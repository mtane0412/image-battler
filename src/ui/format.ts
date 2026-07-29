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
    case "special-drain":
      return `${actor}の ひっさつわざ「${event.moveName}」! ${target}に ${event.damage}の ダメージ! ${actor}は HPを ${event.healed} すいとった!`;
    case "special-debuff":
      return `${actor}の ひっさつわざ「${event.moveName}」! ${target}の こうげきと ぼうぎょが がくっと さがった!`;
    case "special-all-attack":
      return event.first
        ? `${actor}の ひっさつわざ「${event.moveName}」! みんなに ${event.damage}の ダメージ!`
        : `${target}に ${event.damage}の ダメージ!`;
    case "ailment-damage":
      return event.ailment === "poison"
        ? `${actor}は どくに むしばまれている! ${event.damage}の ダメージ!`
        : `${actor}は やけどが いたむ! ${event.damage}の ダメージ!`;
    case "ailment-skip":
      return event.ailment === "paralysis"
        ? `${actor}は からだが しびれて うごけない!`
        : `${actor}は こおりついて うごけない!`;
    case "ailment-cure":
      // freezeは「とけた」、それ以外(cleanseによる解除)は「なおった」と表現します
      return event.ailment === "freeze"
        ? `${actor}の こおりが とけた!`
        : `${actor}の ${AILMENT_LABELS[event.ailment]}が なおった!`;
    case "ailment-confusion":
      return `${actor}は こんらんして じぶんを こうげきした! ${event.damage}の ダメージ!`;
    case "counter":
      return `${actor}の はんげき! ${target}に ${event.damage}の ダメージ!`;
    case "thorns":
      return `${actor}の とげが ${target}を きずつけた! ${event.damage}の ダメージ!`;
    case "endure":
      return `${actor}は こんじょうで もちこたえた!`;
    case "life-steal":
      return `${actor}は あいての せいきを すいとった! HPが ${event.healed} かいふく!`;
    case "regenerate":
      return `${actor}の きずが しぜんに ふさがる! HPが ${event.healed} かいふく!`;
    case "stage-damage":
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}に ${event.damage}の ダメージ!`
        : `${actor}に ${event.damage}の ダメージ!`;
    case "stage-heal":
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}の HPが ${event.healed} かいふくした!`
        : `${actor}の HPが ${event.healed} かいふくした!`;
    case "stage-mp":
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}の MPが ${event.restored} かいふくした!`
        : `${actor}の MPが ${event.restored} かいふくした!`;
    case "stage-ailment":
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}は ${AILMENT_LABELS[event.ailment]}じょうたいに なった!`
        : `${actor}は ${AILMENT_LABELS[event.ailment]}じょうたいに なった!`;
    case "stage-mp-drain":
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}の MPが ${event.drained} へった!`
        : `${actor}の MPが ${event.drained} へった!`;
    case "stage-buff": {
      // attack-up は attackGain のみ、defense-down は defenseGain のみが非ゼロです
      const effect =
        event.attackGain > 0
          ? `こうげきが ぐーんと あがった`
          : `ぼうぎょが がくっと さがった`;
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}の ${effect}!`
        : `${actor}の ${effect}!`;
    }
    case "stage-cure":
      return event.announce
        ? `ステージこうか「${event.eventName}」が はつどうした! ${actor}の ${AILMENT_LABELS[event.ailment]}が なおった!`
        : `${actor}の ${AILMENT_LABELS[event.ailment]}が なおった!`;
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
