/**
 * @file バトル画面(battle.ts)のうち、ストーリーモードの章再生
 * (renderStoryBattle)の配線を検証するテストです。
 *
 * 既存の1v1・2v2・バトルロイヤルの再生オーケストレーション自体(AI・音声・
 * タイマーが複雑に絡む部分)は本ファイルの対象外とします(従来から無テストです)。
 * ここではストーリーモード固有の配線 ── 章バナーの表示、主人公vs相手の
 * 1v1としての描画、決着後のボタンラベルの切り替え(つぎへ/けつまつへ)、
 * 決着後の遷移(onNext経由でのstory-part/story-ending画面への遷移と
 * 章結果の記録)、メッセージ送り(決着後のメッセージウィンドウのクリック・
 * 自動進行)だけを検証します。
 *
 * document.hidden を true にすることで、SE/BGM再生(jsdomの
 * HTMLMediaElement.play() が Promise を返さず未実装のため、素の呼び出しは
 * 例外になります)とタイプライター演出の待機(typeLine内の1文字ずつの
 * アニメーション・pacedWait)をすべて即座に完了させ、実タイマーに依存せず
 * バトルを完走させます。se.ts/bgm.ts/typewriter.ts はいずれも
 * document.hidden のとき演出をスキップする設計(バックグラウンドタブでも
 * バトルを完走させるための本番仕様)のため、この手法はその仕様を
 * そのままテストに利用しています。
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { renderStoryBattle } from "./battle";
import type { AppContext } from "./navigation";
import { AUTO_ADVANCE_DELAY_MS } from "./message-advance";
import { buildStoryPlan, type StoryRun } from "../story/plan";
import { makeCharacter, makeStage, sequenceRng } from "../testing/fixtures";

/** 画面遷移を記録するだけのテスト用コンテキストです。 */
const ctx: AppContext = { navigate: vi.fn() };

/**
 * バトル再生ループを完走させるために、保留中の非同期処理をまとめて
 * 進めます。document.hidden = true のもとでは pacedWait/typeLine の待機は
 * すべてマイクロタスクのみで解決するため、setTimeout(0) のマクロタスクを
 * 何度か挟めば十分完走します(件数はイベント数に依存するため余裕を持たせます)。
 */
async function flushAllBattleEvents(): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * テスト用の全2章構成のStoryRunを作ります。乱数はすべて0を注入し、
 * 第1章の相手を配列先頭(がぶ太)に固定します(決定論的な抽選、
 * plan.test.ts の buildStoryPlan のテストと同じ考え方です)。
 * @param withFirstChapterDone true の場合、第1章の結果を積んだ状態
 *   (=第2章=最終章を再生する状態)にします。
 */
function makeTestRun(withFirstChapterDone: boolean): StoryRun {
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
  const results = withFirstChapterDone
    ? [
        {
          index: 1,
          opponentName: opponent.name,
          stageName: "満月の闘技場",
          outcome: "win" as const,
        },
      ]
    : [];
  return { plan, results };
}

// document.hidden はテスト間で切り替えず(true固定で)このファイル全体に適用します。
// beforeEach/afterEachで毎回付け外しすると、あるテストのplayBattle()が
// (flush漏れで)後続テストに跨って実行され続けたときに document.hidden が
// 一時的にfalseへ戻り、jsdomで未実装のHTMLMediaElement.play()を叩いて
// クラッシュする(実際に発生を確認済み)ため、beforeAll/afterAllで固定します。
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

describe("renderStoryBattle: 表示内容", () => {
  it("章バナーに章番号・ステージ名を表示する(全体の章数は表示しない)", async () => {
    const run = makeTestRun(false);
    const screen = renderStoryBattle(ctx, run);
    expect(screen.querySelector(".chapter-banner-index")?.textContent).toBe(
      "第1話",
    );
    expect(screen.querySelector(".chapter-banner-stage")?.textContent).toBe(
      "満月の闘技場",
    );
    // バックグラウンドで進行中のバトル再生を、次のテストへ持ち越さないよう
    // 完走させてから終わります(document.hiddenの整合性を保つため)
    await flushAllBattleEvents();
  });

  it("主人公と相手だけの1v1として描画する(2v2やロイヤルにならない)", async () => {
    const run = makeTestRun(false);
    const screen = renderStoryBattle(ctx, run);
    const names = Array.from(
      screen.querySelectorAll(".fighter-name"),
    ).map((node) => node.textContent);
    expect(names).toEqual(["もふ吉", "がぶ太"]);
    await flushAllBattleEvents();
  });
});

describe("renderStoryBattle: 決着後のボタン", () => {
  it("最終章でない場合、決着後にボタンが「つぎへ」として表示される", async () => {
    const run = makeTestRun(false);
    const screen = renderStoryBattle(ctx, run);
    await flushAllBattleEvents();

    const button = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "つぎへ",
    );
    expect(button).toBeDefined();
    expect(button?.hidden).toBe(false);
  });

  it("最終章の場合、決着後にボタンが「けつまつへ」として表示される", async () => {
    const run = makeTestRun(true);
    const screen = renderStoryBattle(ctx, run);
    await flushAllBattleEvents();

    const button = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "けつまつへ",
    );
    expect(button).toBeDefined();
    expect(button?.hidden).toBe(false);
  });
});

describe("renderStoryBattle: 決着後の遷移", () => {
  it("最終章でない場合、つぎへを押すと章の結果を積んだrunでstory-part画面へ遷移する", async () => {
    const run = makeTestRun(false);
    const chapter = run.plan.chapters[0];
    if (chapter === undefined) {
      throw new Error("テスト前提が崩れています(第1章が存在しません)");
    }
    const screen = renderStoryBattle(ctx, run);
    await flushAllBattleEvents();

    const button = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "つぎへ",
    );
    button?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "story-part",
      run: expect.objectContaining({
        results: [
          expect.objectContaining({
            index: 1,
            opponentName: chapter.opponent.name,
            stageName: "満月の闘技場",
            outcome: expect.stringMatching(/^(win|lose|draw)$/) as unknown as string,
          }),
        ],
      }),
    });
  });

  it("最終章の場合、けつまつへを押すと章の結果を積んだrunでstory-ending画面へ遷移する", async () => {
    const run = makeTestRun(true);
    const chapter = run.plan.chapters[1];
    if (chapter === undefined) {
      throw new Error("テスト前提が崩れています(第2章が存在しません)");
    }
    const screen = renderStoryBattle(ctx, run);
    await flushAllBattleEvents();

    const button = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "けつまつへ",
    );
    button?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "story-ending",
      run: expect.objectContaining({
        results: [
          expect.objectContaining({ index: 1, outcome: "win" }),
          expect.objectContaining({
            index: 2,
            opponentName: chapter.opponent.name,
            stageName: "満月の闘技場",
            outcome: expect.stringMatching(/^(win|lose|draw)$/) as unknown as string,
          }),
        ],
      }),
    });
  });

  it("ホームへボタンを押すとhome画面へ遷移する(進行を中断する)", async () => {
    const run = makeTestRun(false);
    const screen = renderStoryBattle(ctx, run);

    const homeButton = Array.from(screen.querySelectorAll("button")).find(
      (node) => node.textContent === "← ホームへ",
    );
    homeButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "home" });
    // aborted後の再生ループが打ち切られるところまで進めてから終わります
    await flushAllBattleEvents();
  });
});

describe("renderStoryBattle: メッセージ送り(クリック進行・自動進行)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("決着前はまだクリック送りのヒントを表示しない", async () => {
    const run = makeTestRun(false);
    const screen = renderStoryBattle(ctx, run);
    expect(screen.querySelector(".msg-advance-hint")).toBeNull();
    await flushAllBattleEvents();
  });

  it("決着後はクリック送りのヒントを表示する", async () => {
    const run = makeTestRun(false);
    const screen = renderStoryBattle(ctx, run);
    await flushAllBattleEvents();

    const hint = screen.querySelector<HTMLElement>(".msg-advance-hint");
    expect(hint?.hidden).toBe(false);
  });

  it("決着後、メッセージウィンドウをクリックするとつぎへボタンと同じ操作(次の章へ)を行う", async () => {
    const run = makeTestRun(false);
    const chapter = run.plan.chapters[0];
    if (chapter === undefined) {
      throw new Error("テスト前提が崩れています(第1章が存在しません)");
    }
    const screen = renderStoryBattle(ctx, run);
    await flushAllBattleEvents();

    const logWindow = screen.querySelector<HTMLElement>(".msg-window");
    logWindow?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "story-part",
      run: expect.objectContaining({
        results: [
          expect.objectContaining({
            index: 1,
            opponentName: chapter.opponent.name,
            stageName: "満月の闘技場",
            outcome: expect.stringMatching(/^(win|lose|draw)$/) as unknown as string,
          }),
        ],
      }),
    });
  });

  it("決着後、一定時間操作がないと自動的につぎへボタンと同じ操作(次の章へ)を行う", async () => {
    vi.useFakeTimers();
    const run = makeTestRun(false);
    renderStoryBattle(ctx, run);
    // document.hidden により演出待機は即解決するため、0ms刻みのタイマーを
    // 何度か進めるだけで決着(ready()呼び出し)まで完走します
    for (let i = 0; i < 40; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(ctx.navigate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE_DELAY_MS);
    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "story-part",
      run: expect.anything(),
    });
  });
});
