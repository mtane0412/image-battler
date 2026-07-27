/**
 * @file 効果音モジュール(se.ts)のテストです。
 *
 * 検証項目:
 * - selectSpecialSeKey: 必殺技名・説明文のキーワードから固有効果音を決定できること、
 *   キーワードがない場合もハッシュにより決定的にプールから選択されること
 * - seKeyForEvent: バトルイベント種別ごとに正しい効果音キーへ変換されること
 * - createSePlayer: 効果音の生成・多重再生・音量設定・再生失敗時の安全性
 *
 * 音声再生(HTMLAudioElement)は外部依存(ブラウザAPI)のため、
 * フェイクのAudio実装を注入してテストします。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SE_VOLUME,
  SPECIAL_SE_KEYS,
  createSePlayer,
  seKeyForEvent,
  selectSpecialSeKey,
  seUrl,
} from "./se";
import seManifest from "./se-manifest.json";
import { makeSpecialMove } from "../testing/fixtures";
import type { BattleEvent, BattleEventPayload, CombatantSnapshot } from "../types";

/** テスト用のバトルイベントを1件生成します(共通フィールドは既定値で埋めます)。 */
function makeEvent(
  payload: BattleEventPayload,
  overrides: Partial<Pick<BattleEvent, "turn">> = {},
): BattleEvent {
  const snapshot: CombatantSnapshot = { hp: 68, mp: 30, ailment: null };
  return {
    turn: 1,
    actorId: "char-もふ吉",
    targetId: "char-がぶ太",
    after: { "char-もふ吉": { ...snapshot }, "char-がぶ太": { ...snapshot } },
    ...payload,
    ...overrides,
  };
}

describe("selectSpecialSeKey", () => {
  it("技名に炎のキーワードがあれば炎の効果音を選ぶ", () => {
    const move = makeSpecialMove({ name: "ファイアボール", description: "火の玉を放つ" });
    expect(selectSpecialSeKey(move)).toBe("special-flame");
  });

  it("技名に氷のキーワードがあれば氷の効果音を選ぶ", () => {
    const move = makeSpecialMove({ name: "ブリザードブレス", description: "凍てつく息を吐く" });
    expect(selectSpecialSeKey(move)).toBe("special-ice");
  });

  it("技名に雷のキーワードがあれば雷の効果音を選ぶ", () => {
    const move = makeSpecialMove({ name: "サンダーボルト", description: "いなずまを落とす" });
    expect(selectSpecialSeKey(move)).toBe("special-thunder");
  });

  it("技名に爪のキーワードがあれば斬撃の効果音を選ぶ", () => {
    const move = makeSpecialMove({ name: "爪とぎクラッシュ" });
    expect(selectSpecialSeKey(move)).toBe("special-slash");
  });

  it("技名に闇のキーワードがあれば闇の効果音を選ぶ", () => {
    const move = makeSpecialMove({ name: "シャドウカーテン", description: "影で敵を包み込む" });
    expect(selectSpecialSeKey(move)).toBe("special-dark");
  });

  it("技名にキーワードがなければ説明文から判定する", () => {
    const move = makeSpecialMove({
      name: "ぽかぽかキャノン",
      description: "聖なる光で敵を打ちぬく",
    });
    expect(selectSpecialSeKey(move)).toBe("special-holy");
  });

  it("技名のキーワードを説明文より優先する", () => {
    const move = makeSpecialMove({
      name: "サンダークラップ",
      description: "炎のように熱いいなずまを浴びせる",
    });
    expect(selectSpecialSeKey(move)).toBe("special-thunder");
  });

  it("キーワードがない場合は必殺技プールのいずれかを決定的に選ぶ", () => {
    const move = makeSpecialMove({
      name: "ぷにぷにアタック",
      description: "もちもちのボディでおしつぶす",
    });
    const firstResult = selectSpecialSeKey(move);
    const secondResult = selectSpecialSeKey(move);
    // 同じ必殺技には常に同じ効果音が割り当てられる(固有の音)
    expect(secondResult).toBe(firstResult);
    expect(SPECIAL_SE_KEYS).toContain(firstResult);
  });
});

describe("seKeyForEvent", () => {
  /** 通常攻撃イベントのペイロードです。 */
  const attackPayload: BattleEventPayload = {
    type: "attack",
    critical: false,
    damage: 32,
  };

  it("ミスは空振りの効果音になる", () => {
    const key = seKeyForEvent(makeEvent({ type: "miss" }), "special-impact");
    expect(key).toBe("miss");
  });

  it("攻撃必殺技は渡された固有効果音になる", () => {
    const key = seKeyForEvent(
      makeEvent({ type: "special-attack", moveName: "爪とぎクラッシュ", damage: 66 }),
      "special-flame",
    );
    expect(key).toBe("special-flame");
  });

  it("強化必殺技も渡された固有効果音になる", () => {
    const key = seKeyForEvent(
      makeEvent({
        type: "special-buff",
        moveName: "たけりのポーズ",
        attackGain: 20,
        defenseGain: 15,
      }),
      "special-beast",
    );
    expect(key).toBe("special-beast");
  });

  it("回復必殺技は聖属性の効果音になる", () => {
    const key = seKeyForEvent(
      makeEvent({ type: "special-heal", moveName: "いやしの光", healed: 50 }),
      "special-impact",
    );
    expect(key).toBe("special-holy");
  });

  it("異常必殺技は状態異常の属性に合った効果音になる", () => {
    const cases = [
      { ailment: "poison", expected: "special-dark" },
      { ailment: "paralysis", expected: "special-thunder" },
      { ailment: "burn", expected: "special-flame" },
      { ailment: "freeze", expected: "special-ice" },
    ] as const;
    for (const { ailment, expected } of cases) {
      const key = seKeyForEvent(
        makeEvent({ type: "special-ailment", moveName: "じょうたい技", ailment, damage: 15 }),
        "special-impact",
      );
      expect(key).toBe(expected);
    }
  });

  it("反撃はクリティカルと同じ重い打撃音になる", () => {
    const key = seKeyForEvent(makeEvent({ type: "counter", damage: 12 }), "special-impact");
    expect(key).toBe("critical");
  });

  it("クリティカルは専用の効果音になる", () => {
    const key = seKeyForEvent(
      makeEvent({ type: "attack", critical: true, damage: 48 }),
      "special-impact",
    );
    expect(key).toBe("critical");
  });

  it("通常攻撃はターンの奇偶で2種類の打撃音を使い分ける", () => {
    expect(seKeyForEvent(makeEvent(attackPayload, { turn: 1 }), "special-impact")).toBe("attack1");
    expect(seKeyForEvent(makeEvent(attackPayload, { turn: 2 }), "special-impact")).toBe("attack2");
  });

  it("スリップダメージ・行動不能・解除・endure・パッシブの回復は効果音なし(null)になる", () => {
    // life-steal / regenerate は毎ターン発生しうる経過イベントのため、
    // 効果音を鳴らさずログのみで伝える(必殺技音の特別感を保つ)
    const silentPayloads: BattleEventPayload[] = [
      { type: "ailment-damage", ailment: "poison", damage: 13 },
      { type: "ailment-skip", ailment: "paralysis" },
      { type: "ailment-cure", ailment: "freeze" },
      { type: "endure" },
      { type: "life-steal", healed: 10 },
      { type: "regenerate", healed: 6 },
    ];
    for (const payload of silentPayloads) {
      expect(seKeyForEvent(makeEvent(payload), "special-impact")).toBeNull();
    }
  });
});

describe("seUrl", () => {
  it("マニフェストのファイル名を含むURLを返す", () => {
    expect(seUrl("miss")).toContain("se/punch-swing1.mp3");
  });
});

describe("createSePlayer", () => {
  /**
   * HTMLAudioElement のフェイク実装です。
   * 生成URL・再生回数・音量の記録と、再生失敗のシミュレートができます。
   */
  class FakeAudio {
    src: string;
    volume = 1;
    preload = "";
    playCallCount = 0;
    /** cloneNode で複製されたインスタンス(多重再生の検証用) */
    clones: FakeAudio[] = [];
    /** play() が返すPromise(失敗させたいテストで差し替える) */
    playResult: Promise<void> = Promise.resolve();

    constructor(src: string) {
      this.src = src;
    }

    play(): Promise<void> {
      this.playCallCount += 1;
      return this.playResult;
    }

    cloneNode(): FakeAudio {
      const clone = new FakeAudio(this.src);
      clone.playResult = this.playResult;
      this.clones.push(clone);
      return clone;
    }
  }

  /** フェイクAudioを注入したプレイヤーと、生成されたAudioの記録を返します。 */
  function makePlayer() {
    const created: FakeAudio[] = [];
    const player = createSePlayer((url) => {
      const audio = new FakeAudio(url);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    return { player, created };
  }

  afterEach(() => {
    // document.hidden を上書きしたテストの後始末(own propertyを消して既定に戻す)
    Reflect.deleteProperty(document, "hidden");
    vi.restoreAllMocks();
  });

  it("対応するファイルのURLでAudioを生成し、音量を抑えて再生する", async () => {
    const { player, created } = makePlayer();
    player.play("miss");
    const audio = created[0];
    if (audio === undefined) throw new Error("Audioが生成されていません");
    expect(audio.src).toContain("punch-swing1.mp3");
    // 元のAudioは読み込み用に保持し、再生は複製に対して行う
    const clone = audio.clones[0];
    if (clone === undefined) throw new Error("再生用の複製が生成されていません");
    expect(clone.playCallCount).toBe(1);
    expect(clone.volume).toBe(SE_VOLUME);
  });

  it("同じキーを2回再生してもAudioの生成は1回で、複製により多重再生できる", () => {
    const { player, created } = makePlayer();
    player.play("critical");
    player.play("critical");
    expect(created).toHaveLength(1);
    const audio = created[0];
    if (audio === undefined) throw new Error("Audioが生成されていません");
    expect(audio.clones).toHaveLength(2);
    expect(audio.clones.every((clone) => clone.playCallCount === 1)).toBe(true);
  });

  it("preloadですべての効果音のAudioを生成する", () => {
    const { player, created } = makePlayer();
    player.preload();
    expect(created).toHaveLength(Object.keys(seManifest).length);
  });

  it("再生に失敗しても例外を投げず、警告ログに明示する", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const created: FakeAudio[] = [];
    const player = createSePlayer((url) => {
      const audio = new FakeAudio(url);
      audio.playResult = Promise.reject(new Error("自動再生がブロックされました"));
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    });
    expect(() => {
      player.play("victory");
    }).not.toThrow();
    // 非同期のcatchが実行されるのを待つ
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("タブが非表示のときは再生しない(バックグラウンド完走仕様に合わせる)", () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    const { player, created } = makePlayer();
    player.play("start");
    expect(created).toHaveLength(0);
  });
});
