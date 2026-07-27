/**
 * @file バトルストーリー材料の抽選(story.ts)のテストです。
 * Gemini Nano は同一入力に対して出力が決定論的なため、コード側の乱数で
 * 「舞台」と「因縁」を抽選してプロンプトに変化をつけます。
 * その抽選が一覧から正しく選ばれること・不正な乱数で失敗することを確認します。
 */
import { describe, expect, it } from "vitest";
import {
  STORY_RELATIONS,
  STORY_STAGES,
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
});
