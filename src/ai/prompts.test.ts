/**
 * @file プロンプト組み立て(prompts.ts)のテストです。
 * キャラクター名やバトル情報がプロンプト文字列に正しく埋め込まれることを確認します。
 */
import { describe, expect, it } from "vitest";
import {
  buildCharacterPrompt,
  buildIntroPrompt,
  buildNarrationPrompt,
  buildResultPrompt,
} from "./prompts";

describe("buildCharacterPrompt", () => {
  it("キャラクター名が含まれる", () => {
    const prompt = buildCharacterPrompt("もふ吉");
    expect(prompt).toContain("もふ吉");
  });

  it("必殺技タイプとパッシブスキルの選択肢が含まれる", () => {
    const prompt = buildCharacterPrompt("もふ吉");
    // 必殺技の4タイプ
    for (const type of ["attack", "heal", "ailment", "buff"]) {
      expect(prompt).toContain(type);
    }
    // パッシブスキルの5種
    for (const id of ["crit-master", "ailment-guard", "endure", "counter", "mp-boost"]) {
      expect(prompt).toContain(id);
    }
  });
});

describe("buildNarrationPrompt", () => {
  it("通常攻撃の実況素材(行動側・相手側・ダメージ)が含まれる", () => {
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "がぶ太",
      targetHpAfter: 68,
      targetMaxHp: 100,
      type: "attack",
      critical: false,
      damage: 32,
    });
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("32");
  });

  it("攻撃必殺技の実況素材には技名が含まれる", () => {
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "がぶ太",
      targetHpAfter: 34,
      targetMaxHp: 100,
      type: "special-attack",
      moveName: "爪とぎクラッシュ",
      damage: 66,
    });
    expect(prompt).toContain("爪とぎクラッシュ");
    expect(prompt).toContain("66");
  });

  it("回復必殺技の実況素材には技名と回復量が含まれる", () => {
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "もふ吉",
      targetHpAfter: 98,
      targetMaxHp: 100,
      type: "special-heal",
      moveName: "いやしの毛づくろい",
      healed: 50,
    });
    expect(prompt).toContain("いやしの毛づくろい");
    expect(prompt).toContain("50");
    expect(prompt).toContain("回復");
  });

  it("異常必殺技の実況素材には技名と状態異常名が含まれる", () => {
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "がぶ太",
      targetHpAfter: 85,
      targetMaxHp: 100,
      type: "special-ailment",
      moveName: "しびれるまなざし",
      ailment: "paralysis",
      damage: 15,
    });
    expect(prompt).toContain("しびれるまなざし");
    expect(prompt).toContain("まひ");
  });

  it("強化必殺技の実況素材には技名が含まれる", () => {
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "もふ吉",
      targetHpAfter: 100,
      targetMaxHp: 100,
      type: "special-buff",
      moveName: "たけりのポーズ",
    });
    expect(prompt).toContain("たけりのポーズ");
  });

  it("反撃の実況素材にはパッシブ名とダメージが含まれる", () => {
    const prompt = buildNarrationPrompt({
      actorName: "がぶ太",
      targetName: "もふ吉",
      targetHpAfter: 88,
      targetMaxHp: 100,
      type: "counter",
      passiveName: "鋼のかみつき返し",
      damage: 12,
    });
    expect(prompt).toContain("鋼のかみつき返し");
    expect(prompt).toContain("12");
  });
});

describe("buildIntroPrompt / buildResultPrompt", () => {
  it("開始実況には両者の名前と二つ名が含まれる", () => {
    const prompt = buildIntroPrompt(
      { name: "もふ吉", title: "深淵の眠り猫" },
      { name: "がぶ太", title: "鋼鉄の甘噛み犬" },
    );
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("深淵の眠り猫");
  });

  it("結果実況には勝者と敗者の名前が含まれる", () => {
    const prompt = buildResultPrompt("もふ吉", "がぶ太", false);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("がぶ太");
  });

  it("引き分けの場合はその旨が伝わる情報を含む", () => {
    const prompt = buildResultPrompt("もふ吉", "がぶ太", true);
    expect(prompt).toContain("引き分け");
  });
});
