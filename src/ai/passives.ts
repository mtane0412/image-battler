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
import { sampleWithoutReplacement } from "./sampling";

/** 1回の生成でモデルに提示するパッシブスキル候補の数です。 */
export const PASSIVE_CANDIDATE_COUNT = 4;

/**
 * 全パッシブスキルから候補を重複なしで無作為に抽選します。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲外の値を返すなどで抽選に失敗した場合(Fail-Fast)
 */
export function samplePassiveCandidates(
  rng: () => number = Math.random,
): PassiveSkillId[] {
  return sampleWithoutReplacement(
    PASSIVE_SKILL_IDS,
    PASSIVE_CANDIDATE_COUNT,
    rng,
    "パッシブスキル候補",
  );
}
