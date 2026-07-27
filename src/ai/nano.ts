/**
 * @file Chrome 内蔵 AI「Gemini Nano」(Prompt API)の薄いラッパーです。
 * キャラクター生成(画像入力 + JSON制約出力)と実況生成(テキスト)を提供します。
 *
 * Fail-Fast 方針: Prompt API が使えない環境ではフォールバックせず
 * GeminiNanoUnavailableError を投げ、UI側で有効化手順を案内します。
 */
import type { GeneratedStats } from "../types";
import { buildCharacterGenerationSchema, parseGeneratedStats } from "./schema";
import { samplePassiveCandidates } from "./passives";
import {
  CHARACTER_SYSTEM_PROMPT,
  NARRATION_SYSTEM_PROMPT,
  SPEECH_SYSTEM_PROMPT,
  STORY_SYSTEM_PROMPT,
  buildCharacterPrompt,
} from "./prompts";

/** Prompt API が利用できない環境で投げるエラーです。 */
export class GeminiNanoUnavailableError extends Error {
  override name = "GeminiNanoUnavailableError";
}

/** モデルダウンロードの進捗(0〜1)を受け取るハンドラです。 */
export type DownloadProgressHandler = (loadedRatio: number) => void;

/** キャラクター生成セッションが期待する入出力の宣言です。 */
const CHARACTER_SESSION_IO = {
  expectedInputs: [
    { type: "text", languages: ["ja"] },
    { type: "image" },
  ],
  expectedOutputs: [{ type: "text", languages: ["ja"] }],
} satisfies Pick<LanguageModelCreateOptions, "expectedInputs" | "expectedOutputs">;

/**
 * Gemini Nano の利用可否を返します。
 * Prompt API 自体が存在しないブラウザでは "unavailable" を返します。
 */
export async function checkNanoAvailability(): Promise<LanguageModelAvailability> {
  const api = globalThis.LanguageModel;
  if (api === undefined) {
    return "unavailable";
  }
  return api.availability(CHARACTER_SESSION_IO);
}

/** Prompt API のグローバルを取得します。存在しなければ throw します。 */
function requireLanguageModel(): LanguageModelStatic {
  const api = globalThis.LanguageModel;
  if (api === undefined) {
    throw new GeminiNanoUnavailableError(
      "このブラウザでは Prompt API(LanguageModel)が利用できません。デスクトップ版 Chrome 138 以降を使用してください。",
    );
  }
  return api;
}

/**
 * キャラクター生成用セッション(画像入力対応)を作成します。
 * モデル未ダウンロードの場合はダウンロードが始まり、onProgress に進捗が通知されます。
 * @throws GeminiNanoUnavailableError この環境でモデルが利用できない場合
 */
export async function createCharacterGenerationSession(
  onProgress?: DownloadProgressHandler,
): Promise<LanguageModelSession> {
  const api = requireLanguageModel();
  const availability = await api.availability(CHARACTER_SESSION_IO);
  if (availability === "unavailable") {
    throw new GeminiNanoUnavailableError(
      "この環境では Gemini Nano の画像入力が利用できません。Chrome のバージョンとハードウェア要件(空き容量22GB以上など)を確認してください。",
    );
  }
  return api.create({
    ...CHARACTER_SESSION_IO,
    initialPrompts: [{ role: "system", content: CHARACTER_SYSTEM_PROMPT }],
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const progress = event as ProgressEvent;
        onProgress?.(progress.loaded);
      });
    },
  });
}

/**
 * 画像と名前からキャラクターのステータスを生成します。
 * responseConstraint で JSON Schema に制約した出力を検証付きでパースします。
 *
 * パッシブスキルはコード側で候補を抽選し、プロンプト・スキーマ・検証の
 * すべてを候補に制約します(決定論的なモデルによる選択の偏り防止)。
 * @param rng 候補抽選用の乱数(テストでは決め打ちの列を注入します)
 * @throws CharacterParseError モデル出力が不正な場合(呼び出し側で再生成を促す)
 */
export async function generateCharacterStats(
  session: LanguageModelSession,
  name: string,
  image: Blob | ImageBitmap,
  rng: () => number = Math.random,
): Promise<GeneratedStats> {
  const passiveCandidates = samplePassiveCandidates(rng);
  const response = await session.prompt(
    [
      {
        role: "user",
        content: [
          { type: "text", value: buildCharacterPrompt(name, passiveCandidates) },
          { type: "image", value: image },
        ],
      },
    ],
    { responseConstraint: buildCharacterGenerationSchema(passiveCandidates) },
  );
  return parseGeneratedStats(response, passiveCandidates);
}

/** テキストのみのセッション(実況・ストーリー)が期待する入出力の宣言です。 */
const TEXT_SESSION_IO = {
  expectedInputs: [{ type: "text", languages: ["ja"] }],
  expectedOutputs: [{ type: "text", languages: ["ja"] }],
} satisfies Pick<LanguageModelCreateOptions, "expectedInputs" | "expectedOutputs">;

/**
 * 実況用のベースセッション(テキストのみ)を作成します。
 * @throws GeminiNanoUnavailableError この環境でモデルが利用できない場合
 */
export async function createNarrationSession(): Promise<LanguageModelSession> {
  const api = requireLanguageModel();
  return api.create({
    ...TEXT_SESSION_IO,
    initialPrompts: [{ role: "system", content: NARRATION_SYSTEM_PROMPT }],
  });
}

/**
 * 使い捨てのテキストセッションを作成して1回だけ生成する共通処理です。
 * 前口上・セリフのように使用回数が少ない生成で、セッションの持ち回りを
 * 不要にするために使います。生成の成否に関わらずセッションを破棄します。
 * @throws GeminiNanoUnavailableError この環境でモデルが利用できない場合
 */
async function generateOnce(
  systemPrompt: string,
  prompt: string,
): Promise<string> {
  const api = requireLanguageModel();
  const session = await api.create({
    ...TEXT_SESSION_IO,
    initialPrompts: [{ role: "system", content: systemPrompt }],
  });
  try {
    const response = await session.prompt(prompt);
    return response.trim();
  } finally {
    session.destroy();
  }
}

/**
 * バトル前口上(ストーリー)を1回だけ生成します。
 * @param prompt buildStoryPrompt(ai/prompts.ts)で組み立てたプロンプト
 * @throws GeminiNanoUnavailableError この環境でモデルが利用できない場合
 */
export async function generateBattleStory(prompt: string): Promise<string> {
  return generateOnce(STORY_SYSTEM_PROMPT, prompt);
}

/**
 * 必殺技の決めゼリフを1回だけ生成します。
 * @param prompt buildSpecialMoveSpeechPrompt(ai/prompts.ts)で組み立てたプロンプト
 * @throws GeminiNanoUnavailableError この環境でモデルが利用できない場合
 */
export async function generateSpecialMoveSpeech(
  prompt: string,
): Promise<string> {
  return generateOnce(SPEECH_SYSTEM_PROMPT, prompt);
}

/**
 * ベースセッションを clone して1回だけ実況を生成します。
 * clone を使うのは、セッションにコンテキストが蓄積されて小型モデルの
 * コンテキスト上限を超えるのを防ぐためです。
 */
export async function narrateOnce(
  baseSession: LanguageModelSession,
  prompt: string,
): Promise<string> {
  const session = await baseSession.clone();
  try {
    const response = await session.prompt(prompt);
    return response.trim();
  } finally {
    session.destroy();
  }
}
