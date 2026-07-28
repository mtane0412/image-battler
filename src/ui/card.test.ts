/**
 * @file キャラクターカード描画(card.ts)のテストです。
 * 必殺技・パッシブスキルの説明文がカード上に表示されることを確認します。
 */
import { describe, expect, it } from "vitest";
import { characterCard, stageCard } from "./card";
import {
  makeCharacter,
  makePassive,
  makeSpecialMove,
  makeStageEvent,
  makeStageTrait,
} from "../testing/fixtures";

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

describe("stageCard", () => {
  it("ステージ名・紹介文・画像を表示する", () => {
    const card = stageCard({
      name: "灼熱の闘技場",
      title: "業火の舞台",
      description: "溶岩が渦巻く、灼熱に包まれたステージです",
      trait: makeStageTrait("blazing"),
      event: makeStageEvent("meteor"),
      imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    });
    expect(card.querySelector(".stage-card-name")?.textContent).toBe(
      "灼熱の闘技場",
    );
    expect(card.querySelector(".stage-card-title")?.textContent).toBe(
      "業火の舞台",
    );
    expect(card.querySelector(".stage-card-desc")?.textContent).toBe(
      "溶岩が渦巻く、灼熱に包まれたステージです",
    );
    const img = card.querySelector<HTMLImageElement>(".stage-card-portrait img");
    expect(img?.getAttribute("src")).toBe("data:image/jpeg;base64,dGVzdA==");
  });

  it("特性の名前・説明文を表示する", () => {
    const card = stageCard({
      name: "灼熱の闘技場",
      title: "業火の舞台",
      description: "説明",
      trait: makeStageTrait("blazing", {
        name: "灼熱のオーラ",
        description: "全員の攻撃力が上がる",
      }),
      event: makeStageEvent("meteor"),
      imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    });
    expect(card.querySelector(".stage-card-trait-name")?.textContent).toBe(
      "灼熱のオーラ",
    );
    expect(card.querySelector(".stage-card-trait-desc")?.textContent).toBe(
      "全員の攻撃力が上がる",
    );
  });

  it("特殊イベントの名前・説明文を表示する", () => {
    const card = stageCard({
      name: "灼熱の闘技場",
      title: "業火の舞台",
      description: "説明",
      trait: makeStageTrait("blazing"),
      event: makeStageEvent("meteor", {
        name: "隕石落とし",
        description: "隕石が降り注ぎ全員がダメージを受ける",
      }),
      imageDataUrl: "data:image/jpeg;base64,dGVzdA==",
    });
    expect(card.querySelector(".stage-card-event-name")?.textContent).toBe(
      "隕石落とし",
    );
    expect(card.querySelector(".stage-card-event-desc")?.textContent).toBe(
      "隕石が降り注ぎ全員がダメージを受ける",
    );
  });
});
