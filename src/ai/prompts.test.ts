/**
 * @file プロンプト組み立て(prompts.ts)のテストです。
 * キャラクター名やバトル情報がプロンプト文字列に正しく埋め込まれることを確認します。
 */
import { describe, expect, it } from "vitest";
import {
  buildCharacterPrompt,
  buildDefeatSpeechPrompt,
  buildIntroPrompt,
  buildNarrationPrompt,
  buildResultPrompt,
  buildSpecialMoveSpeechPrompt,
  buildStoryPrompt,
  buildVictorySpeechPrompt,
} from "./prompts";

describe("buildCharacterPrompt", () => {
  it("キャラクター名が含まれる", () => {
    const prompt = buildCharacterPrompt("もふ吉", ["crit-master", "endure", "counter"]);
    expect(prompt).toContain("もふ吉");
  });

  it("必殺技タイプの選択肢が含まれる", () => {
    const prompt = buildCharacterPrompt("もふ吉", ["crit-master", "endure", "counter"]);
    // 必殺技の4タイプ
    for (const type of ["attack", "heal", "ailment", "buff"]) {
      expect(prompt).toContain(type);
    }
  });

  it("パッシブスキルは渡した候補だけが効果の要約付きで含まれる", () => {
    const prompt = buildCharacterPrompt("もふ吉", ["life-steal", "evasion", "berserk"]);
    for (const id of ["life-steal", "evasion", "berserk"]) {
      expect(prompt).toContain(id);
    }
    // 効果の要約(PASSIVE_SKILL_SUMMARIES)も一緒に提示される
    expect(prompt).toContain("与えたダメージの一部を吸収して回復する");
    // 候補にないidは提示されない
    expect(prompt).not.toContain("crit-master");
    expect(prompt).not.toContain("mp-boost");
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

  it("とどめの一撃(残りHP0)では残りHPの数値ではなく決着として実況させる", () => {
    // 「残りHPは0/200」をそのまま渡すと、小型モデルが「あと少しだ」や
    // 最大HPの数値を読み上げるなど不自然な実況になるため、
    // HP0のときは決着の一撃であることを伝えて数値に触れさせない
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "がぶ太",
      targetHpAfter: 0,
      targetMaxHp: 200,
      type: "attack",
      critical: true,
      damage: 45,
    });
    expect(prompt).toContain("力尽き");
    expect(prompt).not.toContain("残りHP");
    expect(prompt).not.toContain("200");
  });

  it("必殺技のとどめの一撃(残りHP0)でも残りHPの数値に触れさせない", () => {
    const prompt = buildNarrationPrompt({
      actorName: "もふ吉",
      targetName: "がぶ太",
      targetHpAfter: 0,
      targetMaxHp: 200,
      type: "special-attack",
      moveName: "爪とぎクラッシュ",
      damage: 66,
    });
    expect(prompt).toContain("爪とぎクラッシュ");
    expect(prompt).toContain("力尽き");
    expect(prompt).not.toContain("残りHP");
    expect(prompt).not.toContain("200");
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

describe("buildStoryPrompt", () => {
  /** テストで共用する両ファイターの情報です。 */
  const mofukichi = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };
  const gabuta = {
    name: "がぶ太",
    title: "鋼鉄の甘噛み犬",
    description: "なんでも噛んでしまう犬の騎士です",
  };
  const ingredients = { stage: "満月の廃神殿", relation: "宿命のライバル" };

  it("両者の名前・二つ名・紹介文が含まれる", () => {
    const prompt = buildStoryPrompt(mofukichi, gabuta, ingredients);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("よく寝る猫の戦士です");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("鋼鉄の甘噛み犬");
    expect(prompt).toContain("なんでも噛んでしまう犬の騎士です");
  });

  it("抽選した舞台と因縁が含まれる", () => {
    const prompt = buildStoryPrompt(mofukichi, gabuta, ingredients);
    expect(prompt).toContain("満月の廃神殿");
    expect(prompt).toContain("宿命のライバル");
  });

  it("勝敗のネタバレを禁止する指示が含まれる", () => {
    // 前口上はバトル再生前に表示するため、結末を書かせない指示が必要
    const prompt = buildStoryPrompt(mofukichi, gabuta, ingredients);
    expect(prompt).toContain("勝敗");
  });
});

describe("buildSpecialMoveSpeechPrompt", () => {
  const mofukichi = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };
  const move = {
    name: "爪とぎクラッシュ",
    description: "鋭い爪で連続攻撃を繰り出す",
  };
  const ingredients = { stage: "満月の廃神殿", relation: "宿命のライバル" };

  it("キャラクターの名前・二つ名・紹介文が含まれる", () => {
    const prompt = buildSpecialMoveSpeechPrompt(mofukichi, move, ingredients);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("よく寝る猫の戦士です");
  });

  it("必殺技の名前と演出説明が含まれる", () => {
    const prompt = buildSpecialMoveSpeechPrompt(mofukichi, move, ingredients);
    expect(prompt).toContain("爪とぎクラッシュ");
    expect(prompt).toContain("鋭い爪で連続攻撃を繰り出す");
  });

  it("抽選した舞台と因縁が含まれる(前口上と世界観を揃えるため)", () => {
    const prompt = buildSpecialMoveSpeechPrompt(mofukichi, move, ingredients);
    expect(prompt).toContain("満月の廃神殿");
    expect(prompt).toContain("宿命のライバル");
  });

  it("短いセリフを1つだけ求める指示が含まれる", () => {
    // 小型モデルが長文を返さないよう、文字数の上限を明示する
    const prompt = buildSpecialMoveSpeechPrompt(mofukichi, move, ingredients);
    expect(prompt).toContain("15文字");
  });
});

describe("buildVictorySpeechPrompt / buildDefeatSpeechPrompt", () => {
  const mofukichi = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };
  const ingredients = { stage: "満月の廃神殿", relation: "宿命のライバル" };

  it("勝利セリフにはキャラ設定・相手の名前・舞台・因縁が含まれる", () => {
    const prompt = buildVictorySpeechPrompt(mofukichi, "がぶ太", ingredients);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("よく寝る猫の戦士です");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("満月の廃神殿");
    expect(prompt).toContain("宿命のライバル");
  });

  it("勝利セリフには勝利の場面と文字数上限の指示が含まれる", () => {
    const prompt = buildVictorySpeechPrompt(mofukichi, "がぶ太", ingredients);
    expect(prompt).toContain("勝利");
    expect(prompt).toContain("15文字");
  });

  it("断末魔にはキャラ設定・相手の名前・舞台・因縁が含まれる", () => {
    const prompt = buildDefeatSpeechPrompt(mofukichi, "がぶ太", ingredients);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("よく寝る猫の戦士です");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("満月の廃神殿");
    expect(prompt).toContain("宿命のライバル");
  });

  it("断末魔には倒れる場面と文字数上限の指示が含まれる", () => {
    const prompt = buildDefeatSpeechPrompt(mofukichi, "がぶ太", ingredients);
    expect(prompt).toContain("断末魔");
    expect(prompt).toContain("15文字");
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
