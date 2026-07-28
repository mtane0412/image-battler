/**
 * @file バトルイベント列の分析ヘルパー(analysis.ts)のテストです。
 * イベント列から戦闘不能(KO)になったキャラクターを集められることを確認します。
 */
import { describe, expect, it } from "vitest";
import { collectKnockedOutIds } from "./analysis";
import type { BattleEvent } from "../types";

/** 通常攻撃イベントを組み立てます(after には全員のスナップショットを渡します)。 */
function makeAttackEvent(
  turn: number,
  actorId: string,
  targetId: string,
  after: BattleEvent["after"],
): BattleEvent {
  return {
    type: "attack",
    critical: false,
    damage: 30,
    turn,
    actorId,
    targetId,
    after,
  };
}

describe("collectKnockedOutIds", () => {
  it("HPが0になったキャラクターのIDが収集される", () => {
    const events: BattleEvent[] = [
      makeAttackEvent(1, "もふ吉", "がぶ太", {
        もふ吉: { hp: 100, mp: 0, ailment: null },
        がぶ太: { hp: 70, mp: 0, ailment: null },
      }),
      makeAttackEvent(2, "もふ吉", "がぶ太", {
        もふ吉: { hp: 100, mp: 0, ailment: null },
        がぶ太: { hp: 0, mp: 0, ailment: null },
      }),
    ];
    expect(collectKnockedOutIds(events)).toEqual(new Set(["がぶ太"]));
  });

  it("一度もHPが0にならないキャラクターは含まれない", () => {
    const events: BattleEvent[] = [
      makeAttackEvent(1, "もふ吉", "がぶ太", {
        もふ吉: { hp: 1, mp: 0, ailment: null },
        がぶ太: { hp: 70, mp: 0, ailment: null },
      }),
    ];
    expect(collectKnockedOutIds(events)).toEqual(new Set());
  });

  it("複数のキャラクターが倒れた場合は全員のIDが収集される", () => {
    // 2v2でチームの2体が順に倒れるイベント列
    const events: BattleEvent[] = [
      makeAttackEvent(1, "もふ吉", "がぶ太", {
        もふ吉: { hp: 100, mp: 0, ailment: null },
        ぴよ助: { hp: 80, mp: 0, ailment: null },
        がぶ太: { hp: 0, mp: 0, ailment: null },
        くろ丸: { hp: 90, mp: 0, ailment: null },
      }),
      makeAttackEvent(2, "ぴよ助", "くろ丸", {
        もふ吉: { hp: 100, mp: 0, ailment: null },
        ぴよ助: { hp: 80, mp: 0, ailment: null },
        がぶ太: { hp: 0, mp: 0, ailment: null },
        くろ丸: { hp: 0, mp: 0, ailment: null },
      }),
    ];
    expect(collectKnockedOutIds(events)).toEqual(new Set(["がぶ太", "くろ丸"]));
  });

  it("イベントが空の場合は空の集合を返す", () => {
    expect(collectKnockedOutIds([])).toEqual(new Set());
  });
});
