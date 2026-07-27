/**
 * @file Gemini Nano の生成結果パーサー(schema.ts)のテストです。
 * モデル出力のJSON文字列を検証付きで GeneratedStats に変換できること、
 * 不正な出力を Fail-Fast で拒否することを確認します。
 */
import { describe, expect, it } from "vitest";
import { CharacterParseError, parseGeneratedStats } from "./schema";

/** 正常なモデル出力のサンプルを生成します。 */
function validPayload(): Record<string, unknown> {
  return {
    hp: 100,
    attack: 40,
    defense: 20,
    speed: 50,
    luck: 30,
    title: "深淵の眠り猫",
    description: "一日の大半を寝て過ごすが、怒らせると恐ろしい猫の戦士です",
    specialMove: {
      name: "爪とぎクラッシュ",
      power: 60,
      description: "鋭い爪で連続攻撃を繰り出す",
    },
  };
}

describe("parseGeneratedStats", () => {
  it("正常なJSON文字列をGeneratedStatsに変換できる", () => {
    const stats = parseGeneratedStats(JSON.stringify(validPayload()));
    expect(stats.hp).toBe(100);
    expect(stats.title).toBe("深淵の眠り猫");
    expect(stats.specialMove.name).toBe("爪とぎクラッシュ");
    expect(stats.specialMove.power).toBe(60);
  });

  it("JSONとして解釈できない文字列を拒否する", () => {
    expect(() => parseGeneratedStats("これはJSONではありません")).toThrow(
      CharacterParseError,
    );
  });

  it("範囲外のステータス(hp=999)を拒否する", () => {
    const payload = { ...validPayload(), hp: 999 };
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(/hp/);
  });

  it("整数でないステータス(attack=40.5)を拒否する", () => {
    const payload = { ...validPayload(), attack: 40.5 };
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });

  it("必須フィールド(specialMove)の欠落を拒否する", () => {
    const payload = validPayload();
    delete payload.specialMove;
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });

  it("空文字のtitleを拒否する", () => {
    const payload = { ...validPayload(), title: "   " };
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });

  it("必殺技の威力が範囲外(power=200)の場合を拒否する", () => {
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).power = 200;
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });
});
