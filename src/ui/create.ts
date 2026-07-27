/**
 * @file キャラクター作成画面です。画像アップロード + 名前入力から
 * Gemini Nano がステータス・必殺技を生成し、localStorage に保存します。
 *
 * IMEに関する注意: 名前入力のEnter確定はフォームのネイティブsubmitに任せており、
 * onKeyDownでEnterを検知していないため、IME変換確定で誤送信されることはありません。
 */
import type { Character, GeneratedStats } from "../types";
import {
  GeminiNanoUnavailableError,
  checkNanoAvailability,
  createCharacterGenerationSession,
  generateCharacterStats,
} from "../ai/nano";
import { CharacterParseError } from "../ai/schema";
import { StorageError, saveCharacter } from "../storage/repository";
import { fileToResizedDataUrl } from "../image/resize";
import { characterCard } from "./card";
import { el } from "./dom";
import type { AppContext } from "./navigation";

/** キャラクター名の最大文字数です。 */
const NAME_MAX_LENGTH = 12;

/** キャラクター作成画面を描画します。 */
export function renderCreate(ctx: AppContext): HTMLElement {
  const screen = el("section", { className: "screen" });

  // 画面ローカルの状態です
  let selectedFile: File | null = null;
  let previewDataUrl: string | null = null;
  let generated: GeneratedStats | null = null;

  screen.append(
    el("div", { className: "section-head" }, [
      el("h2", { className: "section-title", text: "ファイターをつくる" }),
      backButton(),
    ]),
  );

  // モデル未ダウンロード時は、生成ボタンでダウンロードが始まることを事前に案内します
  const noticeArea = el("div");
  screen.append(noticeArea);
  void showDownloadNotice(noticeArea);

  // --- 入力フォーム ---
  const fileInput = el("input", {
    attrs: { type: "file", accept: "image/*", id: "fighter-image" },
  });
  const dropZoneInner = el("span", {
    className: "drop-zone-placeholder",
    text: "ここに画像をドロップ / クリックして選択",
  });
  const dropZone = el("label", {
    className: "drop-zone",
    attrs: { for: "fighter-image" },
  }, [fileInput, dropZoneInner]);

  const nameInput = el("input", {
    className: "text-input",
    attrs: {
      type: "text",
      id: "fighter-name",
      maxlength: String(NAME_MAX_LENGTH),
      placeholder: "例: もふ吉",
      autocomplete: "off",
    },
  });

  const statusArea = el("p", {
    className: "status-line",
    attrs: { "aria-live": "polite" },
  });
  const errorArea = el("div");
  const submitButton = el("button", {
    className: "btn btn-primary btn-large",
    text: "ファイターを生成する",
    attrs: { type: "submit" },
  });

  const form = el("form", { className: "create-form" }, [
    dropZone,
    el("div", { className: "form-field" }, [
      el("label", { text: "なまえ(12文字まで)", attrs: { for: "fighter-name" } }),
      nameInput,
    ]),
    statusArea,
    errorArea,
    submitButton,
  ]);

  // --- 生成結果 ---
  const resultArea = el("div", { className: "create-result" });

  screen.append(form, resultArea);

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void generate();
  });

  /** 選択された画像を検証し、縮小プレビューを表示します。 */
  async function acceptFile(file: File): Promise<void> {
    clearError();
    if (!file.type.startsWith("image/")) {
      showError("画像ファイル(JPEG・PNGなど)を選択してください。");
      return;
    }
    try {
      // 保存用と同じ縮小画像をプレビューにも使います
      previewDataUrl = await fileToResizedDataUrl(file);
      selectedFile = file;
      dropZone.classList.add("drop-zone-filled");
      dropZoneInner.replaceChildren(
        el("img", {
          className: "drop-zone-preview",
          attrs: { src: previewDataUrl, alt: "選択した画像のプレビュー" },
        }),
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Gemini Nano でステータスを生成します。 */
  async function generate(): Promise<void> {
    clearError();
    const name = nameInput.value.trim();
    if (selectedFile === null || previewDataUrl === null) {
      showError("画像を選択してください。");
      return;
    }
    if (name === "") {
      showError("なまえを入力してください。");
      return;
    }

    setBusy(true);
    resultArea.replaceChildren();
    generated = null;
    try {
      statusArea.textContent = "Gemini Nano を準備しています…";
      const session = await createCharacterGenerationSession((ratio) => {
        statusArea.textContent = `AIモデルをダウンロード中… ${Math.round(ratio * 100)}%(初回のみ)`;
      });
      // モデルの準備が完了したので、初回ダウンロードの案内を消します
      noticeArea.replaceChildren();
      try {
        statusArea.textContent = "AIが画像から戦闘力を算出しています…";
        generated = await generateCharacterStats(session, name, selectedFile);
      } finally {
        session.destroy();
      }
      statusArea.textContent = "";
      renderResult(name, generated);
    } catch (error) {
      statusArea.textContent = "";
      showGenerationError(error);
    } finally {
      setBusy(false);
    }
  }

  /** 生成結果カードと保存ボタンを表示します。 */
  function renderResult(name: string, stats: GeneratedStats): void {
    if (previewDataUrl === null) {
      return;
    }
    const imageDataUrl = previewDataUrl;
    const saveButton = el("button", {
      className: "btn btn-primary",
      text: "このファイターを保存する",
      attrs: { type: "button" },
    });
    saveButton.addEventListener("click", () => {
      const character: Character = {
        id: crypto.randomUUID(),
        name,
        imageDataUrl,
        createdAt: new Date().toISOString(),
        ...stats,
      };
      try {
        saveCharacter(character);
        ctx.navigate({ name: "home" });
      } catch (error) {
        showError(
          error instanceof StorageError
            ? error.message
            : `保存に失敗しました: ${String(error)}`,
        );
      }
    });
    const retryButton = el("button", {
      className: "btn btn-ghost",
      text: "べつの結果を生成しなおす",
      attrs: { type: "button" },
    });
    retryButton.addEventListener("click", () => {
      void generate();
    });

    resultArea.replaceChildren(
      el("p", { className: "result-lead", text: "ファイターが誕生しました!" }),
      characterCard({ ...stats, name, imageDataUrl }),
      el("div", { className: "result-actions" }, [saveButton, retryButton]),
    );
    resultArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /** 生成エラーの種類に応じてメッセージを表示します。 */
  function showGenerationError(error: unknown): void {
    if (error instanceof GeminiNanoUnavailableError) {
      showError(
        `${error.message} ホーム画面に有効化の手順があります。`,
      );
      return;
    }
    if (error instanceof CharacterParseError) {
      showError(
        `AIの出力が不正でした(${error.message})。もう一度「ファイターを生成する」を押してください。`,
      );
      return;
    }
    showError(`生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }

  function setBusy(busy: boolean): void {
    submitButton.disabled = busy;
    nameInput.disabled = busy;
    fileInput.disabled = busy;
    submitButton.textContent = busy ? "生成中…" : "ファイターを生成する";
  }

  function showError(message: string): void {
    errorArea.replaceChildren(
      el("div", { className: "error-box" }, [el("p", { text: message })]),
    );
  }

  function clearError(): void {
    errorArea.replaceChildren();
  }

  /**
   * Gemini Nano のモデルが未ダウンロードの場合に、生成ボタンで
   * 初回ダウンロードが始まることを事前に案内します。
   */
  async function showDownloadNotice(area: HTMLElement): Promise<void> {
    const availability = await checkNanoAvailability();
    if (availability !== "downloadable" && availability !== "downloading") {
      return;
    }
    area.replaceChildren(
      el("div", { className: "notice" }, [
        el("p", {
          text: "初回はAIモデル(Gemini Nano・数GB)のダウンロードが必要です。「ファイターを生成する」を押すと自動でダウンロードが始まります(Wi-Fi推奨)。",
        }),
      ]),
    );
  }

  /** ホームに戻るボタンです。 */
  function backButton(): HTMLButtonElement {
    const node = el("button", {
      className: "btn btn-ghost",
      text: "← ホームへ",
      attrs: { type: "button" },
    });
    node.addEventListener("click", () => ctx.navigate({ name: "home" }));
    return node;
  }

  return screen;
}
