/**
 * @file メッセージウィンドウのクリック送り・自動進行(message-advance.ts)のテストです。
 * ready() でヒント表示と自動進行タイマーが始まること、handleClick() で
 * 1回だけ操作が実行されヒントが隠れること、自動進行タイマーが実際に
 * AUTO_ADVANCE_DELAY_MS 後に発火すること、クリック消費後や中断後には
 * 発火しないことを確認します。実タイマーに依存しないよう vi.useFakeTimers()
 * を使います。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_ADVANCE_DELAY_MS, createMessageAdvance } from "./message-advance";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createMessageAdvance: ヒント表示", () => {
  it("初期状態ではヒントが非表示である", () => {
    const { hint } = createMessageAdvance({ isAborted: () => false });
    expect(hint.hidden).toBe(true);
  });

  it("ready()を呼ぶとヒントが表示される", () => {
    const { hint, ready } = createMessageAdvance({ isAborted: () => false });
    ready(vi.fn());
    expect(hint.hidden).toBe(false);
  });
});

describe("createMessageAdvance: handleClick", () => {
  it("ready()前にhandleClick()を呼んでも何も起きない", () => {
    const action = vi.fn();
    const { handleClick } = createMessageAdvance({ isAborted: () => false });
    handleClick();
    expect(action).not.toHaveBeenCalled();
  });

  it("ready()で渡した操作は、handleClick()で1回だけ実行されヒントが隠れる", () => {
    const action = vi.fn();
    const { hint, ready, handleClick } = createMessageAdvance({
      isAborted: () => false,
    });
    ready(action);

    handleClick();
    expect(action).toHaveBeenCalledOnce();
    expect(hint.hidden).toBe(true);

    // 2回目以降のクリックでは再実行しない(二重遷移防止)
    handleClick();
    expect(action).toHaveBeenCalledOnce();
  });

  it("handleClick()で消費したあとは、自動進行タイマーが発火しても操作を再実行しない", () => {
    const action = vi.fn();
    const { ready, handleClick } = createMessageAdvance({
      isAborted: () => false,
    });
    ready(action);
    handleClick();
    expect(action).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS);
    expect(action).toHaveBeenCalledOnce();
  });
});

describe("createMessageAdvance: 自動進行", () => {
  it("ready()から一定時間(AUTO_ADVANCE_DELAY_MS)操作がないと自動的に操作を実行する", () => {
    const action = vi.fn();
    const { hint, ready } = createMessageAdvance({ isAborted: () => false });
    ready(action);

    vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS - 1);
    expect(action).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(action).toHaveBeenCalledOnce();
    expect(hint.hidden).toBe(true);
  });

  it("画面を離れて中断された(isAborted()がtrueの)あとは、自動進行タイマーが発火しても操作を実行しない", () => {
    const action = vi.fn();
    let aborted = false;
    const { ready } = createMessageAdvance({ isAborted: () => aborted });
    ready(action);
    aborted = true;

    vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS);
    expect(action).not.toHaveBeenCalled();
  });

  it("ready()を連続で呼ぶと、直前の待機は破棄され最新の操作だけが自動進行の対象になる", () => {
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    const { ready } = createMessageAdvance({ isAborted: () => false });
    ready(firstAction);

    vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS - 1);
    ready(secondAction);

    // 最初のready()からの経過時間ではなく、2回目のready()からの経過時間で発火する
    vi.advanceTimersByTime(AUTO_ADVANCE_DELAY_MS - 1);
    expect(firstAction).not.toHaveBeenCalled();
    expect(secondAction).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(firstAction).not.toHaveBeenCalled();
    expect(secondAction).toHaveBeenCalledOnce();
  });
});
