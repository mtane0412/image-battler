/**
 * @file キャラクターカードの描画です。ホーム(一覧)とキャラ作成(生成結果の
 * プレビュー)の両方で使用します。
 */
import type { GeneratedStage, GeneratedStats, PassiveSkill, SpecialMove } from "../types";
import { AILMENT_LABELS, SPECIAL_MOVE_TYPE_LABELS } from "../types";
import { STAT_RANGES } from "../ai/schema";
import { el } from "./dom";

/**
 * カード描画に必要な最小限のデータです(Character はこれを満たします)。
 * passive は旧形式から移行したキャラクターでは null になります。
 */
export type CardData = Omit<GeneratedStats, "passive"> & {
  name: string;
  imageDataUrl: string;
  passive: PassiveSkill | null;
};

/** ステータス1行(ラベル+バー+数値)を描画します。 */
function statRow(label: string, value: number, max: number): HTMLElement {
  const percent = Math.round((value / max) * 100);
  return el("div", { className: "stat-row" }, [
    el("span", { className: "stat-label", text: label }),
    el("span", { className: "stat-bar" }, [
      el("span", {
        className: "stat-bar-fill",
        attrs: { style: `width:${percent}%` },
      }),
    ]),
    el("span", { className: "stat-value", text: String(value) }),
  ]);
}

/**
 * 必殺技のタイプ表示文字列を返します。
 * 異常タイプは付与する状態異常名(どく等)まで表示します。
 */
function specialTypeLabel(move: SpecialMove): string {
  if (move.type === "ailment" && move.ailment !== null) {
    return AILMENT_LABELS[move.ailment];
  }
  return SPECIAL_MOVE_TYPE_LABELS[move.type];
}

/**
 * 必殺技のメタ情報(タイプ/威力/消費MP)の表示文字列を返します。
 * カード表示とバトル画面のファイター情報パネルで共用します。
 */
export function specialMoveMeta(move: SpecialMove): string {
  return `${specialTypeLabel(move)}/威力${move.power}/MP${move.mpCost}`;
}

/** キャラクターカード(画像・二つ名・ステータス・必殺技・パッシブ)を描画します。 */
export function characterCard(data: CardData): HTMLElement {
  const card = el("article", { className: "card" }, [
    el("div", { className: "card-portrait" }, [
      el("img", {
        attrs: { src: data.imageDataUrl, alt: `${data.name}の画像` },
      }),
    ]),
    el("p", { className: "card-title", text: data.title }),
    el("h3", { className: "card-name", text: data.name }),
    el("p", { className: "card-desc", text: data.description }),
    el("div", { className: "card-stats" }, [
      statRow("HP", data.hp, STAT_RANGES.hp.max),
      statRow("MP", data.mp, STAT_RANGES.mp.max),
      statRow("こうげき", data.attack, STAT_RANGES.attack.max),
      statRow("ぼうぎょ", data.defense, STAT_RANGES.defense.max),
      statRow("すばやさ", data.speed, STAT_RANGES.speed.max),
      statRow("うん", data.luck, STAT_RANGES.luck.max),
    ]),
    el("div", { className: "card-special" }, [
      el("span", { className: "card-special-label", text: "ひっさつ" }),
      el("span", {
        className: "card-special-name",
        text: data.specialMove.name,
      }),
      el("span", {
        className: "card-special-meta",
        text: specialMoveMeta(data.specialMove),
      }),
      el("span", {
        className: "card-special-desc",
        text: data.specialMove.description,
      }),
    ]),
  ]);

  // 旧形式から移行したキャラクター(passive: null)はパッシブ行を表示しません
  if (data.passive !== null) {
    card.append(
      el("div", { className: "card-passive" }, [
        el("span", { className: "card-passive-label", text: "とくせい" }),
        el("span", { className: "card-passive-name", text: data.passive.name }),
        el("span", {
          className: "card-passive-desc",
          text: data.passive.description,
        }),
      ]),
    );
  }
  return card;
}

/**
 * ステージカード描画に必要な最小限のデータです(Stage はこれを満たします)。
 */
export type StageCardData = GeneratedStage & {
  name: string;
  imageDataUrl: string;
};

/**
 * ステージカード(画像・名前・紹介文・特殊イベント・特性)を描画します。
 * ファイターカード(必殺技が上・とくせいが下)と行の並びを揃えるため、
 * とくしゅいべんと(card-special)を先、とくせい(card-passive)を後に配置します。
 */
export function stageCard(data: StageCardData): HTMLElement {
  return el("article", { className: "card stage-card" }, [
    el("div", { className: "card-portrait stage-card-portrait" }, [
      el("img", {
        attrs: { src: data.imageDataUrl, alt: `${data.name}の画像` },
      }),
    ]),
    el("p", { className: "card-title stage-card-title", text: data.title }),
    el("h3", { className: "card-name stage-card-name", text: data.name }),
    el("p", { className: "card-desc stage-card-desc", text: data.description }),
    el("div", { className: "card-special stage-card-event" }, [
      el("span", { className: "card-special-label", text: "とくしゅいべんと" }),
      el("span", {
        className: "card-special-name stage-card-event-name",
        text: data.event.name,
      }),
      el("span", {
        className: "card-special-desc stage-card-event-desc",
        text: data.event.description,
      }),
    ]),
    el("div", { className: "card-passive stage-card-trait" }, [
      el("span", { className: "card-passive-label", text: "とくせい" }),
      el("span", {
        className: "card-passive-name stage-card-trait-name",
        text: data.trait.name,
      }),
      el("span", {
        className: "card-passive-desc stage-card-trait-desc",
        text: data.trait.description,
      }),
    ]),
  ]);
}
