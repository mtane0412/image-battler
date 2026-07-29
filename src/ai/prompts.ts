/**
 * @file Gemini Nano へ渡すプロンプトの組み立てです。
 * すべて日本語で生成させます。Gemini Nano は小型モデルのため、
 * 指示は短く具体的にしています。
 */
import type { AilmentType, PassiveSkillId, StageEventId, StageTraitId } from "../types";
import {
  AILMENT_LABELS,
  PASSIVE_SKILL_SUMMARIES,
  STAGE_EVENT_SUMMARIES,
  STAGE_TRAIT_SUMMARIES,
} from "../types";
import { STAT_RANGES } from "./schema";
import type { StoryIngredients } from "./story";
import { ENDING_RANK_TONES, type StoryEndingRank, type StoryRecord } from "../story/plan";

/** キャラクター生成セッションのシステムプロンプトです。 */
export const CHARACTER_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのキャラクターデザイナーです。",
  "渡された画像をよく観察し、写っているものの見た目・雰囲気・強そうさを",
  "ステータス・必殺技・パッシブスキルに反映させてください。",
  "出力はすべて日本語で、指定されたJSON形式のみを返してください。",
].join("");

/** ステージ生成セッションのシステムプロンプトです。 */
export const STAGE_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのステージデザイナーです。",
  "渡された画像をよく観察し、写っているものの見た目・雰囲気を",
  "ステージ特性・特殊イベントに反映させてください。",
  "出力はすべて日本語で、指定されたJSON形式のみを返してください。",
].join("");

/**
 * ステージ生成用のユーザープロンプトを組み立てます。画像と一緒に送信します。
 *
 * 特性・特殊イベントは全種類ではなく、抽選済みの候補(traitCandidates/
 * eventCandidates)だけを提示します(ai/stages.ts で抽選、キャラクター生成の
 * パッシブ候補提示と同じ理由です)。
 */
export function buildStagePrompt(
  name: string,
  traitCandidates: readonly StageTraitId[],
  eventCandidates: readonly StageEventId[],
): string {
  const traitChoices = traitCandidates
    .map((id) => `${id}(${STAGE_TRAIT_SUMMARIES[id]})`)
    .join(" / ");
  const eventChoices = eventCandidates
    .map((id) => `${id}(${STAGE_EVENT_SUMMARIES[id]})`)
    .join(" / ");
  return [
    `この画像のステージ「${name}」を対戦ゲームの舞台にしてください。`,
    "画像の見た目から連想して、以下を日本語で決めてください。",
    "- title: ステージ名(10文字程度)",
    "- description: 見た目に触れた紹介文(50文字程度)",
    "- trait: 常時発動するステージ特性。見た目に一番合うidを選び、かっこいい固有名を付ける。",
    `  - id: ${traitChoices}`,
    "  - name(固有名)、description(効果の紹介文。30文字以内)",
    "- event: ラウンド開始時に発動する特殊イベント。見た目に一番合うidを選び、かっこいい固有名を付ける。",
    `  - id: ${eventChoices}`,
    "  - name(固有名)、description(効果の紹介文。30文字以内)",
  ].join("\n");
}

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
  "与えられたファイターたちの設定と舞台から、これから始まるバトルの",
  "前口上を日本語で2〜3文で語ってください。",
  "前口上の本文のみを出力し、前置きや引用符は不要です。",
].join("");

/** ストーリー(前口上)生成に渡すファイター情報です。 */
export interface StoryFighter {
  name: string;
  title: string;
  description: string;
}

/** タッグバトル(2v2)かどうかをチーム人数から判定します。 */
function isTagBattle(
  firstTeam: readonly unknown[],
  secondTeam: readonly unknown[],
): boolean {
  return firstTeam.length > 1 || secondTeam.length > 1;
}

/**
 * バトル前口上用のプロンプトを組み立てます(1v1・2v2共通)。
 * 舞台と因縁(ingredients)はコード側で抽選した材料です(ai/story.ts)。
 * 前口上はバトル再生前に表示するため、勝敗のネタバレを明示的に禁止します。
 */
export function buildStoryPrompt(
  firstTeam: readonly StoryFighter[],
  secondTeam: readonly StoryFighter[],
  ingredients: StoryIngredients,
): string {
  const tag = isTagBattle(firstTeam, secondTeam);
  const cornerLine = (corner: string, fighter: StoryFighter): string =>
    `${corner}:「${fighter.title}」こと ${fighter.name}。${fighter.description}`;
  return [
    tag
      ? "これから始まる2対2のタッグバトルの前口上を2〜3文で書いてください。"
      : "これから始まるバトルの前口上を2〜3文で書いてください。",
    `舞台: ${ingredients.stage}`,
    `${tag ? "両チームの関係" : "二人の関係"}: ${ingredients.relation}`,
    ...firstTeam.map((fighter) => cornerLine("青コーナー", fighter)),
    ...secondTeam.map((fighter) => cornerLine("赤コーナー", fighter)),
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/**
 * 対戦相手の名前一覧を、セリフ用プロンプトに埋め込む1つのラベルへ整形します。
 * バトルロイヤルでは相手が最大9人になり得るため、3人以上は「先頭たちn人」に
 * 丸めて文字列長を有界にします(2人までは1v1・2v2の従来表記と同じです)。
 */
export function formatOpponentsLabel(names: readonly string[]): string {
  const head = names[0];
  if (head === undefined) {
    throw new Error("相手の名前が1人分もありません");
  }
  if (names.length <= 2) {
    return names.join("と");
  }
  return `${head}たち${names.length}人`;
}

/** バトルロイヤルの参加者1人分のエントリー行(番号・二つ名・名前)を組み立てます。 */
function entryLine(
  index: number,
  fighter: { name: string; title: string },
): string {
  return `エントリーNo.${index + 1}:「${fighter.title}」こと ${fighter.name}`;
}

/**
 * バトルロイヤル(完全FFA)の前口上用プロンプトを組み立てます。
 * チーム(青/赤コーナー)の概念がないため、参加者をエントリー番号で列挙します。
 * 前口上はバトル再生前に表示するため、勝敗のネタバレを明示的に禁止します。
 */
export function buildRoyaleStoryPrompt(
  fighters: readonly StoryFighter[],
  ingredients: StoryIngredients,
): string {
  return [
    `これから始まる${fighters.length}人参加のバトルロイヤル(全員が敵同士)の前口上を2〜3文で書いてください。`,
    `舞台: ${ingredients.stage}`,
    `参加者どうしの関係: ${ingredients.relation}`,
    ...fighters.map(
      (fighter, index) =>
        `${entryLine(index, fighter)}。${fighter.description}`,
    ),
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/** バトルロイヤル開始時の煽り実況用プロンプトを組み立てます。 */
export function buildRoyaleIntroPrompt(
  fighters: readonly { name: string; title: string }[],
): string {
  return [
    `これから${fighters.length}人参加のバトルロイヤル(全員が敵同士)が始まります。開始の煽り実況をしてください。`,
    ...fighters.map((fighter, index) => entryLine(index, fighter)),
  ].join("\n");
}

/**
 * バトルロイヤル終了時の実況用プロンプトを組み立てます。
 * winnerName が null の場合は引き分けとして締めます。
 */
export function buildRoyaleResultPrompt(
  winnerName: string | null,
  fighterCount: number,
): string {
  if (winnerName === null) {
    return `${fighterCount}人のバトルロイヤルは決着がつかず引き分けに終わりました。締めの実況をしてください。`;
  }
  return `${winnerName}が${fighterCount}人のバトルロイヤルを制して最後の1人になりました。勝者を称える締めの実況をしてください。`;
}

/** 必殺技セリフ生成セッションのシステムプロンプトです。 */
export const SPEECH_SYSTEM_PROMPT = [
  "あなたは対戦ゲームのキャラクターになりきってセリフを作る脚本家です。",
  "キャラクターの設定に合った短い決めゼリフを日本語で1つだけ作ってください。",
  "セリフ本文のみを出力し、前置きやかぎ括弧・引用符は不要です。",
].join("");

/**
 * セリフ系プロンプトが共有する、キャラクター設定と舞台の説明行です。
 * 舞台と因縁(ingredients)は前口上(buildStoryPrompt)と同じ抽選材料を渡し、
 * セリフの世界観を前口上と揃えます(材料が毎試合変わるため、同じキャラクター
 * でも試合ごとに違うセリフになります)。
 */
function speechContextLines(
  fighter: StoryFighter,
  ingredients: StoryIngredients,
): string[] {
  return [
    `あなたは「${fighter.title}」こと ${fighter.name}。${fighter.description}`,
    `舞台は${ingredients.stage}。相手との関係は${ingredients.relation}。`,
  ];
}

/** 必殺技を放つ瞬間の決めゼリフ用プロンプトを組み立てます。 */
export function buildSpecialMoveSpeechPrompt(
  fighter: StoryFighter,
  move: { name: string; description: string },
  ingredients: StoryIngredients,
): string {
  return [
    ...speechContextLines(fighter, ingredients),
    `いま必殺技「${move.name}」(${move.description})を放ちます。`,
    "技を放つ瞬間の決めゼリフを15文字以内で1つ書いてください。",
  ].join("\n");
}

/** 勝利の瞬間の決めゼリフ用プロンプトを組み立てます。 */
export function buildVictorySpeechPrompt(
  fighter: StoryFighter,
  opponentName: string,
  ingredients: StoryIngredients,
): string {
  return [
    ...speechContextLines(fighter, ingredients),
    `激闘の末、${opponentName}を打ち破って勝利しました。`,
    "勝利の瞬間の決めゼリフを15文字以内で1つ書いてください。",
  ].join("\n");
}

/** 力尽きて倒れる瞬間の断末魔用プロンプトを組み立てます。 */
export function buildDefeatSpeechPrompt(
  fighter: StoryFighter,
  opponentName: string,
  ingredients: StoryIngredients,
): string {
  return [
    ...speechContextLines(fighter, ingredients),
    `激闘の末、${opponentName}に敗れて力尽きました。`,
    "倒れる瞬間の断末魔のセリフを15文字以内で1つ書いてください。",
  ].join("\n");
}

/** バトル開始時の煽り実況用プロンプトを組み立てます(1v1・2v2共通)。 */
export function buildIntroPrompt(
  firstTeam: readonly { name: string; title: string }[],
  secondTeam: readonly { name: string; title: string }[],
): string {
  const tag = isTagBattle(firstTeam, secondTeam);
  const cornerLine = (
    corner: string,
    fighter: { name: string; title: string },
  ): string => `${corner}:「${fighter.title}」こと ${fighter.name}`;
  return [
    tag
      ? "これから2対2のタッグバトルが始まります。開始の煽り実況をしてください。"
      : "これからバトルが始まります。開始の煽り実況をしてください。",
    ...firstTeam.map((fighter) => cornerLine("青コーナー", fighter)),
    ...secondTeam.map((fighter) => cornerLine("赤コーナー", fighter)),
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

/**
 * 1アクション分の実況用プロンプトを組み立てます。
 *
 * とどめの一撃(残りHP0)の特殊処理: 「残りHPは0/200」をそのまま渡すと、
 * 小型モデルが「残りHPはあと少しだ」や最大HPの数値を読み上げるなど
 * 不自然な実況を返すため、HP0のときは決着の一撃であることを伝えて
 * 残りHPの数値には触れさせません。
 */
export function buildNarrationPrompt(params: NarrationParams): string {
  const hpInfo =
    params.targetHpAfter === 0
      ? `この一撃で${params.targetName}は力尽きて倒れました。決着のとどめの一撃として実況し、HPの数値には触れないでください`
      : `残りHPは${params.targetHpAfter}/${params.targetMaxHp}`;
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

/** 章ナレーション生成セッションのシステムプロンプトです(ストーリーモード専用)。 */
export const CHAPTER_SYSTEM_PROMPT = [
  "あなたは連続する冒険物語を語るナレーターです。",
  "これまでのあらすじを踏まえ、今回の場面を日本語で2〜3文で語ってください。",
  "本文のみを出力し、前置きや引用符は不要です。",
].join("");

/** エンディング生成セッションのシステムプロンプトです(ストーリーモード専用)。 */
export const ENDING_SYSTEM_PROMPT = [
  "あなたは冒険物語の結末を語るナレーターです。",
  "旅の全記録を踏まえ、物語の結末を日本語で4〜5文で語ってください。",
  "本文のみを出力し、前置きや引用符は不要です。",
].join("");

/**
 * ストーリーモードの幕開け(プロローグ)ナレーション生成セッションの
 * システムプロンプトです。章ナレーション(CHAPTER_SYSTEM_PROMPT)より
 * 少し長め(3〜4文)にし、主人公と旅の目的をしっかり印象づけます。
 */
export const STORY_OPENING_SYSTEM_PROMPT = [
  "あなたは連続する冒険物語を語るナレーターです。",
  "物語の幕開けとして、主人公の旅立ちの場面を日本語で3〜4文で語ってください。",
  "本文のみを出力し、前置きや引用符は不要です。",
].join("");

/**
 * 章ナレーション用のプロンプトを組み立てます(ストーリーモード専用)。
 * これまでのあらすじ・直近の流れ(momentum)を渡すことで、
 * 章をまたいだ物語の連続性を持たせます。バトルはこのあとに再生するため、
 * 前口上(buildStoryPrompt)と同様に勝敗のネタバレを明示的に禁止します。
 */
export function buildChapterNarrationPrompt(params: {
  protagonist: StoryFighter;
  opponent: StoryFighter;
  /** 主人公が旅に出た目的(story/plan.ts の StoryPlan.quest) */
  quest: string;
  /** この章の遭遇シチュエーション(story/plan.ts の StoryChapterPlan.encounter) */
  encounter: string;
  stageName: string;
  /** 1始まりの章番号 */
  chapterIndex: number;
  /** 全体の章数 */
  chapterCount: number;
  /** これまでの章のあらすじ(story/plan.ts の buildStorySummaryLines の結果) */
  summaryLines: readonly string[];
  /** 直近の流れ(story/plan.ts の describeMomentum の結果) */
  momentum: string;
  /** 三幕構成における語り口の指示(story/plan.ts の ACT_NARRATION_TONES) */
  tone: string;
}): string {
  const {
    protagonist,
    opponent,
    quest,
    encounter,
    stageName,
    chapterIndex,
    chapterCount,
    summaryLines,
    momentum,
    tone,
  } = params;
  return [
    `連続する冒険物語の第${chapterIndex}話(全${chapterCount}話)の場面を2〜3文で書いてください。`,
    tone,
    `主人公:「${protagonist.title}」こと ${protagonist.name}。${protagonist.description}`,
    `主人公の旅の目的: ${quest}`,
    ...(summaryLines.length > 0
      ? ["これまでのあらすじ:", ...summaryLines, `直近の流れ: ${momentum}`]
      : ["これは旅の最初の戦いです。"]),
    `舞台: ${stageName}`,
    `今回立ちはだかるのは「${opponent.title}」こと ${opponent.name}(${encounter})。${opponent.description}`,
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/**
 * ストーリーモードの幕開け(プロローグ)用のプロンプトを組み立てます。
 * まだ相手が登場しない場面のため、主人公の設定と旅の目的だけを渡します。
 * バトルはこのあとに再生するため、勝敗のネタバレを明示的に禁止します。
 */
export function buildStoryOpeningPrompt(
  protagonist: StoryFighter,
  quest: string,
): string {
  return [
    "連続する冒険物語の幕開けの場面を3〜4文で書いてください。",
    `主人公:「${protagonist.title}」こと ${protagonist.name}。${protagonist.description}`,
    `主人公の旅の目的: ${quest}`,
    "まだ誰とも出会っていない、旅立ちの場面です。",
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/**
 * 章の中で相手が主人公にかけるセリフ用のプロンプトを組み立てます(ストーリーモード専用)。
 * 直前に生成した章ナレーションを渡し、その場面に合ったセリフにします。
 */
export function buildChapterOpponentLinePrompt(
  opponent: StoryFighter,
  protagonistName: string,
  narration: string,
  ingredients: StoryIngredients,
): string {
  return [
    ...speechContextLines(opponent, ingredients),
    `いま${protagonistName}と対峙しています。場面の説明: ${narration}`,
    `${protagonistName}に向けたセリフを20文字以内で1つ書いてください。`,
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/**
 * 相手のセリフに対する主人公の返答用のプロンプトを組み立てます(ストーリーモード専用)。
 * 相手のセリフ本文を渡し、掛け合いの会話になるようにします。
 */
export function buildChapterProtagonistLinePrompt(
  protagonist: StoryFighter,
  opponentName: string,
  opponentLine: string,
  ingredients: StoryIngredients,
): string {
  return [
    ...speechContextLines(protagonist, ingredients),
    `${opponentName}が「${opponentLine}」と言いました。`,
    "この言葉への返答のセリフを20文字以内で1つ書いてください。",
    "バトルはこれから行われるため、勝敗や結末には絶対に触れないでください。",
  ].join("\n");
}

/**
 * ストーリーモードのエンディング用プロンプトを組み立てます。
 * 旅の全記録(あらすじ・戦績)とランクごとの語り口(ENDING_RANK_TONES)を渡します。
 */
export function buildStoryEndingPrompt(params: {
  protagonist: StoryFighter;
  quest: string;
  summaryLines: readonly string[];
  record: StoryRecord;
  rank: StoryEndingRank;
}): string {
  const { protagonist, quest, summaryLines, record, rank } = params;
  return [
    `主人公:「${protagonist.title}」こと ${protagonist.name}。${protagonist.description}`,
    `旅の目的: ${quest}`,
    "これまでのあらすじ:",
    ...summaryLines,
    `最終成績: ${record.wins}勝${record.losses}敗${record.draws}分`,
    ENDING_RANK_TONES[rank],
    "この結末を語ってください。",
  ].join("\n");
}
