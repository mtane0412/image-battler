/**
 * @file バトル前口上(ストーリー)に使う材料の抽選です。
 *
 * Gemini Nano は同一入力に対して出力が決定論的なため、キャラクター設定だけを
 * 渡すと同じ組み合わせの対戦では毎回同じストーリーになってしまいます。そこで
 * パッシブ候補の抽選(ai/passives.ts)と同じ発想で、コード側の乱数で「舞台」と
 * 「因縁」を抽選してプロンプトに混ぜ、毎試合違うストーリーを担保します。
 */
import { pickOne, sampleWithoutReplacement } from "./sampling";

/** ストーリーの舞台(バトルが行われる場所・状況)の一覧です。 */
export const STORY_STAGES = [
  "満月に照らされた闘技場",
  "嵐が迫る断崖絶壁",
  "祭りでにぎわう城下町の特設リング",
  "夕日が沈む静かな海辺",
  "雪が降りしきる山の頂",
  "たいまつが揺れる地下闘技場",
  "桜吹雪の舞う古城の中庭",
  "雷鳴とどろく荒野",
] as const;

/** 二人のファイターの因縁(関係性)の一覧です。 */
export const STORY_RELATIONS = [
  "宿命のライバル",
  "かつての師匠と弟子",
  "初対面同士の腕試し",
  "雪辱に燃える再戦",
  "親友同士の真剣勝負",
  "縄張りを懸けた対決",
  "大会の決勝で巡り会った両雄",
  "伝説の座を懸けた頂上決戦",
] as const;

/**
 * 主人公が旅に出た目的の一覧です(ストーリーモード専用)。
 * 物語全体を貫く動機として、全5章のナレーション・エンディングに共通して渡します。
 */
export const STORY_QUESTS = [
  "奪われた宝物を取り戻すため",
  "最強の称号を手に入れるため",
  "行方不明の師匠を捜すため",
  "壊れた故郷を立て直す力を得るため",
  "自分の強さを試すため",
  "かつての敗北の借りを返すため",
  "伝説の武具を求めるため",
  "仲間との約束を果たすため",
] as const;

/**
 * 章ごとの遭遇シチュエーション(最終章以外)の一覧です(ストーリーモード専用)。
 * 相手がどのような立場で行く手をはばむかを表し、章ナレーションの導入に使います。
 */
export const STORY_ENCOUNTERS = [
  "旅の途中の道をふさぐ用心棒として",
  "宿場町で因縁をふっかけてきた荒くれ者として",
  "森の奥で縄張りを守る番人として",
  "腕試しを求めて挑んできた武者修行の旅人として",
  "うわさを聞きつけて待ち構えていた賞金稼ぎとして",
  "村を騒がせていた乱暴者として",
  "商人を脅かしていた盗賊として",
  "橋のたもとで通行料を要求する門番として",
] as const;

/**
 * 最終章の遭遇シチュエーションの一覧です(ストーリーモード専用)。
 * 通常章の一覧(STORY_ENCOUNTERS)とは別枠にし、締めくくりにふさわしい
 * 重みのある状況だけを集めています(小さな遭遇で最終決戦が締まらないのを防ぐため)。
 */
export const STORY_FINAL_ENCOUNTERS = [
  "旅の終着点で待ち構えていた最大の壁として",
  "すべての因縁の先に立ちはだかる宿敵として",
  "旅の目的そのものを賭けた最後の相手として",
  "これまでの戦いの噂を聞きつけて現れた挑戦者として",
] as const;

/** 抽選済みのストーリー材料です。プロンプト組み立て(ai/prompts.ts)に渡します。 */
export interface StoryIngredients {
  /** バトルの舞台 */
  stage: string;
  /** 二人の因縁 */
  relation: string;
}

/**
 * ストーリーの材料(舞台・因縁)を無作為に抽選します。
 *
 * override.stage を渡すと、抽選結果の舞台をユーザーが選んだステージ名で
 * 上書きします(乱数の消費順は変えません)。ステージ未選択時は override を
 * 省略するか {} を渡してください。舞台を常に抽選してから上書きする理由は、
 * 因縁(relation)の抽選が舞台の抽選回数に依存しないようにするためです
 * (先に抽選をスキップすると relation の結果まで変わってしまいます)。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 */
export function sampleStoryIngredients(
  rng: () => number = Math.random,
  override: { stage?: string } = {},
): StoryIngredients {
  const stage = pickOne(STORY_STAGES, rng, "ストーリー材料");
  const relation = pickOne(STORY_RELATIONS, rng, "ストーリー材料");
  return {
    stage: override.stage ?? stage,
    relation,
  };
}

/**
 * 主人公が旅に出た目的を無作為に抽選します(ストーリーモード専用)。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
export function sampleQuest(rng: () => number = Math.random): string {
  return pickOne(STORY_QUESTS, rng, "旅の目的");
}

/**
 * 章ごとの遭遇シチュエーション(最終章以外)を重複なく count 件抽選します
 * (ストーリーモード専用)。最終章の遭遇は sampleFinalEncounter で別途抽選します。
 * @param count 抽選する件数(通常章の数)
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
export function sampleEncounters(
  count: number,
  rng: () => number = Math.random,
): string[] {
  return sampleWithoutReplacement(
    STORY_ENCOUNTERS,
    count,
    rng,
    "遭遇シチュエーション",
  );
}

/**
 * 最終章の遭遇シチュエーションを無作為に抽選します(ストーリーモード専用)。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
export function sampleFinalEncounter(rng: () => number = Math.random): string {
  return pickOne(STORY_FINAL_ENCOUNTERS, rng, "最終章の遭遇シチュエーション");
}
