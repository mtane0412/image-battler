/**
 * @file バトルBGMモジュール(bgm.ts)のテストです。
 *
 * 検証項目:
 * - selectRandomBgmKey: 注入した乱数に応じて全戦闘曲が選択されうること
 * - bgmUrl: マニフェストのファイル名を含むURLを返すこと
 * - loadBgmEnabled / saveBgmEnabled: BGM設定の既定値(ON)と保存・復元
 * - createBgmPlayer: ループ再生・停止・タブ非表示時の一時停止・再生失敗時の安全性
 *
 * 音声再生(HTMLAudioElement)は外部依存(ブラウザAPI)のため、
 * フェイクのAudio実装を注入してテストします。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BGM_ENABLED_STORAGE_KEY,
  BGM_KEYS,
  BGM_VOLUME,
  bgmUrl,
  createBgmPlayer,
  loadBgmEnabled,
  saveBgmEnabled,
  selectRandomBgmKey,
  type BgmPlayer,
} from "./bgm";
import bgmManifest from "./bgm-manifest.json";

describe("selectRandomBgmKey", () => {
  it("乱数が0のときは先頭の戦闘曲を選ぶ", () => {
    expect(selectRandomBgmKey(() => 0)).toBe(BGM_KEYS[0]);
  });

  it("乱数が1に近いときは末尾の戦闘曲を選ぶ", () => {
    expect(selectRandomBgmKey(() => 0.999)).toBe(BGM_KEYS[BGM_KEYS.length - 1]);
  });

  it("注入した乱数に応じてすべての戦闘曲が選択されうる", () => {
    const selectedKeys = BGM_KEYS.map((_, index) =>
      selectRandomBgmKey(() => (index + 0.5) / BGM_KEYS.length),
    );
    expect(selectedKeys).toEqual(BGM_KEYS);
  });
});

describe("bgmUrl", () => {
  it("マニフェストのファイル名を含むURLを返す", () => {
    const firstKey = BGM_KEYS[0];
    if (firstKey === undefined) throw new Error("BGMマニフェストが空です");
    expect(bgmUrl(firstKey)).toContain(`bgm/${bgmManifest[firstKey].file}`);
  });
});

describe("loadBgmEnabled / saveBgmEnabled", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("未設定のときはON(true)を返す", () => {
    expect(loadBgmEnabled()).toBe(true);
  });

  it("OFFを保存するとOFF(false)が復元される", () => {
    saveBgmEnabled(false);
    expect(loadBgmEnabled()).toBe(false);
  });

  it("ONを保存し直すとON(true)が復元される", () => {
    saveBgmEnabled(false);
    saveBgmEnabled(true);
    expect(loadBgmEnabled()).toBe(true);
  });

  it("設定は専用のlocalStorageキーに保存される", () => {
    saveBgmEnabled(false);
    expect(localStorage.getItem(BGM_ENABLED_STORAGE_KEY)).toBe("off");
  });
});

describe("createBgmPlayer", () => {
  /**
   * HTMLAudioElement のフェイク実装です。
   * 生成URL・ループ設定・音量・再生/停止の回数を記録し、
   * 再生失敗のシミュレートができます。
   */
  class FakeAudio {
    src: string;
    volume = 1;
    loop = false;
    currentTime = 30;
    playCallCount = 0;
    pauseCallCount = 0;
    /** play() が返すPromise(失敗させたいテストで差し替える) */
    playResult: Promise<void> = Promise.resolve();

    constructor(src: string) {
      this.src = src;
    }

    play(): Promise<void> {
      this.playCallCount += 1;
      return this.playResult;
    }

    pause(): void {
      this.pauseCallCount += 1;
    }
  }

  /** 各テストで生成したプレイヤーです(afterEachで停止してリスナーの残留を防ぎます)。 */
  const activePlayers: BgmPlayer[] = [];

  /** フェイクAudioと固定乱数を注入したプレイヤーを生成します。 */
  function makePlayer(random: () => number = () => 0) {
    const created: FakeAudio[] = [];
    const player = createBgmPlayer((url) => {
      const audio = new FakeAudio(url);
      created.push(audio);
      return audio as unknown as HTMLAudioElement;
    }, random);
    activePlayers.push(player);
    return { player, created };
  }

  afterEach(() => {
    // 再生中のプレイヤーを停止し、documentに登録したvisibilitychangeリスナーが
    // 後続のテストに残らないようにします(停止済みプレイヤーへのstop()は無害です)
    activePlayers.splice(0).forEach((player) => player.stop());
    // document.hidden を上書きしたテストの後始末(own propertyを消して既定に戻す)
    Reflect.deleteProperty(document, "hidden");
    vi.restoreAllMocks();
  });

  it("play()で選んだ曲をループ設定・抑えた音量で再生する", () => {
    const { player, created } = makePlayer(() => 0);
    player.play();
    const audio = created[0];
    if (audio === undefined) throw new Error("Audioが生成されていません");
    const firstKey = BGM_KEYS[0];
    if (firstKey === undefined) throw new Error("BGMマニフェストが空です");
    expect(audio.src).toContain(bgmManifest[firstKey].file);
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBe(BGM_VOLUME);
    expect(audio.playCallCount).toBe(1);
  });

  it("再生中にplay()を重ねても二重再生しない", () => {
    const { player, created } = makePlayer();
    player.play();
    player.play();
    expect(created).toHaveLength(1);
    expect(created[0]?.playCallCount).toBe(1);
  });

  it("stop()で停止して曲の先頭へ戻す", () => {
    const { player, created } = makePlayer();
    player.play();
    player.stop();
    const audio = created[0];
    if (audio === undefined) throw new Error("Audioが生成されていません");
    expect(audio.pauseCallCount).toBe(1);
    expect(audio.currentTime).toBe(0);
  });

  it("stop()後にplay()すると曲を選び直す(注入乱数で別の曲になる)", () => {
    let randomValue = 0;
    const { player, created } = makePlayer(() => randomValue);
    player.play();
    player.stop();
    randomValue = 0.999;
    player.play();
    expect(created).toHaveLength(2);
    const lastKey = BGM_KEYS[BGM_KEYS.length - 1];
    if (lastKey === undefined) throw new Error("BGMマニフェストが空です");
    expect(created[1]?.src).toContain(bgmManifest[lastKey].file);
  });

  it("再生に失敗しても例外を投げず、警告ログに明示する", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const player = createBgmPlayer((url) => {
      const audio = new FakeAudio(url);
      audio.playResult = Promise.reject(new Error("自動再生がブロックされました"));
      return audio as unknown as HTMLAudioElement;
    });
    activePlayers.push(player);
    expect(() => {
      player.play();
    }).not.toThrow();
    // 非同期のcatchが実行されるのを待つ
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("タブが非表示の間は再生を保留し、表示に戻ったら再生する", () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    const { player, created } = makePlayer();
    player.play();
    expect(created[0]?.playCallCount).toBe(0);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(created[0]?.playCallCount).toBe(1);
  });

  it("再生中にタブが非表示になったら一時停止し、表示に戻ったら再開する", () => {
    const { player, created } = makePlayer();
    player.play();
    const audio = created[0];
    if (audio === undefined) throw new Error("Audioが生成されていません");
    expect(audio.playCallCount).toBe(1);

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(audio.pauseCallCount).toBe(1);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(audio.playCallCount).toBe(2);
  });

  it("stop()後はタブの表示状態が変わっても再生しない", () => {
    const { player, created } = makePlayer();
    player.play();
    player.stop();
    const audio = created[0];
    if (audio === undefined) throw new Error("Audioが生成されていません");

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(audio.playCallCount).toBe(1);
    expect(audio.pauseCallCount).toBe(1);
  });
});
