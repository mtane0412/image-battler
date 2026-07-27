/**
 * @file バトルログ文言生成(format.ts)のテストです。
 * レトロRPG風のログ文言にイベント情報が正しく反映されることを確認します。
 */
import { describe, expect, it } from "vitest";
import { describeEvent } from "./format";
import { makeCharacter, sequenceRng } from "../testing/fixtures";
import { simulateBattle } from "../battle/engine";
import type { BattleEvent, BattleEventPayload, CombatantSnapshot } from "../types";

/** キャラクターIDと表示名の対応表です。 */
const names = { a: "もふ吉", b: "がぶ太" };

/** テスト用のイベントを1件作ります(共通フィールドは既定値で埋めます)。 */
function makeEvent(payload: BattleEventPayload): BattleEvent {
  const snapshot: CombatantSnapshot = { hp: 68, mp: 30, ailment: null };
  return {
    turn: 1,
    actorId: "a",
    targetId: "b",
    after: { a: { ...snapshot }, b: { ...snapshot } },
    ...payload,
  };
}

describe("describeEvent", () => {
  it("通常攻撃は攻撃側・防御側・ダメージを含む", () => {
    const text = describeEvent(
      makeEvent({ type: "attack", critical: false, damage: 32 }),
      names,
    );
    expect(text).toContain("もふ吉");
    expect(text).toContain("がぶ太");
    expect(text).toContain("32");
  });

  it("クリティカル時は「かいしん」の文言を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "attack", critical: true, damage: 48 }),
      names,
    );
    expect(text).toContain("かいしん");
  });

  it("ミス時はダメージ数値を含まない", () => {
    const text = describeEvent(makeEvent({ type: "miss" }), names);
    expect(text).not.toContain("ダメージ");
  });

  it("攻撃必殺技は技名とダメージを含む", () => {
    const text = describeEvent(
      makeEvent({ type: "special-attack", moveName: "爪とぎクラッシュ", damage: 66 }),
      names,
    );
    expect(text).toContain("爪とぎクラッシュ");
    expect(text).toContain("66");
  });

  it("回復必殺技は技名と回復量を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "special-heal", moveName: "いやしの毛づくろい", healed: 50 }),
      names,
    );
    expect(text).toContain("いやしの毛づくろい");
    expect(text).toContain("50");
    expect(text).toContain("かいふく");
  });

  it("異常必殺技は技名と状態異常名を含む", () => {
    const text = describeEvent(
      makeEvent({
        type: "special-ailment",
        moveName: "しびれるまなざし",
        ailment: "paralysis",
        damage: 15,
      }),
      names,
    );
    expect(text).toContain("しびれるまなざし");
    expect(text).toContain("まひ");
  });

  it("強化必殺技は技名と能力上昇の文言を含む", () => {
    const text = describeEvent(
      makeEvent({
        type: "special-buff",
        moveName: "たけりのポーズ",
        attackGain: 20,
        defenseGain: 15,
      }),
      names,
    );
    expect(text).toContain("たけりのポーズ");
    expect(text).toContain("あがった");
  });

  it("毒のスリップダメージは「どく」とダメージを含む", () => {
    const text = describeEvent(
      makeEvent({ type: "ailment-damage", ailment: "poison", damage: 13 }),
      names,
    );
    expect(text).toContain("どく");
    expect(text).toContain("13");
  });

  it("やけどのスリップダメージは「やけど」を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "ailment-damage", ailment: "burn", damage: 6 }),
      names,
    );
    expect(text).toContain("やけど");
  });

  it("麻痺の行動不能は「うごけない」を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "ailment-skip", ailment: "paralysis" }),
      names,
    );
    expect(text).toContain("もふ吉");
    expect(text).toContain("うごけない");
  });

  it("凍結の行動不能は「こおり」を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "ailment-skip", ailment: "freeze" }),
      names,
    );
    expect(text).toContain("こおり");
  });

  it("凍結の解除は「とけた」を含む", () => {
    const text = describeEvent(
      makeEvent({ type: "ailment-cure", ailment: "freeze" }),
      names,
    );
    expect(text).toContain("とけた");
  });

  it("反撃は「はんげき」とダメージを含む", () => {
    const text = describeEvent(makeEvent({ type: "counter", damage: 12 }), names);
    expect(text).toContain("はんげき");
    expect(text).toContain("12");
  });

  it("endureの発動は耐えた旨の文言を含む", () => {
    const text = describeEvent(makeEvent({ type: "endure" }), names);
    expect(text).toContain("もふ吉");
    expect(text).toContain("たえた");
  });

  it("life-stealの吸収は「すいとった」と回復量を含む", () => {
    const text = describeEvent(makeEvent({ type: "life-steal", healed: 10 }), names);
    expect(text).toContain("もふ吉");
    expect(text).toContain("すいとった");
    expect(text).toContain("10");
  });

  it("regenerateの回復は「かいふく」と回復量を含む", () => {
    const text = describeEvent(makeEvent({ type: "regenerate", healed: 6 }), names);
    expect(text).toContain("もふ吉");
    expect(text).toContain("かいふく");
    expect(text).toContain("6");
  });

  it("対応表にないIDのイベントはエラーになる(Fail-Fast)", () => {
    const event = makeEvent({ type: "miss" });
    expect(() => describeEvent(event, { a: "もふ吉" })).toThrow(/がみつかりません/);
  });

  it("実際のバトル結果のイベントにもそのまま適用できる", () => {
    const a = makeCharacter({ id: "a", name: "もふ吉", speed: 80, attack: 60, mp: 0 });
    const b = makeCharacter({ id: "b", name: "がぶ太", hp: 50, defense: 10, speed: 10, mp: 0 });
    const result = simulateBattle(a, b, sequenceRng([]));
    const event = result.events[0];
    if (event === undefined) throw new Error("イベントが生成されていません");
    const text = describeEvent(event, names);
    expect(text).toContain("もふ吉");
  });
});
