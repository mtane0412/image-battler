/**
 * @file Gemini Nano の生成結果パーサー(schema.ts)のテストです。
 * モデル出力のJSON文字列を検証付きで GeneratedStats に変換できること、
 * 不正な出力を Fail-Fast で拒否することを確認します。
 */
import { describe, expect, it } from "vitest";
import {
  CHARACTER_GENERATION_SCHEMA,
  CharacterParseError,
  parseGeneratedStats,
} from "./schema";

/** 正常なモデル出力のサンプルを生成します。 */
function validPayload(): Record<string, unknown> {
  return {
    hp: 100,
    mp: 60,
    attack: 40,
    defense: 20,
    speed: 50,
    luck: 30,
    title: "深淵の眠り猫",
    description: "一日の大半を寝て過ごすが、怒らせると恐ろしい猫の戦士です",
    specialMove: {
      name: "爪とぎクラッシュ",
      type: "attack",
      power: 60,
      mpCost: 30,
      ailment: "none",
      description: "鋭い爪で連続攻撃を繰り出す",
    },
    passive: {
      id: "counter",
      name: "猫の反射神経",
      description: "攻撃を受けると鋭い爪で反撃する",
    },
  };
}

describe("CHARACTER_GENERATION_SCHEMA", () => {
  it("自由記述の文字列フィールドすべてにmaxLengthが設定されている", () => {
    // Gemini Nano は小型モデルのため、文字列が長く暴走すると出力上限で
    // JSONが途中で切れてパース失敗になります。スキーマ側で長さを制約します
    const props = CHARACTER_GENERATION_SCHEMA.properties;
    expect(props.title.maxLength).toBeGreaterThan(0);
    expect(props.description.maxLength).toBeGreaterThan(0);
    expect(props.specialMove.properties.name.maxLength).toBeGreaterThan(0);
    expect(props.specialMove.properties.description.maxLength).toBeGreaterThan(0);
    expect(props.passive.properties.name.maxLength).toBeGreaterThan(0);
    expect(props.passive.properties.description.maxLength).toBeGreaterThan(0);
  });
});

describe("parseGeneratedStats", () => {
  it("正常なJSON文字列をGeneratedStatsに変換できる", () => {
    const stats = parseGeneratedStats(JSON.stringify(validPayload()));
    expect(stats.hp).toBe(100);
    expect(stats.mp).toBe(60);
    expect(stats.title).toBe("深淵の眠り猫");
    expect(stats.specialMove.name).toBe("爪とぎクラッシュ");
    expect(stats.specialMove.type).toBe("attack");
    expect(stats.specialMove.power).toBe(60);
    expect(stats.specialMove.mpCost).toBe(30);
    expect(stats.passive.id).toBe("counter");
    expect(stats.passive.name).toBe("猫の反射神経");
  });

  it("攻撃タイプの必殺技では ailment が null に正規化される", () => {
    // モデルが無関係な ailment 値を返しても、異常タイプ以外では使わないため null にする
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).ailment = "poison";
    const stats = parseGeneratedStats(JSON.stringify(payload));
    expect(stats.specialMove.ailment).toBeNull();
  });

  it("異常タイプの必殺技では ailment がそのまま読み取れる", () => {
    const payload = validPayload();
    Object.assign(payload.specialMove as Record<string, unknown>, {
      type: "ailment",
      ailment: "poison",
    });
    const stats = parseGeneratedStats(JSON.stringify(payload));
    expect(stats.specialMove.type).toBe("ailment");
    expect(stats.specialMove.ailment).toBe("poison");
  });

  it("異常タイプなのに ailment が none の場合を拒否する", () => {
    const payload = validPayload();
    Object.assign(payload.specialMove as Record<string, unknown>, {
      type: "ailment",
      ailment: "none",
    });
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });

  it("必殺技のタイプが不正な値(ultimate)の場合を拒否する", () => {
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).type = "ultimate";
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });

  it("JSONとして解釈できない文字列を拒否する", () => {
    expect(() => parseGeneratedStats("これはJSONではありません")).toThrow(
      CharacterParseError,
    );
  });

  it("文字列の閉じ引用符が ' になる既知の癖を修復してパースできる", () => {
    // Gemini Nano は日本語の文字列末尾で閉じ引用符を「'」と出力することがある
    // (実機で確認済みの決定論的な癖)。この形だけは修復してパースする
    const valid = JSON.stringify(validPayload());
    // 末尾の「"}}」を「'}}」に置き換えて実際の壊れ方を再現する
    const corrupted = `${valid.slice(0, -3)}'}}`;
    expect(() => JSON.parse(corrupted)).toThrow();
    const stats = parseGeneratedStats(corrupted);
    expect(stats.passive.description).toBe("攻撃を受けると鋭い爪で反撃する");
  });

  it("修復しても解釈できない出力は拒否する", () => {
    expect(() => parseGeneratedStats('{"hp": 100, "mp":')).toThrow(
      CharacterParseError,
    );
  });

  it("範囲外のステータス(hp=999)を拒否する", () => {
    const payload = { ...validPayload(), hp: 999 };
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(/hp/);
  });

  it("範囲外のMP(mp=999)を拒否する", () => {
    const payload = { ...validPayload(), mp: 999 };
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(/mp/);
  });

  it("範囲外の消費MP(mpCost=999)を拒否する", () => {
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).mpCost = 999;
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
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

  it("必須フィールド(passive)の欠落を拒否する", () => {
    const payload = validPayload();
    delete payload.passive;
    expect(() => parseGeneratedStats(JSON.stringify(payload))).toThrow(
      CharacterParseError,
    );
  });

  it("パッシブのidが不正な値(super-power)の場合を拒否する", () => {
    const payload = validPayload();
    (payload.passive as Record<string, unknown>).id = "super-power";
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
