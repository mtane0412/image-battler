/**
 * @file ゲーム全体で共有するドメイン型の定義です。
 * キャラクター・必殺技・バトルイベントなど、状態管理(JavaScript側)が扱う
 * データ構造をここに集約します。
 */

/** 必殺技の定義です。Gemini Nano が画像から生成します。 */
export interface SpecialMove {
  /** 必殺技名(例:「爪とぎクラッシュ」) */
  name: string;
  /** 技の威力(STAT_RANGES.specialPower の範囲) */
  power: number;
  /** 技の演出説明文 */
  description: string;
}

/**
 * Gemini Nano が画像認識から生成するステータス一式です。
 * 数値の許容範囲は ai/schema.ts の STAT_RANGES で定義します。
 */
export interface GeneratedStats {
  /** 最大HP */
  hp: number;
  /** 攻撃力 */
  attack: number;
  /** 防御力 */
  defense: number;
  /** 素早さ(行動順の決定に使用) */
  speed: number;
  /** 運(クリティカル率に影響) */
  luck: number;
  /** 二つ名(例:「深淵の眠り猫」) */
  title: string;
  /** キャラクターの紹介文 */
  description: string;
  /** 必殺技 */
  specialMove: SpecialMove;
}

/** localStorage に保存されるキャラクターです。 */
export interface Character extends GeneratedStats {
  /** 一意なID(crypto.randomUUID で採番) */
  id: string;
  /** ユーザーが付けた名前 */
  name: string;
  /** 縮小済み画像の DataURL(JPEG) */
  imageDataUrl: string;
  /** 作成日時(ISO 8601) */
  createdAt: string;
}

/** バトル中の1アクションの種別です。 */
export type BattleActionType = "attack" | "special" | "miss";

/** バトルの1アクションで発生した出来事です。実況生成の素材にもなります。 */
export interface BattleEvent {
  /** 1から始まる通し番号 */
  turn: number;
  attackerId: string;
  defenderId: string;
  type: BattleActionType;
  /** クリティカルヒットかどうか(通常攻撃のみ true になり得る) */
  critical: boolean;
  /** 与えたダメージ(ミス時は0) */
  damage: number;
  /** ダメージ適用後の防御側HP(0未満にはならない) */
  defenderHpAfter: number;
}

/** バトル全体の結果です。 */
export interface BattleResult {
  events: BattleEvent[];
  /** 勝者ID。引き分けの場合は null */
  winnerId: string | null;
  /** 敗者ID。引き分けの場合は null */
  loserId: string | null;
}
