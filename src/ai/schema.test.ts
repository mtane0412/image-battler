/**
 * @file Gemini Nano の生成結果パーサー(schema.ts)のテストです。
 * モデル出力のJSON文字列を検証付きで GeneratedStats に変換できること、
 * 不正な出力を Fail-Fast で拒否することを確認します。
 * パッシブスキルは抽選済みの候補リストに含まれるidだけを許可します。
 */
import { describe, expect, it } from "vitest";
import {
  CharacterParseError,
  buildCharacterGenerationSchema,
  parseGeneratedStats,
} from "./schema";

/** テストで使う抽選済みパッシブ候補です(validPayload の id "counter" を含みます)。 */
const 許可候補 = ["counter", "endure", "mp-boost"] as const;

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

describe("buildCharacterGenerationSchema", () => {
  it("自由記述の文字列フィールドすべてにmaxLengthが設定されている", () => {
    // Gemini Nano は小型モデルのため、文字列が長く暴走すると出力上限で
    // JSONが途中で切れてパース失敗になります。スキーマ側で長さを制約します
    const props = buildCharacterGenerationSchema(許可候補).properties;
    expect(props.title.maxLength).toBeGreaterThan(0);
    expect(props.description.maxLength).toBeGreaterThan(0);
    expect(props.specialMove.properties.name.maxLength).toBeGreaterThan(0);
    expect(props.specialMove.properties.description.maxLength).toBeGreaterThan(0);
    expect(props.passive.properties.name.maxLength).toBeGreaterThan(0);
    expect(props.passive.properties.description.maxLength).toBeGreaterThan(0);
  });

  it("パッシブのidは渡した候補だけがenumに制約される", () => {
    const schema = buildCharacterGenerationSchema(許可候補);
    expect(schema.properties.passive.properties.id.enum).toEqual([
      "counter",
      "endure",
      "mp-boost",
    ]);
  });

  it("候補が空の場合はエラーになる(Fail-Fast)", () => {
    expect(() => buildCharacterGenerationSchema([])).toThrow(/候補/);
  });
});

describe("parseGeneratedStats", () => {
  it("正常なJSON文字列をGeneratedStatsに変換できる", () => {
    const stats = parseGeneratedStats(JSON.stringify(validPayload()), 許可候補);
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
    const stats = parseGeneratedStats(JSON.stringify(payload), 許可候補);
    expect(stats.specialMove.ailment).toBeNull();
  });

  it("異常タイプの必殺技では ailment がそのまま読み取れる", () => {
    const payload = validPayload();
    Object.assign(payload.specialMove as Record<string, unknown>, {
      type: "ailment",
      ailment: "poison",
    });
    const stats = parseGeneratedStats(JSON.stringify(payload), 許可候補);
    expect(stats.specialMove.type).toBe("ailment");
    expect(stats.specialMove.ailment).toBe("poison");
  });

  it("異常タイプなのに ailment が none の場合を拒否する", () => {
    const payload = validPayload();
    Object.assign(payload.specialMove as Record<string, unknown>, {
      type: "ailment",
      ailment: "none",
    });
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("必殺技のタイプが不正な値(ultimate)の場合を拒否する", () => {
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).type = "ultimate";
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("JSONとして解釈できない文字列を拒否する", () => {
    expect(() => parseGeneratedStats("これはJSONではありません", 許可候補)).toThrow(
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
    const stats = parseGeneratedStats(corrupted, 許可候補);
    expect(stats.passive.description).toBe("攻撃を受けると鋭い爪で反撃する");
  });

  it("末尾の文字列値の閉じ引用符が丸ごと欠落する癖を修復してパースできる", () => {
    // Vercel本番の実機で観測した壊れ方(2026-07-27):
    // `"description": "相手の攻撃を軽々と回避する。}}` のように、
    // 最後の文字列値の閉じ引用符が「'」ですらなく丸ごと欠落する
    const valid = JSON.stringify(validPayload());
    // 末尾の「"}}」から引用符だけを取り除いて実際の壊れ方を再現する
    const corrupted = `${valid.slice(0, -3)}}}`;
    expect(() => JSON.parse(corrupted)).toThrow();
    const stats = parseGeneratedStats(corrupted, 許可候補);
    expect(stats.passive.description).toBe("攻撃を受けると鋭い爪で反撃する");
  });

  it("JSON終端の後ろに続くゴミ(「{」+改行)を取り除いてパースできる", () => {
    // Vercel本番の実機で観測した壊れ方(2026-07-27):
    // 完結したJSONの直後に「{」+改行が続く(次のオブジェクトを
    // 出力し始めたとみられる)。最後の「}」より後ろを切り捨てて修復する
    const corrupted = `${JSON.stringify(validPayload())}{\n`;
    expect(() => JSON.parse(corrupted)).toThrow();
    const stats = parseGeneratedStats(corrupted, 許可候補);
    expect(stats.title).toBe("深淵の眠り猫");
  });

  it("閉じ引用符の欠落と末尾ゴミが同時に起きた実例を修復してパースできる", () => {
    // Vercel本番で実際に発生した組み合わせ:
    // `…回避する。}}{\n` (閉じ引用符欠落 + 末尾に「{」+改行)
    const valid = JSON.stringify(validPayload());
    const corrupted = `${valid.slice(0, -3)}}}{\n`;
    expect(() => JSON.parse(corrupted)).toThrow();
    const stats = parseGeneratedStats(corrupted, 許可候補);
    expect(stats.passive.description).toBe("攻撃を受けると鋭い爪で反撃する");
  });

  it("閉じ引用符が ' になる癖と末尾ゴミが同時に起きても修復してパースできる", () => {
    // 既知の「'」癖(#2で修復済み)と末尾ゴミは独立した癖のため、
    // 同時に発生する組み合わせにも備える
    const valid = JSON.stringify(validPayload());
    const corrupted = `${valid.slice(0, -3)}'}}{\n`;
    expect(() => JSON.parse(corrupted)).toThrow();
    const stats = parseGeneratedStats(corrupted, 許可候補);
    expect(stats.passive.description).toBe("攻撃を受けると鋭い爪で反撃する");
  });

  it("数値の直後に余分な閉じ括弧がある出力は修復せず拒否する(Fail-Fast)", () => {
    // 引用符の補完は末尾の閉じ括弧の直前が数字の場合は行わない
    // (正常な数値終わりの構造に引用符を挿入すると数値を壊すため)。
    // 修復できない構造の壊れ方はそのまま CharacterParseError で拒否する
    expect(() => parseGeneratedStats('{"hp": 100, "mp": 60}}', 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("修復しても解釈できない出力は拒否する", () => {
    expect(() => parseGeneratedStats('{"hp": 100, "mp":', 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("範囲外のステータス(hp=999)を拒否する", () => {
    const payload = { ...validPayload(), hp: 999 };
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(/hp/);
  });

  it("拡大後のHP範囲の上限(hp=300)を受け入れる", () => {
    // バトルを長くするためHP範囲は 100〜300 に拡大済みです
    const payload = { ...validPayload(), hp: 300 };
    const stats = parseGeneratedStats(JSON.stringify(payload), 許可候補);
    expect(stats.hp).toBe(300);
  });

  it("拡大前の旧範囲のHP(hp=50)を拒否する", () => {
    // 旧範囲(50〜150)の下限は新範囲(100〜300)では範囲外です
    const payload = { ...validPayload(), hp: 50 };
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(/hp/);
  });

  it("範囲外のMP(mp=999)を拒否する", () => {
    const payload = { ...validPayload(), mp: 999 };
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(/mp/);
  });

  it("範囲外の消費MP(mpCost=999)を拒否する", () => {
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).mpCost = 999;
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("整数でないステータス(attack=40.5)を拒否する", () => {
    const payload = { ...validPayload(), attack: 40.5 };
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("必須フィールド(specialMove)の欠落を拒否する", () => {
    const payload = validPayload();
    delete payload.specialMove;
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("必須フィールド(passive)の欠落を拒否する", () => {
    const payload = validPayload();
    delete payload.passive;
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("パッシブのidが不正な値(super-power)の場合を拒否する", () => {
    const payload = validPayload();
    (payload.passive as Record<string, unknown>).id = "super-power";
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("定義済みでも候補にないパッシブid(crit-master)を拒否する", () => {
    // 抽選した候補の外から選ばれた場合は補正せずエラーにする(Fail-Fast)
    const payload = validPayload();
    (payload.passive as Record<string, unknown>).id = "crit-master";
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("空文字のtitleを拒否する", () => {
    const payload = { ...validPayload(), title: "   " };
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });

  it("必殺技の威力が範囲外(power=200)の場合を拒否する", () => {
    const payload = validPayload();
    (payload.specialMove as Record<string, unknown>).power = 200;
    expect(() => parseGeneratedStats(JSON.stringify(payload), 許可候補)).toThrow(
      CharacterParseError,
    );
  });
});
