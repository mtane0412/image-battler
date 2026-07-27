/**
 * @file バトルイベントをレトロRPG風のログ文言(ひらがな多め)に変換します。
 * この文言はAIを使わず常にJavaScript側で生成するため、実況AIが失敗しても
 * バトルの進行内容は必ずユーザーに伝わります。
 */
import type { BattleEvent } from "../types";
import { AILMENT_LABELS } from "../types";

/**
 * 1イベント分のメカニカルなログ文言を生成します。
 * @param names キャラクターIDと表示名の対応表
 * @throws Error イベントのIDが対応表にない場合(Fail-Fast)
 */
export function describeEvent(
  event: BattleEvent,
  names: Record<string, string>,
): string {
  const actor = nameOf(names, event.actorId);
  const target = nameOf(names, event.targetId);

  switch (event.type) {
    case "miss":
      return `${actor}の こうげき! しかし ${target}には あたらない!`;
    case "attack": {
      const critical = event.critical ? " かいしんの いちげき!" : "";
      return `${actor}の こうげき!${critical} ${target}に ${event.damage}の ダメージ!`;
    }
    case "special-attack":
      return `${actor}の ひっさつわざ「${event.moveName}」! ${target}に ${event.damage}の ダメージ!`;
    case "special-heal":
      return `${actor}の ひっさつわざ「${event.moveName}」! HPが ${event.healed} かいふくした!`;
    case "special-ailment":
      return [
        `${actor}の ひっさつわざ「${event.moveName}」! ${target}に ${event.damage}の ダメージ!`,
        ` ${target}は ${AILMENT_LABELS[event.ailment]}じょうたいに なった!`,
      ].join("");
    case "special-buff":
      return `${actor}の ひっさつわざ「${event.moveName}」! こうげきと ぼうぎょが ぐーんと あがった!`;
    case "ailment-damage":
      return event.ailment === "poison"
        ? `${actor}は どくに むしばまれている! ${event.damage}の ダメージ!`
        : `${actor}は やけどが いたむ! ${event.damage}の ダメージ!`;
    case "ailment-skip":
      return event.ailment === "paralysis"
        ? `${actor}は からだが しびれて うごけない!`
        : `${actor}は こおりついて うごけない!`;
    case "ailment-cure":
      return `${actor}の こおりが とけた!`;
    case "counter":
      return `${actor}の はんげき! ${target}に ${event.damage}の ダメージ!`;
    case "endure":
      return `${actor}は こんじょうで もちこたえた!`;
  }
}

/** 対応表からキャラクター名を取り出します。見つからない場合は Fail-Fast で停止します。 */
function nameOf(names: Record<string, string>, id: string): string {
  const name = names[id];
  if (name === undefined) {
    throw new Error(`キャラクターID「${id}」の表示名がみつかりません`);
  }
  return name;
}
