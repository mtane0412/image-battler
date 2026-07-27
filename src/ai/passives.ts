/**
 * @file キャラクター生成時にモデルへ提示するパッシブスキル候補の抽選です。
 *
 * Gemini Nano は同一入力に対して出力が決定論的なため、全種類を提示すると
 * 説明が汎用的なスキル(状態異常耐性など)へ選択が偏ります。そこで
 * コード側で候補を無作為に絞り込み、モデルには「候補の中から画像に
 * 一番合うものを選ぶ」役割だけを任せて、特性の多様性を担保します。
 */
import type { PassiveSkillId } from "../types";
import { PASSIVE_SKILL_IDS } from "../types";

/** 1回の生成でモデルに提示するパッシブスキル候補の数です。 */
export const PASSIVE_CANDIDATE_COUNT = 3;

/**
 * 全パッシブスキルから候補を重複なしで無作為に抽選します。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲外の値を返すなどで抽選に失敗した場合(Fail-Fast)
 */
export function samplePassiveCandidates(
  rng: () => number = Math.random,
): PassiveSkillId[] {
  const pool: PassiveSkillId[] = [...PASSIVE_SKILL_IDS];
  const picked: PassiveSkillId[] = [];
  while (picked.length < PASSIVE_CANDIDATE_COUNT) {
    // インデックス計算の前に乱数値そのものを検証します([0, 1) 以外は不正)
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `パッシブスキル候補の抽選に失敗しました(乱数が範囲[0, 1)外です: ${value})`,
      );
    }
    const index = Math.floor(value * pool.length);
    const [id] = pool.splice(index, 1);
    if (id === undefined) {
      throw new Error(
        `パッシブスキル候補の抽選に失敗しました(不正なインデックス: ${index})`,
      );
    }
    picked.push(id);
  }
  return picked;
}
