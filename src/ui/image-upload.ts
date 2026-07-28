/**
 * @file 画像アップロードUIの共通部品です。
 * キャラクター作成画面(create.ts)とステージ作成画面(stage-create.ts)の
 * どちらも「画像ドロップゾーン + 縮小プレビュー」「モデル未ダウンロード時の
 * 事前案内」を必要とするため、ここに切り出して共用します。
 */
import { checkNanoAvailability } from "../ai/nano";
import { fileToResizedDataUrl } from "../image/resize";
import { el } from "./dom";

/** 画像ドロップゾーンの生成オプションです。 */
export interface ImageDropZoneOptions {
  /** input要素のid(labelのfor属性と対応させます) */
  inputId: string;
  /** 未選択時にドロップゾーン内へ表示するプレースホルダーテキスト */
  placeholder: string;
  /** 選択後のプレビュー画像のaltテキスト */
  previewAlt: string;
  /** 画像として読み込め、縮小プレビューの生成にも成功したときに呼ばれます */
  onAccepted: (file: File, previewDataUrl: string) => void;
  /** 画像として不正・縮小処理に失敗したときに呼ばれます */
  onError: (message: string) => void;
}

/** 画像ドロップゾーンです。 */
export interface ImageDropZone {
  root: HTMLElement;
  /** 生成中などに選択操作を無効化/有効化します。 */
  setDisabled(disabled: boolean): void;
}

/**
 * 画像ドロップゾーン(クリック選択・ドラッグ&ドロップ・縮小プレビュー表示)を作ります。
 */
export function createImageDropZone(
  options: ImageDropZoneOptions,
): ImageDropZone {
  const fileInput = el("input", {
    attrs: { type: "file", accept: "image/*", id: options.inputId },
  });
  const dropZoneInner = el("span", {
    className: "drop-zone-placeholder",
    text: options.placeholder,
  });
  const dropZone = el(
    "label",
    {
      className: "drop-zone",
      attrs: { for: options.inputId },
    },
    [fileInput, dropZoneInner],
  );

  /** 選択された画像を検証し、縮小プレビューを表示します。 */
  async function acceptFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      options.onError("画像ファイル(JPEG・PNGなど)を選択してください。");
      return;
    }
    try {
      const previewDataUrl = await fileToResizedDataUrl(file);
      dropZone.classList.add("drop-zone-filled");
      dropZoneInner.replaceChildren(
        el("img", {
          className: "drop-zone-preview",
          attrs: { src: previewDataUrl, alt: options.previewAlt },
        }),
      );
      options.onAccepted(file, previewDataUrl);
    } catch (error) {
      options.onError(error instanceof Error ? error.message : String(error));
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      void acceptFile(file);
    }
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drop-zone-active");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drop-zone-active");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drop-zone-active");
    const file = event.dataTransfer?.files[0];
    if (file !== undefined) {
      void acceptFile(file);
    }
  });

  return {
    root: dropZone,
    setDisabled(disabled: boolean): void {
      fileInput.disabled = disabled;
    },
  };
}

/**
 * Gemini Nano のモデルが未ダウンロードの場合に、指定した操作で
 * 初回ダウンロードが始まることを事前に案内します。
 * @param message 案内文(呼び出し画面のボタン名に合わせて渡します)
 */
export async function showModelDownloadNotice(
  area: HTMLElement,
  message: string,
): Promise<void> {
  const availability = await checkNanoAvailability();
  if (availability !== "downloadable" && availability !== "downloading") {
    return;
  }
  // 非同期で出現する案内のため、role="status" でスクリーンリーダーにも通知します
  area.replaceChildren(
    el("div", { className: "notice", attrs: { role: "status" } }, [
      el("p", { text: message }),
    ]),
  );
}
