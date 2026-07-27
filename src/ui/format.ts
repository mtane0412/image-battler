/**
 * @file バトルイベントをレトロRPG風のログ文言(ひらがな多め)に変換します。
 * この文言はAIを使わず常にJavaScript側で生成するため、実況AIが失敗しても
 * バトルの進行内容は必ずユーザーに伝わります。
 */
import type { BattleEvent } from "../types";

/**
 * 1イベント分のメカニカルなログ文言を生成します。
 * @param specialMoveName 攻撃側の必殺技名(type が special のときに使用)
 */
export function describeEvent(
  event: BattleEvent,
  attackerName: string,
  defenderName: string,
  specialMoveName: string,
): string {
  switch (event.type) {
    case "miss":
      return `${attackerName}の こうげき! しかし ${defenderName}には あたらない!`;
    case "special":
      return `${attackerName}の ひっさつわざ「${specialMoveName}」! ${defenderName}に ${event.damage}の ダメージ!`;
    case "attack": {
      const critical = event.critical ? " かいしんの いちげき!" : "";
      return `${attackerName}の こうげき!${critical} ${defenderName}に ${event.damage}の ダメージ!`;
    }
  }
}
