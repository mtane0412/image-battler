/**
 * @file メッセージウィンドウのクリック送り・自動進行の共通ロジックです。
 *
 * ストーリーモードやバトル画面では、決着後の「次へ」に相当するボタン
 * (つぎへ・けつまつへ・たたかう等)がメッセージウィンドウより下に配置され、
 * ログが伸びると画面外に隠れてテンポが悪くなります。この対策として、
 * メッセージウィンドウ自体をクリックしても同じ操作を実行できるようにし、
 * クリックできることを示すヒント(▼)を表示します。さらに一定時間操作が
 * ないときは自動的に同じ操作を実行します(ready() 呼び出しからの経過時間)。
 *
 * 明示的な cancel() は持ちません。画面遷移時は呼び出し側の isAborted() が
 * true になることで、遅れて発火した自動進行タイマーのコールバックが
 * 実行時に自己判定して何もしない、という既存方針(ui/typewriter.ts の
 * pacedWait と同じ考え方)に揃えています。
 */
import { el } from "./dom";

/**
 * 自動進行までの無操作時間(ミリ秒)です。ユーザーがメッセージを読み切る
 * のに十分な長さを見つつ、放置してもテンポよく進むよう8秒としています。
 */
export const AUTO_ADVANCE_DELAY_MS = 8000;

/** createMessageAdvance が受け取る依存です。 */
export interface MessageAdvanceDeps {
  /**
   * 呼び出し時点で画面遷移などにより中断されているかどうかを返します。
   * 自動進行タイマーの発火時、画面を離れたあとに誤って操作を実行しない
   * ためのガードに使います。
   */
  isAborted: () => boolean;
}

/** createMessageAdvance が返すインターフェースです。 */
export interface MessageAdvance {
  /**
   * クリックで先送りできることを示すヒント要素です。呼び出し側が
   * メッセージウィンドウ付近の任意の位置に配置します。ready() が
   * 呼ばれるまでは非表示です。
   */
  hint: HTMLElement;
  /**
   * 画面の主操作(次へ相当のボタンの処理)を渡し、クリック待ち・自動進行の
   * 対象にします。ヒントを表示し、AUTO_ADVANCE_DELAY_MS 経過しても
   * 操作がなければ自動的に action を実行します。
   * 呼び直すと、それまでの待機は破棄され最新の action に置き換わります。
   */
  ready(action: () => void): void;
  /**
   * メッセージウィンドウがクリックされたときに呼びます。ready() 済みの
   * 操作があれば1回だけ実行してヒントを隠します。まだ準備できていない
   * 場合は何もしません(タイピング中の演出打ち切りは呼び出し側が
   * typewriter.skip() を別途呼ぶ責務です)。
   */
  handleClick(): void;
}

/**
 * メッセージ送り(クリック進行・自動進行)の制御インスタンスを作ります。
 * @param deps 中断判定
 */
export function createMessageAdvance(
  deps: MessageAdvanceDeps,
): MessageAdvance {
  const { isAborted } = deps;
  const hint = el("span", {
    className: "msg-advance-hint",
    text: "▼ クリックで すすむ",
    attrs: { "aria-hidden": "true" },
  });
  hint.hidden = true;

  let pendingAction: (() => void) | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  /** 待機状態を破棄します(タイマー解除・ヒント非表示・保留操作クリア)。 */
  function clearPending(): void {
    pendingAction = null;
    hint.hidden = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return {
    hint,
    ready(action: () => void): void {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      pendingAction = action;
      hint.hidden = false;
      timerId = setTimeout(() => {
        timerId = null;
        if (isAborted() || pendingAction === null) {
          return;
        }
        const run = pendingAction;
        clearPending();
        run();
      }, AUTO_ADVANCE_DELAY_MS);
    },
    handleClick(): void {
      if (pendingAction === null) {
        return;
      }
      const run = pendingAction;
      clearPending();
      run();
    },
  };
}
