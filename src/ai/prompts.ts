/**
 * @file Gemini Nano へ渡すプロンプトの組み立てです。
 * すべて日本語で生成させます。Gemini Nano は小型モデルのため、
 * 指示は短く具体的にしています。
 */
import type { AilmentType, PassiveSkillId } from "../types";
import { AILMENT_LABELS, PASSIVE_SKILL_SUMMARIES } from "../types";
import { STAT_RANGES } from "./schema";

/** キャラクター生成セッションのシステムプロンプトです。 */
export const CHARACTER_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのキャラクターデザイナーです。",
  "渡された画像をよく観察し、写っているものの見た目・雰囲気・強そうさを",
  "ステータス・必殺技・パッシブスキルに反映させてください。",
  "出力はすべて日本語で、指定されたJSON形式のみを返してください。",
].join("");

/** 実況セッションのシステムプロンプトです。 */
export const NARRATION_SYSTEM_PROMPT = [
  "あなたは格闘ゲームの熱血実況アナウンサーです。",
  "与えられたバトル情報をもとに、日本語で1〜2文の短い実況をしてください。",
  "実況本文のみを出力し、前置きや引用符は不要です。",
].join("");

/**
 * キャラクター生成用のユーザープロンプトを組み立てます。
 * 画像と一緒に送信します。
 *
 * パッシブスキルは全種類ではなく、抽選済みの候補(passiveCandidates)だけを
 * 提示します。Gemini Nano は出力が決定論的で、全種類を提示すると特定の
 * スキルに選択が偏るためです(候補の抽選は ai/passives.ts)。
 */
export function buildCharacterPrompt(
  name: string,
  passiveCandidates: readonly PassiveSkillId[],
): string {
  const passiveChoices = passiveCandidates
    .map((id) => `${id}(${PASSIVE_SKILL_SUMMARIES[id]})`)
    .join(" / ");
  return [
    `この画像のキャラクター「${name}」を対戦ゲームのファイターにしてください。`,
    "画像の見た目から連想して、以下を日本語で決めてください。",
    `- hp(${STAT_RANGES.hp.min}〜${STAT_RANGES.hp.max})、mp(${STAT_RANGES.mp.min}〜${STAT_RANGES.mp.max})、attack(${STAT_RANGES.attack.min}〜${STAT_RANGES.attack.max})、defense(${STAT_RANGES.defense.min}〜${STAT_RANGES.defense.max})、speed(${STAT_RANGES.speed.min}〜${STAT_RANGES.speed.max})、luck(${STAT_RANGES.luck.min}〜${STAT_RANGES.luck.max})`,
    "- title: かっこいい二つ名(10文字程度)",
    "- description: 見た目に触れた紹介文(50文字程度)",
    "- specialMove: 必殺技。見た目に一番合うtypeを選ぶ。",
    "  - type: attack(強力な攻撃) / heal(HP回復) / ailment(状態異常を与える) / buff(自分の攻守を上げる)",
    "  - ailment: typeがailmentのときだけ poison(毒)/paralysis(麻痺)/burn(やけど)/freeze(凍結) から選ぶ。それ以外は none",
    `  - name(技名)、power(${STAT_RANGES.specialPower.min}〜${STAT_RANGES.specialPower.max})、mpCost(${STAT_RANGES.specialMpCost.min}〜${STAT_RANGES.specialMpCost.max}。強い技ほど高くする)、description(技の演出説明。30文字以内)`,
    "- passive: パッシブスキル。見た目に一番合うidを選び、キャラ固有のかっこいい名前を付ける。",
    `  - id: ${passiveChoices}`,
    "  - name(固有名)、description(効果の紹介文。30文字以内)",
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

/**
 * 実況プロンプトに渡すバトル情報です。
 * バトルイベントのうち実況対象のもの(通常攻撃・必殺技・反撃)を、
 * キャラクターIDではなく名前で表した形です。
 * actor は行動した側、target は効果を受けた側です(自己対象の技では同一)。
 */
export type NarrationParams = {
  actorName: string;
  targetName: string;
  /** 効果適用後の target の残りHP */
  targetHpAfter: number;
  targetMaxHp: number;
} & (
  | { type: "attack"; critical: boolean; damage: number }
  | { type: "miss" }
  | { type: "special-attack"; moveName: string; damage: number }
  | { type: "special-heal"; moveName: string; healed: number }
  | { type: "special-ailment"; moveName: string; ailment: AilmentType; damage: number }
  | { type: "special-buff"; moveName: string }
  | { type: "counter"; passiveName: string; damage: number }
);

/** 1アクション分の実況用プロンプトを組み立てます。 */
export function buildNarrationPrompt(params: NarrationParams): string {
  const hpInfo = `残りHPは${params.targetHpAfter}/${params.targetMaxHp}`;
  switch (params.type) {
    case "miss":
      return `${params.actorName}の攻撃は${params.targetName}にかわされて外れました。この場面を実況してください。`;
    case "special-attack":
      return [
        `${params.actorName}が必殺技「${params.moveName}」を放ち、`,
        `${params.targetName}に${params.damage}ダメージを与えました。${hpInfo}。`,
        "この場面を実況してください。",
      ].join("");
    case "special-heal":
      return [
        `${params.actorName}が必殺技「${params.moveName}」で自分のHPを${params.healed}回復しました。${hpInfo}。`,
        "この場面を実況してください。",
      ].join("");
    case "special-ailment":
      return [
        `${params.actorName}が必殺技「${params.moveName}」で${params.targetName}に${params.damage}ダメージを与え、`,
        `${params.targetName}を${AILMENT_LABELS[params.ailment]}状態にしました。${hpInfo}。`,
        "この場面を実況してください。",
      ].join("");
    case "special-buff":
      return [
        `${params.actorName}が必殺技「${params.moveName}」で自分の攻撃力と防御力を高めました。`,
        "この場面を実況してください。",
      ].join("");
    case "counter":
      return [
        `${params.actorName}のパッシブスキル「${params.passiveName}」が発動し、`,
        `${params.targetName}に${params.damage}の反撃ダメージを与えました。${hpInfo}。`,
        "この場面を実況してください。",
      ].join("");
    case "attack":
      return [
        `${params.actorName}の${params.critical ? "会心の" : ""}攻撃が${params.targetName}に命中し、`,
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
