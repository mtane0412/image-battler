/**
 * @file キャラクターカード描画(card.ts)のテストです。
 * 必殺技・パッシブスキルの説明文がカード上に表示されることを確認します。
 */
import { describe, expect, it } from "vitest";
import { characterCard } from "./card";
import { makeCharacter, makePassive, makeSpecialMove } from "../testing/fixtures";

describe("characterCard", () => {
  it("必殺技の説明文を表示する", () => {
    const card = characterCard(
      makeCharacter({
        specialMove: makeSpecialMove({
          name: "爪とぎクラッシュ",
          description: "鋭い爪を研ぎ澄まして敵を切り裂く",
        }),
      }),
    );
    const desc = card.querySelector(".card-special-desc");
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe("鋭い爪を研ぎ澄まして敵を切り裂く");
  });

  it("必殺技の名前とメタ情報(タイプ・威力・MP)も引き続き表示する", () => {
    const card = characterCard(
      makeCharacter({
        specialMove: makeSpecialMove({
          name: "爪とぎクラッシュ",
          type: "attack",
          power: 55,
          mpCost: 25,
        }),
      }),
    );
    expect(card.querySelector(".card-special-name")?.textContent).toBe(
      "爪とぎクラッシュ",
    );
    expect(card.querySelector(".card-special-meta")?.textContent).toBe(
      "こうげき/威力55/MP25",
    );
  });

  it("パッシブスキルがあるときは説明文を表示する", () => {
    const card = characterCard(
      makeCharacter({
        passive: makePassive("counter", {
          name: "猫の反射神経",
          description: "攻撃されると反射的にやり返す",
        }),
      }),
    );
    expect(card.querySelector(".card-passive-desc")?.textContent).toBe(
      "攻撃されると反射的にやり返す",
    );
  });

  it("パッシブスキルがないとき(移行キャラ)はパッシブ行を表示しない", () => {
    const card = characterCard(makeCharacter({ passive: null }));
    expect(card.querySelector(".card-passive")).toBeNull();
  });
});
