/**
 * @file バトル画面のファイター情報パネル(fighter-info.ts)のテストです。
 * 観戦者が両者の必殺技・特性・パラメータを把握できることを確認します。
 */
import { describe, expect, it } from "vitest";
import { fighterInfoPanel } from "./fighter-info";
import {
  makeCharacter,
  makePassive,
  makeSpecialMove,
} from "../testing/fixtures";

describe("fighterInfoPanel", () => {
  it("必殺技の名前とメタ情報(タイプ・威力・消費MP)を表示する", () => {
    // 事前条件: 攻撃タイプの必殺技を持つキャラクター
    const panel = fighterInfoPanel(
      makeCharacter({
        specialMove: makeSpecialMove({
          name: "爪とぎクラッシュ",
          type: "attack",
          power: 55,
          mpCost: 25,
        }),
      }),
    );
    // 検証: 技名とメタ情報(カード表示と同じ書式)が表示される
    expect(panel.querySelector(".fighter-special-name")?.textContent).toBe(
      "爪とぎクラッシュ",
    );
    expect(panel.querySelector(".fighter-special-meta")?.textContent).toBe(
      "こうげき/威力55/MP25",
    );
  });

  it("状態異常タイプの必殺技は付与する異常名(どく等)を表示する", () => {
    // 事前条件: どくを付与する状態異常タイプの必殺技
    const panel = fighterInfoPanel(
      makeCharacter({
        specialMove: makeSpecialMove({
          name: "しびれ毒の牙",
          type: "ailment",
          ailment: "poison",
          power: 30,
          mpCost: 20,
        }),
      }),
    );
    // 検証: タイプ表示が「どく」になる(カード表示と同じ仕様)
    expect(panel.querySelector(".fighter-special-meta")?.textContent).toBe(
      "どく/威力30/MP20",
    );
  });

  it("特性があるときは固有名と効果の要約を表示する", () => {
    // 事前条件: counter(反撃)の特性を持つキャラクター
    const panel = fighterInfoPanel(
      makeCharacter({
        passive: makePassive("counter", { name: "猫の反射神経" }),
      }),
    );
    // 検証: AIが付けた固有名と、エンジン仕様に基づく効果の要約が表示される
    expect(panel.querySelector(".fighter-passive-name")?.textContent).toBe(
      "猫の反射神経",
    );
    expect(panel.querySelector(".fighter-passive-desc")?.textContent).toBe(
      "攻撃されると反撃する",
    );
  });

  it("特性がないとき(旧形式から移行したキャラ)は特性行を表示しない", () => {
    // 事前条件: パッシブなしのキャラクター(makeCharacter の既定値)
    const panel = fighterInfoPanel(makeCharacter({ passive: null }));
    // 検証: 特性行そのものが描画されない
    expect(panel.querySelector(".fighter-passive")).toBeNull();
  });

  it("パラメータ(こうげき・ぼうぎょ・すばやさ・うん)を表示する", () => {
    // 事前条件: 各パラメータに異なる値を設定したキャラクター
    const panel = fighterInfoPanel(
      makeCharacter({ attack: 42, defense: 21, speed: 63, luck: 7 }),
    );
    // 検証: 4項目がラベルと数値のペアで表示される(HP/MPはバーで表示済みのため除外)
    const items = [...panel.querySelectorAll(".fighter-stat")].map(
      (item) => item.textContent,
    );
    expect(items).toEqual([
      "こうげき42",
      "ぼうぎょ21",
      "すばやさ63",
      "うん7",
    ]);
  });
});
