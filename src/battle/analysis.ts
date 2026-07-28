/**
 * @file バトルイベント列の分析ヘルパーです。
 * バトル展開は再生前に全イベントが確定しているため(battle/engine.ts)、
 * 再生前の演出準備(倒れる予定のメンバーの断末魔の先行生成など)に使います。
 */
import type { BattleEvent } from "../types";

/**
 * イベント列の中で戦闘不能(HP0)になったキャラクターのID集合を返します。
 * HP0は終端状態(倒れたキャラクターは行動も回復もしない)のため、
 * いずれかのイベントのスナップショットでHP0になっていれば戦闘不能と判定できます。
 */
export function collectKnockedOutIds(
  events: readonly BattleEvent[],
): Set<string> {
  const knockedOut = new Set<string>();
  for (const event of events) {
    for (const [id, snapshot] of Object.entries(event.after)) {
      if (snapshot.hp === 0) {
        knockedOut.add(id);
      }
    }
  }
  return knockedOut;
}
