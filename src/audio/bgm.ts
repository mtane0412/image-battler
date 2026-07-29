/**
 * @file バトルBGMモジュールです。魔王魂(https://maou.audio/)のファンタジー
 * 戦闘曲を使用します。素材ファイルはリポジトリに含めず、`npm run fetch:bgm` で
 * public/bgm/ にダウンロードします(素材一覧は bgm-manifest.json)。
 *
 * 設計方針:
 * - バトルごとに戦闘曲をランダムに1曲選び、ループ再生します(乱数は注入可能)
 * - BGMのON/OFF設定はlocalStorageに保存し、ホーム画面・バトル画面の
 *   両方から切り替えられます(未設定の既定はON)
 * - プレイヤーはアプリ全体で1つだけ共有します(画面切り替え時の止め忘れ防止)
 * - タブが非表示の間は一時停止します(効果音と同じく、見えていない画面の
 *   音だけが鳴り続けるのを防ぎます。表示に戻ると再開します)
 * - 再生失敗はゲーム進行に影響させません(明示的フォールバック:
 *   効果音と同じく演出の失敗でバトルを止めない設計です。警告ログで明示します)
 */
import bgmManifest from "./bgm-manifest.json";

/** BGMのキー(bgm-manifest.json のキーと一致します)。 */
export type BgmKey = keyof typeof bgmManifest;

/** BGMの音量(効果音より控えめにして実況・効果音を聞き取りやすくします)。 */
export const BGM_VOLUME = 0.25;

/** BGMのON/OFF設定を保存するlocalStorageキーです。 */
export const BGM_ENABLED_STORAGE_KEY = "image-battler:bgm-enabled";

/** BGMの音量設定を保存するlocalStorageキーです。 */
export const BGM_VOLUME_STORAGE_KEY = "image-battler:bgm-volume";

/** 選択対象の戦闘曲キーの一覧です(Object.keysの戻り値型を補うアサーションです)。 */
export const BGM_KEYS = Object.keys(bgmManifest) as readonly BgmKey[];

/**
 * 戦闘曲をランダムに1曲選びます。
 * @param random 0以上1未満の乱数を返す関数(テストでは固定値を注入します)
 */
export function selectRandomBgmKey(random: () => number = Math.random): BgmKey {
  const index = Math.floor(random() * BGM_KEYS.length);
  const key = BGM_KEYS[index];
  if (key === undefined) {
    throw new Error(`戦闘BGMの選択に失敗しました(index=${index})`);
  }
  return key;
}

/** BGMキーに対応する音声ファイルのURLを返します。 */
export function bgmUrl(key: BgmKey): string {
  return `${import.meta.env.BASE_URL}bgm/${bgmManifest[key].file}`;
}

/**
 * BGMのON/OFF設定を読み込みます。未設定の場合はON(true)です。
 * @param storage 保存先(テストではフェイクを注入できます)
 */
export function loadBgmEnabled(storage: Storage = localStorage): boolean {
  return storage.getItem(BGM_ENABLED_STORAGE_KEY) !== "off";
}

/**
 * BGMのON/OFF設定を保存します。
 * @param storage 保存先(テストではフェイクを注入できます)
 */
export function saveBgmEnabled(
  enabled: boolean,
  storage: Storage = localStorage,
): void {
  storage.setItem(BGM_ENABLED_STORAGE_KEY, enabled ? "on" : "off");
}

/**
 * BGMの音量設定(0以上1以下)を読み込みます。
 * 未設定・範囲外・数値でない場合は既定音量(BGM_VOLUME)にフォールバックします
 * (loadBgmEnabledと同様、壊れた設定値でBGMが鳴らなくなることを避けるためです)。
 * @param storage 保存先(テストではフェイクを注入できます)
 */
export function loadBgmVolume(storage: Storage = localStorage): number {
  const raw = storage.getItem(BGM_VOLUME_STORAGE_KEY);
  // Number("") は 0 になってしまう(=有効な音量として通ってしまう)ため、
  // 空文字列は未設定と同様に既定音量へフォールバックします
  if (raw === null || raw.trim() === "") {
    return BGM_VOLUME;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return BGM_VOLUME;
  }
  return value;
}

/**
 * BGMの音量設定を保存します。
 * @param volume 0以上1以下の音量
 * @param storage 保存先(テストではフェイクを注入できます)
 */
export function saveBgmVolume(
  volume: number,
  storage: Storage = localStorage,
): void {
  storage.setItem(BGM_VOLUME_STORAGE_KEY, String(volume));
}

/** BGMプレイヤーです。 */
export interface BgmPlayer {
  /**
   * ランダムに選んだ戦闘曲のループ再生を開始します。
   * すでに再生中の場合は何もしません(二重再生を防ぎます)。
   * 音量は保存済みの設定(loadBgmVolume)に従います。
   */
  play(): void;
  /** 再生を停止し、曲の先頭へ戻します。停止中は何もしません。 */
  stop(): void;
  /** 再生中の音量を即座に変更します。停止中は何もしません(設定パネルのスライダー用)。 */
  setVolume(volume: number): void;
}

/**
 * BGMプレイヤーを生成します。
 *
 * @param createAudio Audio要素の生成関数(テストではフェイクを注入します)
 * @param random 選曲に使う乱数関数(テストでは固定値を注入します)
 */
export function createBgmPlayer(
  createAudio: (url: string) => HTMLAudioElement = (url) => new Audio(url),
  random: () => number = Math.random,
): BgmPlayer {
  // 再生中のAudio要素です(nullは停止中を表します)
  let current: HTMLAudioElement | null = null;

  /** 現在の曲の再生を開始します。失敗は警告ログのみでゲーム進行を止めません。 */
  function playCurrent(): void {
    current?.play().catch((error: unknown) => {
      // BGMは演出であり、失敗してもバトル進行を止めません(明示的フォールバック)
      console.warn(
        "BGMを再生できませんでした(ゲーム進行には影響しません)",
        error,
      );
    });
  }

  /** タブの表示状態に合わせて一時停止・再開します。 */
  function handleVisibilityChange(): void {
    if (current === null) {
      return;
    }
    if (document.hidden) {
      current.pause();
    } else {
      playCurrent();
    }
  }

  return {
    play(): void {
      if (current !== null) {
        return;
      }
      const audio = createAudio(bgmUrl(selectRandomBgmKey(random)));
      audio.loop = true;
      audio.volume = loadBgmVolume();
      current = audio;
      document.addEventListener("visibilitychange", handleVisibilityChange);
      // タブが非表示の間は再生を保留し、表示に戻ったときに再生を開始します
      if (!document.hidden) {
        playCurrent();
      }
    },
    stop(): void {
      if (current === null) {
        return;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      current.pause();
      current.currentTime = 0;
      current = null;
    },
    setVolume(volume: number): void {
      if (current === null) {
        return;
      }
      current.volume = volume;
    },
  };
}

/** アプリ全体で共有するBGMプレイヤーです(遅延生成)。 */
let sharedPlayer: BgmPlayer | undefined;

/**
 * アプリ全体で共有するBGMプレイヤーを返します。
 * 画面をまたいで1つだけ保持することで、画面切り替え時の止め忘れを防ぎます。
 */
export function getSharedBgmPlayer(): BgmPlayer {
  sharedPlayer ??= createBgmPlayer();
  return sharedPlayer;
}
