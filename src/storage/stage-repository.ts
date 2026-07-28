/**
 * @file ステージの永続化リポジトリです。localStorage に JSON で保存します。
 * キャラクターの永続化(storage/repository.ts)と同じ設計方針(バージョン付き
 * 保存形式・Fail-Fast なエラー処理)を踏襲します。
 *
 * Fail-Fast 方針: 保存データの破損・容量超過・未対応バージョン・
 * 未定義の特性/イベントidは補正・黙殺せず StorageError を投げ、
 * UI側でユーザーに通知します。特性/イベントidはバトルエンジンの
 * switch/テーブル参照キーになるため、将来のリネーム事故を防ぐ目的で
 * STAGE_TRAIT_IDS/STAGE_EVENT_IDS に含まれるかを保存データの読込時に検証します。
 */
import type { Stage } from "../types";
import { STAGE_EVENT_IDS, STAGE_TRAIT_IDS } from "../types";
import { StorageError } from "./repository";

/** localStorage のキーです。 */
export const STAGE_STORAGE_KEY = "image-battler:stages";

/** 保存データのスキーマバージョンです。 */
export const STAGE_STORAGE_VERSION = 1;

/**
 * 保存済みステージとして最低限の形をしているかを検証します。
 * trait.id / event.id はエンジンの switch/テーブル参照キーになるため、
 * 定義済みの一覧に含まれるかまで厳密に検証します。
 */
function isStageLike(value: unknown): value is Stage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const trait = (value as { trait?: unknown }).trait;
  const event = (value as { event?: unknown }).event;
  if (typeof trait !== "object" || trait === null) {
    return false;
  }
  if (typeof event !== "object" || event === null) {
    return false;
  }
  const traitId = (trait as { id?: unknown }).id;
  const eventId = (event as { id?: unknown }).id;
  return (
    (STAGE_TRAIT_IDS as readonly unknown[]).includes(traitId) &&
    (STAGE_EVENT_IDS as readonly unknown[]).includes(eventId)
  );
}

/**
 * 保存済みステージを保存順に返します。
 * @throws StorageError 保存データが壊れている場合
 */
export function loadStages(storage: Storage = localStorage): Stage[] {
  const raw = storage.getItem(STAGE_STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorageError(
      "ステージの保存データが壊れています。ブラウザの localStorage を確認してください。",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new StorageError(
      "ステージの保存データの形式が不正です(バージョン付き形式ではありません)。",
    );
  }
  const envelope = parsed as { version?: unknown; stages?: unknown };
  if (
    envelope.version === STAGE_STORAGE_VERSION &&
    Array.isArray(envelope.stages)
  ) {
    if (!envelope.stages.every(isStageLike)) {
      throw new StorageError(
        "ステージの保存データの形式が不正です(未定義の特性/イベントidを含むか、ステージデータを解析できません)。",
      );
    }
    return envelope.stages;
  }
  if (typeof envelope.version === "number") {
    throw new StorageError(
      `ステージの保存データのバージョン(${envelope.version})に対応していません。`,
    );
  }
  throw new StorageError(
    "ステージの保存データの形式が不正です(バージョン付き形式ではありません)。",
  );
}

/**
 * ステージを末尾に追加保存します。
 * @throws StorageError 容量超過などで保存に失敗した場合
 */
export function saveStage(
  stage: Stage,
  storage: Storage = localStorage,
): void {
  const stages = loadStages(storage);
  stages.push(stage);
  writeAll(stages, storage);
}

/** 指定IDのステージを削除します。 */
export function deleteStage(
  id: string,
  storage: Storage = localStorage,
): void {
  const stages = loadStages(storage).filter((s) => s.id !== id);
  writeAll(stages, storage);
}

/** 全件をバージョン付きの現行形式で書き戻します。 */
function writeAll(stages: Stage[], storage: Storage): void {
  try {
    storage.setItem(
      STAGE_STORAGE_KEY,
      JSON.stringify({ version: STAGE_STORAGE_VERSION, stages }),
    );
  } catch (error) {
    throw new StorageError(
      `ステージの保存に失敗しました。localStorage の容量超過の可能性があります(保存済み: ${stages.length - 1}件)。原因: ${String(error)}`,
    );
  }
}
