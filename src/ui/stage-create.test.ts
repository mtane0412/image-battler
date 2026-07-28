/**
 * @file ステージ作成画面(stage-create.ts)のテストです。
 * モデル未ダウンロード時の事前案内・ダウンロード進捗の文言・
 * 生成中のステータス表示を確認します(create.test.ts と対称の検証項目です)。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderStageCreate } from "./stage-create";
import type { AppContext } from "./navigation";
import {
  checkNanoAvailability,
  createStageGenerationSession,
  generateStageStats,
} from "../ai/nano";
import { fileToResizedDataUrl } from "../image/resize";

vi.mock("../ai/nano", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/nano")>();
  return {
    ...actual,
    checkNanoAvailability: vi.fn(),
    createStageGenerationSession: vi.fn(),
    generateStageStats: vi.fn(),
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
  const fileInput = screen.querySelector<HTMLInputElement>("#stage-image");
  const nameInput = screen.querySelector<HTMLInputElement>("#stage-name");
  const form = screen.querySelector("form");
  if (fileInput === null || nameInput === null || form === null) {
    throw new Error("フォーム要素が見つかりません");
  }
  const file = new File(["ダミー画像データ"], "闘技場.png", {
    type: "image/png",
  });
  Object.defineProperty(fileInput, "files", { value: [file] });
  fileInput.dispatchEvent(new Event("change"));
  await flushPromises();
  nameInput.value = "灼熱の闘技場";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fileToResizedDataUrl).mockResolvedValue(
    "data:image/jpeg;base64,dGVzdA==",
  );
});

describe("renderStageCreate: 初回ダウンロードの事前案内", () => {
  it("モデルが未ダウンロード(downloadable)のとき、生成ボタンでダウンロードが始まる旨を案内する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("downloadable");
    const screen = renderStageCreate(ctx);
    await flushPromises();
    const notice = screen.querySelector(".notice");
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain("初回はAIモデル");
    expect(notice?.textContent).toContain("ダウンロード");
  });

  it("モデルがダウンロード済み(available)のとき、案内を表示しない", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("available");
    const screen = renderStageCreate(ctx);
    await flushPromises();
    expect(screen.querySelector(".notice")).toBeNull();
  });
});

describe("renderStageCreate: 生成中のステータス表示", () => {
  it("ダウンロード進捗を「AIモデルをダウンロード中…」の形式で表示する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("downloadable");
    let capturedOnProgress: ((ratio: number) => void) | undefined;
    vi.mocked(createStageGenerationSession).mockImplementation(
      (onProgress) => {
        capturedOnProgress = onProgress;
        return new Promise(() => {});
      },
    );
    const screen = renderStageCreate(ctx);
    await submitForm(screen);
    if (capturedOnProgress === undefined) {
      throw new Error("進捗ハンドラが渡されていません");
    }
    capturedOnProgress(0.42);
    expect(screen.querySelector(".status-line")?.textContent).toBe(
      "AIモデルをダウンロード中… 42%(初回のみ)",
    );
  });

  it("生成中は「AIがステージの特徴を分析しています…」を表示する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("available");
    vi.mocked(createStageGenerationSession).mockResolvedValue(
      makeFakeSession(),
    );
    vi.mocked(generateStageStats).mockReturnValue(new Promise(() => {}));
    const screen = renderStageCreate(ctx);
    await submitForm(screen);
    expect(screen.querySelector(".status-line")?.textContent).toBe(
      "AIがステージの特徴を分析しています…",
    );
  });

  it("生成に成功したらステージカードと保存ボタンを表示する", async () => {
    vi.mocked(checkNanoAvailability).mockResolvedValue("available");
    vi.mocked(createStageGenerationSession).mockResolvedValue(
      makeFakeSession(),
    );
    vi.mocked(generateStageStats).mockResolvedValue({
      title: "業火の舞台",
      description: "溶岩が渦巻くステージです",
      trait: { id: "blazing", name: "灼熱のオーラ", description: "全員の攻撃力が上がる" },
      event: { id: "meteor", name: "隕石落とし", description: "隕石が降り注ぐ" },
    });
    const screen = renderStageCreate(ctx);
    await submitForm(screen);
    expect(screen.querySelector(".stage-card-name")?.textContent).toBe(
      "灼熱の闘技場",
    );
    expect(
      screen.querySelector(".result-actions button")?.textContent,
    ).toContain("保存");
  });
});
