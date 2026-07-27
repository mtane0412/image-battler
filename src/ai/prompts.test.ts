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
});

describe("buildNarrationPrompt", () => {
  it("通常攻撃の実況素材(攻撃側・防御側・ダメージ)が含まれる", () => {
    const prompt = buildNarrationPrompt({
      attackerName: "もふ吉",
      defenderName: "がぶ太",
      type: "attack",
      critical: false,
      damage: 32,
      defenderHpAfter: 68,
      defenderMaxHp: 100,
    });
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("32");
  });

  it("必殺技の実況素材には技名が含まれる", () => {
    const prompt = buildNarrationPrompt({
      attackerName: "もふ吉",
      defenderName: "がぶ太",
      type: "special",
      critical: false,
      damage: 66,
      defenderHpAfter: 34,
      defenderMaxHp: 100,
      specialMoveName: "爪とぎクラッシュ",
    });
    expect(prompt).toContain("爪とぎクラッシュ");
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
