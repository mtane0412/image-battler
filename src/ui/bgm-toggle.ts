/**
 * @file BGM設定(ON/OFF)の切り替えボタンです。
 * ホーム画面(バトルスタートの隣)とバトル画面の両方で共用します。
 * 押すたびに設定をlocalStorageへ保存し、表示(ラベルとaria-pressed)を更新します。
 */
import { loadBgmEnabled, saveBgmEnabled } from "../audio/bgm";
import { el } from "./dom";

/**
 * BGM切り替えボタンを生成します。表示は現在の保存済み設定に合わせます。
 * @param onToggle 切り替え後の設定値を受け取るコールバックです。
 *   バトル画面ではここで再生の開始・停止を行います(ホーム画面では不要)。
 */
export function bgmToggleButton(
  onToggle?: (enabled: boolean) => void,
): HTMLButtonElement {
  const node = el("button", {
    className: "btn btn-ghost bgm-button",
    attrs: { type: "button" },
  });

  /** ボタンの表示(ラベルとトグル状態)を設定値に合わせます。 */
  function applyState(enabled: boolean): void {
    node.textContent = enabled ? "♪ BGM ON" : "♪ BGM OFF";
    node.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  applyState(loadBgmEnabled());
  node.addEventListener("click", () => {
    const enabled = !loadBgmEnabled();
    saveBgmEnabled(enabled);
    applyState(enabled);
    onToggle?.(enabled);
  });
  return node;
}
