/**
 * @file バトルエンジン(engine.ts)のテストです。
 * 乱数を注入して、ダメージ計算式・行動順・必殺技・決着判定を検証します。
 *
 * 乱数の消費順(実装と合わせること):
 * - 必殺技が使用可能な場合: [必殺技判定] → (発動時)[威力補正]
 * - 通常攻撃の場合: [ミス判定] → [クリティカル判定] → [威力補正]
 * - 同速時の先攻決定: バトル開始時に1回だけ消費
 */
import { describe, expect, it } from "vitest";
import { resolveAction, simulateBattle, type CombatantState } from "./engine";
import { makeCharacter, sequenceRng } from "../testing/fixtures";

/** テスト用の戦闘状態を作ります。 */
function makeState(
  overrides: Partial<CombatantState> = {},
): CombatantState {
  const character = overrides.character ?? makeCharacter();
  return {
    character,
    hp: character.hp,
    specialUsed: false,
    ...overrides,
  };
}

describe("resolveAction: 通常攻撃", () => {
  it("威力補正0.5のとき、攻撃力40・防御20で32ダメージになる", () => {
    // variance = 0.85 + 0.5 * 0.3 = 1.0 → 40 * 1.0 - 20 * 0.4 = 32
    const attacker = makeState({ character: makeCharacter({ attack: 40, luck: 0 }) });
    const defender = makeState({ character: makeCharacter({ defense: 20 }) });
    const outcome = resolveAction(attacker, defender, sequenceRng([0.5, 0.5, 0.5]));
    expect(outcome).toEqual({ type: "attack", critical: false, damage: 32 });
  });

  it("計算結果が0以下でも最低1ダメージを与える", () => {
    // 20 * 1.0 - 50 * 0.4 = 0 → 1
    const attacker = makeState({ character: makeCharacter({ attack: 20, luck: 0 }) });
    const defender = makeState({ character: makeCharacter({ defense: 50 }) });
    const outcome = resolveAction(attacker, defender, sequenceRng([0.5, 0.5, 0.5]));
    expect(outcome.damage).toBe(1);
  });

  it("ミス判定の乱数が0.05未満のときミスになりダメージ0", () => {
    const attacker = makeState();
    const defender = makeState();
    const outcome = resolveAction(attacker, defender, sequenceRng([0.01]));
    expect(outcome).toEqual({ type: "miss", critical: false, damage: 0 });
  });

  it("運100(クリティカル率25%)で判定を通るとダメージが1.5倍になる", () => {
    // (40 * 1.0 - 20 * 0.4) * 1.5 = 48
    const attacker = makeState({ character: makeCharacter({ attack: 40, luck: 100 }) });
    const defender = makeState({ character: makeCharacter({ defense: 20 }) });
    const outcome = resolveAction(attacker, defender, sequenceRng([0.5, 0.1, 0.5]));
    expect(outcome).toEqual({ type: "attack", critical: true, damage: 48 });
  });
});

describe("resolveAction: 必殺技", () => {
  it("HPが50%以下かつ未使用のとき、判定を通ると必殺技が発動する", () => {
    // raw = 50 * 1.0 + 40 * 0.5 - 20 * 0.2 = 66
    const attacker = makeState({
      character: makeCharacter({ attack: 40, hp: 100 }),
      hp: 40,
    });
    const defender = makeState({ character: makeCharacter({ defense: 20 }) });
    const outcome = resolveAction(attacker, defender, sequenceRng([0.1, 0.5]));
    expect(outcome).toEqual({ type: "special", critical: false, damage: 66 });
  });

  it("必殺技を使用済みの場合はHPが低くても通常攻撃になる", () => {
    const attacker = makeState({
      character: makeCharacter({ attack: 40, hp: 100 }),
      hp: 40,
      specialUsed: true,
    });
    const defender = makeState({ character: makeCharacter({ defense: 20 }) });
    const outcome = resolveAction(attacker, defender, sequenceRng([0.5, 0.5, 0.5]));
    expect(outcome.type).toBe("attack");
  });

  it("HPが50%を超えている間は必殺技判定自体が行われない", () => {
    const attacker = makeState({
      character: makeCharacter({ attack: 40, hp: 100 }),
      hp: 51,
    });
    const defender = makeState({ character: makeCharacter({ defense: 20 }) });
    // 先頭の0.1はミス判定として消費される(0.05以上なのでミスにもならない)
    const outcome = resolveAction(attacker, defender, sequenceRng([0.1, 0.5, 0.5]));
    expect(outcome.type).toBe("attack");
  });
});

describe("simulateBattle: 行動順", () => {
  it("素早さが高いキャラクターが先攻になる", () => {
    const 韋駄天 = makeCharacter({ id: "fast", name: "韋駄天", speed: 80 });
    const 鈍足 = makeCharacter({ id: "slow", name: "鈍足", speed: 30 });
    const result = simulateBattle(韋駄天, 鈍足, sequenceRng([]));
    expect(result.events[0]?.attackerId).toBe("fast");
  });

  it("同速の場合は乱数で先攻を決める(0.5未満で第1引数が先攻)", () => {
    const a = makeCharacter({ id: "a", speed: 50 });
    const b = makeCharacter({ id: "b", speed: 50 });
    expect(simulateBattle(a, b, sequenceRng([0.4])).events[0]?.attackerId).toBe("a");
    expect(simulateBattle(a, b, sequenceRng([0.6])).events[0]?.attackerId).toBe("b");
  });
});

describe("simulateBattle: 決着", () => {
  it("相手のHPを0にしたキャラクターが勝者になる", () => {
    const 豪傑 = makeCharacter({ id: "strong", attack: 60, speed: 90 });
    const 紙装甲 = makeCharacter({ id: "weak", hp: 50, defense: 10, speed: 10 });
    // 60 * 1.0 - 10 * 0.4 = 56 ダメージで一撃
    const result = simulateBattle(豪傑, 紙装甲, sequenceRng([]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.defenderHpAfter).toBe(0);
    expect(result.winnerId).toBe("strong");
    expect(result.loserId).toBe("weak");
  });

  it("100アクションで決着しない場合、HP残存率が同じなら引き分けになる", () => {
    // 攻撃20 vs 防御50 → 毎回最低保証の1ダメージ。50往復でも決着しない
    const a = makeCharacter({ id: "a", hp: 150, attack: 20, defense: 50, speed: 80 });
    const b = makeCharacter({ id: "b", hp: 150, attack: 20, defense: 50, speed: 30 });
    const result = simulateBattle(a, b, sequenceRng([]));
    expect(result.events).toHaveLength(100);
    expect(result.winnerId).toBeNull();
    expect(result.loserId).toBeNull();
  });

  it("100アクションで決着しない場合、HP残存率が高い方が勝者になる", () => {
    // a: (150-50)/150 ≈ 0.667、b: (140-50)/140 ≈ 0.643 → a の勝ち
    const a = makeCharacter({ id: "a", hp: 150, attack: 20, defense: 50, speed: 80 });
    const b = makeCharacter({ id: "b", hp: 140, attack: 20, defense: 50, speed: 30 });
    const result = simulateBattle(a, b, sequenceRng([]));
    expect(result.winnerId).toBe("a");
    expect(result.loserId).toBe("b");
  });

  it("HPが50%以下になったキャラクターはバトル中に必殺技を発動できる", () => {
    // 1手目: b(速90)が56ダメージ → a のHP44(50%以下)
    // 2手目: a が必殺技判定0.1で発動、50 + 20 - 4 = 66ダメージ
    // 3手目: b が56ダメージで a のHP0 → b の勝ち
    const a = makeCharacter({
      id: "a", hp: 100, attack: 40, defense: 10, speed: 40,
      specialMove: { name: "逆襲の一閃", power: 50, description: "追い詰められて放つ渾身の一撃" },
    });
    const b = makeCharacter({ id: "b", hp: 150, attack: 60, defense: 20, speed: 90 });
    const result = simulateBattle(a, b, sequenceRng([0.5, 0.5, 0.5, 0.1, 0.5]));
    expect(result.events).toHaveLength(3);
    expect(result.events[1]?.type).toBe("special");
    expect(result.events[1]?.damage).toBe(66);
    expect(result.winnerId).toBe("b");
  });
});
