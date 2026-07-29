/**
 * @file キャラクター生成時にモデルへ提示する必殺技タイプ・状態異常候補の抽選です。
 *
 * ai/passives.ts・ai/stages.ts と同じ理由(Gemini Nano は同一入力に対して
 * 出力が決定論的なため、全候補を提示すると説明が汎用的なタイプへ選択が偏る)で、
 * コード側で候補を無作為に絞り込み、モデルには「候補の中から画像に一番合う
 * ものを選ぶ」役割だけを任せます。
 */
import type { AilmentType, SpecialMoveType } from "../types";
import { AILMENT_TYPES, SPECIAL_MOVE_TYPES } from "../types";
import { sampleWithoutReplacement } from "./sampling";

/** 1回の生成でモデルに提示する必殺技タイプ候補の数です。 */
export const SPECIAL_MOVE_TYPE_CANDIDATE_COUNT = 3;
/** 1回の生成でモデルに提示する状態異常候補の数です。 */
export const AILMENT_CANDIDATE_COUNT = 3;

/** 抽選済みの必殺技候補です(タイプ→状態異常の順に乱数を消費します)。 */
export interface MoveCandidates {
  types: SpecialMoveType[];
  ailments: AilmentType[];
}

/**
 * 全必殺技タイプ・全状態異常から候補を重複なしで無作為に抽選します。
 * タイプ候補を抽選したあと状態異常候補を抽選します(乱数の消費順)。
 * 状態異常候補は、タイプ候補に "ailment" が含まれるかどうかにかかわらず
 * 常に抽選します(JSON Schema の ailment フィールドは "none" と候補の
 * 組み合わせを enum にするため、"ailment" タイプが候補にない場合は
 * モデルが "none" を返すだけで、抽選自体は無駄になりません)。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲外の値を返すなどで抽選に失敗した場合(Fail-Fast)
 */
export function sampleMoveCandidates(
  rng: () => number = Math.random,
): MoveCandidates {
  return {
    types: sampleWithoutReplacement(
      SPECIAL_MOVE_TYPES,
      SPECIAL_MOVE_TYPE_CANDIDATE_COUNT,
      rng,
      "必殺技タイプ候補",
    ),
    ailments: sampleWithoutReplacement(
      AILMENT_TYPES,
      AILMENT_CANDIDATE_COUNT,
      rng,
      "状態異常候補",
    ),
  };
}
