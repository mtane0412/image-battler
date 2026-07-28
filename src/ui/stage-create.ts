/**
 * @file ステージ作成画面です。画像アップロード + 名前入力から
 * Gemini Nano がステージ特性・特殊イベントを生成し、localStorage に保存します。
 * キャラクター作成画面(create.ts)と対称の構造です。
 *
 * IMEに関する注意: 名前入力のEnter確定はフォームのネイティブsubmitに任せており、
 * onKeyDownでEnterを検知していないため、IME変換確定で誤送信されることはありません。
 */
import type { GeneratedStage, Stage } from "../types";
import {
  GeminiNanoUnavailableError,
  createStageGenerationSession,
  generateStageStats,
} from "../ai/nano";
import { StageParseError } from "../ai/schema";
import { StorageError } from "../storage/repository";
import { saveStage } from "../storage/stage-repository";
import { stageCard } from "./card";
import { el } from "./dom";
import { createImageDropZone, showModelDownloadNotice } from "./image-upload";
import type { AppContext } from "./navigation";

/** ステージ名の最大文字数です。 */
const NAME_MAX_LENGTH = 12;

/** ステージ作成画面を描画します。 */
export function renderStageCreate(ctx: AppContext): HTMLElement {
  const screen = el("section", { className: "screen" });

  // 画面ローカルの状態です
  let selectedFile: File | null = null;
  let previewDataUrl: string | null = null;
  let generated: GeneratedStage | null = null;

  screen.append(
    el("div", { className: "section-head" }, [
      el("h2", { className: "section-title", text: "ステージをつくる" }),
      backButton(),
    ]),
  );

  // モデル未ダウンロード時は、生成ボタンでダウンロードが始まることを事前に案内します
  const noticeArea = el("div");
  screen.append(noticeArea);
  void showModelDownloadNotice(
    noticeArea,
    "初回はAIモデル(Gemini Nano・数GB)のダウンロードが必要です。「ステージを生成する」を押すと自動でダウンロードが始まります(Wi-Fi推奨)。",
  );

  // --- 入力フォーム ---
  const imageDropZone = createImageDropZone({
    inputId: "stage-image",
    placeholder: "ここに画像をドロップ / クリックして選択",
    previewAlt: "選択した画像のプレビュー",
    onAccepted(file, previewDataUrlValue) {
      clearError();
      selectedFile = file;
      previewDataUrl = previewDataUrlValue;
    },
    onError(message) {
      showError(message);
    },
  });

  const nameInput = el("input", {
    className: "text-input",
    attrs: {
      type: "text",
      id: "stage-name",
      maxlength: String(NAME_MAX_LENGTH),
      placeholder: "例: 灼熱の闘技場",
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
    text: "ステージを生成する",
    attrs: { type: "submit" },
  });

  const form = el("form", { className: "create-form" }, [
    imageDropZone.root,
    el("div", { className: "form-field" }, [
      el("label", { text: "なまえ(12文字まで)", attrs: { for: "stage-name" } }),
      nameInput,
    ]),
    statusArea,
    errorArea,
    submitButton,
  ]);

  // --- 生成結果 ---
  const resultArea = el("div", { className: "create-result" });

  screen.append(form, resultArea);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void generate();
  });

  /** Gemini Nano でステージ特性・特殊イベントを生成します。 */
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
      const session = await createStageGenerationSession((ratio) => {
        statusArea.textContent = `AIモデルをダウンロード中… ${Math.round(ratio * 100)}%(初回のみ)`;
      });
      // モデルの準備が完了したので、初回ダウンロードの案内を消します
      noticeArea.replaceChildren();
      try {
        statusArea.textContent = "AIがステージの特徴を分析しています…";
        generated = await generateStageStats(session, name, selectedFile);
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
  function renderResult(name: string, stage: GeneratedStage): void {
    if (previewDataUrl === null) {
      return;
    }
    const imageDataUrl = previewDataUrl;
    const saveButton = el("button", {
      className: "btn btn-primary",
      text: "このステージを保存する",
      attrs: { type: "button" },
    });
    saveButton.addEventListener("click", () => {
      const saved: Stage = {
        id: crypto.randomUUID(),
        name,
        imageDataUrl,
        createdAt: new Date().toISOString(),
        ...stage,
      };
      try {
        saveStage(saved);
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
      el("p", { className: "result-lead", text: "ステージが誕生しました!" }),
      stageCard({ ...stage, name, imageDataUrl }),
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
    if (error instanceof StageParseError) {
      showError(
        `AIの出力が不正でした(${error.message})。もう一度「ステージを生成する」を押してください。`,
      );
      return;
    }
    showError(`生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }

  function setBusy(busy: boolean): void {
    submitButton.disabled = busy;
    nameInput.disabled = busy;
    imageDropZone.setDisabled(busy);
    submitButton.textContent = busy ? "生成中…" : "ステージを生成する";
  }

  function showError(message: string): void {
    errorArea.replaceChildren(
      el("div", { className: "error-box" }, [el("p", { text: message })]),
    );
  }

  function clearError(): void {
    errorArea.replaceChildren();
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
