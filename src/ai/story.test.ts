/**
 * @file バトルストーリー材料の抽選(story.ts)のテストです。
 * Gemini Nano は同一入力に対して出力が決定論的なため、コード側の乱数で
 * 「舞台」と「因縁」を抽選してプロンプトに変化をつけます。
 * その抽選が一覧から正しく選ばれること・不正な乱数で失敗することを確認します。
 */
import { describe, expect, it } from "vitest";
import {
  STORY_ENCOUNTERS,
  STORY_FINAL_ENCOUNTERS,
  STORY_QUESTS,
  STORY_RELATIONS,
  STORY_STAGES,
  sampleEncounters,
  sampleFinalEncounter,
  sampleQuest,
  sampleStoryIngredients,
} from "./story";
import { sequenceRng } from "../testing/fixtures";

describe("sampleStoryIngredients", () => {
  it("舞台と因縁がそれぞれ一覧の中から選ばれる", () => {
    // 乱数0.5を注入すると、各一覧の中央付近の要素が選ばれる
    const ingredients = sampleStoryIngredients(sequenceRng([0.5, 0.5]));
    expect(STORY_STAGES).toContain(ingredients.stage);
    expect(STORY_RELATIONS).toContain(ingredients.relation);
  });

  it("乱数0では各一覧の先頭が選ばれる(決定論的な抽選)", () => {
    const ingredients = sampleStoryIngredients(sequenceRng([0, 0]));
    expect(ingredients.stage).toBe(STORY_STAGES[0]);
    expect(ingredients.relation).toBe(STORY_RELATIONS[0]);
  });

  it("乱数が異なれば異なる組み合わせになる(毎試合の変化の源)", () => {
    const firstMatch = sampleStoryIngredients(sequenceRng([0, 0]));
    const secondMatch = sampleStoryIngredients(sequenceRng([0.99, 0.99]));
    expect(firstMatch.stage).not.toBe(secondMatch.stage);
    expect(firstMatch.relation).not.toBe(secondMatch.relation);
  });

  it("乱数が範囲[0, 1)外の値を返した場合はエラーになる(Fail-Fast)", () => {
    expect(() => sampleStoryIngredients(sequenceRng([1.5]))).toThrow(/乱数/);
  });

  it("ステージ選択時はstageだけ上書きされ、relationは通常どおり抽選される", () => {
    // ステージ選択時も乱数は舞台→因縁の順に2回消費し、抽選結果のstageを
    // 明示的なステージ名で上書きするだけにする(消費順を変えないため)
    const ingredients = sampleStoryIngredients(sequenceRng([0, 0]), {
      stage: "灼熱の闘技場",
    });
    expect(ingredients.stage).toBe("灼熱の闘技場");
    expect(ingredients.relation).toBe(STORY_RELATIONS[0]);
  });

  it("overrideを渡さない場合は通常どおり舞台一覧から抽選される", () => {
    const ingredients = sampleStoryIngredients(sequenceRng([0, 0]), {});
    expect(ingredients.stage).toBe(STORY_STAGES[0]);
  });
});

describe("sampleQuest", () => {
  it("旅の目的が一覧の中から選ばれる", () => {
    const quest = sampleQuest(sequenceRng([0.5]));
    expect(STORY_QUESTS).toContain(quest);
  });

  it("乱数0では一覧の先頭が選ばれる(決定論的な抽選)", () => {
    expect(sampleQuest(sequenceRng([0]))).toBe(STORY_QUESTS[0]);
  });

  it("乱数が範囲[0, 1)外の値を返した場合はエラーになる(Fail-Fast)", () => {
    expect(() => sampleQuest(sequenceRng([1.2]))).toThrow(/乱数/);
  });
});

describe("sampleEncounters", () => {
  it("指定した件数だけ重複なしで返す", () => {
    const encounters = sampleEncounters(3, sequenceRng([0, 0, 0]));
    expect(encounters).toHaveLength(3);
    expect(new Set(encounters).size).toBe(3);
    for (const encounter of encounters) {
      expect(STORY_ENCOUNTERS).toContain(encounter);
    }
  });

  it("乱数0を注入すると一覧の先頭から順に選ばれる(決定論的な抽選)", () => {
    const encounters = sampleEncounters(2, sequenceRng([0, 0]));
    expect(encounters).toEqual([STORY_ENCOUNTERS[0], STORY_ENCOUNTERS[1]]);
  });

  it("乱数が範囲[0, 1)外の値を返した場合はエラーになる(Fail-Fast)", () => {
    expect(() => sampleEncounters(2, sequenceRng([1.2]))).toThrow(/乱数/);
  });
});

describe("sampleFinalEncounter", () => {
  it("最終章の遭遇シチュエーションが専用の一覧の中から選ばれる", () => {
    const encounter = sampleFinalEncounter(sequenceRng([0.5]));
    expect(STORY_FINAL_ENCOUNTERS).toContain(encounter);
    // 通常章の一覧とは別枠であることを確認する(最終章がふさわしい重みのある遭遇になるため)
    expect(STORY_ENCOUNTERS).not.toContain(encounter);
  });

  it("乱数0では一覧の先頭が選ばれる(決定論的な抽選)", () => {
    expect(sampleFinalEncounter(sequenceRng([0]))).toBe(
      STORY_FINAL_ENCOUNTERS[0],
    );
  });

  it("乱数が範囲[0, 1)外の値を返した場合はエラーになる(Fail-Fast)", () => {
    expect(() => sampleFinalEncounter(sequenceRng([1.2]))).toThrow(/乱数/);
  });
});
