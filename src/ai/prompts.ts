/**
 * @file Gemini Nano へ渡すプロンプトの組み立てです。
 * すべて日本語で生成させます。Gemini Nano は小型モデルのため、
 * 指示は短く具体的にしています。
 */
import { STAT_RANGES } from "./schema";

/** キャラクター生成セッションのシステムプロンプトです。 */
export const CHARACTER_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのキャラクターデザイナーです。",
  "渡された画像をよく観察し、写っているものの見た目・雰囲気・強そうさを",
  "ステータスと必殺技に反映させてください。",
  "出力はすべて日本語で、指定されたJSON形式のみを返してください。",
].join("");

/** 実況セッションのシステムプロンプトです。 */
export const NARRATION_SYSTEM_PROMPT = [
  "あなたは格闘ゲームの熱血実況アナウンサーです。",
  "与えられたバトル情報をもとに、日本語で1〜2文の短い実況をしてください。",
  "実況本文のみを出力し、前置きや引用符は不要です。",
].join("");

/** 実況プロンプトに渡すバトル情報です。 */
export interface NarrationParams {
  attackerName: string;
  defenderName: string;
  type: "attack" | "special" | "miss";
  critical: boolean;
  damage: number;
  defenderHpAfter: number;
  defenderMaxHp: number;
  /** type が special のときの技名 */
  specialMoveName?: string;
}

/**
 * キャラクター生成用のユーザープロンプトを組み立てます。
 * 画像と一緒に送信します。
 */
export function buildCharacterPrompt(name: string): string {
  return [
    `この画像のキャラクター「${name}」を対戦ゲームのファイターにしてください。`,
    "画像の見た目から連想して、以下を日本語で決めてください。",
    `- hp(${STAT_RANGES.hp.min}〜${STAT_RANGES.hp.max})、attack(${STAT_RANGES.attack.min}〜${STAT_RANGES.attack.max})、defense(${STAT_RANGES.defense.min}〜${STAT_RANGES.defense.max})、speed(${STAT_RANGES.speed.min}〜${STAT_RANGES.speed.max})、luck(${STAT_RANGES.luck.min}〜${STAT_RANGES.luck.max})`,
    "- title: かっこいい二つ名(10文字程度)",
    "- description: 見た目に触れた紹介文(50文字程度)",
    `- specialMove: 必殺技。name(技名)、power(${STAT_RANGES.specialPower.min}〜${STAT_RANGES.specialPower.max})、description(技の演出説明)`,
  ].join("\n");
}

/** バトル開始時の煽り実況用プロンプトを組み立てます。 */
export function buildIntroPrompt(
  first: { name: string; title: string },
  second: { name: string; title: string },
): string {
  return [
    "これからバトルが始まります。開始の煽り実況をしてください。",
    `青コーナー:「${first.title}」こと ${first.name}`,
    `赤コーナー:「${second.title}」こと ${second.name}`,
  ].join("\n");
}

/** 1アクション分の実況用プロンプトを組み立てます。 */
export function buildNarrationPrompt(params: NarrationParams): string {
  const hpInfo = `残りHPは${params.defenderHpAfter}/${params.defenderMaxHp}`;
  switch (params.type) {
    case "miss":
      return `${params.attackerName}の攻撃は${params.defenderName}にかわされて外れました。この場面を実況してください。`;
    case "special":
      return [
        `${params.attackerName}が必殺技「${params.specialMoveName ?? ""}」を放ち、`,
        `${params.defenderName}に${params.damage}ダメージを与えました。${hpInfo}。`,
        "この場面を実況してください。",
      ].join("");
    case "attack":
      return [
        `${params.attackerName}の${params.critical ? "会心の" : ""}攻撃が${params.defenderName}に命中し、`,
        `${params.damage}ダメージを与えました。${hpInfo}。`,
        "これは通常攻撃です(必殺技という言葉は使わないでください)。この場面を実況してください。",
      ].join("");
  }
}

/** バトル終了時の実況用プロンプトを組み立てます。 */
export function buildResultPrompt(
  firstName: string,
  secondName: string,
  isDraw: boolean,
): string {
  if (isDraw) {
    return `${firstName}と${secondName}の激闘は決着がつかず引き分けに終わりました。締めの実況をしてください。`;
  }
  return `${firstName}が${secondName}を打ち破って勝利しました。勝者を称える締めの実況をしてください。`;
}
