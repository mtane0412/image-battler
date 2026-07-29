/**
 * @file 候補一覧からの無作為抽選の共通ヘルパー(sampling.ts)のテストです。
 * ai/stages.ts の sampleWithoutReplacement と ai/story.ts の pickOne を
 * 共通化する切り出し先であり、既存の挙動(決定論的な抽選・Fail-Fast)を
 * そのまま維持できていることを確認します。
 */
import { describe, expect, it } from "vitest";
import { pickOne, sampleWithoutReplacement } from "./sampling";
import { sequenceRng } from "../testing/fixtures";

describe("pickOne", () => {
  const pool = ["まんげつの闘技場", "だんがいの断崖", "しろあとの中庭"] as const;

  it("乱数0では一覧の先頭が選ばれる(決定論的な抽選)", () => {
    expect(pickOne(pool, sequenceRng([0]), "テスト候補")).toBe(pool[0]);
  });

  it("乱数0.99では一覧の末尾が選ばれる", () => {
    expect(pickOne(pool, sequenceRng([0.99]), "テスト候補")).toBe(
      pool[pool.length - 1],
    );
  });

  it("乱数が範囲[0, 1)外の値を返した場合はエラーになる(Fail-Fast)", () => {
    expect(() => pickOne(pool, sequenceRng([1]), "テスト候補")).toThrow(
      /乱数/,
    );
    expect(() => pickOne(pool, sequenceRng([-0.1]), "テスト候補")).toThrow(
      /乱数/,
    );
    expect(() =>
      pickOne(pool, sequenceRng([Number.NaN]), "テスト候補"),
    ).toThrow(/乱数/);
  });

  it("エラーメッセージに指定したラベルが含まれる(どの抽選の失敗か切り分けられるようにするため)", () => {
    expect(() => pickOne(pool, sequenceRng([1]), "テスト候補")).toThrow(
      /テスト候補/,
    );
  });
});

describe("sampleWithoutReplacement", () => {
  const pool = ["もふ吉", "がぶ太", "ぴよ助", "くろ丸"] as const;

  it("指定件数を重複なしで返す", () => {
    const picked = sampleWithoutReplacement(pool, 2, sequenceRng([0, 0]), "テスト候補");
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
    for (const value of picked) {
      expect(pool).toContain(value);
    }
  });

  it("乱数0を注入すると毎回残りの先頭から選ばれる(決定論的な抽選)", () => {
    const picked = sampleWithoutReplacement(pool, 3, sequenceRng([0, 0, 0]), "テスト候補");
    expect(picked).toEqual(["もふ吉", "がぶ太", "ぴよ助"]);
  });

  it("乱数が範囲[0, 1)外の値を返した場合はエラーになる(Fail-Fast)", () => {
    expect(() =>
      sampleWithoutReplacement(pool, 2, sequenceRng([1]), "テスト候補"),
    ).toThrow(/乱数/);
  });
});
