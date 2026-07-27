/**
 * @file テスト用のフィクスチャ(キャラクター生成ヘルパー・乱数列ヘルパー)です。
 * プロダクションコードからは import しないでください。
 */
import type { Character } from "../types";
import type { Rng } from "../battle/engine";

/**
 * テスト用キャラクターを生成します。
 * 指定しなかった項目は読みやすい既定値で埋めます。
 */
export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-テスト",
    name: "テストキャラ",
    hp: 100,
    attack: 40,
    defense: 20,
    speed: 50,
    luck: 0,
    title: "試験の勇者",
    description: "テスト用のキャラクターです",
    specialMove: {
      name: "テストスラッシュ",
      power: 50,
      description: "光の斬撃で敵を切り裂く",
    },
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
