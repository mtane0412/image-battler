/**
 * @file ゲーム全体で共有するドメイン型の定義です。
 * キャラクター・必殺技・状態異常・パッシブスキル・バトルイベントなど、
 * 状態管理(JavaScript側)が扱うデータ構造をここに集約します。
 */

/** ステータス異常の種類です。1キャラクターは同時に1つだけ罹患します。 */
export type AilmentType = "poison" | "paralysis" | "burn" | "freeze";

/** ステータス異常の種類一覧です(検証・表示で使用します)。 */
export const AILMENT_TYPES = [
  "poison",
  "paralysis",
  "burn",
  "freeze",
] as const satisfies readonly AilmentType[];

/** ステータス異常の日本語表示名です(ログ・実況・カード表示で共用します)。 */
export const AILMENT_LABELS = {
  poison: "どく",
  paralysis: "まひ",
  burn: "やけど",
  freeze: "こおり",
} as const satisfies Record<AilmentType, string>;

/**
 * 必殺技のタイプです。
 * - attack: 高威力の攻撃技
 * - heal: 自分のHPを回復する技
 * - ailment: 相手にステータス異常を与える技(小ダメージ付き)
 * - buff: 自分の攻撃力・防御力を上げる技
 */
export type SpecialMoveType = "attack" | "heal" | "ailment" | "buff";

/** 必殺技のタイプ一覧です(検証・表示で使用します)。 */
export const SPECIAL_MOVE_TYPES = [
  "attack",
  "heal",
  "ailment",
  "buff",
] as const satisfies readonly SpecialMoveType[];

/** 必殺技タイプの日本語表示名です(ログ・カード表示で共用します)。 */
export const SPECIAL_MOVE_TYPE_LABELS = {
  attack: "こうげき",
  heal: "かいふく",
  ailment: "じょうたい",
  buff: "きょうか",
} as const satisfies Record<SpecialMoveType, string>;

/** 必殺技の定義です。Gemini Nano が画像から生成します。 */
export interface SpecialMove {
  /** 必殺技名(例:「爪とぎクラッシュ」) */
  name: string;
  /** 技のタイプ */
  type: SpecialMoveType;
  /** 技の威力(STAT_RANGES.specialPower の範囲)。タイプごとに効果量の基準値になります */
  power: number;
  /** 消費MP(STAT_RANGES.specialMpCost の範囲) */
  mpCost: number;
  /** type が "ailment" のとき付与するステータス異常。それ以外のタイプでは null */
  ailment: AilmentType | null;
  /** 技の演出説明文 */
  description: string;
}

/**
 * パッシブスキルの種類です。効果はバトルエンジンに実装済みで、
 * AI は画像に合うものを選んで固有名を付けます。
 * - crit-master: クリティカル率が2倍になる
 * - ailment-guard: ステータス異常にならない
 * - endure: 戦闘不能になるダメージを1回だけHP1で耐える
 * - counter: 通常攻撃を受けたとき一定確率で反撃する
 * - mp-boost: 毎ターンのMP回復量が2倍になる
 * - life-steal: 通常攻撃で与えたダメージの一部だけHPを回復する
 * - regenerate: 自分の行動後にHPが少し回復する
 * - berserk: HPが減っている(30%以下)とき攻撃力が上がる
 * - evasion: 相手の通常攻撃のミス率が上がる
 * - first-strike: 素早さに関係なく先攻になる
 */
export type PassiveSkillId =
  | "crit-master"
  | "ailment-guard"
  | "endure"
  | "counter"
  | "mp-boost"
  | "life-steal"
  | "regenerate"
  | "berserk"
  | "evasion"
  | "first-strike";

/** パッシブスキルの種類一覧です(検証・表示で使用します)。 */
export const PASSIVE_SKILL_IDS = [
  "crit-master",
  "ailment-guard",
  "endure",
  "counter",
  "mp-boost",
  "life-steal",
  "regenerate",
  "berserk",
  "evasion",
  "first-strike",
] as const satisfies readonly PassiveSkillId[];

/**
 * パッシブスキルの効果の短い要約です。
 * キャラクター生成プロンプトの候補提示と、効果の説明表示に共用します。
 */
export const PASSIVE_SKILL_SUMMARIES = {
  "crit-master": "会心の一撃が出やすい",
  "ailment-guard": "状態異常にならない",
  endure: "倒れる一撃をHP1で耐える",
  counter: "攻撃されると反撃する",
  "mp-boost": "MPの回復が速い",
  "life-steal": "与えたダメージの一部を吸収して回復する",
  regenerate: "毎ターンHPが少しずつ回復する",
  berserk: "HPが減ると攻撃力が上がる",
  evasion: "相手の攻撃をかわしやすい",
  "first-strike": "素早さに関係なく先手を取る",
} as const satisfies Record<PassiveSkillId, string>;

/** パッシブスキルです。効果(id)はエンジン実装済み、名前はAIが付けます。 */
export interface PassiveSkill {
  /** 効果の種類(エンジンが解釈するID) */
  id: PassiveSkillId;
  /** AIが付けた固有名(例:「猫の反射神経」) */
  name: string;
  /** 効果の紹介文 */
  description: string;
}

/**
 * Gemini Nano が画像認識から生成するステータス一式です。
 * 数値の許容範囲は ai/schema.ts の STAT_RANGES で定義します。
 */
export interface GeneratedStats {
  /** 最大HP */
  hp: number;
  /** 最大MP(必殺技のリソース) */
  mp: number;
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
  /** パッシブスキル */
  passive: PassiveSkill;
}

/** localStorage に保存されるキャラクターです。 */
export interface Character extends Omit<GeneratedStats, "passive"> {
  /** 一意なID(crypto.randomUUID で採番) */
  id: string;
  /** ユーザーが付けた名前 */
  name: string;
  /**
   * パッシブスキル。旧形式データから自動移行したキャラクターは
   * パッシブを持たないため null になります(storage/repository.ts 参照)。
   */
  passive: PassiveSkill | null;
  /** 縮小済み画像の DataURL(JPEG) */
  imageDataUrl: string;
  /** 作成日時(ISO 8601) */
  createdAt: string;
}

/** バトルイベント適用後の、一方のキャラクターの状態スナップショットです。 */
export interface CombatantSnapshot {
  /** 現在HP */
  hp: number;
  /** 現在MP */
  mp: number;
  /** 罹患中のステータス異常(なければ null) */
  ailment: AilmentType | null;
}

/**
 * 全バトルイベント共通のフィールドです。
 * - actorId: 行動(または効果)の主体。自己対象の効果では targetId と同じです
 * - after: イベント適用後の両者の状態(キーはキャラクターID)。
 *   UIはこれを反映するだけでHP/MP/状態異常の表示を同期できます
 */
export interface BattleEventBase {
  /** 1から始まるアクション通し番号(同一アクション由来の派生イベントは同じ値) */
  turn: number;
  /** 行動・効果の主体のキャラクターID */
  actorId: string;
  /** 効果の対象のキャラクターID(自己対象は actorId と同じ) */
  targetId: string;
  /** イベント適用後の両者の状態(キーはキャラクターID) */
  after: Record<string, CombatantSnapshot>;
}

/**
 * バトルイベントの種類ごとの固有フィールドです。
 * エンジンが共通フィールド(BattleEventBase)を補って BattleEvent を組み立てます。
 */
export type BattleEventPayload =
  (
    | {
        /** 通常攻撃(命中) */
        type: "attack";
        critical: boolean;
        damage: number;
      }
    | {
        /** 通常攻撃のミス */
        type: "miss";
      }
    | {
        /** 攻撃タイプの必殺技 */
        type: "special-attack";
        moveName: string;
        damage: number;
      }
    | {
        /** 回復タイプの必殺技(自己対象) */
        type: "special-heal";
        moveName: string;
        /** 実際に回復した量(最大HPを超えた分は含まない) */
        healed: number;
      }
    | {
        /** ステータス異常タイプの必殺技(小ダメージ+異常付与) */
        type: "special-ailment";
        moveName: string;
        ailment: AilmentType;
        damage: number;
      }
    | {
        /** 自己強化タイプの必殺技(自己対象) */
        type: "special-buff";
        moveName: string;
        attackGain: number;
        defenseGain: number;
      }
    | {
        /** 毒・やけどによる行動後のスリップダメージ(自己対象) */
        type: "ailment-damage";
        ailment: Extract<AilmentType, "poison" | "burn">;
        damage: number;
      }
    | {
        /** 麻痺・凍結による行動不能(自己対象) */
        type: "ailment-skip";
        ailment: Extract<AilmentType, "paralysis" | "freeze">;
      }
    | {
        /** 凍結の解除(自己対象) */
        type: "ailment-cure";
        ailment: Extract<AilmentType, "freeze">;
      }
    | {
        /** パッシブ「counter」による反撃(actor が反撃する側) */
        type: "counter";
        damage: number;
      }
    | {
        /** パッシブ「endure」の発動。HP1で耐えた(自己対象) */
        type: "endure";
      }
    | {
        /** パッシブ「life-steal」による通常攻撃後のHP吸収(自己対象) */
        type: "life-steal";
        /** 実際に回復した量(最大HPを超えた分は含まない) */
        healed: number;
      }
    | {
        /** パッシブ「regenerate」による行動後のHP回復(自己対象) */
        type: "regenerate";
        /** 実際に回復した量(最大HPを超えた分は含まない) */
        healed: number;
      }
  );

/** バトルの1イベントです。type で判別する共用体です。実況生成の素材にもなります。 */
export type BattleEvent = BattleEventBase & BattleEventPayload;

/** バトル全体の結果です。 */
export interface BattleResult {
  events: BattleEvent[];
  /** 勝者ID。引き分けの場合は null */
  winnerId: string | null;
  /** 敗者ID。引き分けの場合は null */
  loserId: string | null;
}

/** チーム戦の勝敗サイドです。simulateTeamBattle の第1引数のチームが "first" です。 */
export type BattleSide = "first" | "second";

/** チーム戦(1v1・2v2共通)のバトル全体の結果です。 */
export interface TeamBattleResult {
  events: BattleEvent[];
  /** 勝利したサイド。引き分けの場合は null */
  winner: BattleSide | null;
}
