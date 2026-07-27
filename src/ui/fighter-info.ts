/**
 * @file バトル画面のファイター情報パネルの描画です。
 * 観戦者が両者の手の内を把握できるよう、必殺技(名前・タイプ・威力・消費MP)、
 * 特性(固有名・効果の要約)、パラメータ(こうげき・ぼうぎょ・すばやさ・うん)を
 * ファイターの下に常時表示します。
 *
 * HP・MPは battle.ts のバー表示が担当するためここでは扱いません。
 * 特性の効果説明には、AIが生成する紹介文(description)ではなく
 * エンジン仕様に基づく短い要約(PASSIVE_SKILL_SUMMARIES)を使用します
 * (ステージ上の限られたスペースでも効果が正確に伝わるようにするためです)。
 */
import type { Character } from "../types";
import { PASSIVE_SKILL_SUMMARIES } from "../types";
import { specialMoveMeta } from "./card";
import { el } from "./dom";

/** パラメータ1項目(ラベル+数値)を描画します。 */
function statItem(label: string, value: number): HTMLElement {
  return el("span", { className: "fighter-stat" }, [
    el("span", { className: "fighter-stat-label", text: label }),
    el("span", { className: "fighter-stat-value", text: String(value) }),
  ]);
}

/**
 * ファイター情報パネル(必殺技・特性・パラメータ)を描画します。
 * 旧形式から移行したキャラクター(passive: null)は特性行を表示しません
 * (カード表示 card.ts と同じ方針です)。
 */
export function fighterInfoPanel(character: Character): HTMLElement {
  const panel = el("div", { className: "fighter-info" }, [
    el("div", { className: "fighter-special" }, [
      el("span", { className: "fighter-info-label", text: "ひっさつ" }),
      el("span", {
        className: "fighter-special-name",
        text: character.specialMove.name,
      }),
      el("span", {
        className: "fighter-special-meta",
        text: specialMoveMeta(character.specialMove),
      }),
    ]),
  ]);

  if (character.passive !== null) {
    panel.append(
      el("div", { className: "fighter-passive" }, [
        el("span", { className: "fighter-info-label", text: "とくせい" }),
        el("span", {
          className: "fighter-passive-name",
          text: character.passive.name,
        }),
        el("span", {
          className: "fighter-passive-desc",
          text: PASSIVE_SKILL_SUMMARIES[character.passive.id],
        }),
      ]),
    );
  }

  panel.append(
    el("div", { className: "fighter-stats" }, [
      statItem("こうげき", character.attack),
      statItem("ぼうぎょ", character.defense),
      statItem("すばやさ", character.speed),
      statItem("うん", character.luck),
    ]),
  );
  return panel;
}
