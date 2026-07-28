/**
 * @file バトル画面のバトルロイヤル(完全FFA)固有の表示ロジックです。
 * jsdom でテストしづらい battle.ts 本体から切り出した純粋関数群で、
 * カットインの方向・勝敗の正規化・判定負け時の断末魔担当を決めます。
 */
import type { Character } from "../types";

/** カットインのスライド方向クラスです(styles.css の .cutin-left / .cutin-right と対応)。 */
export type CutinSide = "cutin-left" | "cutin-right";

/**
 * バトルロイヤルでのカットインのスライド方向を決めます。
 * チームの左右がないため、エントリー順(0始まり)の偶数を左から・
 * 奇数を右から出します(決定論的で、画面幅や折り返しに依存しません)。
 */
export function cutinSideFor(index: number): CutinSide {
  return index % 2 === 0 ? "cutin-left" : "cutin-right";
}

/** バトルロイヤルの勝敗を勝者一覧・敗者一覧へ正規化した結果です。 */
export interface RoyaleOutcome {
  /** 勝者(常に1人)の配列。チーム戦の勝利チームと同じ形で扱えます */
  winners: Character[];
  /** 勝者以外の全員(エントリー順) */
  losers: Character[];
}

/**
 * バトルロイヤルの結果を、チーム戦と共通の「勝者一覧 / 敗者一覧」へ正規化します。
 * 引き分け(winnerId が null)の場合は null を返します。
 * winnerId が参加者にいない場合はデータ不正なので停止します(Fail-Fast)。
 */
export function royaleOutcome(
  fighters: readonly Character[],
  winnerId: string | null,
): RoyaleOutcome | null {
  if (winnerId === null) {
    return null;
  }
  const winner = fighters.find((fighter) => fighter.id === winnerId);
  if (winner === undefined) {
    throw new Error(`勝者IDが参加者にみつかりません: ${winnerId}`);
  }
  return {
    winners: [winner],
    losers: fighters.filter((fighter) => fighter.id !== winnerId),
  };
}

/**
 * 判定負け(タイムアウト)時に締めの断末魔を語る敗者を選びます。
 * 倒れた敗者は倒れた瞬間に断末魔を語り済みのため、敗者の誰も倒れていない
 * 場合のみ先頭の敗者を返します(それ以外は null = 締めの断末魔なし)。
 */
export function pickTimeoutDefeatSpeaker(
  losers: readonly Character[],
  knockedOutIds: ReadonlySet<string>,
): Character | null {
  const head = losers[0];
  if (head === undefined) {
    return null;
  }
  return losers.every((loser) => !knockedOutIds.has(loser.id)) ? head : null;
}
