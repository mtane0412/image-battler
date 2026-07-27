/**
 * @file バトル前口上(ストーリー)に使う材料の抽選です。
 *
 * Gemini Nano は同一入力に対して出力が決定論的なため、キャラクター設定だけを
 * 渡すと同じ組み合わせの対戦では毎回同じストーリーになってしまいます。そこで
 * パッシブ候補の抽選(ai/passives.ts)と同じ発想で、コード側の乱数で「舞台」と
 * 「因縁」を抽選してプロンプトに混ぜ、毎試合違うストーリーを担保します。
 */

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

/** 抽選済みのストーリー材料です。プロンプト組み立て(ai/prompts.ts)に渡します。 */
export interface StoryIngredients {
  /** バトルの舞台 */
  stage: string;
  /** 二人の因縁 */
  relation: string;
}

/**
 * 一覧から1要素を無作為に選びます。
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
function pickOne<T>(pool: readonly T[], rng: () => number): T {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `ストーリー材料の抽選に失敗しました(乱数が範囲[0, 1)外です: ${value})`,
    );
  }
  const picked = pool[Math.floor(value * pool.length)];
  if (picked === undefined) {
    throw new Error(
      `ストーリー材料の抽選に失敗しました(不正なインデックス: ${value})`,
    );
  }
  return picked;
}

/**
 * ストーリーの材料(舞台・因縁)を無作為に抽選します。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 */
export function sampleStoryIngredients(
  rng: () => number = Math.random,
): StoryIngredients {
  return {
    stage: pickOne(STORY_STAGES, rng),
    relation: pickOne(STORY_RELATIONS, rng),
  };
}
