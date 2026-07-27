/**
 * @file Gemini Nano へ渡すプロンプトの組み立てです。
 * すべて日本語で生成させます。Gemini Nano は小型モデルのため、
 * 指示は短く具体的にしています。
 */
import type { AilmentType, PassiveSkillId } from "../types";
import { AILMENT_LABELS, PASSIVE_SKILL_SUMMARIES } from "../types";
import { STAT_RANGES } from "./schema";
import type { StoryIngredients } from "./story";

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

/** ストーリー(前口上)生成セッションのシステムプロンプトです。 */
export const STORY_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのオープニングを語るナレーターです。",
  "与えられた二人のファイターの設定と舞台から、これから始まるバトルの",
  "前口上を日本語で2〜3文で語ってください。",
  "前口上の本文のみを出力し、前置きや引用符は不要です。",
].join("");

/** ストーリー(前口上)生成に渡すファイター情報です。 */
export interface StoryFighter {
  name: string;
  title: string;
  description: string;
}

/**
 * バトル前口上用のプロンプトを組み立てます。
 * 舞台と因縁(ingredients)はコード側で抽選した材料です(ai/story.ts)。
 * 前口上はバトル再生前に表示するため、勝敗のネタバレを明示的に禁止します。
 */
export function buildStoryPrompt(
  first: StoryFighter,
  second: StoryFighter,
  ingredients: StoryIngredients,
): string {
  return [
    "これから始まるバトルの前口上を2〜3文で書いてください。",
    `舞台: ${ingredients.stage}`,
    `二人の関係: ${ingredients.relation}`,
    `青コーナー:「${first.title}」こと ${first.name}。${first.description}`,
    `赤コーナー:「${second.title}」こと ${second.name}。${second.description}`,
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/** 必殺技セリフ生成セッションのシステムプロンプトです。 */
export const SPEECH_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのキャラクターになりきってセリフを作る脚本家です。",
  "キャラクターの設定に合った短い決めゼリフを日本語で1つだけ作ってください。",
  "セリフ本文のみを出力し、前置きやかぎ括弧・引用符は不要です。",
].join("");

/**
 * 必殺技を放つ瞬間の決めゼリフ用プロンプトを組み立てます。
 * 舞台と因縁(ingredients)は前口上(buildStoryPrompt)と同じ抽選材料を渡し、
 * セリフの世界観を前口上と揃えます(材料が毎試合変わるため、同じキャラクター・
 * 同じ技でも試合ごとに違うセリフになります)。
 */
export function buildSpecialMoveSpeechPrompt(
  fighter: StoryFighter,
  move: { name: string; description: string },
  ingredients: StoryIngredients,
): string {
  return [
    `あなたは「${fighter.title}」こと ${fighter.name}。${fighter.description}`,
    `舞台は${ingredients.stage}。相手との関係は${ingredients.relation}。`,
    `いま必殺技「${move.name}」(${move.description})を放ちます。`,
    "技を放つ瞬間の決めゼリフを15文字以内で1つ書いてください。",
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
