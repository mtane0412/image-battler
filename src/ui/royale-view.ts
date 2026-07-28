/**
 * @file バトル画面のバトルロイヤル(完全FFA)固有の表示ロジックです。
 * jsdom でテストしづらい battle.ts 本体から切り出した純粋関数群で、
 * カットインの方向・勝敗の正規化・判定負け時の断末魔担当・突進演出の方向を決めます。
 */
import type { Character } from "../types";

/** カットインのスライド方向クラスです(styles.css の .cutin-left / .cutin-right と対応)。 */
export type CutinSide = "cutin-left" | "cutin-right";

/**
 * バトルロイヤルの突進アニメーションの横移動量(px)です。
 * styles.css の lunge-right/lunge-left(1v1/2v2用)と同じ距離に揃えています。
 */
const ROYALE_LUNGE_DISTANCE_PX = 30;

/**
 * バトルロイヤルの突進アニメーションのスライド方向(px)を、攻撃側・対象側の
 * DOM矩形(左端座標と幅)を比較して決めます。
 *
 * ロイヤルは全員が同じ枠色(fighter-royale)で折り返しグリッドに並ぶため、
 * 1v1/2v2 の fighter-p1/fighter-p2 のような固定の左右クラスで突進方向を
 * 決められません。そのため実際の表示位置の中心X座標を比較し、対象が右に
 * いれば正の値(右へ突進)、左にいれば負の値(左へ突進)を返します。
 * 中心X座標が一致する場合(真上/真下に並ぶ場合など)は右へ突進します。
 */
export function royaleLungeOffsetPx(
  actorRect: { left: number; width: number },
  targetRect: { left: number; width: number },
): number {
  const actorCenterX = actorRect.left + actorRect.width / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  return targetCenterX >= actorCenterX
    ? ROYALE_LUNGE_DISTANCE_PX
    : -ROYALE_LUNGE_DISTANCE_PX;
}

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
