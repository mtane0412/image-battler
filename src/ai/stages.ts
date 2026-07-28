/**
 * @file ステージ生成時にモデルへ提示する特性・特殊イベント候補の抽選です。
 *
 * ai/passives.ts と同じ理由(Gemini Nano は同一入力に対して出力が決定論的なため、
 * 全候補を提示すると説明が汎用的な効果へ選択が偏る)で、コード側で候補を
 * 無作為に絞り込み、モデルには「候補の中から画像に一番合うものを選ぶ」役割だけを
 * 任せます。
 */
import type { StageEventId, StageTraitId } from "../types";
import { STAGE_EVENT_IDS, STAGE_TRAIT_IDS } from "../types";

/** 1回の生成でモデルに提示するステージ特性候補の数です。 */
export const STAGE_TRAIT_CANDIDATE_COUNT = 2;
/** 1回の生成でモデルに提示するステージ特殊イベント候補の数です。 */
export const STAGE_EVENT_CANDIDATE_COUNT = 2;

/** 抽選済みのステージ候補です(特性→イベントの順に乱数を消費します)。 */
export interface StageCandidates {
  traits: StageTraitId[];
  events: StageEventId[];
}

/**
 * プールから重複なく count 件を無作為に抽選します。
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
function sampleWithoutReplacement<T>(
  pool: readonly T[],
  count: number,
  rng: () => number,
): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < count) {
    // インデックス計算の前に乱数値そのものを検証します([0, 1) 以外は不正)
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `ステージ候補の抽選に失敗しました(乱数が範囲[0, 1)外です: ${value})`,
      );
    }
    const index = Math.floor(value * remaining.length);
    const [id] = remaining.splice(index, 1);
    if (id === undefined) {
      throw new Error(
        `ステージ候補の抽選に失敗しました(不正なインデックス: ${index})`,
      );
    }
    picked.push(id);
  }
  return picked;
}

/**
 * 全ステージ特性・特殊イベントから候補を重複なしで無作為に抽選します。
 * 特性候補を抽選したあとイベント候補を抽選します(乱数の消費順)。
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @throws Error 乱数が範囲外の値を返すなどで抽選に失敗した場合(Fail-Fast)
 */
export function sampleStageCandidates(
  rng: () => number = Math.random,
): StageCandidates {
  return {
    traits: sampleWithoutReplacement(
      STAGE_TRAIT_IDS,
      STAGE_TRAIT_CANDIDATE_COUNT,
      rng,
    ),
    events: sampleWithoutReplacement(
      STAGE_EVENT_IDS,
      STAGE_EVENT_CANDIDATE_COUNT,
      rng,
    ),
  };
}
