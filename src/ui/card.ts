/**
 * @file キャラクターカードの描画です。ホーム(一覧)とキャラ作成(生成結果の
 * プレビュー)の両方で使用します。
 */
import type { GeneratedStats } from "../types";
import { STAT_RANGES } from "../ai/schema";
import { el } from "./dom";

/** カード描画に必要な最小限のデータです(Character はこれを満たします)。 */
export type CardData = GeneratedStats & {
  name: string;
  imageDataUrl: string;
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

/** キャラクターカード(画像・二つ名・ステータス・必殺技)を描画します。 */
export function characterCard(data: CardData): HTMLElement {
  return el("article", { className: "card" }, [
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
      statRow("こうげき", data.attack, STAT_RANGES.attack.max),
      statRow("ぼうぎょ", data.defense, STAT_RANGES.defense.max),
      statRow("すばやさ", data.speed, STAT_RANGES.speed.max),
      statRow("うん", data.luck, STAT_RANGES.luck.max),
    ]),
    el("div", { className: "card-special" }, [
      el("span", { className: "card-special-label", text: "ひっさつ" }),
      el("span", {
        className: "card-special-name",
        text: `${data.specialMove.name}(威力${data.specialMove.power})`,
      }),
    ]),
  ]);
}
