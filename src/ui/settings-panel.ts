/**
 * @file 設定パネルです。ヘッダーの歯車アイコン(トリガーボタン)と、
 * BGM/効果音の音量設定・データ一括リセットを含むオーバーレイダイアログを提供します。
 *
 * 設計方針:
 * - jsdomが<dialog>のshowModal()未対応のため、通常の<div>によるオーバーレイで実装します
 *   (hidden属性の付け外しで開閉します)
 * - データ削除は誤操作防止のため、既存の「けす」ボタン(home.ts)と同じ
 *   2回押して確定するパターンを使用します
 */
import { getSharedBgmPlayer, loadBgmVolume, saveBgmVolume, type BgmPlayer } from "../audio/bgm";
import { loadSeVolume, saveSeVolume } from "../audio/se";
import { resetAllData } from "../storage/reset";
import { el } from "./dom";
import { GEAR_ICON_SVG } from "./icons";

/** 音量スライダーの目盛り間隔(%)です。 */
const VOLUME_STEP_PERCENT = 5;

/** createSettingsPanel の依存性です(テストではフェイクを注入します)。 */
export interface SettingsPanelDeps {
  /** 音量変更を即座に反映するBGMプレイヤーです。既定はアプリ共有インスタンスです。 */
  bgmPlayer?: Pick<BgmPlayer, "setVolume">;
  /** 設定・保存データの読み書き先です。既定はlocalStorageです。 */
  storage?: Storage;
  /** データ削除確定後に呼ぶ再読み込み関数です。既定はページ再読み込みです。 */
  reload?: () => void;
}

/** createSettingsPanel の戻り値です。 */
export interface SettingsPanel {
  /** ヘッダーに配置する、パネルを開くトリガーボタンです。 */
  trigger: HTMLButtonElement;
  /** パネル本体を含むオーバーレイです(初期状態は非表示)。 */
  overlay: HTMLDivElement;
}

/** 0〜1の音量をスライダー表示用の0〜100(整数)に変換します。 */
function volumeToPercent(volume: number): number {
  return Math.round(volume * 100);
}

/** スライダーの0〜100(文字列)を0〜1の音量に変換します。 */
function percentToVolume(percent: string): number {
  return Number(percent) / 100;
}

/**
 * 設定パネル(トリガーボタン+オーバーレイ)を生成します。
 */
export function createSettingsPanel(
  deps: SettingsPanelDeps = {},
): SettingsPanel {
  const bgmPlayer = deps.bgmPlayer ?? getSharedBgmPlayer();
  const storage = deps.storage ?? localStorage;
  const reload = deps.reload ?? (() => window.location.reload());

  const trigger = el("button", {
    className: "icon-button settings-trigger",
    attrs: { type: "button", "aria-label": "設定を開く" },
  });
  trigger.innerHTML = GEAR_ICON_SVG;

  const closeButton = el("button", {
    className: "btn btn-ghost btn-small settings-close",
    text: "閉じる",
    attrs: { type: "button", "aria-label": "設定を閉じる" },
  });

  // ---------- BGM音量 ----------
  const bgmVolumeValue = el("span", { className: "volume-value" });
  const bgmVolumeSlider = el("input", {
    className: "bgm-volume-slider",
    attrs: {
      type: "range",
      min: "0",
      max: "100",
      step: String(VOLUME_STEP_PERCENT),
      "aria-label": "BGM音量",
    },
  });
  /** BGM音量の表示(スライダー位置とラベル)を設定値に合わせます。 */
  function applyBgmVolumeDisplay(volume: number): void {
    const percent = volumeToPercent(volume);
    bgmVolumeSlider.value = String(percent);
    bgmVolumeValue.textContent = `${percent}%`;
  }
  applyBgmVolumeDisplay(loadBgmVolume(storage));
  bgmVolumeSlider.addEventListener("input", () => {
    const volume = percentToVolume(bgmVolumeSlider.value);
    saveBgmVolume(volume, storage);
    bgmPlayer.setVolume(volume);
    bgmVolumeValue.textContent = `${bgmVolumeSlider.value}%`;
  });

  // ---------- 効果音音量 ----------
  const seVolumeValue = el("span", { className: "volume-value" });
  const seVolumeSlider = el("input", {
    className: "se-volume-slider",
    attrs: {
      type: "range",
      min: "0",
      max: "100",
      step: String(VOLUME_STEP_PERCENT),
      "aria-label": "効果音音量",
    },
  });
  /** 効果音音量の表示(スライダー位置とラベル)を設定値に合わせます。 */
  function applySeVolumeDisplay(volume: number): void {
    const percent = volumeToPercent(volume);
    seVolumeSlider.value = String(percent);
    seVolumeValue.textContent = `${percent}%`;
  }
  applySeVolumeDisplay(loadSeVolume(storage));
  seVolumeSlider.addEventListener("input", () => {
    const volume = percentToVolume(seVolumeSlider.value);
    saveSeVolume(volume, storage);
    seVolumeValue.textContent = `${seVolumeSlider.value}%`;
  });

  // ---------- データリセット ----------
  // 誤操作防止のため、削除は2回押して確定します(home.tsの「けす」ボタンと同じパターン)
  const resetButton = el("button", {
    className: "btn btn-ghost btn-small settings-reset-button",
    text: "データを全て削除",
    attrs: { type: "button" },
  });
  /** データ削除ボタンの確認状態を初期表示に戻します(パネルを閉じたときに呼びます)。 */
  function resetDeleteConfirmState(): void {
    delete resetButton.dataset["confirming"];
    resetButton.textContent = "データを全て削除";
    resetButton.classList.remove("btn-danger");
  }
  resetButton.addEventListener("click", () => {
    if (resetButton.dataset["confirming"] === "true") {
      resetAllData(storage);
      reload();
      return;
    }
    resetButton.dataset["confirming"] = "true";
    resetButton.textContent = "本当に削除しますか?";
    resetButton.classList.add("btn-danger");
  });

  const panel = el("div", {
    className: "settings-panel",
    attrs: {
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "settings-panel-title",
    },
  }, [
    el("div", { className: "settings-panel-head" }, [
      el("h2", { className: "settings-panel-title", text: "設定", attrs: { id: "settings-panel-title" } }),
      closeButton,
    ]),
    el("section", { className: "settings-section" }, [
      el("label", { className: "settings-row-label", text: "BGM音量" }),
      el("div", { className: "volume-row" }, [bgmVolumeSlider, bgmVolumeValue]),
    ]),
    el("section", { className: "settings-section" }, [
      el("label", { className: "settings-row-label", text: "効果音音量" }),
      el("div", { className: "volume-row" }, [seVolumeSlider, seVolumeValue]),
    ]),
    el("section", { className: "settings-section" }, [
      el("p", { className: "settings-row-label", text: "データリセット" }),
      el("p", { className: "settings-hint", text: "作成済みのファイター・ステージ・音量設定など、画像バトラーの保存データをすべて削除します。" }),
      resetButton,
    ]),
  ]);

  const overlay = el(
    "div",
    { className: "settings-overlay", attrs: { hidden: "" } },
    [panel],
  );

  /** パネルを開く直前にフォーカスしていた要素です(閉じるときに戻します)。 */
  let focusBeforeOpen: HTMLElement | null = null;

  /** パネル内のフォーカス可能な要素(Tabで循環させる対象)を返します。 */
  function focusableElements(): HTMLElement[] {
    return Array.from(
      panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      ),
    );
  }

  /** パネルを開き、フォーカスをパネル内(閉じるボタン)へ移します。 */
  function openPanel(): void {
    focusBeforeOpen =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    overlay.hidden = false;
    closeButton.focus();
  }
  /** パネルを閉じ、データ削除の確認状態をリセットし、開く前の要素へフォーカスを戻します。 */
  function closePanel(): void {
    overlay.hidden = true;
    resetDeleteConfirmState();
    focusBeforeOpen?.focus();
    focusBeforeOpen = null;
  }

  trigger.addEventListener("click", openPanel);
  closeButton.addEventListener("click", closePanel);
  // 背景(オーバーレイ自身)のクリックのみで閉じます(パネル内のクリックは伝播で除外)
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closePanel();
    }
  });
  // Escapeで閉じ、Tab/Shift+Tabはパネル内の先頭・末尾要素で循環させます
  // (モーダル(role="dialog" aria-modal="true")としての最低限のキーボード操作性です)
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const elements = focusableElements();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return { trigger, overlay };
}
