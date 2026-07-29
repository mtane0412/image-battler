/**
 * @file プロンプト組み立て(prompts.ts)のテストです。
 * キャラクター名やバトル情報がプロンプト文字列に正しく埋め込まれることを確認します。
 */
import { describe, expect, it } from "vitest";
import {
  buildCharacterPrompt,
  buildChapterNarrationPrompt,
  buildChapterOpponentLinePrompt,
  buildChapterProtagonistLinePrompt,
  buildDefeatSpeechPrompt,
  buildIntroPrompt,
  buildNarrationPrompt,
  buildResultPrompt,
  buildRoyaleIntroPrompt,
  buildRoyaleResultPrompt,
  buildRoyaleStoryPrompt,
  buildSpecialMoveSpeechPrompt,
  buildStagePrompt,
  buildStoryEndingPrompt,
  buildStoryOpeningPrompt,
  buildStoryPrompt,
  buildVictorySpeechPrompt,
  formatOpponentsLabel,
} from "./prompts";
import { ACT_NARRATION_TONES, ENDING_RANK_TONES } from "../story/plan";

describe("buildCharacterPrompt", () => {
  it("キャラクター名が含まれる", () => {
    const prompt = buildCharacterPrompt(
      "もふ吉",
      ["crit-master", "endure", "counter"],
      ["attack", "heal", "ailment"],
      ["poison", "paralysis", "burn"],
    );
    expect(prompt).toContain("もふ吉");
  });

  it("必殺技タイプは渡した候補だけが効果の要約付きで含まれる", () => {
    const prompt = buildCharacterPrompt(
      "もふ吉",
      ["crit-master", "endure", "counter"],
      ["drain", "debuff", "all-attack"],
      ["poison", "paralysis", "burn"],
    );
    for (const type of ["drain", "debuff", "all-attack"]) {
      expect(prompt).toContain(type);
    }
    // 効果の要約(SPECIAL_MOVE_TYPE_SUMMARIES)も一緒に提示される
    expect(prompt).toContain("ダメージを与えつつ一部を吸収して回復する");
    // 候補にないタイプは提示されない
    expect(prompt).not.toContain("type: attack(");
    expect(prompt).not.toContain("buff(自分の攻守を上げる)");
  });

  it("状態異常は渡した候補だけがラベル付きで含まれる", () => {
    const prompt = buildCharacterPrompt(
      "もふ吉",
      ["crit-master", "endure", "counter"],
      ["attack", "heal", "ailment"],
      ["curse", "blind", "weaken"],
    );
    for (const ailment of ["curse", "blind", "weaken"]) {
      expect(prompt).toContain(ailment);
    }
    expect(prompt).toContain("のろい");
    // 候補にない状態異常は提示されない
    expect(prompt).not.toContain("poison(どく)");
  });

  it("パッシブスキルは渡した候補だけが効果の要約付きで含まれる", () => {
    const prompt = buildCharacterPrompt(
      "もふ吉",
      ["life-steal", "evasion", "berserk"],
      ["attack", "heal", "ailment"],
      ["poison", "paralysis", "burn"],
    );
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

describe("buildStagePrompt", () => {
  it("ステージ名が含まれる", () => {
    const prompt = buildStagePrompt("灼熱の闘技場", ["attack-up", "damage-cut"], [
      "damage",
      "heal",
    ]);
    expect(prompt).toContain("灼熱の闘技場");
  });

  it("ステージ特性は渡した候補だけが効果の要約付きで含まれる", () => {
    const prompt = buildStagePrompt(
      "極寒の氷原",
      ["crit-up", "mp-regen-up"],
      ["damage", "heal"],
    );
    for (const id of ["crit-up", "mp-regen-up"]) {
      expect(prompt).toContain(id);
    }
    expect(prompt).toContain("全員の会心率が上がる");
    // 候補にないidは提示されない
    expect(prompt).not.toContain("attack-up");
    expect(prompt).not.toContain("damage-cut");
  });

  it("ステージ特殊イベントは渡した候補だけが効果の要約付きで含まれる", () => {
    const prompt = buildStagePrompt(
      "瘴気の沼地",
      ["attack-up", "damage-cut"],
      ["mana-restore", "ailment"],
    );
    for (const id of ["mana-restore", "ailment"]) {
      expect(prompt).toContain(id);
    }
    expect(prompt).toContain("状態異常でない生存者全員をやけど状態にする");
    // 候補にないidは提示されない(trait側の "damage-cut" に "damage" が
    // 部分一致してしまうため、id+開き括弧の形式で厳密にチェックします)
    expect(prompt).not.toContain("damage(");
    expect(prompt).not.toContain("heal(");
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

  it("1v1では両者の名前・二つ名・紹介文が含まれる", () => {
    const prompt = buildStoryPrompt([mofukichi], [gabuta], ingredients);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("よく寝る猫の戦士です");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("鋼鉄の甘噛み犬");
    expect(prompt).toContain("なんでも噛んでしまう犬の騎士です");
  });

  it("抽選した舞台と因縁が含まれる", () => {
    const prompt = buildStoryPrompt([mofukichi], [gabuta], ingredients);
    expect(prompt).toContain("満月の廃神殿");
    expect(prompt).toContain("宿命のライバル");
  });

  it("勝敗のネタバレを禁止する指示が含まれる", () => {
    // 前口上はバトル再生前に表示するため、結末を書かせない指示が必要
    const prompt = buildStoryPrompt([mofukichi], [gabuta], ingredients);
    expect(prompt).toContain("勝敗");
  });

  it("2v2では4体全員の名前と紹介文が含まれ、タッグバトルであることが伝わる", () => {
    const piyosuke = {
      name: "ぴよ助",
      title: "疾風のひよこ",
      description: "すばしっこいひよこの剣士です",
    };
    const kuromaru = {
      name: "くろ丸",
      title: "漆黒の甲羅",
      description: "守りの固い亀の重戦士です",
    };
    const prompt = buildStoryPrompt(
      [mofukichi, piyosuke],
      [gabuta, kuromaru],
      ingredients,
    );
    for (const name of ["もふ吉", "ぴよ助", "がぶ太", "くろ丸"]) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain("すばしっこいひよこの剣士です");
    expect(prompt).toContain("守りの固い亀の重戦士です");
    expect(prompt).toContain("2対2");
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
      [{ name: "もふ吉", title: "深淵の眠り猫" }],
      [{ name: "がぶ太", title: "鋼鉄の甘噛み犬" }],
    );
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("深淵の眠り猫");
  });

  it("2v2の開始実況には4体全員の名前が含まれ、タッグバトルであることが伝わる", () => {
    const prompt = buildIntroPrompt(
      [
        { name: "もふ吉", title: "深淵の眠り猫" },
        { name: "ぴよ助", title: "疾風のひよこ" },
      ],
      [
        { name: "がぶ太", title: "鋼鉄の甘噛み犬" },
        { name: "くろ丸", title: "漆黒の甲羅" },
      ],
    );
    for (const name of ["もふ吉", "ぴよ助", "がぶ太", "くろ丸"]) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain("2対2");
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

describe("formatOpponentsLabel", () => {
  it("相手が1人のときは名前をそのまま返す", () => {
    expect(formatOpponentsLabel(["がぶ太"])).toBe("がぶ太");
  });

  it("相手が2人のときは「と」でつなぐ(1v1・2v2の従来表記と同じ)", () => {
    expect(formatOpponentsLabel(["がぶ太", "ぴよ助"])).toBe("がぶ太とぴよ助");
  });

  it("相手が3人以上のときは「先頭たちn人」に丸めて文字列長を抑える", () => {
    // バトルロイヤルでは相手が最大9人になり得るため、プロンプト長を有界にする
    expect(
      formatOpponentsLabel(["がぶ太", "ぴよ助", "くろ丸", "ぽん吉"]),
    ).toBe("がぶ太たち4人");
  });

  it("相手が0人はデータ不正なのでエラーになる(Fail-Fast)", () => {
    expect(() => formatOpponentsLabel([])).toThrow(/相手/);
  });
});

describe("buildRoyaleStoryPrompt / buildRoyaleIntroPrompt / buildRoyaleResultPrompt", () => {
  const fighters = [
    { name: "もふ吉", title: "深淵の眠り猫", description: "よく寝る猫の戦士です" },
    { name: "がぶ太", title: "鋼鉄の甘噛み犬", description: "なんでも噛んでしまう犬の騎士です" },
    { name: "ぴよ助", title: "疾風のひよこ", description: "すばしっこいひよこの剣士です" },
  ];
  const ingredients = { stage: "満月の廃神殿", relation: "宿命のライバル" };

  it("前口上には全員の名前・二つ名・紹介文と、人数・バトルロイヤルであることが含まれる", () => {
    const prompt = buildRoyaleStoryPrompt(fighters, ingredients);
    for (const fighter of fighters) {
      expect(prompt).toContain(fighter.name);
      expect(prompt).toContain(fighter.title);
      expect(prompt).toContain(fighter.description);
    }
    expect(prompt).toContain("3人");
    expect(prompt).toContain("バトルロイヤル");
  });

  it("前口上には舞台・因縁とネタバレ禁止指示が含まれ、チームのコーナー色は含まれない", () => {
    const prompt = buildRoyaleStoryPrompt(fighters, ingredients);
    expect(prompt).toContain("満月の廃神殿");
    expect(prompt).toContain("宿命のライバル");
    expect(prompt).toContain("勝敗");
    // 完全FFAにはチーム(青/赤コーナー)の概念がない
    expect(prompt).not.toContain("青コーナー");
    expect(prompt).not.toContain("赤コーナー");
  });

  it("開始実況には全員の名前・二つ名と、人数・バトルロイヤルであることが含まれる", () => {
    const prompt = buildRoyaleIntroPrompt(
      fighters.map(({ name, title }) => ({ name, title })),
    );
    for (const fighter of fighters) {
      expect(prompt).toContain(fighter.name);
      expect(prompt).toContain(fighter.title);
    }
    expect(prompt).toContain("3人");
    expect(prompt).toContain("バトルロイヤル");
    expect(prompt).not.toContain("青コーナー");
  });

  it("結果実況には勝者の名前と人数・バトルロイヤルであることが含まれる", () => {
    const prompt = buildRoyaleResultPrompt("もふ吉", 5);
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("5人");
    expect(prompt).toContain("バトルロイヤル");
  });

  it("引き分けの場合はその旨が伝わる情報を含む", () => {
    const prompt = buildRoyaleResultPrompt(null, 4);
    expect(prompt).toContain("引き分け");
    expect(prompt).toContain("4人");
  });
});

describe("buildChapterNarrationPrompt", () => {
  const protagonist = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };
  const opponent = {
    name: "がぶ太",
    title: "鋼鉄の甘噛み犬",
    description: "なんでも噛んでしまう犬の騎士です",
  };

  it("主人公・相手・旅の目的・遭遇・舞台・章番号が含まれる", () => {
    const prompt = buildChapterNarrationPrompt({
      protagonist,
      opponent,
      quest: "奪われた宝物を取り戻すため",
      encounter: "旅の途中の道をふさぐ用心棒として",
      stageName: "満月の闘技場",
      chapterIndex: 2,
      chapterCount: 5,
      summaryLines: ["第1話: 炎の谷でぴよ助に勝利した。"],
      momentum: "直前の戦いに勝利した",
      tone: ACT_NARRATION_TONES.act2,
    });
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("奪われた宝物を取り戻すため");
    expect(prompt).toContain("旅の途中の道をふさぐ用心棒として");
    expect(prompt).toContain("満月の闘技場");
    expect(prompt).toContain("第2話");
    expect(prompt).toContain("全5話");
  });

  it("これまでのあらすじと直近の流れが含まれる(物語の連続性を持たせるため)", () => {
    const prompt = buildChapterNarrationPrompt({
      protagonist,
      opponent,
      quest: "奪われた宝物を取り戻すため",
      encounter: "旅の途中の道をふさぐ用心棒として",
      stageName: "満月の闘技場",
      chapterIndex: 2,
      chapterCount: 5,
      summaryLines: ["第1話: 炎の谷でぴよ助に勝利した。"],
      momentum: "直前の戦いに勝利した",
      tone: ACT_NARRATION_TONES.act2,
    });
    expect(prompt).toContain("第1話: 炎の谷でぴよ助に勝利した。");
    expect(prompt).toContain("直前の戦いに勝利した");
  });

  it("第1話(あらすじが空)のときは旅の最初の戦いであることが伝わる", () => {
    const prompt = buildChapterNarrationPrompt({
      protagonist,
      opponent,
      quest: "奪われた宝物を取り戻すため",
      encounter: "旅の途中の道をふさぐ用心棒として",
      stageName: "満月の闘技場",
      chapterIndex: 1,
      chapterCount: 5,
      summaryLines: [],
      momentum: "まだ戦いは始まっていない",
      tone: ACT_NARRATION_TONES.act1,
    });
    expect(prompt).toContain("最初の戦い");
  });

  it("勝敗のネタバレを禁止する指示が含まれる(バトル再生前に表示するため)", () => {
    const prompt = buildChapterNarrationPrompt({
      protagonist,
      opponent,
      quest: "奪われた宝物を取り戻すため",
      encounter: "旅の途中の道をふさぐ用心棒として",
      stageName: "満月の闘技場",
      chapterIndex: 1,
      chapterCount: 5,
      summaryLines: [],
      momentum: "まだ戦いは始まっていない",
      tone: ACT_NARRATION_TONES.act1,
    });
    expect(prompt).toContain("勝敗");
  });

  it("渡した幕(act)のトーン指示が含まれる(三幕構成の演出)", () => {
    const prompt = buildChapterNarrationPrompt({
      protagonist,
      opponent,
      quest: "奪われた宝物を取り戻すため",
      encounter: "旅の終着点で待ち構えていた最大の壁として",
      stageName: "満月の闘技場",
      chapterIndex: 5,
      chapterCount: 5,
      summaryLines: ["第1話: 炎の谷でぴよ助に勝利した。"],
      momentum: "直前の戦いに勝利した",
      tone: ACT_NARRATION_TONES.act3,
    });
    expect(prompt).toContain(ACT_NARRATION_TONES.act3);
  });
});

describe("buildChapterOpponentLinePrompt / buildChapterProtagonistLinePrompt", () => {
  const protagonist = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };
  const opponent = {
    name: "がぶ太",
    title: "鋼鉄の甘噛み犬",
    description: "なんでも噛んでしまう犬の騎士です",
  };
  const ingredients = { stage: "満月の廃神殿", relation: "宿命のライバル" };

  it("相手のセリフ用プロンプトには相手のキャラ設定・場面のナレーション・文字数上限・ネタバレ禁止が含まれる", () => {
    const prompt = buildChapterOpponentLinePrompt(
      opponent,
      protagonist.name,
      "峠を越えた一行の前に、炎をまとう獣が立ちはだかった。",
      ingredients,
    );
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("鋼鉄の甘噛み犬");
    expect(prompt).toContain(
      "峠を越えた一行の前に、炎をまとう獣が立ちはだかった。",
    );
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("20文字");
    expect(prompt).toContain("勝敗");
  });

  it("主人公のセリフ用プロンプトには主人公のキャラ設定・相手のセリフ・文字数上限が含まれ、返答であることが伝わる", () => {
    const prompt = buildChapterProtagonistLinePrompt(
      protagonist,
      opponent.name,
      "ここから先は 通さんぞ!",
      ingredients,
    );
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("がぶ太");
    expect(prompt).toContain("ここから先は 通さんぞ!");
    expect(prompt).toContain("20文字");
    expect(prompt).toContain("返答");
  });
});

describe("buildStoryOpeningPrompt", () => {
  const protagonist = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };

  it("主人公のキャラ設定と旅の目的が含まれる", () => {
    const prompt = buildStoryOpeningPrompt(
      protagonist,
      "奪われた宝物を取り戻すため",
    );
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("深淵の眠り猫");
    expect(prompt).toContain("よく寝る猫の戦士です");
    expect(prompt).toContain("奪われた宝物を取り戻すため");
  });

  it("まだ誰とも出会っていない旅立ちの場面であることが伝わる", () => {
    const prompt = buildStoryOpeningPrompt(
      protagonist,
      "奪われた宝物を取り戻すため",
    );
    expect(prompt).toContain("誰とも出会っていない");
  });

  it("勝敗のネタバレを禁止する指示が含まれる(バトル再生前に表示するため)", () => {
    const prompt = buildStoryOpeningPrompt(
      protagonist,
      "奪われた宝物を取り戻すため",
    );
    expect(prompt).toContain("勝敗");
  });
});

describe("buildStoryEndingPrompt", () => {
  const protagonist = {
    name: "もふ吉",
    title: "深淵の眠り猫",
    description: "よく寝る猫の戦士です",
  };

  it("主人公・旅の目的・あらすじ・戦績・ランクのトーンが含まれる", () => {
    const prompt = buildStoryEndingPrompt({
      protagonist,
      quest: "奪われた宝物を取り戻すため",
      summaryLines: [
        "第1話: 満月の闘技場でがぶ太に勝利した。",
        "第2話: 炎の谷でぴよ助に敗れた。",
      ],
      record: { wins: 1, losses: 1, draws: 0, total: 2 },
      rank: "normal",
    });
    expect(prompt).toContain("もふ吉");
    expect(prompt).toContain("奪われた宝物を取り戻すため");
    expect(prompt).toContain("第1話: 満月の闘技場でがぶ太に勝利した。");
    expect(prompt).toContain("第2話: 炎の谷でぴよ助に敗れた。");
    expect(prompt).toContain("1勝1敗0分");
    expect(prompt).toContain(ENDING_RANK_TONES.normal);
  });

  it("全勝(perfect)ランクのトーンが含まれる", () => {
    const prompt = buildStoryEndingPrompt({
      protagonist,
      quest: "奪われた宝物を取り戻すため",
      summaryLines: ["第1話: 満月の闘技場でがぶ太に勝利した。"],
      record: { wins: 1, losses: 0, draws: 0, total: 1 },
      rank: "perfect",
    });
    expect(prompt).toContain(ENDING_RANK_TONES.perfect);
  });
});
