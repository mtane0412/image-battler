/**
 * @file ステージ生成時にモデルへ提示する特性・特殊イベント候補の抽選(stages.ts)の
 * テストです。候補数・重複なし・注入した乱数に対する決定論的な結果を検証します。
 */
import { describe, expect, it } from "vitest";
import { STAGE_EVENT_IDS, STAGE_TRAIT_IDS } from "../types";
import {
  STAGE_EVENT_CANDIDATE_COUNT,
  STAGE_TRAIT_CANDIDATE_COUNT,
  sampleStageCandidates,
} from "./stages";
import { sequenceRng } from "../testing/fixtures";

describe("sampleStageCandidates", () => {
  it("特性候補・イベント候補をそれぞれ2件返し、すべて定義済みのidで重複がない", () => {
    const candidates = sampleStageCandidates();
    expect(candidates.traits).toHaveLength(STAGE_TRAIT_CANDIDATE_COUNT);
    expect(candidates.events).toHaveLength(STAGE_EVENT_CANDIDATE_COUNT);
    expect(new Set(candidates.traits).size).toBe(STAGE_TRAIT_CANDIDATE_COUNT);
    expect(new Set(candidates.events).size).toBe(STAGE_EVENT_CANDIDATE_COUNT);
    for (const id of candidates.traits) {
      expect(STAGE_TRAIT_IDS).toContain(id);
    }
    for (const id of candidates.events) {
      expect(STAGE_EVENT_IDS).toContain(id);
    }
  });

  it("乱数0を注入すると各一覧の先頭から順に選ばれる(特性→イベントの順に消費、決定論的)", () => {
    const candidates = sampleStageCandidates(sequenceRng([0, 0, 0, 0]));
    expect(candidates.traits).toEqual(["blazing", "fortified"]);
    expect(candidates.events).toEqual(["meteor", "spring"]);
  });

  it("乱数の値によって選ばれる候補が変わる", () => {
    // 0.99 では毎回、残っている候補の末尾が選ばれる
    const candidates = sampleStageCandidates(sequenceRng([0.99, 0.99, 0.99, 0.99]));
    expect(candidates.traits).toEqual(["mana-rich", "fortunate"]);
    expect(candidates.events).toEqual(["miasma", "mana-burst"]);
  });

  it("乱数が範囲外([0,1)以外)の値を返す場合はエラーになる(Fail-Fast)", () => {
    expect(() => sampleStageCandidates(() => 1)).toThrow(/乱数/);
    expect(() => sampleStageCandidates(() => -0.1)).toThrow(/乱数/);
    expect(() => sampleStageCandidates(() => Number.NaN)).toThrow(/乱数/);
  });
});
