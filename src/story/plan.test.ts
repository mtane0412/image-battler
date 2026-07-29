/**
 * @file ストーリーモードの進行ロジック(plan.ts)のテストです。
 * 物語計画の抽選(buildStoryPlan)、章の進行(currentChapter / isFinalChapter /
 * appendChapterResult)、あらすじ・戦績・エンディングランクの判定を検証します。
 */
import { describe, expect, it } from "vitest";
import {
  STORY_ENCOUNTERS,
  STORY_FINAL_ENCOUNTERS,
  STORY_QUESTS,
} from "../ai/story";
import { makeCharacter, makeStage, sequenceRng } from "../testing/fixtures";
import {
  ACT_NARRATION_TONES,
  ENDING_RANK_LABELS,
  ENDING_RANK_TONES,
  STORY_MAX_CHAPTERS,
  STORY_MIN_OPPONENTS,
  actForChapter,
  appendChapterResult,
  buildStoryPlan,
  buildStorySummaryLines,
  currentChapter,
  describeMomentum,
  isFinalChapter,
  judgeEndingRank,
  judgeStoryOutcome,
  tallyRecord,
  type StoryAct,
  type StoryChapterPlan,
  type StoryChapterResult,
  type StoryEndingRank,
  type StoryOutcome,
  type StoryPlan,
  type StoryRun,
} from "./plan";

/** テスト用の章の結果を組み立てます(あらすじ・戦績・連勝連敗のテストで使い回します)。 */
function makeResult(
  index: number,
  outcome: StoryOutcome,
  overrides: Partial<StoryChapterResult> = {},
): StoryChapterResult {
  return {
    index,
    opponentName: `対戦相手${index}`,
    stageName: "イメージバトルアリーナ",
    outcome,
    ...overrides,
  };
}

/** plan.chapters から index 位置の章を取り出します(欠落はテスト前提が崩れているためFail-Fast)。 */
function chapterAt(plan: StoryPlan, index: number): StoryChapterPlan {
  const chapter = plan.chapters[index];
  if (chapter === undefined) {
    throw new Error(`テスト前提が崩れています(章[${index}]が存在しません)`);
  }
  return chapter;
}

describe("buildStoryPlan", () => {
  const protagonist = makeCharacter({ id: "char-しゅじんこう", name: "しゅじんこう" });
  const fiveOpponents = [
    makeCharacter({ id: "char-1", name: "もふ吉" }),
    makeCharacter({ id: "char-2", name: "がぶ太" }),
    makeCharacter({ id: "char-3", name: "ぴよ助" }),
    makeCharacter({ id: "char-4", name: "くろ丸" }),
    makeCharacter({ id: "char-5", name: "しろたん" }),
  ];
  const twoStages = [
    makeStage({ id: "stage-1", title: "満月の闘技場" }),
    makeStage({ id: "stage-2", title: "炎の谷" }),
  ];

  it("乱数0を注入すると、旅の目的→通常章の遭遇→最終章の遭遇→相手→ステージ→各章の因縁の順に決定論的に組み立つ", () => {
    // quest(1) + encounters(chapterCount-1=4) + finalEncounter(1) + opponents(5) + stages(2+2+1=5) = 16回。
    // 以降の各章の因縁(舞台+因縁で2回×5章=10回)はフォールバック値(0.5)で問題ない
    // (ステージが割り当たっている章では舞台がステージ名で上書きされるため影響しない)。
    const plan = buildStoryPlan(
      protagonist,
      fiveOpponents,
      twoStages,
      sequenceRng(Array(16).fill(0)),
    );

    expect(plan.protagonist).toBe(protagonist);
    expect(plan.quest).toBe(STORY_QUESTS[0]);
    expect(plan.chapters).toHaveLength(5);
    expect(plan.chapters.map((c) => c.index)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.chapters.map((c) => c.opponent.id)).toEqual(
      fiveOpponents.map((o) => o.id),
    );
    expect(plan.chapters.map((c) => c.encounter)).toEqual([
      STORY_ENCOUNTERS[0],
      STORY_ENCOUNTERS[1],
      STORY_ENCOUNTERS[2],
      STORY_ENCOUNTERS[3],
      STORY_FINAL_ENCOUNTERS[0],
    ]);
    expect(plan.chapters.map((c) => c.stage?.title)).toEqual([
      "満月の闘技場",
      "炎の谷",
      "満月の闘技場",
      "炎の谷",
      "満月の闘技場",
    ]);
  });

  it("最終章の遭遇シチュエーションは通常章の一覧とは重複しない専用枠から選ばれる", () => {
    const plan = buildStoryPlan(protagonist, fiveOpponents, [], sequenceRng([0.99]));
    const finalChapter = chapterAt(plan, plan.chapters.length - 1);
    expect(STORY_FINAL_ENCOUNTERS).toContain(finalChapter.encounter);
  });

  it("保存済みステージが0件のときは全章デフォルトステージ(null)になる", () => {
    const plan = buildStoryPlan(protagonist, fiveOpponents, [], sequenceRng([0.3]));
    for (const chapter of plan.chapters) {
      expect(chapter.stage).toBeNull();
    }
  });

  it("ステージが選ばれた章では、セリフ用のingredients.stageがステージ名で上書きされる", () => {
    const plan = buildStoryPlan(
      protagonist,
      fiveOpponents,
      twoStages,
      sequenceRng(Array(16).fill(0)),
    );
    for (const chapter of plan.chapters) {
      if (chapter.stage !== null) {
        expect(chapter.ingredients.stage).toBe(chapter.stage.title);
      }
    }
  });

  it("章数は主人公以外のファイター数と5のうち小さい方になる(相手3体なら3章)", () => {
    const threeOpponents = fiveOpponents.slice(0, 3);
    const plan = buildStoryPlan(protagonist, threeOpponents, [], sequenceRng([0.5]));
    expect(plan.chapters).toHaveLength(3);
  });

  it("章数の上限はSTORY_MAX_CHAPTERS(5)を超えない(相手が多くても5章まで)", () => {
    const manyOpponents = [
      ...fiveOpponents,
      makeCharacter({ id: "char-6", name: "たぬ吉" }),
      makeCharacter({ id: "char-7", name: "きつね丸" }),
    ];
    const plan = buildStoryPlan(protagonist, manyOpponents, [], sequenceRng([0.5]));
    expect(plan.chapters).toHaveLength(STORY_MAX_CHAPTERS);
  });

  it("対戦相手が最小人数(2体)未満の場合はエラーになる(Fail-Fast)", () => {
    const oneOpponent = [fiveOpponents[0]!];
    expect(() => buildStoryPlan(protagonist, oneOpponent, [])).toThrow(
      new RegExp(`${STORY_MIN_OPPONENTS}体`),
    );
  });

  it("対戦相手に重複がない(乱数の値に関わらず同じ相手は一度しか登場しない)", () => {
    // 実際の乱数(Math.random)を使っても一意性は常に成立するべき
    const plan = buildStoryPlan(protagonist, fiveOpponents, twoStages);
    const ids = plan.chapters.map((c) => c.opponent.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("保存ステージが3件・章数が5のとき、ステージは重複なしを優先しつつ足りない分だけ重複する", () => {
    const threeStages = [
      makeStage({ id: "stage-a", title: "満月の闘技場" }),
      makeStage({ id: "stage-b", title: "炎の谷" }),
      makeStage({ id: "stage-c", title: "沈黙の氷原" }),
    ];
    const plan = buildStoryPlan(protagonist, fiveOpponents, threeStages, sequenceRng([0.5]));
    const titles = plan.chapters.map((c) => c.stage?.title);
    // 3種類のステージすべてが最低1回は使われる(重複なしを優先しているため)
    expect(new Set(titles).size).toBe(3);
    // 5章に対しステージは3種類しかないため、どれかは2回登場する
    const counts = titles.reduce<Record<string, number>>((acc, title) => {
      if (title !== undefined) {
        acc[title] = (acc[title] ?? 0) + 1;
      }
      return acc;
    }, {});
    expect(Object.values(counts).some((count) => count === 2)).toBe(true);
  });
});

describe("currentChapter / isFinalChapter / appendChapterResult", () => {
  const protagonist = makeCharacter({ id: "char-しゅじんこう", name: "しゅじんこう" });
  const threeOpponents = [
    makeCharacter({ id: "char-1", name: "もふ吉" }),
    makeCharacter({ id: "char-2", name: "がぶ太" }),
    makeCharacter({ id: "char-3", name: "ぴよ助" }),
  ];
  const plan = buildStoryPlan(protagonist, threeOpponents, [], sequenceRng([0.5]));

  it("結果がまだない場合は第1章を返す", () => {
    const run: StoryRun = { plan, results: [] };
    expect(currentChapter(run).index).toBe(1);
  });

  it("N章分の結果を積むと第N+1章を返す", () => {
    const run: StoryRun = { plan, results: [makeResult(1, "win")] };
    expect(currentChapter(run).index).toBe(2);
  });

  it("すべての章が終わっている場合はエラーになる(Fail-Fast)", () => {
    const finishedRun: StoryRun = {
      plan,
      results: plan.chapters.map((chapter) => makeResult(chapter.index, "win")),
    };
    expect(() => currentChapter(finishedRun)).toThrow();
  });

  it("最終章かどうかを判定できる", () => {
    const run: StoryRun = { plan, results: [] };
    expect(isFinalChapter(run, chapterAt(plan, 0))).toBe(false);
    expect(isFinalChapter(run, chapterAt(plan, 2))).toBe(true);
  });

  it("appendChapterResultは元のrunを変更せず、結果を1件追加した新しいrunを返す(不変)", () => {
    const run: StoryRun = { plan, results: [] };
    const result = makeResult(1, "win");
    const nextRun = appendChapterResult(run, result);

    expect(run.results).toHaveLength(0);
    expect(nextRun.results).toEqual([result]);
    expect(nextRun.plan).toBe(plan);
  });
});

describe("buildStorySummaryLines", () => {
  const protagonist = makeCharacter({ id: "char-しゅじんこう" });
  const twoOpponents = [
    makeCharacter({ id: "char-1", name: "もふ吉" }),
    makeCharacter({ id: "char-2", name: "がぶ太" }),
  ];
  const plan = buildStoryPlan(protagonist, twoOpponents, [], sequenceRng([0.5]));

  it("結果がない場合は空配列を返す", () => {
    expect(buildStorySummaryLines({ plan, results: [] })).toEqual([]);
  });

  it("勝敗ごとに正しい語尾のあらすじ行を組み立てる", () => {
    const run: StoryRun = {
      plan,
      results: [
        makeResult(1, "win", { opponentName: "もふ吉", stageName: "満月の闘技場" }),
        makeResult(2, "lose", { opponentName: "がぶ太", stageName: "炎の谷" }),
        makeResult(3, "draw", {
          opponentName: "ぴよ助",
          stageName: "イメージバトルアリーナ",
        }),
      ],
    };
    expect(buildStorySummaryLines(run)).toEqual([
      "第1話: 満月の闘技場でもふ吉に勝利した。",
      "第2話: 炎の谷でがぶ太に敗れた。",
      "第3話: イメージバトルアリーナでぴよ助と引き分けた。",
    ]);
  });
});

describe("describeMomentum", () => {
  it("結果がまだない場合は「まだ戦いは始まっていない」を返す", () => {
    expect(describeMomentum([])).toBe("まだ戦いは始まっていない");
  });

  it("2連勝以上のときは連勝数を示す", () => {
    const results = [makeResult(1, "win"), makeResult(2, "win"), makeResult(3, "win")];
    expect(describeMomentum(results)).toBe("3連勝中");
  });

  it("勝利が単発(直前だけ)のときは連勝数を示さない", () => {
    const results = [makeResult(1, "lose"), makeResult(2, "win")];
    expect(describeMomentum(results)).toBe("直前の戦いに勝利した");
  });

  it("2連敗以上のときは連敗数を示す", () => {
    const results = [makeResult(1, "win"), makeResult(2, "lose"), makeResult(3, "lose")];
    expect(describeMomentum(results)).toBe("2連敗中");
  });

  it("敗北が単発(直前だけ)のときは連敗数を示さない", () => {
    const results = [makeResult(1, "win"), makeResult(2, "lose")];
    expect(describeMomentum(results)).toBe("直前の戦いに敗れた");
  });

  it("直前が引き分けのときは五分の展開を示す", () => {
    const results = [makeResult(1, "win"), makeResult(2, "draw")];
    expect(describeMomentum(results)).toBe("勝敗つかずの五分の展開");
  });
});

describe("tallyRecord", () => {
  it("勝ち・負け・引き分け・合計を正しく集計する", () => {
    const results = [
      makeResult(1, "win"),
      makeResult(2, "win"),
      makeResult(3, "lose"),
      makeResult(4, "draw"),
    ];
    expect(tallyRecord(results)).toEqual({ wins: 2, losses: 1, draws: 1, total: 4 });
  });

  it("結果が空の場合はすべて0になる", () => {
    expect(tallyRecord([])).toEqual({ wins: 0, losses: 0, draws: 0, total: 0 });
  });
});

describe("judgeEndingRank", () => {
  it("全勝はperfect", () => {
    expect(judgeEndingRank({ wins: 5, losses: 0, draws: 0, total: 5 })).toBe("perfect");
  });

  it("全敗はworst", () => {
    expect(judgeEndingRank({ wins: 0, losses: 5, draws: 0, total: 5 })).toBe("worst");
  });

  it("勝ち越しはgood", () => {
    expect(judgeEndingRank({ wins: 3, losses: 1, draws: 1, total: 5 })).toBe("good");
  });

  it("負け越しはbad", () => {
    expect(judgeEndingRank({ wins: 1, losses: 3, draws: 1, total: 5 })).toBe("bad");
  });

  it("勝敗数が同じ(五分)場合はnormal", () => {
    expect(judgeEndingRank({ wins: 2, losses: 2, draws: 1, total: 5 })).toBe("normal");
  });

  it("全て引き分けの場合もnormal", () => {
    expect(judgeEndingRank({ wins: 0, losses: 0, draws: 5, total: 5 })).toBe("normal");
  });

  it("戦績が空(total: 0)の場合はエラーになる(Fail-Fast)", () => {
    expect(() =>
      judgeEndingRank({ wins: 0, losses: 0, draws: 0, total: 0 }),
    ).toThrow();
  });
});

describe("judgeStoryOutcome", () => {
  it("勝者チームに主人公が含まれるときはwinを返す", () => {
    const outcome = judgeStoryOutcome(
      [{ id: "char-しゅじんこう" }],
      "char-しゅじんこう",
    );
    expect(outcome).toBe("win");
  });

  it("勝者チームに主人公が含まれないときはloseを返す", () => {
    const outcome = judgeStoryOutcome(
      [{ id: "char-あいて" }],
      "char-しゅじんこう",
    );
    expect(outcome).toBe("lose");
  });

  it("勝者チームがnull(引き分け)のときはdrawを返す", () => {
    const outcome = judgeStoryOutcome(null, "char-しゅじんこう");
    expect(outcome).toBe("draw");
  });
});

describe("actForChapter", () => {
  it("第1話は序(act1)になる", () => {
    expect(actForChapter(1, 5)).toBe("act1");
  });

  it("最終話は急(act3)になる", () => {
    expect(actForChapter(5, 5)).toBe("act3");
  });

  it("第1話と最終話の間は破(act2)になる", () => {
    expect(actForChapter(2, 5)).toBe("act2");
    expect(actForChapter(3, 5)).toBe("act2");
    expect(actForChapter(4, 5)).toBe("act2");
  });

  it("章数が2話(相手が最小人数)のときは、破(act2)を経ずに序→急になる", () => {
    expect(actForChapter(1, 2)).toBe("act1");
    expect(actForChapter(2, 2)).toBe("act3");
  });
});

describe("ACT_NARRATION_TONES", () => {
  it("すべての幕(act1/act2/act3)にトーンの指示が定義されている", () => {
    const acts: StoryAct[] = ["act1", "act2", "act3"];
    for (const act of acts) {
      expect(ACT_NARRATION_TONES[act].length).toBeGreaterThan(0);
    }
  });
});

describe("ENDING_RANK_LABELS / ENDING_RANK_TONES", () => {
  it("すべてのランクにラベルとトーンの指示が定義されている", () => {
    const ranks: StoryEndingRank[] = ["perfect", "good", "normal", "bad", "worst"];
    for (const rank of ranks) {
      expect(ENDING_RANK_LABELS[rank].length).toBeGreaterThan(0);
      expect(ENDING_RANK_TONES[rank].length).toBeGreaterThan(0);
    }
  });
});
