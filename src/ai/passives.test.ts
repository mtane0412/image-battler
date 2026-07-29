/**
 * @file パッシブスキル候補の抽選(passives.ts)のテストです。
 * 候補数・重複なし・注入した乱数に対する決定論的な結果を検証します。
 */
import { describe, expect, it } from "vitest";
import { PASSIVE_SKILL_IDS } from "../types";
import { PASSIVE_CANDIDATE_COUNT, samplePassiveCandidates } from "./passives";
import { sequenceRng } from "../testing/fixtures";

describe("samplePassiveCandidates", () => {
  it("候補を4件返し、すべて定義済みのidで重複がない", () => {
    const candidates = samplePassiveCandidates();
    expect(candidates).toHaveLength(PASSIVE_CANDIDATE_COUNT);
    expect(new Set(candidates).size).toBe(PASSIVE_CANDIDATE_COUNT);
    for (const id of candidates) {
      expect(PASSIVE_SKILL_IDS).toContain(id);
    }
  });

  it("乱数0を注入すると一覧の先頭から順に選ばれる(決定論的)", () => {
    expect(samplePassiveCandidates(sequenceRng([0, 0, 0, 0]))).toEqual([
      "crit-master",
      "ailment-guard",
      "endure",
      "counter",
    ]);
  });

  it("乱数の値によって選ばれる候補が変わる", () => {
    // 0.99 では毎回、残っている候補の末尾が選ばれる
    expect(
      samplePassiveCandidates(sequenceRng([0.99, 0.99, 0.99, 0.99])),
    ).toEqual(["cleanse", "overheal", "sure-hit", "giant-killer"]);
  });

  it("乱数が範囲外([0,1)以外)の値を返す場合はエラーになる(Fail-Fast)", () => {
    expect(() => samplePassiveCandidates(() => 1)).toThrow(/乱数/);
    expect(() => samplePassiveCandidates(() => -0.1)).toThrow(/乱数/);
    expect(() => samplePassiveCandidates(() => Number.NaN)).toThrow(/乱数/);
  });
});
