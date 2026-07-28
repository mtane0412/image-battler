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
 * ステージ特性の種類です。効果はバトルエンジンに実装済みで、
 * AI は画像に合うものを選んで固有名を付けます。全員に平等にかかる「場の効果」です。
 * - blazing: 全員の攻撃力が上がる
 * - fortified: 全員の被ダメージが下がる
 * - fortunate: 全員のクリティカル率が上がる
 * - mana-rich: 全員の毎ターンMP回復量が上がる
 */
export type StageTraitId = "blazing" | "fortified" | "fortunate" | "mana-rich";

/** ステージ特性の種類一覧です(検証・表示で使用します)。 */
export const STAGE_TRAIT_IDS = [
  "blazing",
  "fortified",
  "fortunate",
  "mana-rich",
] as const satisfies readonly StageTraitId[];

/**
 * ステージ特性の効果の短い要約です。
 * ステージ生成プロンプトの候補提示と、効果の説明表示に共用します。
 */
export const STAGE_TRAIT_SUMMARIES = {
  blazing: "全員の攻撃力が上がる",
  fortified: "全員の被ダメージが下がる",
  fortunate: "全員の会心率が上がる",
  "mana-rich": "全員のMP回復が速い",
} as const satisfies Record<StageTraitId, string>;

/** ステージ特性です。効果(id)はエンジン実装済み、名前はAIが付けます。 */
export interface StageTrait {
  /** 効果の種類(エンジンが解釈するID) */
  id: StageTraitId;
  /** AIが付けた固有名(例:「灼熱の闘技場」) */
  name: string;
  /** 効果の紹介文 */
  description: string;
}

/**
 * ステージ特殊イベントの種類です。ラウンド開始時に一定確率で発動し、
 * 生存者全員に平等な効果を与えます。効果量はエンジンに実装済みで、
 * AI は画像に合うものを選んで固有名を付けます。
 * - meteor: 生存者全員がダメージを受ける(戦闘不能にはならない)
 * - spring: 生存者全員のHPが少し回復する
 * - mana-burst: 生存者全員のMPが大きく回復する
 * - miasma: 状態異常でない生存者全員がやけど状態になる
 */
export type StageEventId = "meteor" | "spring" | "mana-burst" | "miasma";

/** ステージ特殊イベントの種類一覧です(検証・表示で使用します)。 */
export const STAGE_EVENT_IDS = [
  "meteor",
  "spring",
  "mana-burst",
  "miasma",
] as const satisfies readonly StageEventId[];

/**
 * ステージ特殊イベントの効果の短い要約です。
 * ステージ生成プロンプトの候補提示と、効果の説明表示に共用します。
 */
export const STAGE_EVENT_SUMMARIES = {
  meteor: "全員にダメージを与える隕石が降る",
  spring: "全員のHPを少し回復する泉がわく",
  "mana-burst": "全員のMPを大きく回復する魔力があふれる",
  miasma: "全員をやけど状態にする瘴気が立ちこめる",
} as const satisfies Record<StageEventId, string>;

/** ステージ特殊イベントです。効果(id)はエンジン実装済み、名前はAIが付けます。 */
export interface StageEvent {
  /** 効果の種類(エンジンが解釈するID) */
  id: StageEventId;
  /** AIが付けた固有名(例:「隕石落とし」) */
  name: string;
  /** 効果の紹介文 */
  description: string;
}

/**
 * Gemini Nano が画像認識から生成するステージ情報一式です。
 * ステージには数値ステータスを持たせず、特性・イベントの種類(id)だけを
 * AI に選ばせます(効果量はエンジン側の定数のため、JSON出力を小さく保てます)。
 */
export interface GeneratedStage {
  /** ステージ名(例:「灼熱の闘技場」) */
  title: string;
  /** ステージの紹介文 */
  description: string;
  /** 常時発動するステージ特性 */
  trait: StageTrait;
  /** ラウンド開始時に一定確率で発動する特殊イベント */
  event: StageEvent;
}

/** localStorage に保存されるステージです。 */
export interface Stage extends GeneratedStage {
  /** 一意なID(crypto.randomUUID で採番) */
  id: string;
  /** ユーザーが付けた名前 */
  name: string;
  /** 縮小済み画像の DataURL(JPEG) */
  imageDataUrl: string;
  /** 作成日時(ISO 8601) */
  createdAt: string;
}

/**
 * バトルエンジンが必要とする最小限のステージ情報です。
 * 永続化用フィールド(id・name・imageDataUrl・createdAt・title・description)を
 * 含まないため、エンジンはステージの保存形式を知る必要がありません。
 */
export type BattleStage = Pick<Stage, "trait" | "event">;

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
    | {
        /**
         * ステージ特殊イベントによる行動後のダメージ(自己対象)。
         * ラウンド開始時に生存者ごとに1件ずつ発行されます
         */
        type: "stage-damage";
        eventId: StageEventId;
        eventName: string;
        /** そのラウンドのステージイベント群で最初の1件かどうか */
        announce: boolean;
        damage: number;
      }
    | {
        /** ステージ特殊イベントによるHP回復(自己対象) */
        type: "stage-heal";
        eventId: StageEventId;
        eventName: string;
        announce: boolean;
        /** 実際に回復した量(最大HPを超えた分は含まない) */
        healed: number;
      }
    | {
        /** ステージ特殊イベントによるMP回復(自己対象) */
        type: "stage-mp";
        eventId: StageEventId;
        eventName: string;
        announce: boolean;
        /** 実際に回復した量(最大MPを超えた分は含まない) */
        restored: number;
      }
    | {
        /** ステージ特殊イベントによるステータス異常付与(自己対象) */
        type: "stage-ailment";
        eventId: StageEventId;
        eventName: string;
        announce: boolean;
        ailment: Extract<AilmentType, "burn">;
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

/** バトルロイヤル(完全FFA)のバトル全体の結果です。 */
export interface RoyaleBattleResult {
  events: BattleEvent[];
  /** 最後まで生き残った(または判定勝ちした)キャラクターのID。引き分けの場合は null */
  winnerId: string | null;
}
