/**
 * @file ストーリーモードのエンディング画面(story-ending.ts)のテストです。
 * ランク見出し・戦績一覧の表示、エンディング本文の生成成功/失敗時の表示、
 * 「もういちど ストーリーを あそぶ」ボタンでの再挑戦、メッセージウィンドウの
 * クリックによるタイプライター演出のスキップを確認します。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStoryEnding } from "./story-ending";
import type { AppContext } from "./navigation";
import { generateStoryEnding } from "../ai/nano";
import { createTypewriter, type TypewriterDeps } from "./typewriter";
import {
  buildStoryPlan,
  type StoryChapterResult,
  type StoryRun,
} from "../story/plan";
import { makeCharacter, makeStage, sequenceRng } from "../testing/fixtures";
import { loadCharacters } from "../storage/repository";
import { loadStages } from "../storage/stage-repository";

// Prompt API(Gemini Nano)は jsdom に存在しない外部依存のためモックします
vi.mock("../ai/nano", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/nano")>();
  return { ...actual, generateStoryEnding: vi.fn() };
});
// クリック時にタイプライターのskip()が呼ばれることを検証するため、
// 実装(typeLine)は本物のまま、返り値のskip()だけをスパイに差し替えます
vi.mock("./typewriter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./typewriter")>();
  return {
    ...actual,
    createTypewriter: vi.fn((deps: TypewriterDeps) => {
      const real = actual.createTypewriter(deps);
      return { ...real, skip: vi.fn(real.skip) };
    }),
  };
});
// もう一度あそぶボタンの再抽選に使う保存データの読み込みをモックします
vi.mock("../storage/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/repository")>();
  return { ...actual, loadCharacters: vi.fn() };
});
vi.mock("../storage/stage-repository", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../storage/stage-repository")>();
  return { ...actual, loadStages: vi.fn() };
});

/** 画面遷移を記録するだけのテスト用コンテキストです。 */
const ctx: AppContext = { navigate: vi.fn() };

/** setTimeout(0) まで待ち、保留中の非同期処理をDOMに反映させます。 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** テスト用の全2章構成のStoryPlanを作ります(乱数はすべて0で決定論的)。 */
function makeTestPlan() {
  const protagonist = makeCharacter({ id: "char-しゅじんこう", name: "もふ吉" });
  const opponent = makeCharacter({ id: "char-あいて", name: "がぶ太" });
  const secondOpponent = makeCharacter({ id: "char-あいて2", name: "ぴよ助" });
  const stage = makeStage({ id: "stage-1", title: "満月の闘技場" });
  return buildStoryPlan(
    protagonist,
    [opponent, secondOpponent],
    [stage],
    sequenceRng(Array(20).fill(0)),
  );
}

/** テスト用の章結果を組み立てます。 */
function makeResult(
  index: number,
  outcome: StoryChapterResult["outcome"],
  overrides: Partial<StoryChapterResult> = {},
): StoryChapterResult {
  return {
    index,
    opponentName: `相手${index}`,
    stageName: `ステージ${index}`,
    outcome,
    ...overrides,
  };
}

// document.hidden をtrueに固定し、SE再生(jsdomで未実装のHTMLMediaElement.play()が
// 例外になる)とタイプライター演出の待機を即座に完了させます(battle.test.tsと同じ理由)
beforeAll(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  Object.defineProperty(document, "hidden", {
    value: true,
    configurable: true,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "hidden");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("renderStoryEnding: ランク見出しと戦績一覧", () => {
  it("全勝のときはTRUE ENDを見出しに表示する", async () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const run: StoryRun = {
      plan,
      results: [makeResult(1, "win"), makeResult(2, "win")],
    };
    const screen = renderStoryEnding(ctx, run);
    expect(screen.querySelector(".ending-rank")?.textContent).toBe("TRUE END");
  });

  it("全敗のときはWORST ENDを見出しに表示する", () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const run: StoryRun = {
      plan,
      results: [makeResult(1, "lose"), makeResult(2, "lose")],
    };
    const screen = renderStoryEnding(ctx, run);
    expect(screen.querySelector(".ending-rank")?.textContent).toBe(
      "WORST END",
    );
  });

  it("戦績一覧に章ごとの相手・ステージ・勝敗を表示する", () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const run: StoryRun = {
      plan,
      results: [
        makeResult(1, "win", { opponentName: "がぶ太", stageName: "満月の闘技場" }),
        makeResult(2, "lose", { opponentName: "ぴよ助", stageName: "炎の谷" }),
      ],
    };
    const screen = renderStoryEnding(ctx, run);
    const items = Array.from(
      screen.querySelectorAll(".story-ending-record-item"),
    ).map((node) => node.textContent);
    expect(items[0]).toContain("第1話");
    expect(items[0]).toContain("満月の闘技場");
    expect(items[0]).toContain("がぶ太");
    expect(items[0]).toContain("かち");
    expect(items[1]).toContain("第2話");
    expect(items[1]).toContain("炎の谷");
    expect(items[1]).toContain("ぴよ助");
    expect(items[1]).toContain("まけ");
  });

  it("最終成績を「n勝n敗n分」の形式で表示する", () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const run: StoryRun = {
      plan,
      results: [makeResult(1, "win"), makeResult(2, "draw")],
    };
    const screen = renderStoryEnding(ctx, run);
    expect(screen.querySelector(".story-ending-summary")?.textContent).toBe(
      "1勝0敗1分",
    );
  });
});

describe("renderStoryEnding: エンディング本文の生成", () => {
  it("生成に成功するとストーリー種別のログとして表示する", async () => {
    vi.mocked(generateStoryEnding).mockResolvedValue(
      "こうして長い旅は幕を閉じた。",
    );
    const plan = makeTestPlan();
    const run: StoryRun = { plan, results: [makeResult(1, "win")] };
    const screen = renderStoryEnding(ctx, run);
    await flushPromises();

    const line = screen.querySelector(".log-story");
    expect(line?.lastElementChild?.textContent).toBe(
      "こうして長い旅は幕を閉じた。",
    );
  });

  it("生成に失敗すると警告行を表示し、戦績表示は維持される", async () => {
    vi.mocked(generateStoryEnding).mockRejectedValue(new Error("モデル利用不可"));
    const plan = makeTestPlan();
    const run: StoryRun = {
      plan,
      results: [
        makeResult(1, "win", { opponentName: "がぶ太", stageName: "満月の闘技場" }),
      ],
    };
    const screen = renderStoryEnding(ctx, run);
    await flushPromises();

    expect(screen.querySelector(".log-warn")).not.toBeNull();
    expect(
      screen.querySelector(".story-ending-record-item")?.textContent,
    ).toContain("がぶ太");
  });
});

describe("renderStoryEnding: ボタン操作", () => {
  it("ホームへボタンを押すとhome画面へ遷移する", () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const run: StoryRun = { plan, results: [makeResult(1, "win")] };
    const screen = renderStoryEnding(ctx, run);

    const homeButton = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "← ホームへ",
    );
    homeButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "home" });
  });

  it("もういちどストーリーをあそぶボタンを押すと、同じ主人公で新しい物語を組み立てプロローグ(story-opening)画面へ遷移する", () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const opponent = makeCharacter({ id: "char-あいて", name: "がぶ太" });
    const thirdOpponent = makeCharacter({ id: "char-あいて3", name: "くろ丸" });
    vi.mocked(loadCharacters).mockReturnValue([
      plan.protagonist,
      opponent,
      thirdOpponent,
    ]);
    vi.mocked(loadStages).mockReturnValue([]);
    const run: StoryRun = { plan, results: [makeResult(1, "win")] };
    const screen = renderStoryEnding(ctx, run);

    const retryButton = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "もういちど ストーリーを あそぶ",
    );
    retryButton?.click();

    expect(ctx.navigate).toHaveBeenCalledOnce();
    const [call] = vi.mocked(ctx.navigate).mock.calls[0] ?? [];
    expect(call?.name).toBe("story-opening");
    if (call?.name !== "story-opening") {
      throw new Error("想定外の遷移です");
    }
    expect(call.run.results).toEqual([]);
    expect(call.run.plan.protagonist.id).toBe(plan.protagonist.id);
  });
});

describe("renderStoryEnding: メッセージウィンドウのクリック", () => {
  it("メッセージウィンドウをクリックするとタイプライター演出のスキップを呼び出す", () => {
    vi.mocked(generateStoryEnding).mockReturnValue(new Promise(() => {}));
    const plan = makeTestPlan();
    const run: StoryRun = { plan, results: [makeResult(1, "win")] };
    const screen = renderStoryEnding(ctx, run);

    const results = vi.mocked(createTypewriter).mock.results;
    const latest = results.at(-1);
    if (latest === undefined || latest.type !== "return") {
      throw new Error("createTypewriterの呼び出し結果を取得できませんでした");
    }
    const { skip } = latest.value as ReturnType<typeof createTypewriter>;

    const logWindow = screen.querySelector<HTMLElement>(".msg-window");
    logWindow?.click();

    expect(skip).toHaveBeenCalledOnce();
  });

  it("単一の次の操作がないため、クリック送り・自動進行のヒントは表示しない(story-opening/story-part/battleとは異なる方針)", async () => {
    vi.mocked(generateStoryEnding).mockResolvedValue(
      "こうして長い旅は幕を閉じた。",
    );
    const plan = makeTestPlan();
    const run: StoryRun = { plan, results: [makeResult(1, "win")] };
    const screen = renderStoryEnding(ctx, run);
    await flushPromises();

    expect(screen.querySelector(".msg-advance-hint")).toBeNull();
  });
});
