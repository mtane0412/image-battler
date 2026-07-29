/**
 * @file メッセージウィンドウのタイプライター表示(typewriter.ts)のテストです。
 * battle.ts から切り出した共通部品で、ストーリーパート画面・エンディング画面でも
 * 同じ表示ロジックを使い回します。バッジ表示・reducedMotion時の即時表示・
 * タブ非表示時の即時表示・演出中の表示音再生を確認します。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTypewriter, pacedWait } from "./typewriter";
import type { SePlayer } from "../audio/se";

/** テスト用の疑似SEプレイヤー(playLoopの呼び出しと停止を記録します)。 */
function makeFakeSePlayer(): {
  sePlayer: Pick<SePlayer, "playLoop">;
  playLoop: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn();
  const playLoop = vi.fn().mockReturnValue(stop);
  return { sePlayer: { playLoop }, playLoop, stop };
}

describe("createTypewriter.typeLine", () => {
  afterEach(() => {
    // document.hidden を上書きしたテストの後始末(own propertyを消して既定に戻す)
    Reflect.deleteProperty(document, "hidden");
  });

  it("reducedMotion時は演出をスキップして即座に全文を表示し、タイピング用クラスも外れる", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer, playLoop } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: true,
      isAborted: () => false,
    });

    await typeLine("ようこそ もふ吉の もりへ", "system");

    const line = logWindow.querySelector(".log-line");
    expect(line?.textContent).toBe("ようこそ もふ吉の もりへ");
    expect(line?.classList.contains("typing")).toBe(false);
    expect(line?.classList.contains("log-system")).toBe(true);
    // 演出をスキップするため表示音も鳴らさない
    expect(playLoop).not.toHaveBeenCalled();
  });

  it("kind: narrationのときは実況バッジが先頭に付く", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: true,
      isAborted: () => false,
    });

    await typeLine("もふ吉が優勢だ!", "narration");

    const badge = logWindow.querySelector(".log-mic");
    expect(badge?.textContent).toBe("実況");
    expect(badge?.classList.contains("log-mic-story")).toBe(false);
  });

  it("kind: storyのときはストーリーバッジが先頭に付く", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: true,
      isAborted: () => false,
    });

    await typeLine("峠を越えた一行の前に、獣が立ちはだかった。", "story");

    const badge = logWindow.querySelector(".log-mic-story");
    expect(badge?.textContent).toBe("ストーリー");
  });

  it("タブが非表示のときはreducedMotionでなくても即座に全文表示する(バックグラウンド完走仕様)", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    const logWindow = document.createElement("div");
    const { sePlayer, playLoop } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: false,
      isAborted: () => false,
    });

    await typeLine("がぶ太が反撃した!", "system");

    expect(logWindow.querySelector(".log-line")?.textContent).toBe(
      "がぶ太が反撃した!",
    );
    expect(playLoop).not.toHaveBeenCalled();
  });

  it("演出中はメッセージ表示音をループ再生し、表示完了と同時に停止する", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer, playLoop, stop } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: false,
      isAborted: () => false,
    });

    // 短い文字列でも実際に1文字ずつ描画するタイマーを消費するため、
    // このテストだけ実タイマーの経過(数十ms)を伴います
    await typeLine("やあ", "system");

    expect(playLoop).toHaveBeenCalledWith("message");
    expect(stop).toHaveBeenCalledOnce();
    expect(logWindow.querySelector(".log-line")?.textContent).toBe("やあ");
  });

  it("サロゲートペア(絵文字)を含む文字列でも欠けずに全文表示する", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: false,
      isAborted: () => false,
    });

    await typeLine("🐱🐶", "system");

    expect(logWindow.querySelector(".log-line")?.textContent).toBe("🐱🐶");
  });

  it("skip()を呼ぶと、演出中の行を即座に全文表示して完了する(メッセージ送り操作用)", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer, stop } = makeFakeSePlayer();
    const { typeLine, skip } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: false,
      isAborted: () => false,
    });

    const promise = typeLine(
      "クリックで先送りできるとテンポがよくなる",
      "system",
    );
    skip();
    await promise;

    const line = logWindow.querySelector(".log-line");
    expect(line?.textContent).toBe("クリックで先送りできるとテンポがよくなる");
    expect(line?.classList.contains("typing")).toBe(false);
    // 演出を打ち切っても表示音の停止は必ず行われる
    expect(stop).toHaveBeenCalledOnce();
  });

  it("isAbortedがtrueのときは演出の待機をスキップしつつ、最終的に全文を表示する", async () => {
    const logWindow = document.createElement("div");
    const { sePlayer, stop } = makeFakeSePlayer();
    const { typeLine } = createTypewriter({
      logWindow,
      sePlayer,
      reducedMotion: false,
      isAborted: () => true,
    });

    await typeLine("中断されても表示は完了する", "system");

    expect(logWindow.querySelector(".log-line")?.textContent).toBe(
      "中断されても表示は完了する",
    );
    // finallyブロックは通るため、鳴らしていれば必ず停止される
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe("pacedWait", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "hidden");
    vi.useRealTimers();
  });

  it("documentが非表示のときは待たずに即座に解決する(バックグラウンドでタイマーが間引かれる対策)", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    const before = Date.now();
    await pacedWait(1000);
    expect(Date.now() - before).toBeLessThan(50);
  });

  it("表示中は指定ミリ秒が経過するまで解決しない", async () => {
    vi.useFakeTimers();
    const onResolved = vi.fn();
    void pacedWait(500).then(onResolved);

    await vi.advanceTimersByTimeAsync(499);
    expect(onResolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onResolved).toHaveBeenCalledOnce();
  });
});
