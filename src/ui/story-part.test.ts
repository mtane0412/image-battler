/**
 * @file ストーリーパート画面(story-part.ts)のテストです。
 * 章バナー・立ち絵の表示、ナレーション→相手→主人公の1往復2行の会話の順の表示、
 * 生成失敗時のフォールバック、「たたかう」ボタンでの中断遷移、メッセージ送り
 * (クリック進行・自動進行)を確認します。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStoryPart } from "./story-part";
import type { AppContext } from "./navigation";
import { generateChapterNarration, generateCharacterSpeech } from "../ai/nano";
import { AUTO_ADVANCE_DELAY_MS } from "./message-advance";
import { buildStoryPlan, type StoryRun } from "../story/plan";
import { makeCharacter, makeStage, sequenceRng } from "../testing/fixtures";

// Prompt API(Gemini Nano)は jsdom に存在しない外部依存のためモックします
// (エラークラス等は実物を残すため importOriginal でスプレッドします)
vi.mock("../ai/nano", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/nano")>();
  return {
    ...actual,
    generateChapterNarration: vi.fn(),
    generateCharacterSpeech: vi.fn(),
  };
});
// jsdomのHTMLMediaElement.play()はPromiseを返さず未実装のため、
// 実際のAudio再生を避けてBGMをモックします(se.tsのpreloadは再生しないため対象外)
vi.mock("../audio/bgm", () => ({
  getSharedBgmPlayer: vi.fn(() => ({
    play: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
  })),
  loadBgmEnabled: vi.fn(() => false),
}));

/** 画面遷移を記録するだけのテスト用コンテキストです。 */
const ctx: AppContext = { navigate: vi.fn() };

/** setTimeout(0) まで待ち、保留中の非同期処理をDOMに反映させます。 */
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 数回flushして、逐次実行される複数段階の生成
 * (ナレーション→相手のセリフ→主人公のセリフ)を待ちます。
 */
async function flushAllChapterGeneration(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await flushPromises();
  }
}

/**
 * テスト用の全2章構成のStoryRun(相手2名・ステージ1件)を作ります。
 * 乱数はすべて0を注入し、相手の登場順を渡した配列順に固定します
 * (buildStoryPlanの抽選は全て0のとき常に先頭から選ぶため決定論的です)。
 */
function makeTestRun(): StoryRun {
  const protagonist = makeCharacter({ id: "char-しゅじんこう", name: "もふ吉" });
  const opponent = makeCharacter({ id: "char-あいて", name: "がぶ太" });
  const secondOpponent = makeCharacter({ id: "char-あいて2", name: "ぴよ助" });
  const stage = makeStage({ id: "stage-1", title: "満月の闘技場" });
  const plan = buildStoryPlan(
    protagonist,
    [opponent, secondOpponent],
    [stage],
    sequenceRng(Array(20).fill(0)),
  );
  return { plan, results: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  // battle.ts と同じ prefers-reduced-motion 判定を使うため、テストでは
  // reduce(true)を強制してタイマーに依存しない即時表示にします
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: true }),
  );
});

describe("renderStoryPart: 表示内容", () => {
  it("章バナーに章番号・ステージ名を表示する(全体の章数は表示しない)", () => {
    vi.mocked(generateChapterNarration).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    expect(screen.querySelector(".chapter-banner-index")?.textContent).toBe(
      "第1話",
    );
    expect(screen.querySelector(".chapter-banner-stage")?.textContent).toBe(
      "満月の闘技場",
    );
  });

  it("主人公と相手の立ち絵(名前)を表示する", () => {
    vi.mocked(generateChapterNarration).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    const names = Array.from(
      screen.querySelectorAll(".story-portrait-name"),
    ).map((node) => node.textContent);
    expect(names).toEqual(["もふ吉", "がぶ太"]);
  });
});

describe("renderStoryPart: 生成の順序", () => {
  it("ナレーション→相手のセリフ→主人公のセリフの順に表示する", async () => {
    vi.mocked(generateChapterNarration).mockResolvedValue(
      "峠を越えた一行の前に、獣が立ちはだかった。",
    );
    vi.mocked(generateCharacterSpeech)
      .mockResolvedValueOnce("ここから先は 通さんぞ!")
      .mockResolvedValueOnce("じゃあ 通してもらうまでだ");

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    // .log-lineは種別によって先頭にバッジ(実況/ストーリー)を持つため、
    // 本文は必ず最後の子要素(body用span)から取り出します
    const lines = Array.from(screen.querySelectorAll(".log-line")).map(
      (node) => node.lastElementChild?.textContent,
    );
    expect(lines).toEqual([
      "峠を越えた一行の前に、獣が立ちはだかった。",
      "がぶ太「ここから先は 通さんぞ!」",
      "もふ吉「じゃあ 通してもらうまでだ」",
    ]);
  });

  it("ローディング行はナレーション到着後に取り除かれる", async () => {
    vi.mocked(generateChapterNarration).mockResolvedValue("獣が現れた。");
    vi.mocked(generateCharacterSpeech).mockResolvedValue("……");

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    expect(screen.querySelector(".log-loading")).not.toBeNull();

    await flushAllChapterGeneration();
    expect(screen.querySelector(".log-loading")).toBeNull();
  });
});

describe("renderStoryPart: 生成失敗時のフォールバック", () => {
  it("ナレーション生成に失敗すると警告行を表示し、以後のセリフ生成は行わない", async () => {
    vi.mocked(generateChapterNarration).mockRejectedValue(
      new Error("モデル利用不可"),
    );

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    expect(screen.querySelector(".log-warn")).not.toBeNull();
    expect(generateCharacterSpeech).not.toHaveBeenCalled();
  });

  it("相手のセリフ生成に失敗しても警告行を表示し、たたかうボタンで進行できる", async () => {
    vi.mocked(generateChapterNarration).mockResolvedValue("獣が現れた。");
    vi.mocked(generateCharacterSpeech).mockRejectedValue(
      new Error("モデル利用不可"),
    );

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    expect(screen.querySelector(".log-warn")).not.toBeNull();
    const battleButton = screen.querySelector<HTMLButtonElement>(
      ".story-part-fight-button",
    );
    expect(battleButton?.disabled).toBe(false);
    // 相手のセリフ(1回目の呼び出し)が失敗した時点で以降(主人公のセリフ)は試みない
    expect(generateCharacterSpeech).toHaveBeenCalledTimes(1);
  });

  it("セリフが指示された文字数を大きく超えて生成された場合は失敗として扱い、警告行を表示して以降の会話は行わない", async () => {
    // 実機で確認した癖: 小型モデルが「20文字以内で」という指示を無視し、
    // プロンプトの指示文そのものをメタ的に復唱した長文を返すことがある
    // (例:「承知しました。◯◯への返答を20文字以内で作成します。実際のセリフ。」)。
    // このような明らかに指示に従っていない出力は、そのまま表示せず
    // 生成失敗として扱う(Fail-Fast)
    vi.mocked(generateChapterNarration).mockResolvedValue("獣が現れた。");
    vi.mocked(generateCharacterSpeech).mockResolvedValueOnce(
      "承知しました。この言葉への返答を20文字以内で作成します。実際のセリフはこちらです。",
    );

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    expect(screen.querySelector(".log-warn")).not.toBeNull();
    // 異常に長いセリフはログに表示しない
    const lines = Array.from(screen.querySelectorAll(".log-speech")).map(
      (node) => node.textContent,
    );
    expect(lines).toEqual([]);
    // 相手のセリフが不正な出力だった時点で以降(主人公のセリフ)は試みない
    expect(generateCharacterSpeech).toHaveBeenCalledTimes(1);
  });
});

describe("renderStoryPart: ボタン操作", () => {
  it("たたかうボタンを押すとstory-battle画面へ遷移する(生成完了を待たない)", () => {
    // 生成を保留したままにして、待たずに遷移できることを検証します
    vi.mocked(generateChapterNarration).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);

    const battleButton = screen.querySelector<HTMLButtonElement>(
      ".story-part-fight-button",
    );
    expect(battleButton?.disabled).toBe(false);
    battleButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-battle", run });
  });

  it("ホームへボタンを押すとhome画面へ遷移する(進行を中断する)", () => {
    vi.mocked(generateChapterNarration).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);

    const homeButton = screen.querySelector<HTMLButtonElement>(
      ".story-part-home-button",
    );
    homeButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "home" });
  });
});

describe("renderStoryPart: メッセージ送り(クリック進行・自動進行)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("会話の生成中はまだクリック送りのヒントを表示しない", () => {
    vi.mocked(generateChapterNarration).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);

    expect(screen.querySelector(".msg-advance-hint")).toBeNull();
  });

  it("会話が出そろうとクリック送りのヒントを表示する", async () => {
    vi.mocked(generateChapterNarration).mockResolvedValue("獣が現れた。");
    vi.mocked(generateCharacterSpeech)
      .mockResolvedValueOnce("ここから先は 通さんぞ!")
      .mockResolvedValueOnce("じゃあ 通してもらうまでだ");

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    const hint = screen.querySelector<HTMLElement>(".msg-advance-hint");
    expect(hint?.hidden).toBe(false);
  });

  it("会話が出そろった後、メッセージウィンドウをクリックするとstory-battle画面へ遷移する(たたかうボタンと同じ操作)", async () => {
    vi.mocked(generateChapterNarration).mockResolvedValue("獣が現れた。");
    vi.mocked(generateCharacterSpeech)
      .mockResolvedValueOnce("ここから先は 通さんぞ!")
      .mockResolvedValueOnce("じゃあ 通してもらうまでだ");

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    const logWindow = screen.querySelector<HTMLElement>(".msg-window");
    logWindow?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-battle", run });
  });

  it("ナレーション生成に失敗した場合でも、警告表示後はクリックでstory-battle画面へ遷移できる", async () => {
    vi.mocked(generateChapterNarration).mockRejectedValue(
      new Error("モデル利用不可"),
    );

    const run = makeTestRun();
    const screen = renderStoryPart(ctx, run);
    await flushAllChapterGeneration();

    const logWindow = screen.querySelector<HTMLElement>(".msg-window");
    logWindow?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-battle", run });
  });

  it("会話が出そろった後、一定時間操作がないと自動的にstory-battle画面へ遷移する", async () => {
    vi.useFakeTimers();
    vi.mocked(generateChapterNarration).mockResolvedValue("獣が現れた。");
    vi.mocked(generateCharacterSpeech)
      .mockResolvedValueOnce("ここから先は 通さんぞ!")
      .mockResolvedValueOnce("じゃあ 通してもらうまでだ");

    const run = makeTestRun();
    renderStoryPart(ctx, run);
    // ナレーション→相手→主人公の逐次生成が完了する(ready()呼び出し)までの
    // マイクロタスクを流す
    for (let i = 0; i < 9; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(ctx.navigate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE_DELAY_MS);
    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-battle", run });
  });
});
