/**
 * @file 設定パネル(settings-panel.ts)のテストです。
 *
 * 検証項目:
 * - 歯車ボタンで開閉できること、背景クリック・閉じるボタンで閉じられること
 * - BGM/効果音の音量スライダーが保存済みの設定を反映し、操作すると保存されること
 * - BGM音量変更時はBgmPlayer.setVolume()も呼ばれ、再生中の音量へ即座に反映すること
 * - データ削除ボタンは2回押して確定するパターンで、確定時にresetAllDataとreloadが
 *   呼ばれること。パネルを閉じると確認状態がリセットされること
 * - モーダルとしてのフォーカス管理(開いたら先頭要素にフォーカス、Escapeで閉じる、
 *   Tab/Shift+Tabでパネル内を循環、閉じたらトリガーへフォーカスを戻す)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsPanel } from "./settings-panel";
import { loadBgmVolume, saveBgmVolume, type BgmPlayer } from "../audio/bgm";
import { loadSeVolume, saveSeVolume } from "../audio/se";

/** テスト用のインメモリStorage実装です(実際のlocalStorageを汚さないため)。 */
function createFakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size;
    },
  };
}

/** テスト用のBgmPlayerフェイクです(setVolumeの呼び出しだけ記録します)。 */
function createFakeBgmPlayer(): Pick<BgmPlayer, "setVolume"> & {
  setVolumeCalls: number[];
} {
  const setVolumeCalls: number[] = [];
  return {
    setVolumeCalls,
    setVolume(volume: number): void {
      setVolumeCalls.push(volume);
    },
  };
}

describe("createSettingsPanel", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("歯車ボタンを押すと設定パネルが開く", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    expect(overlay.hidden).toBe(true);
    trigger.click();
    expect(overlay.hidden).toBe(false);
  });

  it("閉じるボタンを押すと設定パネルが閉じる", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    trigger.click();
    const closeButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-close",
    );
    if (closeButton === null) throw new Error("閉じるボタンが見つかりません");
    closeButton.click();
    expect(overlay.hidden).toBe(true);
  });

  it("オーバーレイの背景をクリックすると閉じる", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    trigger.click();
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(overlay.hidden).toBe(true);
  });

  it("パネル内をクリックしても閉じない", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    trigger.click();
    const panel = overlay.querySelector<HTMLElement>(".settings-panel");
    if (panel === null) throw new Error("パネルが見つかりません");
    panel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(overlay.hidden).toBe(false);
  });

  it("BGM音量スライダーの初期値は保存済みの設定を反映する", () => {
    saveBgmVolume(0.6, storage);
    const { overlay } = createSettingsPanel({ storage });
    const slider = overlay.querySelector<HTMLInputElement>(
      ".bgm-volume-slider",
    );
    if (slider === null) throw new Error("BGM音量スライダーが見つかりません");
    expect(slider.value).toBe("60");
  });

  it("BGM音量スライダーを操作すると保存され、BgmPlayer.setVolume()が呼ばれる", () => {
    const bgmPlayer = createFakeBgmPlayer();
    const { overlay } = createSettingsPanel({ storage, bgmPlayer });
    const slider = overlay.querySelector<HTMLInputElement>(
      ".bgm-volume-slider",
    );
    if (slider === null) throw new Error("BGM音量スライダーが見つかりません");
    slider.value = "80";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(loadBgmVolume(storage)).toBe(0.8);
    expect(bgmPlayer.setVolumeCalls).toEqual([0.8]);
  });

  it("効果音音量スライダーの初期値は保存済みの設定を反映する", () => {
    saveSeVolume(0.3, storage);
    const { overlay } = createSettingsPanel({ storage });
    const slider = overlay.querySelector<HTMLInputElement>(
      ".se-volume-slider",
    );
    if (slider === null) throw new Error("効果音音量スライダーが見つかりません");
    expect(slider.value).toBe("30");
  });

  it("効果音音量スライダーを操作すると保存される", () => {
    const { overlay } = createSettingsPanel({ storage });
    const slider = overlay.querySelector<HTMLInputElement>(
      ".se-volume-slider",
    );
    if (slider === null) throw new Error("効果音音量スライダーが見つかりません");
    slider.value = "20";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    expect(loadSeVolume(storage)).toBe(0.2);
  });

  it("データ削除ボタンは1回目のクリックで確認文言に変わり、削除は実行されない", () => {
    const reload = vi.fn();
    storage.setItem("image-battler:characters", "山田太郎のデータ");
    const { overlay } = createSettingsPanel({ storage, reload });
    const resetButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-reset-button",
    );
    if (resetButton === null) throw new Error("データ削除ボタンが見つかりません");
    resetButton.click();
    expect(resetButton.textContent).toContain("本当に");
    expect(storage.getItem("image-battler:characters")).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("データ削除ボタンを2回押すと全データを削除しページを再読み込みする", () => {
    const reload = vi.fn();
    storage.setItem("image-battler:characters", "山田太郎のデータ");
    const { overlay } = createSettingsPanel({ storage, reload });
    const resetButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-reset-button",
    );
    if (resetButton === null) throw new Error("データ削除ボタンが見つかりません");
    resetButton.click();
    resetButton.click();
    expect(storage.getItem("image-battler:characters")).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("パネルを閉じて再度開くと削除確認の状態がリセットされる", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    trigger.click();
    const resetButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-reset-button",
    );
    if (resetButton === null) throw new Error("データ削除ボタンが見つかりません");
    resetButton.click();
    expect(resetButton.textContent).toContain("本当に");

    const closeButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-close",
    );
    if (closeButton === null) throw new Error("閉じるボタンが見つかりません");
    closeButton.click();
    trigger.click();
    expect(resetButton.textContent).not.toContain("本当に");
  });
});

describe("createSettingsPanel のフォーカス管理(モーダルとしてのアクセシビリティ)", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("パネルを開くと閉じるボタンにフォーカスが移動する", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    document.body.append(trigger, overlay);
    trigger.click();
    const closeButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-close",
    );
    expect(document.activeElement).toBe(closeButton);
    trigger.remove();
    overlay.remove();
  });

  it("Escapeキーを押すとパネルが閉じる", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    document.body.append(trigger, overlay);
    trigger.click();
    overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(overlay.hidden).toBe(true);
    trigger.remove();
    overlay.remove();
  });

  it("パネルを閉じるとトリガーボタンにフォーカスが戻る", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    document.body.append(trigger, overlay);
    trigger.focus();
    trigger.click();
    const closeButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-close",
    );
    if (closeButton === null) throw new Error("閉じるボタンが見つかりません");
    closeButton.click();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    overlay.remove();
  });

  it("最後の要素でTabを押すと最初の要素(閉じるボタン)へ循環する", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    document.body.append(trigger, overlay);
    trigger.click();
    const closeButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-close",
    );
    const resetButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-reset-button",
    );
    if (closeButton === null || resetButton === null) {
      throw new Error("パネル内のボタンが見つかりません");
    }
    resetButton.focus();
    overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(closeButton);
    trigger.remove();
    overlay.remove();
  });

  it("先頭の要素でShift+Tabを押すと最後の要素(データ削除ボタン)へ循環する", () => {
    const { trigger, overlay } = createSettingsPanel({ storage });
    document.body.append(trigger, overlay);
    trigger.click();
    const closeButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-close",
    );
    const resetButton = overlay.querySelector<HTMLButtonElement>(
      ".settings-reset-button",
    );
    if (closeButton === null || resetButton === null) {
      throw new Error("パネル内のボタンが見つかりません");
    }
    closeButton.focus();
    overlay.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(resetButton);
    trigger.remove();
    overlay.remove();
  });
});
