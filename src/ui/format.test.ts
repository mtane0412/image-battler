/**
 * @file バトルログ文言生成(format.ts)のテストです。
 * レトロRPG風のログ文言にイベント情報が正しく反映されることを確認します。
 */
import { describe, expect, it } from "vitest";
import { describeEvent } from "./format";
import { makeCharacter } from "../testing/fixtures";
import { simulateBattle } from "../battle/engine";
import { sequenceRng } from "../testing/fixtures";

/** テスト用のイベントを1件作ります。 */
function makeEvent(overrides: Partial<Parameters<typeof describeEvent>[0]> = {}) {
  return {
    turn: 1,
    attackerId: "a",
    defenderId: "b",
    type: "attack" as const,
    critical: false,
    damage: 32,
    defenderHpAfter: 68,
    ...overrides,
  };
}

describe("describeEvent", () => {
  it("通常攻撃は攻撃側・防御側・ダメージを含む", () => {
    const text = describeEvent(makeEvent(), "もふ吉", "がぶ太", "爪とぎクラッシュ");
    expect(text).toContain("もふ吉");
    expect(text).toContain("がぶ太");
    expect(text).toContain("32");
  });

  it("クリティカル時は「かいしん」の文言を含む", () => {
    const text = describeEvent(
      makeEvent({ critical: true }),
      "もふ吉",
      "がぶ太",
      "爪とぎクラッシュ",
    );
    expect(text).toContain("かいしん");
  });

  it("ミス時はダメージ数値を含まない", () => {
    const text = describeEvent(
      makeEvent({ type: "miss", damage: 0 }),
      "もふ吉",
      "がぶ太",
      "爪とぎクラッシュ",
    );
    expect(text).not.toContain("ダメージ");
  });

  it("必殺技は技名を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "special", damage: 66 }),
      "もふ吉",
      "がぶ太",
      "爪とぎクラッシュ",
    );
    expect(text).toContain("爪とぎクラッシュ");
    expect(text).toContain("66");
  });

  it("実際のバトル結果のイベントにもそのまま適用できる", () => {
    const a = makeCharacter({ id: "a", name: "もふ吉", speed: 80, attack: 60 });
    const b = makeCharacter({ id: "b", name: "がぶ太", hp: 50, defense: 10, speed: 10 });
    const result = simulateBattle(a, b, sequenceRng([]));
    const event = result.events[0];
    if (event === undefined) throw new Error("イベントが生成されていません");
    const text = describeEvent(event, "もふ吉", "がぶ太", a.specialMove.name);
    expect(text).toContain("もふ吉");
  });
});
