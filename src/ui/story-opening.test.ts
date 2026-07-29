/**
 * @file ストーリーモードのプロローグ画面(story-opening.ts)のテストです。
 * 主人公だけの立ち絵表示、オープニングナレーションの生成成功/失敗時の表示、
 * 「たびにでる」ボタンでの第1章への遷移、メッセージ送り
 * (クリック進行・自動進行)を確認します。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStoryOpening } from "./story-opening";
import type { AppContext } from "./navigation";
import { generateStoryOpening } from "../ai/nano";
import { AUTO_ADVANCE_DELAY_MS } from "./message-advance";
import { buildStoryPlan, type StoryRun } from "../story/plan";
import { makeCharacter, makeStage, sequenceRng } from "../testing/fixtures";

// Prompt API(Gemini Nano)は jsdom に存在しない外部依存のためモックします
vi.mock("../ai/nano", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/nano")>();
  return { ...actual, generateStoryOpening: vi.fn() };
});
// jsdomのHTMLMediaElement.play()はPromiseを返さず未実装のため、
// 実際のAudio再生を避けてBGMをモックします(story-part.test.tsと同じ理由)
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
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** テスト用の全2章構成のStoryRun(相手2名・ステージ1件)を作ります。 */
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
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

describe("renderStoryOpening: 表示内容", () => {
  it("主人公だけの立ち絵を表示する(相手はまだ登場しない)", () => {
    vi.mocked(generateStoryOpening).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);
    const names = Array.from(
      screen.querySelectorAll(".story-portrait-name"),
    ).map((node) => node.textContent);
    expect(names).toEqual(["もふ吉"]);
  });
});

describe("renderStoryOpening: オープニングナレーションの生成", () => {
  it("生成に成功するとストーリー種別のログとして表示する", async () => {
    vi.mocked(generateStoryOpening).mockResolvedValue(
      "もふ吉は、故郷を救うため旅に出た。",
    );
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);
    await flushPromises();

    const line = screen.querySelector(".log-story");
    expect(line?.lastElementChild?.textContent).toBe(
      "もふ吉は、故郷を救うため旅に出た。",
    );
  });

  it("生成に失敗すると警告行を表示する", async () => {
    vi.mocked(generateStoryOpening).mockRejectedValue(
      new Error("モデル利用不可"),
    );
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);
    await flushPromises();

    expect(screen.querySelector(".log-warn")).not.toBeNull();
  });
});

describe("renderStoryOpening: ボタン操作", () => {
  it("たびにでるボタンを押すとstory-part画面(第1章、同じrun)へ遷移する(生成完了を待たない)", () => {
    vi.mocked(generateStoryOpening).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);

    const startButton = screen.querySelector<HTMLButtonElement>(
      ".story-opening-start-button",
    );
    expect(startButton?.disabled).toBe(false);
    startButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-part", run });
  });

  it("ホームへボタンを押すとhome画面へ遷移する", () => {
    vi.mocked(generateStoryOpening).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);

    const homeButton = screen.querySelector<HTMLButtonElement>(
      ".story-opening-home-button",
    );
    homeButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "home" });
  });
});

describe("renderStoryOpening: メッセージ送り(クリック進行・自動進行)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("生成中はまだクリック送りのヒントを表示しない", () => {
    vi.mocked(generateStoryOpening).mockReturnValue(new Promise(() => {}));
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);

    expect(screen.querySelector(".msg-advance-hint")).toBeNull();
  });

  it("表示が完了するとクリック送りのヒントを表示する", async () => {
    vi.mocked(generateStoryOpening).mockResolvedValue(
      "もふ吉は、故郷を救うため旅に出た。",
    );
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);
    await flushPromises();

    const hint = screen.querySelector<HTMLElement>(".msg-advance-hint");
    expect(hint?.hidden).toBe(false);
  });

  it("表示が完了した後、メッセージウィンドウをクリックするとstory-part画面へ遷移する(たびにでるボタンと同じ操作)", async () => {
    vi.mocked(generateStoryOpening).mockResolvedValue(
      "もふ吉は、故郷を救うため旅に出た。",
    );
    const run = makeTestRun();
    const screen = renderStoryOpening(ctx, run);
    await flushPromises();

    const logWindow = screen.querySelector<HTMLElement>(".msg-window");
    logWindow?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-part", run });
  });

  it("表示が完了した後、一定時間操作がないと自動的にstory-part画面へ遷移する", async () => {
    vi.useFakeTimers();
    vi.mocked(generateStoryOpening).mockResolvedValue(
      "もふ吉は、故郷を救うため旅に出た。",
    );
    const run = makeTestRun();
    renderStoryOpening(ctx, run);
    // 生成完了→表示完了(ready()呼び出し)までのマイクロタスクを流す
    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(ctx.navigate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTO_ADVANCE_DELAY_MS);
    expect(ctx.navigate).toHaveBeenCalledWith({ name: "story-part", run });
  });
});
