/**
 * @file Chrome 内蔵 AI「Gemini Nano」を利用する Prompt API(`LanguageModel`)の型定義です。
 * Prompt API は実験的 API のため TypeScript 標準の lib.dom.d.ts には含まれておらず、
 * このファイルでアンビエント宣言を行います。
 * 参考: https://developer.chrome.com/docs/ai/prompt-api
 *
 * 注意事項:
 * - Chrome 138 以降のデスクトップ版でのみ利用できます。
 * - 非対応ブラウザでは `globalThis.LanguageModel` が undefined になります。
 */

/** モデルの利用可否を表す状態です。 */
type LanguageModelAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

/** セッション作成時に期待する入出力の種別・言語の宣言です。 */
interface LanguageModelExpected {
  type: "text" | "image" | "audio";
  languages?: string[];
}

/** マルチモーダルプロンプトのコンテンツ1要素です。 */
interface LanguageModelMessageContent {
  type: "text" | "image" | "audio";
  value:
    | string
    | Blob
    | ImageBitmap
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageData;
}

/** プロンプトメッセージ1件です。 */
interface LanguageModelMessage {
  role: "system" | "user" | "assistant";
  content: string | LanguageModelMessageContent[];
}

/** セッション作成オプションです。 */
interface LanguageModelCreateOptions {
  initialPrompts?: LanguageModelMessage[];
  expectedInputs?: LanguageModelExpected[];
  expectedOutputs?: LanguageModelExpected[];
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
  monitor?(monitor: EventTarget): void;
}

/** prompt() 実行時のオプションです。 */
interface LanguageModelPromptOptions {
  /** JSON Schema を渡すと、モデル出力がそのスキーマに制約されます。 */
  responseConstraint?: object;
  signal?: AbortSignal;
}

/** 生成セッションです。会話コンテキストを保持します。 */
interface LanguageModelSession {
  prompt(
    input: string | LanguageModelMessage[],
    options?: LanguageModelPromptOptions,
  ): Promise<string>;
  promptStreaming(
    input: string | LanguageModelMessage[],
    options?: LanguageModelPromptOptions,
  ): ReadableStream<string>;
  /** コンテキストを初期状態(initialPrompts のみ)に戻した複製を作成します。 */
  clone(): Promise<LanguageModelSession>;
  destroy(): void;
}

/** `LanguageModel` グローバルの静的インターフェースです。 */
interface LanguageModelStatic {
  availability(
    options?: Pick<
      LanguageModelCreateOptions,
      "expectedInputs" | "expectedOutputs"
    >,
  ): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

/** 非対応ブラウザでは undefined になるため、必ず存在チェックを行ってください。 */
// eslint-disable-next-line no-var
declare var LanguageModel: LanguageModelStatic | undefined;
