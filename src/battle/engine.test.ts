/**
 * @file バトルエンジン(engine.ts)のテストです。
 * 乱数を注入して、ダメージ計算式・MP管理・必殺技タイプ(攻撃/回復/異常/強化)・
 * ステータス異常(毒/麻痺/やけど/凍結)・パッシブスキル・行動順・決着判定を検証します。
 *
 * 乱数の消費順(実装と厳密に一致させること):
 * - バトル開始時: 同速の場合のみ[先攻決定]を1回
 * - 各アクション:
 *   1. 凍結中: [解凍判定] / 麻痺中: [麻痺判定](行動不能ならここで終了)
 *   2. 必殺技が使用可能な場合: [必殺技判定] → 発動時、
 *      attack / heal / ailment タイプは[威力補正]を1回消費(buff は消費しない)
 *   3. 通常攻撃の場合: [ミス判定] → [クリティカル判定] → [威力補正]
 *   4. 通常攻撃が命中し、相手が counter 持ちで生存している場合: [反撃判定]
 *   5. 行動後の毒・やけどダメージとMP回復: 乱数消費なし
 */
import { describe, expect, it } from "vitest";
import { simulateBattle } from "./engine";
import {
  makeCharacter,
  makePassive,
  makeSpecialMove,
  sequenceRng,
} from "../testing/fixtures";

describe("simulateBattle: 通常攻撃", () => {
  it("威力補正0.5のとき、攻撃力40・防御20で32ダメージになる", () => {
    // MPを0にして必殺技判定を封じ、乱数は[ミス, クリティカル, 威力補正]の順で消費される
    // variance = 0.85 + 0.5 * 0.3 = 1.0 → 40 * 1.0 - 20 * 0.4 = 32
    const 攻め手 = makeCharacter({ id: "a", attack: 40, luck: 0, mp: 0, speed: 90 });
    const 受け手 = makeCharacter({ id: "b", defense: 20, mp: 0, speed: 30 });
    const result = simulateBattle(攻め手, 受け手, sequenceRng([0.5, 0.5, 0.5]));
    expect(result.events[0]).toMatchObject({
      type: "attack",
      critical: false,
      damage: 32,
      actorId: "a",
      targetId: "b",
      turn: 1,
      after: { b: { hp: 68 } },
    });
  });

  it("計算結果が0以下でも最低1ダメージを与える", () => {
    // 20 * 1.0 - 50 * 0.4 = 0 → 最低保証で1
    const 攻め手 = makeCharacter({ id: "a", attack: 20, luck: 0, mp: 0, speed: 90 });
    const 受け手 = makeCharacter({ id: "b", defense: 50, mp: 0, speed: 30 });
    const result = simulateBattle(攻め手, 受け手, sequenceRng([0.5, 0.5, 0.5]));
    expect(result.events[0]).toMatchObject({ type: "attack", damage: 1 });
  });

  it("ミス判定の乱数が0.05未満のときミスになりHPは減らない", () => {
    const 攻め手 = makeCharacter({ id: "a", mp: 0, speed: 90 });
    const 受け手 = makeCharacter({ id: "b", hp: 100, mp: 0, speed: 30 });
    const result = simulateBattle(攻め手, 受け手, sequenceRng([0.01]));
    expect(result.events[0]).toMatchObject({
      type: "miss",
      after: { b: { hp: 100 } },
    });
  });

  it("運100(クリティカル率25%)で判定を通るとダメージが1.5倍になる", () => {
    // (40 * 1.0 - 20 * 0.4) * 1.5 = 48
    const 攻め手 = makeCharacter({ id: "a", attack: 40, luck: 100, mp: 0, speed: 90 });
    const 受け手 = makeCharacter({ id: "b", defense: 20, mp: 0, speed: 30 });
    const result = simulateBattle(攻め手, 受け手, sequenceRng([0.5, 0.1, 0.5]));
    expect(result.events[0]).toMatchObject({
      type: "attack",
      critical: true,
      damage: 48,
    });
  });
});

describe("simulateBattle: MPと攻撃タイプの必殺技", () => {
  it("MPが足りればHP満タンでも必殺技を使え、消費MPが反映される", () => {
    // damage = 50 * 1.0 + 40 * 0.5 - 20 * 0.2 = 66、MPは60 - 30 = 30
    const 攻め手 = makeCharacter({ id: "a", attack: 40, mp: 60, speed: 90 });
    const 受け手 = makeCharacter({ id: "b", defense: 20, mp: 0, speed: 30 });
    const result = simulateBattle(攻め手, 受け手, sequenceRng([0.1, 0.5]));
    expect(result.events[0]).toMatchObject({
      type: "special-attack",
      moveName: "テストスラッシュ",
      damage: 66,
      after: { a: { mp: 30 }, b: { hp: 34 } },
    });
  });

  it("MPは行動後に10回復し、足りる限り必殺技を何度でも使える", () => {
    // 1手目: aの必殺技(66ダメージ、MP 60→30、行動後+10で40)
    // 2手目: bの通常攻撃(32ダメージ)
    // 3手目: aの2回目の必殺技(MP 40→10)でbのHP 34→0となり決着
    const a = makeCharacter({ id: "a", attack: 40, defense: 20, mp: 60, speed: 90 });
    const b = makeCharacter({ id: "b", attack: 40, defense: 20, mp: 0, speed: 30 });
    const result = simulateBattle(
      a,
      b,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.1, 0.5]),
    );
    expect(result.events[0]).toMatchObject({
      type: "special-attack",
      after: { a: { mp: 30 } },
    });
    expect(result.events[2]).toMatchObject({
      type: "special-attack",
      after: { a: { mp: 10 }, b: { hp: 0 } },
    });
    expect(result.winnerId).toBe("a");
  });

  it("MPが消費MPより少ない間は必殺技判定自体が行われない", () => {
    // 判定が行われれば先頭の0.01は必殺技判定(<0.4)で発動するはず。
    // ミスになることで、先頭の乱数がミス判定に使われた(=判定なし)ことを確認する
    const 攻め手 = makeCharacter({
      id: "a",
      mp: 20,
      speed: 90,
      specialMove: makeSpecialMove({ mpCost: 30 }),
    });
    const 受け手 = makeCharacter({ id: "b", mp: 0, speed: 30 });
    const result = simulateBattle(攻め手, 受け手, sequenceRng([0.01]));
    expect(result.events[0]).toMatchObject({ type: "miss" });
  });
});

describe("simulateBattle: 回復タイプの必殺技", () => {
  it("HPが60%以下のとき回復技が発動し、自分のHPが回復する", () => {
    // 1手目: bの攻撃60 * 1.0 - 20 * 0.4 = 52ダメージでaのHPは48(60%以下)
    // 2手目: aの回復技 round(50 * 1.0) = 50回復でHP 98
    const 回復役 = makeCharacter({
      id: "a",
      hp: 100,
      defense: 20,
      mp: 60,
      speed: 30,
      specialMove: makeSpecialMove({ name: "いやしの光", type: "heal", power: 50 }),
    });
    const 攻め手 = makeCharacter({ id: "b", attack: 60, mp: 0, speed: 90 });
    const result = simulateBattle(
      回復役,
      攻め手,
      sequenceRng([0.5, 0.5, 0.5, 0.1, 0.5]),
    );
    expect(result.events[1]).toMatchObject({
      type: "special-heal",
      moveName: "いやしの光",
      healed: 50,
      actorId: "a",
      targetId: "a",
      after: { a: { hp: 98, mp: 30 } },
    });
  });

  it("HPが60%を超えている間は回復技の判定が行われない", () => {
    const 回復役 = makeCharacter({
      id: "a",
      mp: 60,
      speed: 90,
      specialMove: makeSpecialMove({ type: "heal" }),
    });
    const 受け手 = makeCharacter({ id: "b", mp: 0, speed: 30 });
    const result = simulateBattle(回復役, 受け手, sequenceRng([0.01]));
    expect(result.events[0]).toMatchObject({ type: "miss" });
  });

  it("回復量は最大HPを超えた分が切り捨てられる", () => {
    // aのHPは100 - 52 = 48。威力80の回復はround(80)=80だが、実際は52だけ回復してHP100
    const 回復役 = makeCharacter({
      id: "a",
      hp: 100,
      defense: 20,
      mp: 60,
      speed: 30,
      specialMove: makeSpecialMove({ type: "heal", power: 80 }),
    });
    const 攻め手 = makeCharacter({ id: "b", attack: 60, mp: 0, speed: 90 });
    const result = simulateBattle(
      回復役,
      攻め手,
      sequenceRng([0.5, 0.5, 0.5, 0.1, 0.5]),
    );
    expect(result.events[1]).toMatchObject({
      type: "special-heal",
      healed: 52,
      after: { a: { hp: 100 } },
    });
  });
});

describe("simulateBattle: ステータス異常タイプの必殺技", () => {
  /** 毒を与える技を持つ素早いキャラクターと、遅い通常キャラクターの組です。 */
  function makeAilmentPair(ailment: "poison" | "paralysis" | "burn" | "freeze") {
    const 仕掛け役 = makeCharacter({
      id: "a",
      attack: 40,
      defense: 20,
      mp: 60,
      speed: 90,
      specialMove: makeSpecialMove({ name: "じょうたい技", type: "ailment", power: 50, ailment }),
    });
    const 受け手 = makeCharacter({
      id: "b",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
    });
    return { 仕掛け役, 受け手 };
  }

  it("毒技は小ダメージを与えつつ相手を毒状態にし、行動後に最大HP1/8の毒ダメージが入る", () => {
    const { 仕掛け役, 受け手 } = makeAilmentPair("poison");
    // 1手目: 毒技 round(50 * 0.3 * 1.0) = 15ダメージ + 毒付与
    // 2手目: bの通常攻撃32ダメージ → 行動後にround(100/8)=13の毒ダメージ
    // 3手目: bが毒状態なので異常技は使えず、先頭の0.01はミス判定になる
    const result = simulateBattle(
      仕掛け役,
      受け手,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.01]),
    );
    expect(result.events[0]).toMatchObject({
      type: "special-ailment",
      moveName: "じょうたい技",
      ailment: "poison",
      damage: 15,
      after: { b: { hp: 85, ailment: "poison" } },
    });
    expect(result.events[1]).toMatchObject({ type: "attack", actorId: "b" });
    expect(result.events[2]).toMatchObject({
      type: "ailment-damage",
      ailment: "poison",
      damage: 13,
      actorId: "b",
      targetId: "b",
      turn: 2,
      after: { b: { hp: 72 } },
    });
    expect(result.events[3]).toMatchObject({ type: "miss", actorId: "a" });
  });

  it("やけどは行動後に最大HP1/16のダメージが入り、攻撃力が半減する", () => {
    const { 仕掛け役, 受け手 } = makeAilmentPair("burn");
    // 2手目: bの攻撃力は40→20に半減し、20 * 1.0 - 20 * 0.4 = 12ダメージ
    // 行動後にround(100/16)=6のやけどダメージ
    const result = simulateBattle(
      仕掛け役,
      受け手,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[1]).toMatchObject({ type: "attack", damage: 12 });
    expect(result.events[2]).toMatchObject({
      type: "ailment-damage",
      ailment: "burn",
      damage: 6,
      after: { b: { hp: 79 } },
    });
  });

  it("麻痺は判定(25%)を引くと行動不能になり、引かなければ行動できる", () => {
    const { 仕掛け役, 受け手 } = makeAilmentPair("paralysis");
    // 2手目: bの麻痺判定0.1(<0.25)で行動不能
    // 3手目: aの通常攻撃(bが異常中なので異常技は使えない)
    // 4手目: bの麻痺判定0.9で行動でき、通常攻撃32ダメージ
    const result = simulateBattle(
      仕掛け役,
      受け手,
      sequenceRng([0.1, 0.5, 0.1, 0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.5]),
    );
    expect(result.events[1]).toMatchObject({
      type: "ailment-skip",
      ailment: "paralysis",
      actorId: "b",
    });
    expect(result.events[3]).toMatchObject({ type: "attack", actorId: "b", damage: 32 });
  });

  it("凍結は解凍判定(30%)を引くまで行動不能になり、解凍したターンは行動できる", () => {
    const { 仕掛け役, 受け手 } = makeAilmentPair("freeze");
    // 2手目: bの解凍判定0.5(≥0.3)で凍結のまま行動不能
    // 4手目: bの解凍判定0.1(<0.3)で解凍し、そのまま通常攻撃できる
    const result = simulateBattle(
      仕掛け役,
      受け手,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.1, 0.5, 0.5, 0.5]),
    );
    expect(result.events[1]).toMatchObject({
      type: "ailment-skip",
      ailment: "freeze",
      actorId: "b",
    });
    expect(result.events[3]).toMatchObject({
      type: "ailment-cure",
      ailment: "freeze",
      actorId: "b",
      after: { b: { ailment: null } },
    });
    expect(result.events[4]).toMatchObject({ type: "attack", actorId: "b", damage: 32 });
  });
});

describe("simulateBattle: 自己強化タイプの必殺技", () => {
  it("強化技は攻撃力と防御力を上げ、以降の与ダメージ・被ダメージに反映される", () => {
    // 1手目: aの強化技(乱数は判定のみ)。attackGain = round(50*0.4) = 20、defenseGain = round(50*0.3) = 15
    // 2手目: bの攻撃はaの防御20+15で 40 - 35*0.4 = 26ダメージ
    // 3手目: 強化技は1回きりなので判定なし。aの攻撃は (40+20)*1.0 - 8 = 52ダメージ
    const 強化役 = makeCharacter({
      id: "a",
      attack: 40,
      defense: 20,
      mp: 60,
      speed: 90,
      specialMove: makeSpecialMove({ name: "たけりのポーズ", type: "buff", power: 50 }),
    });
    const 受け手 = makeCharacter({
      id: "b",
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
    });
    const result = simulateBattle(
      強化役,
      受け手,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[0]).toMatchObject({
      type: "special-buff",
      moveName: "たけりのポーズ",
      attackGain: 20,
      defenseGain: 15,
      actorId: "a",
      targetId: "a",
      after: { a: { mp: 30 } },
    });
    expect(result.events[1]).toMatchObject({ type: "attack", damage: 26 });
    expect(result.events[2]).toMatchObject({ type: "attack", damage: 52 });
  });
});

describe("simulateBattle: パッシブスキル", () => {
  it("crit-master はクリティカル率が2倍になる", () => {
    // 運100 → 通常25%だが crit-master で50%。クリティカル判定0.45は
    // パッシブなしなら外れ、crit-master なら当たり
    const 通常 = makeCharacter({ id: "a", attack: 40, luck: 100, mp: 0, speed: 90 });
    const 達人 = makeCharacter({
      id: "a",
      attack: 40,
      luck: 100,
      mp: 0,
      speed: 90,
      passive: makePassive("crit-master"),
    });
    const 受け手 = makeCharacter({ id: "b", defense: 20, mp: 0, speed: 30 });
    const 乱数 = [0.5, 0.45, 0.5];
    expect(
      simulateBattle(通常, 受け手, sequenceRng([...乱数])).events[0],
    ).toMatchObject({ type: "attack", critical: false, damage: 32 });
    expect(
      simulateBattle(達人, 受け手, sequenceRng([...乱数])).events[0],
    ).toMatchObject({ type: "attack", critical: true, damage: 48 });
  });

  it("ailment-guard 持ちの相手には異常技の判定が行われない", () => {
    const 仕掛け役 = makeCharacter({
      id: "a",
      mp: 60,
      speed: 90,
      specialMove: makeSpecialMove({ type: "ailment", ailment: "poison" }),
    });
    const 守り手 = makeCharacter({
      id: "b",
      mp: 0,
      speed: 30,
      passive: makePassive("ailment-guard"),
    });
    // 判定が行われれば先頭の0.01で異常技が発動するはず。ミスになることで判定なしを確認
    const result = simulateBattle(仕掛け役, 守り手, sequenceRng([0.01]));
    expect(result.events[0]).toMatchObject({ type: "miss" });
  });

  it("endure は戦闘不能になるダメージを1回だけHP1で耐える", () => {
    // 1手目: aの攻撃56ダメージ(bのHP50)→ endure でHP1になり endure イベントが続く
    // 3手目: 2回目の致死ダメージは耐えられず決着
    const 攻め手 = makeCharacter({ id: "a", attack: 60, defense: 20, mp: 0, speed: 90 });
    const 忍耐役 = makeCharacter({
      id: "b",
      hp: 50,
      attack: 40,
      defense: 10,
      mp: 0,
      speed: 30,
      passive: makePassive("endure"),
    });
    const result = simulateBattle(
      攻め手,
      忍耐役,
      sequenceRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[0]).toMatchObject({
      type: "attack",
      damage: 56,
      after: { b: { hp: 1 } },
    });
    expect(result.events[1]).toMatchObject({
      type: "endure",
      actorId: "b",
      targetId: "b",
      turn: 1,
    });
    expect(result.winnerId).toBe("a");
    expect(result.events.filter((e) => e.type === "endure")).toHaveLength(1);
  });

  it("counter は通常攻撃を受けたとき30%判定で反撃する", () => {
    // 1手目: aの攻撃32ダメージ → 反撃判定0.1(<0.3)で round(40*0.3)=12 の反撃
    const 攻め手 = makeCharacter({ id: "a", attack: 40, defense: 20, mp: 0, speed: 90 });
    const 反撃役 = makeCharacter({
      id: "b",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
      passive: makePassive("counter"),
    });
    const result = simulateBattle(
      攻め手,
      反撃役,
      sequenceRng([0.5, 0.5, 0.5, 0.1, 0.5, 0.5, 0.5]),
    );
    expect(result.events[1]).toMatchObject({
      type: "counter",
      actorId: "b",
      targetId: "a",
      damage: 12,
      turn: 1,
      after: { a: { hp: 88 } },
    });
    // 2手目はbの通常の行動(反撃イベントではない)
    expect(result.events[2]).toMatchObject({ type: "attack", actorId: "b" });
  });

  it("counter は必殺技に対しては反撃判定を行わない", () => {
    // aの必殺技の後、次のイベントはbの通常の行動になる(反撃判定の乱数も消費されない)
    const 攻め手 = makeCharacter({ id: "a", attack: 40, mp: 60, speed: 90 });
    const 反撃役 = makeCharacter({
      id: "b",
      hp: 100,
      attack: 40,
      mp: 0,
      speed: 30,
      passive: makePassive("counter"),
    });
    const result = simulateBattle(
      攻め手,
      反撃役,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[0]).toMatchObject({ type: "special-attack" });
    expect(result.events[1]).toMatchObject({ type: "attack", actorId: "b" });
  });

  it("mp-boost はMP回復量が2倍(20)になる", () => {
    // 1手目: aの必殺技でMP 60→30、行動後+20で50
    // 3手目: 2回目の必殺技でMP 50→20(パッシブなしなら40→10のはず)
    const 加速役 = makeCharacter({
      id: "a",
      attack: 40,
      defense: 20,
      mp: 60,
      speed: 90,
      passive: makePassive("mp-boost"),
    });
    const 受け手 = makeCharacter({
      id: "b",
      hp: 150,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
    });
    const result = simulateBattle(
      加速役,
      受け手,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.1, 0.5]),
    );
    expect(result.events[2]).toMatchObject({
      type: "special-attack",
      after: { a: { mp: 20 } },
    });
  });

  it("life-steal は通常攻撃で与えたダメージの30%だけHPを回復する", () => {
    // 1手目: bの攻撃32ダメージでaのHPは68に減る
    // 2手目: aの攻撃32ダメージのあと round(32*0.3)=10 回復してHP78になり、
    //         life-steal イベントが攻撃イベントに続く
    const 吸血役 = makeCharacter({
      id: "a",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
      passive: makePassive("life-steal"),
    });
    const 攻め手 = makeCharacter({
      id: "b",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 90,
    });
    const result = simulateBattle(
      吸血役,
      攻め手,
      sequenceRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[1]).toMatchObject({
      type: "attack",
      actorId: "a",
      damage: 32,
    });
    expect(result.events[2]).toMatchObject({
      type: "life-steal",
      healed: 10,
      actorId: "a",
      targetId: "a",
      turn: 2,
      after: { a: { hp: 78 }, b: { hp: 68 } },
    });
  });

  it("life-steal はHPが満タンのときは回復イベントを出さない", () => {
    // 1手目のaの攻撃後、回復イベントを挟まずに2手目のbの行動が続く
    const 吸血役 = makeCharacter({
      id: "a",
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 90,
      passive: makePassive("life-steal"),
    });
    const 受け手 = makeCharacter({ id: "b", attack: 40, defense: 20, mp: 0, speed: 30 });
    const result = simulateBattle(吸血役, 受け手, sequenceRng([]));
    expect(result.events[0]).toMatchObject({ type: "attack", actorId: "a" });
    expect(result.events[1]).toMatchObject({ type: "attack", actorId: "b" });
  });

  it("regenerate は行動後に最大HPの1/16だけHPが回復する", () => {
    // 1手目: bの攻撃32ダメージでaのHPは68に減る
    // 2手目: aの攻撃の行動後に round(100/16)=6 回復してHP74になる
    const 再生役 = makeCharacter({
      id: "a",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
      passive: makePassive("regenerate"),
    });
    const 攻め手 = makeCharacter({
      id: "b",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 90,
    });
    const result = simulateBattle(
      再生役,
      攻め手,
      sequenceRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[2]).toMatchObject({
      type: "regenerate",
      healed: 6,
      actorId: "a",
      targetId: "a",
      turn: 2,
      after: { a: { hp: 74 } },
    });
  });

  it("regenerate はHPが満タンのときは回復イベントを出さない", () => {
    // 1手目のaの行動後は全快のため回復イベントがなく、2手目のbの行動が続く
    const 再生役 = makeCharacter({
      id: "a",
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 90,
      passive: makePassive("regenerate"),
    });
    const 受け手 = makeCharacter({ id: "b", attack: 40, defense: 20, mp: 0, speed: 30 });
    const result = simulateBattle(再生役, 受け手, sequenceRng([]));
    expect(result.events[0]).toMatchObject({ type: "attack", actorId: "a" });
    expect(result.events[1]).toMatchObject({ type: "attack", actorId: "b" });
  });

  it("berserk はHPが30%以下のとき通常攻撃のダメージが1.5倍になる", () => {
    // 1手目: bの攻撃78*1.0 - 20*0.4 = 70ダメージでaのHPはちょうど30(30%)になる
    // 2手目: aの攻撃は berserk なしなら 40-8=32、berserk ありなら 40*1.5-8=52
    const 狂戦士 = makeCharacter({
      id: "a",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
      passive: makePassive("berserk"),
    });
    const 通常 = makeCharacter({
      id: "a",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
    });
    const 攻め手 = makeCharacter({ id: "b", attack: 78, defense: 20, mp: 0, speed: 90 });
    const 乱数 = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    expect(
      simulateBattle(狂戦士, 攻め手, sequenceRng([...乱数])).events[1],
    ).toMatchObject({ type: "attack", actorId: "a", damage: 52 });
    expect(
      simulateBattle(通常, 攻め手, sequenceRng([...乱数])).events[1],
    ).toMatchObject({ type: "attack", actorId: "a", damage: 32 });
  });

  it("berserk はHPが30%を超えている間は発動しない", () => {
    // 1手目: bの攻撃77*1.0 - 8 = 69ダメージでaのHPは31(30%超)
    // 2手目: aの攻撃力は上がらず 40-8=32ダメージのまま
    const 狂戦士 = makeCharacter({
      id: "a",
      hp: 100,
      attack: 40,
      defense: 20,
      mp: 0,
      speed: 30,
      passive: makePassive("berserk"),
    });
    const 攻め手 = makeCharacter({ id: "b", attack: 77, defense: 20, mp: 0, speed: 90 });
    const result = simulateBattle(
      狂戦士,
      攻め手,
      sequenceRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.events[1]).toMatchObject({ type: "attack", actorId: "a", damage: 32 });
  });

  it("evasion 持ちへの通常攻撃はミス率が20%に上がる", () => {
    // ミス判定0.1は通常(5%)なら命中、evasion持ち(20%)ならミスになる
    const 攻め手 = makeCharacter({ id: "a", mp: 0, speed: 90 });
    const 回避役 = makeCharacter({
      id: "b",
      mp: 0,
      speed: 30,
      passive: makePassive("evasion"),
    });
    const 鈍重役 = makeCharacter({ id: "b", mp: 0, speed: 30 });
    expect(
      simulateBattle(攻め手, 回避役, sequenceRng([0.1])).events[0],
    ).toMatchObject({ type: "miss" });
    expect(
      simulateBattle(攻め手, 鈍重役, sequenceRng([0.1, 0.5, 0.5])).events[0],
    ).toMatchObject({ type: "attack" });
  });

  it("first-strike 持ちは素早さが低くても先攻になる", () => {
    const 先制役 = makeCharacter({
      id: "a",
      speed: 10,
      mp: 0,
      passive: makePassive("first-strike"),
    });
    const 韋駄天 = makeCharacter({ id: "b", speed: 90, mp: 0 });
    const result = simulateBattle(先制役, 韋駄天, sequenceRng([0.9, 0.5, 0.5]));
    // 先頭の0.9はaのミス判定に消費されて命中になる(先攻決定には使われない)
    expect(result.events[0]).toMatchObject({ type: "attack", actorId: "a" });
  });

  it("同速でも first-strike 持ちが先攻になり、先攻決定の乱数は消費されない", () => {
    // 先攻決定に乱数を使う実装なら、先頭の0.9(≥0.5)でbが先攻になってしまうはず
    const 先制役 = makeCharacter({
      id: "a",
      speed: 50,
      mp: 0,
      passive: makePassive("first-strike"),
    });
    const 同速役 = makeCharacter({ id: "b", speed: 50, mp: 0 });
    const result = simulateBattle(先制役, 同速役, sequenceRng([0.9]));
    expect(result.events[0]).toMatchObject({ type: "attack", actorId: "a" });
  });

  it("両者が first-strike 持ちの場合は従来どおり素早さで先攻を決める", () => {
    const a = makeCharacter({
      id: "a",
      speed: 30,
      mp: 0,
      passive: makePassive("first-strike"),
    });
    const b = makeCharacter({
      id: "b",
      speed: 90,
      mp: 0,
      passive: makePassive("first-strike"),
    });
    expect(simulateBattle(a, b, sequenceRng([])).events[0]?.actorId).toBe("b");
  });
});

describe("simulateBattle: 入力検証", () => {
  it("両者のIDが同一の場合はエラーになる(Fail-Fast)", () => {
    // スナップショットがIDをキーにするため、同一IDでは状態が上書きされてしまう
    const a = makeCharacter({ id: "same-id", mp: 0 });
    const b = makeCharacter({ id: "same-id", mp: 0 });
    expect(() => simulateBattle(a, b, sequenceRng([]))).toThrow(/同一/);
  });
});

describe("simulateBattle: 行動順", () => {
  it("素早さが高いキャラクターが先攻になる", () => {
    const 韋駄天 = makeCharacter({ id: "fast", name: "韋駄天", speed: 80, mp: 0 });
    const 鈍足 = makeCharacter({ id: "slow", name: "鈍足", speed: 30, mp: 0 });
    const result = simulateBattle(韋駄天, 鈍足, sequenceRng([]));
    expect(result.events[0]?.actorId).toBe("fast");
  });

  it("同速の場合は乱数で先攻を決める(0.5未満で第1引数が先攻)", () => {
    const a = makeCharacter({ id: "a", speed: 50, mp: 0 });
    const b = makeCharacter({ id: "b", speed: 50, mp: 0 });
    expect(simulateBattle(a, b, sequenceRng([0.4])).events[0]?.actorId).toBe("a");
    expect(simulateBattle(a, b, sequenceRng([0.6])).events[0]?.actorId).toBe("b");
  });
});

describe("simulateBattle: 決着", () => {
  it("相手のHPを0にしたキャラクターが勝者になる", () => {
    // 60 * 1.0 - 10 * 0.4 = 56ダメージで一撃
    const 豪傑 = makeCharacter({ id: "strong", attack: 60, speed: 90, mp: 0 });
    const 紙装甲 = makeCharacter({ id: "weak", hp: 50, defense: 10, speed: 10, mp: 0 });
    const result = simulateBattle(豪傑, 紙装甲, sequenceRng([]));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ after: { weak: { hp: 0 } } });
    expect(result.winnerId).toBe("strong");
    expect(result.loserId).toBe("weak");
  });

  it("100アクションで決着しない場合、HP残存率が同じなら引き分けになる", () => {
    // 攻撃20 vs 防御50 → 毎回最低保証の1ダメージ。50往復でも決着しない
    const a = makeCharacter({ id: "a", hp: 150, attack: 20, defense: 50, speed: 80, mp: 0 });
    const b = makeCharacter({ id: "b", hp: 150, attack: 20, defense: 50, speed: 30, mp: 0 });
    const result = simulateBattle(a, b, sequenceRng([]));
    expect(result.events).toHaveLength(100);
    expect(result.winnerId).toBeNull();
    expect(result.loserId).toBeNull();
  });

  it("100アクションで決着しない場合、HP残存率が高い方が勝者になる", () => {
    // a: (150-50)/150 ≈ 0.667、b: (140-50)/140 ≈ 0.643 → a の勝ち
    const a = makeCharacter({ id: "a", hp: 150, attack: 20, defense: 50, speed: 80, mp: 0 });
    const b = makeCharacter({ id: "b", hp: 140, attack: 20, defense: 50, speed: 30, mp: 0 });
    const result = simulateBattle(a, b, sequenceRng([]));
    expect(result.winnerId).toBe("a");
    expect(result.loserId).toBe("b");
  });

  it("毒ダメージでHPが0になった場合も勝敗がつく", () => {
    // bはHP20。毒技15ダメージ+毒(1/8=round(2.5)=3)で削られ、
    // 4手目の行動後の毒ダメージで力尽きる
    const 仕掛け役 = makeCharacter({
      id: "a",
      attack: 20,
      defense: 50,
      mp: 60,
      speed: 90,
      specialMove: makeSpecialMove({ type: "ailment", power: 50, ailment: "poison" }),
    });
    const 受け手 = makeCharacter({
      id: "b",
      hp: 20,
      attack: 20,
      defense: 50,
      mp: 0,
      speed: 30,
    });
    const result = simulateBattle(
      仕掛け役,
      受け手,
      sequenceRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(result.winnerId).toBe("a");
    expect(result.loserId).toBe("b");
    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent).toMatchObject({
      type: "ailment-damage",
      ailment: "poison",
      after: { b: { hp: 0 } },
    });
  });
});
