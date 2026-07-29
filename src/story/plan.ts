/**
 * @file ストーリーモードの進行ロジックです。
 *
 * 主人公を1体選び、保存済みの他のファイターが順番に立ちはだかる全5章(相手が
 * 少なければそれ以下)の物語を扱います。物語全体の計画(誰と・どのステージで・
 * どんな遭遇で戦うか)は開始時に一括で抽選し(buildStoryPlan)、以後は不変です。
 * 進行状態(StoryRun)は章の決着ごとに appendChapterResult で新しい値を作って
 * 画面間を受け渡します(グローバルなストアは持ちません)。
 *
 * Gemini Nano は同一入力に対して出力が決定論的なため、ai/story.ts と同じ発想で
 * 「旅の目的」「章ごとの遭遇シチュエーション」をコード側の乱数で抽選し、
 * 毎回違う物語を担保します。
 */
import type { Character, Stage } from "../types";
import {
  sampleEncounters,
  sampleFinalEncounter,
  sampleQuest,
  sampleStoryIngredients,
  type StoryIngredients,
} from "../ai/story";
import { sampleWithoutReplacement } from "../ai/sampling";

/** ストーリーモードの最大章数です。 */
export const STORY_MAX_CHAPTERS = 5;
/** ストーリーモードを開始するために必要な、主人公以外の最小ファイター数です。 */
export const STORY_MIN_OPPONENTS = 2;

/** 1章分の計画です。物語の開始時に抽選し、以後は変わりません。 */
export interface StoryChapterPlan {
  /** 1始まりの章番号 */
  index: number;
  /** この章で戦う相手 */
  opponent: Character;
  /** この章のステージ(デフォルトステージの場合は null) */
  stage: Stage | null;
  /** 遭遇シチュエーション(章ナレーションの導入に使う抽選材料) */
  encounter: string;
  /**
   * この章のセリフ生成に使う材料です。舞台(stage)は、ステージを割り当てた章では
   * そのステージ名で上書き済みです(ai/story.ts の override と同じ考え方)。
   */
  ingredients: StoryIngredients;
}

/** 物語全体の計画です。 */
export interface StoryPlan {
  protagonist: Character;
  /** 主人公が旅に出た目的(物語全体を貫く動機) */
  quest: string;
  chapters: StoryChapterPlan[];
}

/** 1章の決着です。 */
export type StoryOutcome = "win" | "lose" | "draw";

/** 1章分の決着の記録です。あらすじ・戦績の組み立てに使います。 */
export interface StoryChapterResult {
  /** 1始まりの章番号 */
  index: number;
  opponentName: string;
  /** あらすじ行に出す表示名(デフォルトステージの場合は「イメージバトルアリーナ」等の呼称) */
  stageName: string;
  outcome: StoryOutcome;
}

/**
 * 進行中の物語です。画面遷移のたびに appendChapterResult で results を
 * 1章分増やした新しい値を作り、次の画面へ渡します(plan は不変です)。
 */
export interface StoryRun {
  plan: StoryPlan;
  results: StoryChapterResult[];
}

/**
 * 保存済みステージから、章の数だけステージを割り当てます。
 * 重複なしを優先し、章数がステージ数を上回る分だけ重複させます。
 * 保存ステージが0件の場合は全章デフォルトステージ(null)にします。
 */
function assignChapterStages(
  stages: readonly Stage[],
  chapterCount: number,
  rng: () => number,
): (Stage | null)[] {
  if (stages.length === 0) {
    return Array.from({ length: chapterCount }, () => null);
  }
  const assigned: Stage[] = [];
  while (assigned.length < chapterCount) {
    const take = Math.min(chapterCount - assigned.length, stages.length);
    assigned.push(
      ...sampleWithoutReplacement(stages, take, rng, "ステージ割り当て"),
    );
  }
  return assigned;
}

/**
 * 章のインデックス(0始まり)に対応する遭遇シチュエーションを返します。
 * 最終章(インデックスが chapterCount - 1)だけ finalEncounter を使います。
 * @throws Error 通常章の遭遇シチュエーションが欠落している場合(データ不正、Fail-Fast)
 */
function encounterForChapterIndex(
  chapterIndex: number,
  chapterCount: number,
  encounters: readonly string[],
  finalEncounter: string,
): string {
  if (chapterIndex === chapterCount - 1) {
    return finalEncounter;
  }
  const encounter = encounters[chapterIndex];
  if (encounter === undefined) {
    throw new Error(
      `第${chapterIndex + 1}章の遭遇シチュエーションが見つかりません`,
    );
  }
  return encounter;
}

/**
 * 物語全体の計画を抽選します。
 *
 * 乱数の消費順: 旅の目的 → 通常章の遭遇 → 最終章の遭遇 → 相手 → ステージ →
 * 各章の因縁(ai/story.ts の sampleStoryIngredients が舞台→因縁の順に消費)。
 * 章数は主人公以外のファイター数と STORY_MAX_CHAPTERS(5) の小さい方です。
 *
 * @param protagonist 主人公として選ばれたファイター
 * @param others 主人公以外の保存済みファイター(この中から相手が選ばれます)
 * @param stages 保存済みステージ(0件でも構いません。章ごとにランダム割り当てします)
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error others が STORY_MIN_OPPONENTS 未満の場合(Fail-Fast)
 */
export function buildStoryPlan(
  protagonist: Character,
  others: readonly Character[],
  stages: readonly Stage[],
  rng: () => number = Math.random,
): StoryPlan {
  if (others.length < STORY_MIN_OPPONENTS) {
    throw new Error(
      `ストーリーモードには主人公以外に${STORY_MIN_OPPONENTS}体以上のファイターが必要です(現在: ${others.length}体)`,
    );
  }
  const chapterCount = Math.min(STORY_MAX_CHAPTERS, others.length);
  const quest = sampleQuest(rng);
  const encounters = sampleEncounters(chapterCount - 1, rng);
  const finalEncounter = sampleFinalEncounter(rng);
  const opponents = sampleWithoutReplacement(
    others,
    chapterCount,
    rng,
    "ストーリーの対戦相手",
  );
  const chapterStages = assignChapterStages(stages, chapterCount, rng);

  const chapters: StoryChapterPlan[] = opponents.map((opponent, i) => {
    const stage = chapterStages[i] ?? null;
    return {
      index: i + 1,
      opponent,
      stage,
      encounter: encounterForChapterIndex(
        i,
        chapterCount,
        encounters,
        finalEncounter,
      ),
      ingredients: sampleStoryIngredients(rng, { stage: stage?.title }),
    };
  });

  return { protagonist, quest, chapters };
}

/**
 * まだ決着していない先頭の章(次に戦う章)を返します。
 * @throws Error 物語がすでに全ての章を終えている場合(Fail-Fast)
 */
export function currentChapter(run: StoryRun): StoryChapterPlan {
  const chapter = run.plan.chapters[run.results.length];
  if (chapter === undefined) {
    throw new Error("物語はすでに全ての章を終えています");
  }
  return chapter;
}

/**
 * バトルエンジンの勝者チームから、ストーリーモードの章の決着(勝敗)を判定します。
 * ストーリーモードの各章は常に主人公1体 vs 相手1体の1vs1のため、勝者チームに
 * 主人公のIDが含まれるかどうかだけで判定できます。
 * @param winners 勝者チーム(引き分けの場合は null)
 * @param protagonistId 主人公のキャラクターID
 */
export function judgeStoryOutcome(
  winners: readonly { id: string }[] | null,
  protagonistId: string,
): StoryOutcome {
  if (winners === null) {
    return "draw";
  }
  return winners.some((member) => member.id === protagonistId)
    ? "win"
    : "lose";
}

/**
 * 三幕構成における幕です。
 * - act1(序): 落ち着いた導入
 * - act2(破): 試練が積み重なる中盤
 * - act3(急): 旅の集大成となる終盤の山場
 */
export type StoryAct = "act1" | "act2" | "act3";

/**
 * 章番号から三幕構成における幕を判定します。第1話が序(act1)、最終話が
 * 急(act3)、それ以外は破(act2)です。章数が2話(相手が最小人数)の場合は
 * 破を経ずに序→急になります。
 * @param chapterIndex 1始まりの章番号
 * @param chapterCount 全体の章数
 */
export function actForChapter(
  chapterIndex: number,
  chapterCount: number,
): StoryAct {
  if (chapterIndex === chapterCount) {
    return "act3";
  }
  if (chapterIndex === 1) {
    return "act1";
  }
  return "act2";
}

/**
 * 幕ごとの章ナレーションの語り口の指示です(三幕構成のトーンづけ)。
 * UIには表示せず、章ナレーション生成プロンプト(ai/prompts.ts)にだけ渡します
 * (章バナーに全体の章数を出すと逆に分かりづらくなるため、UI表示は増やしません)。
 */
export const ACT_NARRATION_TONES = {
  act1: "物語の序盤、落ち着いた導入の調子で",
  act2: "物語の中盤、試練が積み重なっていく調子で",
  act3: "物語の終盤、旅の集大成としての山場の調子で",
} as const satisfies Record<StoryAct, string>;

/** 指定した章が物語の最終章かどうかを判定します。 */
export function isFinalChapter(
  run: StoryRun,
  chapter: StoryChapterPlan,
): boolean {
  return chapter.index === run.plan.chapters.length;
}

/**
 * 1章分の決着を記録した新しい StoryRun を返します(元の run は変更しません)。
 */
export function appendChapterResult(
  run: StoryRun,
  result: StoryChapterResult,
): StoryRun {
  return { plan: run.plan, results: [...run.results, result] };
}

/** 決着の種類に応じた助詞と動詞を返します(あらすじ行の組み立て用)。 */
function outcomePhrase(outcome: StoryOutcome): { particle: string; verb: string } {
  switch (outcome) {
    case "win":
      return { particle: "に", verb: "勝利した" };
    case "lose":
      return { particle: "に", verb: "敗れた" };
    case "draw":
      return { particle: "と", verb: "引き分けた" };
  }
}

/**
 * これまでの章の決着から、あらすじ行を1章1行で組み立てます。
 * 章ナレーション生成プロンプトに渡し、物語の連続性を持たせるために使います。
 */
export function buildStorySummaryLines(run: StoryRun): string[] {
  return run.results.map((result) => {
    const { particle, verb } = outcomePhrase(result.outcome);
    return `第${result.index}話: ${result.stageName}で${result.opponentName}${particle}${verb}。`;
  });
}

/**
 * 直近の流れ(連勝中・連敗中・五分)を1行で表します。章ナレーションの調子付けに使います。
 * 直前の結果から同じ決着が何回連続しているかを数え、2回以上続いていれば連勝・連敗として示します。
 */
export function describeMomentum(
  results: readonly StoryChapterResult[],
): string {
  const last = results[results.length - 1];
  if (last === undefined) {
    return "まだ戦いは始まっていない";
  }
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const result = results[i];
    if (result === undefined || result.outcome !== last.outcome) {
      break;
    }
    streak += 1;
  }
  switch (last.outcome) {
    case "win":
      return streak >= 2 ? `${streak}連勝中` : "直前の戦いに勝利した";
    case "lose":
      return streak >= 2 ? `${streak}連敗中` : "直前の戦いに敗れた";
    case "draw":
      return "勝敗つかずの五分の展開";
  }
}

/** 章の決着から集計した戦績です。 */
export interface StoryRecord {
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

/** これまでの章の決着から、勝ち・負け・引き分け・合計を集計します。 */
export function tallyRecord(
  results: readonly StoryChapterResult[],
): StoryRecord {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const result of results) {
    if (result.outcome === "win") {
      wins += 1;
    } else if (result.outcome === "lose") {
      losses += 1;
    } else {
      draws += 1;
    }
  }
  return { wins, losses, draws, total: results.length };
}

/** 戦績から決まるエンディングのランクです。 */
export type StoryEndingRank = "perfect" | "good" | "normal" | "bad" | "worst";

/**
 * 戦績からエンディングランクを判定します。
 * 全勝: perfect / 全敗: worst / 勝ち越し: good / 負け越し: bad / それ以外(五分): normal
 * @throws Error 戦績が空(total: 0)の場合(Fail-Fast、判定不能なため)
 */
export function judgeEndingRank(record: StoryRecord): StoryEndingRank {
  if (record.total === 0) {
    throw new Error("戦績が空のためエンディングランクを判定できません");
  }
  if (record.wins === record.total) {
    return "perfect";
  }
  if (record.losses === record.total) {
    return "worst";
  }
  if (record.wins > record.losses) {
    return "good";
  }
  if (record.losses > record.wins) {
    return "bad";
  }
  return "normal";
}

/** 画面に出すエンディングの見出しです(レトロゲーム風)。 */
export const ENDING_RANK_LABELS = {
  perfect: "TRUE END",
  good: "GOOD END",
  normal: "NORMAL END",
  bad: "BAD END",
  worst: "WORST END",
} as const satisfies Record<StoryEndingRank, string>;

/** エンディング生成プロンプトに渡す、ランクごとの語り口の指示です。 */
export const ENDING_RANK_TONES = {
  perfect: "全戦全勝で伝説となった結末を、高らかに祝福する調子で",
  good: "勝ち越して目的を果たした結末を、達成感のある調子で",
  normal: "勝ちと負けが五分だった旅を、得たものと失ったものの両方を見つめる調子で",
  bad: "負け越して目的には届かなかった結末を、悔しさと次への予感を込めた調子で",
  worst: "全戦全敗で打ちのめされた結末を、それでも立ち上がる余地を残した調子で",
} as const satisfies Record<StoryEndingRank, string>;
