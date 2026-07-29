/**
 * @file キャラクター生成時にモデルへ提示する必殺技タイプ・状態異常候補の
 * 抽選(moves.ts)のテストです。候補数・重複なし・注入した乱数に対する
 * 決定論的な結果を検証します。
 */
import { describe, expect, it } from "vitest";
import { AILMENT_TYPES, SPECIAL_MOVE_TYPES } from "../types";
import {
  AILMENT_CANDIDATE_COUNT,
  SPECIAL_MOVE_TYPE_CANDIDATE_COUNT,
  sampleMoveCandidates,
} from "./moves";
import { sequenceRng } from "../testing/fixtures";

describe("sampleMoveCandidates", () => {
  it("タイプ候補・状態異常候補をそれぞれ3件返し、すべて定義済みのidで重複がない", () => {
    const candidates = sampleMoveCandidates();
    expect(candidates.types).toHaveLength(SPECIAL_MOVE_TYPE_CANDIDATE_COUNT);
    expect(candidates.ailments).toHaveLength(AILMENT_CANDIDATE_COUNT);
    expect(new Set(candidates.types).size).toBe(SPECIAL_MOVE_TYPE_CANDIDATE_COUNT);
    expect(new Set(candidates.ailments).size).toBe(AILMENT_CANDIDATE_COUNT);
    for (const id of candidates.types) {
      expect(SPECIAL_MOVE_TYPES).toContain(id);
    }
    for (const id of candidates.ailments) {
      expect(AILMENT_TYPES).toContain(id);
    }
  });

  it("乱数0を注入すると各一覧の先頭から順に選ばれる(タイプ→状態異常の順に消費、決定論的)", () => {
    const candidates = sampleMoveCandidates(sequenceRng([0, 0, 0, 0, 0, 0]));
    expect(candidates.types).toEqual(["attack", "heal", "ailment"]);
    expect(candidates.ailments).toEqual(["poison", "paralysis", "burn"]);
  });

  it("乱数の値によって選ばれる候補が変わる", () => {
    // 0.99 では毎回、残っている候補の末尾が選ばれる
    const candidates = sampleMoveCandidates(sequenceRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
    expect(candidates.types).toEqual(["all-attack", "debuff", "drain"]);
    expect(candidates.ailments).toEqual(["weaken", "confusion", "blind"]);
  });

  it("乱数が範囲外([0,1)以外)の値を返す場合はエラーになる(Fail-Fast)", () => {
    expect(() => sampleMoveCandidates(() => 1)).toThrow(/乱数/);
    expect(() => sampleMoveCandidates(() => -0.1)).toThrow(/乱数/);
    expect(() => sampleMoveCandidates(() => Number.NaN)).toThrow(/乱数/);
  });
});
