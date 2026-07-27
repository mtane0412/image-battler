/**
 * @file テスト用のフィクスチャ(キャラクター生成ヘルパー・乱数列ヘルパー)です。
 * プロダクションコードからは import しないでください。
 */
import type { Character, PassiveSkill, SpecialMove } from "../types";
import type { Rng } from "../battle/engine";

/**
 * テスト用の必殺技を生成します。
 * 指定しなかった項目は攻撃タイプの読みやすい既定値で埋めます。
 */
export function makeSpecialMove(
  overrides: Partial<SpecialMove> = {},
): SpecialMove {
  return {
    name: "テストスラッシュ",
    type: "attack",
    power: 50,
    mpCost: 30,
    ailment: null,
    description: "光の斬撃で敵を切り裂く",
    ...overrides,
  };
}

/**
 * テスト用のパッシブスキルを生成します。
 * id を指定して効果を選び、名前は省略時に「テストパッシブ(id)」になります。
 */
export function makePassive(
  id: PassiveSkill["id"],
  overrides: Partial<Omit<PassiveSkill, "id">> = {},
): PassiveSkill {
  return {
    id,
    name: `テストパッシブ(${id})`,
    description: "テスト用のパッシブスキルです",
    ...overrides,
  };
}

/**
 * テスト用キャラクターを生成します。
 * 指定しなかった項目は読みやすい既定値で埋めます。
 * 既定ではパッシブなし(旧形式からの移行キャラ相当)です。
 */
export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-テスト",
    name: "テストキャラ",
    hp: 100,
    mp: 60,
    attack: 40,
    defense: 20,
    speed: 50,
    luck: 0,
    title: "試験の勇者",
    description: "テスト用のキャラクターです",
    specialMove: makeSpecialMove(),
    passive: null,
    imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    createdAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * 指定した値を順番に返し、使い切ったら fallback を返し続ける乱数関数を作ります。
 * バトルエンジンの乱数消費順を決め打ちしてテストするために使用します。
 */
export function sequenceRng(values: number[], fallback = 0.5): Rng {
  const queue = [...values];
  return () => queue.shift() ?? fallback;
}
