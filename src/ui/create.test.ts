/**
 * @file キャラクター作成画面(create.ts)のテストです。
 * モデル未ダウンロード時の事前案内・ダウンロード進捗の文言・
 * 生成中のステータス表示を確認します。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderCreate } from "./create";
import type { AppContext } from "./navigation";
import {
  checkNanoAvailability,
  createCharacterGenerationSession,
  generateCharacterStats,
} from "../ai/nano";
import { fileToResizedDataUrl } from "../image/resize";

// Prompt API(Gemini Nano)と canvas(画像縮小)は jsdom に存在しない外部依存のためモックします
vi.mock("../ai/nano", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/nano")>();
  return {
    ...actual,
    checkNanoAvailability: vi.fn(),
    createCharacterGenerationSession: vi.fn(),
    generateCharacterStats: vi.fn(),
  };
});
vi.mock("../image/resize", () => ({
  fileToResizedDataUrl: vi.fn(),
}));

/** 画面遷移を記録するだけのテスト用コンテキストです。 */
const ctx: AppContext = { navigate: vi.fn() };

/** インターフェースだけを満たすテスト用のダミーセッションを作ります。 */
function makeFakeSession(): LanguageModelSession {
  return {
    prompt: vi.fn().mockResolvedValue(""),
    promptStreaming: vi.fn(),
    clone: vi.fn(),
    destroy: vi.fn(),
  };
}

/** setTimeout(0) まで待ち、保留中の非同期処理をDOMに反映させます。 */
async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 画像選択と名前入力を済ませ、フォームを送信して生成フローを開始します。
 * jsdom では input.files を直接設定できないため defineProperty で注入します。
 */
async function submitForm(screen: HTMLElement): Promise<void> {
  const fileInput = screen.querySelector<HTMLInputElement>("#fighter-image");
  const nameInput = screen.querySelector<HTMLInputElement>("#fighter-name");
  const form = screen.querySelector("form");
  if (fileInput === null || nameInput === null || form === null) {
    throw new Error("フォーム要素が見つかりません");
  }
  const file = new File(["ダミー画像データ"], "もふ吉.png", {
    type: "image/png",
  });
  Object.defineProperty(fileInput, "files", { value: [file] });
  fileInput.dispatchEvent(new Event("change"));
  await flushPromises();
  nameInput.value = "もふ吉";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fileToResizedDataUrl).mockResolvedValue(
    "data:image/jpeg;base64,dGVzdA==",
  );
});

describe("renderCreate: 初回ダウンロードの事前案内", () => {
  it("モデルが未ダウンロード(downloadable)のとき、生成ボタンでダウンロードが始まる旨を案内する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("downloadable");
    const screen = renderCreate(ctx);
    await flushPromises();
    const notice = screen.querySelector(".notice");
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain("初回はAIモデル");
    expect(notice?.textContent).toContain("ダウンロード");
  });

  it("モデルがダウンロード済み(available)のとき、案内を表示しない", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("available");
    const screen = renderCreate(ctx);
    await flushPromises();
    expect(screen.querySelector(".notice")).toBeNull();
  });

  it("セッション作成に成功したら(モデル準備完了)、案内を消す", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("downloadable");
    vi.mocked(createCharacterGenerationSession).mockResolvedValue(
      makeFakeSession(),
    );
    // 生成は完了させず、セッション作成直後の状態を検証します
    vi.mocked(generateCharacterStats).mockReturnValue(new Promise(() => {}));
    const screen = renderCreate(ctx);
    await flushPromises();
    expect(screen.querySelector(".notice")).not.toBeNull();
    await submitForm(screen);
    expect(screen.querySelector(".notice")).toBeNull();
  });
});

describe("renderCreate: 生成中のステータス表示", () => {
  it("ダウンロード進捗を「AIモデルをダウンロード中…」の形式で表示する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("downloadable");
    // セッション作成を保留し、その間に進捗ハンドラを呼んで表示を検証します
    let capturedOnProgress: ((ratio: number) => void) | undefined;
    vi.mocked(createCharacterGenerationSession).mockImplementation(
      (onProgress) => {
        capturedOnProgress = onProgress;
        return new Promise(() => {});
      },
    );
    const screen = renderCreate(ctx);
    await submitForm(screen);
    if (capturedOnProgress === undefined) {
      throw new Error("進捗ハンドラが渡されていません");
    }
    capturedOnProgress(0.42);
    expect(screen.querySelector(".status-line")?.textContent).toBe(
      "AIモデルをダウンロード中… 42%(初回のみ)",
    );
  });

  it("生成中は「AIが画像から戦闘力を算出しています…」を表示する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("available");
    vi.mocked(createCharacterGenerationSession).mockResolvedValue(
      makeFakeSession(),
    );
    // 生成を保留したままにして、生成中のステータス文言を検証します
    vi.mocked(generateCharacterStats).mockReturnValue(new Promise(() => {}));
    const screen = renderCreate(ctx);
    await submitForm(screen);
    expect(screen.querySelector(".status-line")?.textContent).toBe(
      "AIが画像から戦闘力を算出しています…",
    );
  });
});
