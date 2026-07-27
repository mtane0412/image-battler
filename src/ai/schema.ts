/**
 * @file Gemini Nano のキャラクター生成に使う JSON Schema と、
 * モデル出力(JSON文字列)を検証付きでパースする処理です。
 *
 * Fail-Fast 方針: モデル出力が範囲外・欠落・型不一致の場合は補正せずに
 * CharacterParseError を投げます。呼び出し側(UI)が再生成を促します。
 */
import type { GeneratedStats } from "../types";

/** モデル出力の検証に失敗したときに投げるエラーです。 */
export class CharacterParseError extends Error {
  override name = "CharacterParseError";
}

/** 各ステータスの許容範囲です。JSON Schema と検証の双方で使用します。 */
export const STAT_RANGES = {
  hp: { min: 50, max: 150 },
  attack: { min: 20, max: 60 },
  defense: { min: 10, max: 50 },
  speed: { min: 10, max: 100 },
  luck: { min: 0, max: 100 },
  specialPower: { min: 30, max: 80 },
} as const;

/**
 * Prompt API の responseConstraint に渡す JSON Schema です。
 * モデル出力をこの構造に制約します。
 */
export const CHARACTER_GENERATION_SCHEMA = {
  type: "object",
  required: [
    "hp",
    "attack",
    "defense",
    "speed",
    "luck",
    "title",
    "description",
    "specialMove",
  ],
  additionalProperties: false,
  properties: {
    hp: { type: "integer", minimum: STAT_RANGES.hp.min, maximum: STAT_RANGES.hp.max },
    attack: { type: "integer", minimum: STAT_RANGES.attack.min, maximum: STAT_RANGES.attack.max },
    defense: { type: "integer", minimum: STAT_RANGES.defense.min, maximum: STAT_RANGES.defense.max },
    speed: { type: "integer", minimum: STAT_RANGES.speed.min, maximum: STAT_RANGES.speed.max },
    luck: { type: "integer", minimum: STAT_RANGES.luck.min, maximum: STAT_RANGES.luck.max },
    title: { type: "string" },
    description: { type: "string" },
    specialMove: {
      type: "object",
      required: ["name", "power", "description"],
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        power: {
          type: "integer",
          minimum: STAT_RANGES.specialPower.min,
          maximum: STAT_RANGES.specialPower.max,
        },
        description: { type: "string" },
      },
    },
  },
} as const;

/**
 * モデル出力のJSON文字列を検証し、GeneratedStats として返します。
 * @throws CharacterParseError 出力がJSONでない・範囲外・欠落している場合
 */
export function parseGeneratedStats(raw: string): GeneratedStats {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CharacterParseError(
      `モデル出力をJSONとして解釈できませんでした: ${raw.slice(0, 100)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CharacterParseError("モデル出力がオブジェクトではありません");
  }
  const obj = parsed as Record<string, unknown>;

  const stats = {
    hp: readInt(obj, "hp", STAT_RANGES.hp),
    attack: readInt(obj, "attack", STAT_RANGES.attack),
    defense: readInt(obj, "defense", STAT_RANGES.defense),
    speed: readInt(obj, "speed", STAT_RANGES.speed),
    luck: readInt(obj, "luck", STAT_RANGES.luck),
    title: readText(obj, "title"),
    description: readText(obj, "description"),
    specialMove: readSpecialMove(obj),
  } satisfies GeneratedStats;
  return stats;
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

/** specialMove オブジェクトを検証付きで読み取ります。 */
function readSpecialMove(obj: Record<string, unknown>): GeneratedStats["specialMove"] {
  const value = obj["specialMove"];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CharacterParseError("specialMove がオブジェクトではありません");
  }
  const move = value as Record<string, unknown>;
  return {
    name: readText(move, "name"),
    power: readInt(move, "power", STAT_RANGES.specialPower),
    description: readText(move, "description"),
  };
}
