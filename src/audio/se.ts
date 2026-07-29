/**
 * @file バトル効果音モジュールです。効果音ラボ(https://soundeffect-lab.info/)の
 * 素材を使用します。素材ファイルはリポジトリに含めず、`npm run fetch:se` で
 * public/se/ にダウンロードします(素材一覧は se-manifest.json)。
 *
 * 設計方針:
 * - 「イベント→効果音キー」の決定は純粋関数(このファイル)で行い、テストします
 * - 必殺技には固有の効果音を割り当てます。技名・説明文の属性キーワード
 *   (炎・氷・雷など)で選び、該当がなければ技名のハッシュで決定的に選びます
 * - 再生失敗はゲーム進行に影響させません(明示的フォールバック:
 *   実況AIと同じく演出の失敗でバトルを止めない設計です。警告ログで明示します)
 */
import seManifest from "./se-manifest.json";
import type { AilmentType, BattleEvent, SpecialMove, StageEventId } from "../types";

/** 効果音のキー(se-manifest.json のキーと一致します)。 */
export type SeKey = keyof typeof seManifest;

/** 効果音の音量(素材の音圧が高めなので抑えます)。 */
export const SE_VOLUME = 0.5;

/** 効果音の音量設定を保存するlocalStorageキーです。 */
export const SE_VOLUME_STORAGE_KEY = "image-battler:se-volume";

/**
 * 効果音の音量設定(0以上1以下)を読み込みます。
 * 未設定・範囲外・数値でない場合は既定音量(SE_VOLUME)にフォールバックします
 * (bgm.tsのloadBgmVolumeと同様、壊れた設定値で無音になることを避けるためです)。
 * @param storage 保存先(テストではフェイクを注入できます)
 */
export function loadSeVolume(storage: Storage = localStorage): number {
  const raw = storage.getItem(SE_VOLUME_STORAGE_KEY);
  // Number("") は 0 になってしまう(=有効な音量として通ってしまう)ため、
  // 空文字列は未設定と同様に既定音量へフォールバックします
  if (raw === null || raw.trim() === "") {
    return SE_VOLUME;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return SE_VOLUME;
  }
  return value;
}

/**
 * 効果音の音量設定を保存します。
 * @param volume 0以上1以下の音量
 * @param storage 保存先(テストではフェイクを注入できます)
 */
export function saveSeVolume(
  volume: number,
  storage: Storage = localStorage,
): void {
  storage.setItem(SE_VOLUME_STORAGE_KEY, String(volume));
}

/** 必殺技用効果音のプール(ハッシュによるフォールバック選択の対象)です。 */
export const SPECIAL_SE_KEYS = [
  "special-flame",
  "special-ice",
  "special-thunder",
  "special-wind",
  "special-holy",
  "special-dark",
  "special-quake",
  "special-slash",
  "special-beast",
  "special-impact",
] as const satisfies readonly SeKey[];

/**
 * 必殺技の属性キーワード表です。配列の並び順が優先順位になります
 * (複数属性に一致する技名は先に定義した属性が勝ちます)。
 */
const SPECIAL_KEYWORD_RULES: ReadonlyArray<{
  key: (typeof SPECIAL_SE_KEYS)[number];
  keywords: readonly string[];
}> = [
  {
    key: "special-flame",
    keywords: ["炎", "火", "ほのお", "ファイア", "フレイム", "フレア", "バーン", "マグマ", "灼", "燃", "爆"],
  },
  {
    key: "special-ice",
    keywords: ["氷", "こおり", "アイス", "フリーズ", "ブリザード", "吹雪", "水", "ウォーター", "凍", "冷"],
  },
  {
    key: "special-thunder",
    keywords: ["雷", "かみなり", "サンダー", "ライトニング", "いなずま", "稲妻", "ボルト", "電"],
  },
  {
    key: "special-wind",
    keywords: ["風", "かぜ", "ウィンド", "ストーム", "嵐", "竜巻", "トルネード", "疾風"],
  },
  {
    key: "special-holy",
    keywords: ["光", "ひかり", "聖", "ホーリー", "シャイン", "輝", "天使", "オーロラ"],
  },
  {
    key: "special-dark",
    keywords: ["闇", "やみ", "ダーク", "シャドウ", "影", "呪", "深淵", "暗黒"],
  },
  {
    key: "special-quake",
    keywords: ["大地", "地割れ", "地震", "アース", "クエイク", "岩", "震"],
  },
  {
    key: "special-slash",
    keywords: ["斬", "切", "裂", "剣", "刃", "ソード", "ブレード", "スラッシュ", "爪", "クロー"],
  },
  {
    key: "special-beast",
    keywords: ["咆哮", "吠", "ほえ", "牙", "キバ", "ファング", "ビースト", "ロア", "かみつ", "がぶ"],
  },
];

/**
 * 必殺技に固有の効果音キーを割り当てます。
 *
 * 1. 技名に属性キーワードが含まれればその属性の効果音
 * 2. なければ説明文で同様に判定
 * 3. どちらにもなければ技名のハッシュでプールから決定的に選択
 *
 * 同じ必殺技には常に同じ効果音が割り当てられます(=技の固有音になります)。
 */
export function selectSpecialSeKey(specialMove: SpecialMove): SeKey {
  for (const text of [specialMove.name, specialMove.description]) {
    for (const rule of SPECIAL_KEYWORD_RULES) {
      if (rule.keywords.some((keyword) => text.includes(keyword))) {
        return rule.key;
      }
    }
  }
  const index = fnv1aHash(specialMove.name) % SPECIAL_SE_KEYS.length;
  const key = SPECIAL_SE_KEYS[index];
  if (key === undefined) {
    throw new Error(`必殺技効果音の選択に失敗しました(index=${index})`);
  }
  return key;
}

/** FNV-1a ハッシュ(32bit)です。文字列から決定的な非負整数を得ます。 */
function fnv1aHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 状態異常ごとの効果音キーです(異常必殺技の演出に使用します)。 */
const AILMENT_SE_KEYS = {
  poison: "special-dark",
  paralysis: "special-thunder",
  burn: "special-flame",
  freeze: "special-ice",
  curse: "special-dark",
  blind: "special-dark",
  confusion: "special-wind",
  weaken: "special-dark",
} as const satisfies Record<AilmentType, SeKey>;

/**
 * ステージ特殊イベントごとの効果音キーです。既存の必殺技用素材を流用するため、
 * ステージ機能のために新規素材(npm run fetch:se)を追加する必要はありません。
 */
const STAGE_EVENT_SE_KEYS = {
  damage: "special-quake",
  heal: "special-holy",
  "mana-restore": "special-thunder",
  ailment: "special-dark",
  "mana-drain": "special-dark",
  "attack-up": "special-flame",
  "defense-down": "special-dark",
  cleanse: "special-holy",
} as const satisfies Record<StageEventId, SeKey>;

/**
 * バトルイベントを効果音キーに変換します。
 * 効果音を鳴らさないイベント(スリップダメージ・行動不能・解除・endure)では
 * null を返します(該当する素材がないため、ログと視覚演出のみで伝えます)。
 * @param specialSeKey 行動側の必殺技に割り当てた固有効果音キー
 */
export function seKeyForEvent(
  event: BattleEvent,
  specialSeKey: SeKey,
): SeKey | null {
  switch (event.type) {
    case "miss":
      return "miss";
    case "special-attack":
    case "special-buff":
    case "special-drain":
    case "special-debuff":
    case "special-all-attack":
      return specialSeKey;
    case "special-heal":
      return "special-holy";
    case "special-ailment":
      return AILMENT_SE_KEYS[event.ailment];
    case "counter":
    case "thorns":
      // 反撃・とげの反射は重い一撃の音で強調します
      return "critical";
    case "attack":
      if (event.critical) {
        return "critical";
      }
      // 単調にならないよう、ターンの奇偶で2種類の打撃音を使い分けます
      return event.turn % 2 === 1 ? "attack1" : "attack2";
    case "ailment-damage":
    case "ailment-skip":
    case "ailment-cure":
    case "ailment-confusion":
    case "endure":
    case "life-steal":
    case "regenerate":
      // 経過イベント(life-steal / regenerate 含む)は毎ターン発生しうるため
      // 効果音を鳴らさない(必殺技音の特別感を保つ)
      return null;
    case "stage-damage":
    case "stage-heal":
    case "stage-mp":
    case "stage-ailment":
    case "stage-mp-drain":
    case "stage-buff":
    case "stage-cure":
      return STAGE_EVENT_SE_KEYS[event.eventId];
  }
}

/** 効果音キーに対応する音声ファイルのURLを返します。 */
export function seUrl(key: SeKey): string {
  return `${import.meta.env.BASE_URL}se/${seManifest[key].file}`;
}

/** 効果音プレイヤーです。 */
export interface SePlayer {
  /** すべての効果音の読み込みを開始します(バトル開始前の先読み用)。 */
  preload(): void;
  /** 指定キーの効果音を再生します。失敗してもゲーム進行を止めません。 */
  play(key: SeKey): void;
  /**
   * 指定キーの効果音をループ再生し、停止関数を返します。
   * メッセージ表示音など「演出が続いている間だけ鳴らす」用途で使用します。
   * 失敗してもゲーム進行を止めません(停止関数は常に安全に呼べます)。
   */
  playLoop(key: SeKey): () => void;
}

/**
 * 効果音プレイヤーを生成します。
 *
 * - Audio要素はキーごとに1つだけ生成してキャッシュし、再生時は複製(cloneNode)
 *   するため、同じ効果音を重ねて鳴らせます
 * - タブが非表示の間は再生しません(バトルはバックグラウンドでも完走する仕様の
 *   ため、見えていない画面の音だけが鳴り続けるのを防ぎます)
 *
 * @param createAudio Audio要素の生成関数(テストではフェイクを注入します)
 */
export function createSePlayer(
  createAudio: (url: string) => HTMLAudioElement = (url) => new Audio(url),
): SePlayer {
  const cache = new Map<SeKey, HTMLAudioElement>();

  /** キャッシュ済みAudioを返します。未生成なら生成して読み込みを開始します。 */
  function ensureAudio(key: SeKey): HTMLAudioElement {
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const audio = createAudio(seUrl(key));
    audio.preload = "auto";
    cache.set(key, audio);
    return audio;
  }

  /**
   * 複製したAudioで再生を開始し、その複製を返します。
   * 効果音は演出であり、再生に失敗してもバトル進行を止めません
   * (明示的フォールバック: 警告ログのみ出力します)。
   */
  function playClone(key: SeKey, loop: boolean): HTMLAudioElement {
    // cloneNode の戻り値型は Node のためアサーションが必要です
    const clone = ensureAudio(key).cloneNode(true) as HTMLAudioElement;
    clone.loop = loop;
    clone.volume = loadSeVolume();
    clone.play().catch((error: unknown) => {
      console.warn(
        `効果音「${key}」を再生できませんでした(ゲーム進行には影響しません)`,
        error,
      );
    });
    return clone;
  }

  return {
    preload(): void {
      for (const key of Object.keys(seManifest)) {
        ensureAudio(key as SeKey);
      }
    },
    play(key: SeKey): void {
      if (document.hidden) {
        return;
      }
      playClone(key, false);
    },
    playLoop(key: SeKey): () => void {
      if (document.hidden) {
        // タブ非表示時は再生しないため、停止関数も何もしません
        return () => {};
      }
      const clone = playClone(key, true);
      return () => {
        clone.pause();
      };
    },
  };
}
