/**
 * @file Gemini Nano のキャラクター生成に使う JSON Schema と、
 * モデル出力(JSON文字列)を検証付きでパースする処理です。
 *
 * Fail-Fast 方針: モデル出力が範囲外・欠落・型不一致の場合は補正せずに
 * CharacterParseError を投げます。呼び出し側(UI)が再生成を促します。
 * 例外として、異常タイプ以外の必殺技の ailment フィールドは使用しない値のため
 * null に正規化します(補正ではなく無関係フィールドの破棄です)。
 *
 * パッシブスキルのidは、抽選済みの候補リスト(ai/passives.ts で抽選)だけを
 * スキーマ・検証の両方で許可します。候補外のidは Fail-Fast で拒否します。
 */
import type {
  AilmentType,
  GeneratedStats,
  PassiveSkill,
  PassiveSkillId,
} from "../types";
import { AILMENT_TYPES, SPECIAL_MOVE_TYPES } from "../types";

/** モデル出力の検証に失敗したときに投げるエラーです。 */
export class CharacterParseError extends Error {
  override name = "CharacterParseError";
}

/** 各ステータスの許容範囲です。JSON Schema と検証の双方で使用します。 */
export const STAT_RANGES = {
  // バトルを長引かせるため、他ステータスに対してHPだけ意図的に高めの範囲です
  // (変更時は storage/repository.ts の旧データHP移行も見直すこと)
  hp: { min: 100, max: 300 },
  mp: { min: 30, max: 100 },
  attack: { min: 20, max: 60 },
  defense: { min: 10, max: 50 },
  speed: { min: 10, max: 100 },
  luck: { min: 0, max: 100 },
  specialPower: { min: 30, max: 80 },
  specialMpCost: { min: 15, max: 50 },
} as const;

/**
 * 必殺技の ailment フィールドに指定できる値です。
 * 異常タイプ以外の技では "none" を指定させます。
 */
const AILMENT_CHOICES = ["none", ...AILMENT_TYPES] as const;

/**
 * 自由記述フィールドの最大文字数です(JSON Schema の maxLength に使用)。
 *
 * Gemini Nano は小型モデルのため、説明文が長く暴走すると出力トークン上限で
 * JSONが途中で切れてパース失敗になります。制約側で長さを抑えて予防します。
 * パース時の検証には使いません(長さはゲーム性に影響しない表示上の制約のため、
 * 万一超過してもエラーにはしません)。
 */
export const TEXT_LIMITS = {
  /** 二つ名・技名・パッシブ名 */
  name: 20,
  /** キャラクターの紹介文 */
  characterDescription: 80,
  /** 技・パッシブの説明文 */
  effectDescription: 60,
} as const;

/**
 * Prompt API の responseConstraint に渡す JSON Schema を組み立てます。
 * モデル出力をこの構造に制約します。パッシブスキルのidは抽選済みの
 * 候補(passiveCandidates)だけを enum に許可します。
 * @throws Error 候補が空の場合(enumが空のスキーマは無意味なため Fail-Fast)
 */
export function buildCharacterGenerationSchema(
  passiveCandidates: readonly PassiveSkillId[],
) {
  if (passiveCandidates.length === 0) {
    throw new Error("パッシブスキルの候補が空です(抽選結果を渡してください)");
  }
  return {
    type: "object",
    required: [
      "hp",
      "mp",
      "attack",
      "defense",
      "speed",
      "luck",
      "title",
      "description",
      "specialMove",
      "passive",
    ],
    additionalProperties: false,
    properties: {
      hp: { type: "integer", minimum: STAT_RANGES.hp.min, maximum: STAT_RANGES.hp.max },
      mp: { type: "integer", minimum: STAT_RANGES.mp.min, maximum: STAT_RANGES.mp.max },
      attack: { type: "integer", minimum: STAT_RANGES.attack.min, maximum: STAT_RANGES.attack.max },
      defense: { type: "integer", minimum: STAT_RANGES.defense.min, maximum: STAT_RANGES.defense.max },
      speed: { type: "integer", minimum: STAT_RANGES.speed.min, maximum: STAT_RANGES.speed.max },
      luck: { type: "integer", minimum: STAT_RANGES.luck.min, maximum: STAT_RANGES.luck.max },
      title: { type: "string", maxLength: TEXT_LIMITS.name },
      description: { type: "string", maxLength: TEXT_LIMITS.characterDescription },
      specialMove: {
        type: "object",
        required: ["name", "type", "power", "mpCost", "ailment", "description"],
        additionalProperties: false,
        properties: {
          name: { type: "string", maxLength: TEXT_LIMITS.name },
          type: { type: "string", enum: SPECIAL_MOVE_TYPES },
          power: {
            type: "integer",
            minimum: STAT_RANGES.specialPower.min,
            maximum: STAT_RANGES.specialPower.max,
          },
          mpCost: {
            type: "integer",
            minimum: STAT_RANGES.specialMpCost.min,
            maximum: STAT_RANGES.specialMpCost.max,
          },
          ailment: { type: "string", enum: AILMENT_CHOICES },
          description: { type: "string", maxLength: TEXT_LIMITS.effectDescription },
        },
      },
      passive: {
        type: "object",
        required: ["id", "name", "description"],
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: passiveCandidates },
          name: { type: "string", maxLength: TEXT_LIMITS.name },
          description: { type: "string", maxLength: TEXT_LIMITS.effectDescription },
        },
      },
    },
  } as const;
}

/**
 * モデル出力のJSON文字列を検証し、GeneratedStats として返します。
 * @param allowedPassiveIds 抽選済みのパッシブ候補。候補外のidは拒否します
 * @throws CharacterParseError 出力がJSONでない・範囲外・欠落している場合
 */
export function parseGeneratedStats(
  raw: string,
  allowedPassiveIds: readonly PassiveSkillId[],
): GeneratedStats {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = parseWithQuirkRepairs(raw);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CharacterParseError("モデル出力がオブジェクトではありません");
  }
  const obj = parsed as Record<string, unknown>;

  const stats = {
    hp: readInt(obj, "hp", STAT_RANGES.hp),
    mp: readInt(obj, "mp", STAT_RANGES.mp),
    attack: readInt(obj, "attack", STAT_RANGES.attack),
    defense: readInt(obj, "defense", STAT_RANGES.defense),
    speed: readInt(obj, "speed", STAT_RANGES.speed),
    luck: readInt(obj, "luck", STAT_RANGES.luck),
    title: readText(obj, "title"),
    description: readText(obj, "description"),
    specialMove: readSpecialMove(obj),
    passive: readPassive(obj, allowedPassiveIds),
  } satisfies GeneratedStats;
  return stats;
}

/**
 * Gemini Nano の既知の癖を修復した候補を順にパースし、最初に解釈できた値を
 * 返します。どの候補でも解釈できない場合は CharacterParseError を投げます。
 *
 * 実機で確認した決定論的な癖(いずれも responseConstraint では防げません):
 * 1. 日本語の文字列値の閉じ引用符を「'」と出力する(例: `…する。'}}`)
 * 2. 末尾の文字列値の閉じ引用符を丸ごと省略する(例: `…回避する。}}`)
 * 3. 完結したJSONの後ろにゴミを出力する(例: `…}}` の後に「{」+改行)
 *
 * 癖は同時に発生しうるため、単独・組み合わせの修復候補をすべて試します。
 * JSONとして成立しない候補は採用されないため、構文を壊す誤修復は
 * 排除されます(構文的に成立した最初の候補を決定論的に採用します)。
 */
function parseWithQuirkRepairs(raw: string): unknown {
  const trimmed = trimTrailingGarbage(raw);
  const quoteClosed = repairMissingClosingQuote(trimmed);
  const candidates = [
    repairQuoteQuirk(raw),
    trimmed,
    repairQuoteQuirk(trimmed),
    quoteClosed,
    repairQuoteQuirk(quoteClosed),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // この候補では修復できなかったため、次の候補を試します
    }
  }
  // 診断のため、先頭と末尾の両方を含めます(末尾で壊れることが多いため)
  throw new CharacterParseError(
    `モデル出力をJSONとして解釈できませんでした(先頭: ${raw.slice(0, 60)} / 末尾: ${raw.slice(-60)})`,
  );
}

/**
 * 癖1の修復: 閉じ引用符「'」+ 区切り記号(} , ])を「"」+ 区切り記号へ
 * 置き換えます。
 */
function repairQuoteQuirk(raw: string): string {
  return raw.replace(/'(\s*[}\],])/g, '"$1');
}

/**
 * 癖2の修復: 末尾の閉じ括弧の直前に閉じ引用符「"」を補います
 * (Vercel本番の実機例: `"description": "相手の攻撃を軽々と回避する。}}`)。
 *
 * 直前の文字が引用符・閉じ括弧・JSON構文空白の場合は補いません。
 * 数値で終わる正常な構造(例: `"mpCost": 30}}`)に補った候補は
 * JSONとして不正のままなので採用されず、数値を壊すことはありません。
 * 空白はJSONの構文空白(space/tab/CR/LF)だけを対象にします。全角空白などの
 * Unicode空白は文字列内容の一部として残して修復し、パース後の trim で
 * 除去されます。
 */
function repairMissingClosingQuote(raw: string): string {
  return raw.replace(/([^" \t\r\n}\]])((?:[ \t\r\n]*[}\]])+)$/, '$1"$2');
}

/**
 * 癖3の修復: JSON本体の後ろに続くゴミを取り除きます
 * (Vercel本番の実機例: `…}}` の後に「{」+改行が続く)。
 * このスキーマの正しい出力は必ず「}」で終わるため、最後の「}」より後ろは
 * すべて不要とみなして切り捨てます。「}」が無い場合は修復せずそのまま返します。
 *
 * 制限: ゴミ側に「}」が含まれるまで出力が進んだ場合(未観測)は切り捨て位置を
 * 誤り、修復できずに CharacterParseError となります(Fail-Fast)。
 */
function trimTrailingGarbage(raw: string): string {
  const lastBrace = raw.lastIndexOf("}");
  return lastBrace === -1 ? raw : raw.slice(0, lastBrace + 1);
}

/** 指定キーの整数値を検証付きで読み取ります。 */
function readInt(
  obj: Record<string, unknown>,
  key: string,
  range: { min: number; max: number },
): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CharacterParseError(`${key} が整数ではありません: ${String(value)}`);
  }
  if (value < range.min || value > range.max) {
    throw new CharacterParseError(
      `${key} が許容範囲(${range.min}〜${range.max})外です: ${value}`,
    );
  }
  return value;
}

/** 指定キーの空でない文字列を検証付きで読み取ります(前後の空白は除去)。 */
function readText(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new CharacterParseError(`${key} が空か文字列ではありません`);
  }
  return value.trim();
}

/** 指定キーの値が許可リストに含まれる文字列であることを検証して読み取ります。 */
function readChoice<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  choices: readonly T[],
): T {
  const value = obj[key];
  if (typeof value !== "string" || !(choices as readonly string[]).includes(value)) {
    throw new CharacterParseError(
      `${key} が不正な値です(許可: ${choices.join(", ")}): ${String(value)}`,
    );
  }
  return value as T;
}

/** 指定キーのオブジェクト値を検証付きで読み取ります。 */
function readObject(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = obj[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CharacterParseError(`${key} がオブジェクトではありません`);
  }
  return value as Record<string, unknown>;
}

/** specialMove オブジェクトを検証付きで読み取ります。 */
function readSpecialMove(obj: Record<string, unknown>): GeneratedStats["specialMove"] {
  const move = readObject(obj, "specialMove");
  const type = readChoice(move, "type", SPECIAL_MOVE_TYPES);
  const ailmentChoice = readChoice(move, "ailment", AILMENT_CHOICES);

  // 異常タイプの技には必ず具体的な状態異常が必要です(Fail-Fast)。
  // それ以外のタイプでは ailment を使用しないため null に正規化します
  let ailment: AilmentType | null = null;
  if (type === "ailment") {
    if (ailmentChoice === "none") {
      throw new CharacterParseError(
        "異常タイプの必殺技に ailment(poison/paralysis/burn/freeze)が指定されていません",
      );
    }
    ailment = ailmentChoice;
  }

  return {
    name: readText(move, "name"),
    type,
    power: readInt(move, "power", STAT_RANGES.specialPower),
    mpCost: readInt(move, "mpCost", STAT_RANGES.specialMpCost),
    ailment,
    description: readText(move, "description"),
  };
}

/**
 * passive オブジェクトを検証付きで読み取ります。
 * idは抽選済みの候補(allowedPassiveIds)に含まれる値だけを許可します。
 */
function readPassive(
  obj: Record<string, unknown>,
  allowedPassiveIds: readonly PassiveSkillId[],
): PassiveSkill {
  const passive = readObject(obj, "passive");
  return {
    id: readChoice(passive, "id", allowedPassiveIds),
    name: readText(passive, "name"),
    description: readText(passive, "description"),
  };
}
