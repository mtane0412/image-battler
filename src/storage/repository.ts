/**
 * @file キャラクターの永続化リポジトリです。localStorage に JSON で保存します。
 * サーバーを使わない完全無料運用のため、永続化はブラウザ内で完結します。
 *
 * Fail-Fast 方針: 保存データの破損や容量超過は補正・黙殺せず StorageError を
 * 投げ、UI側でユーザーに通知します。
 *
 * 旧形式データの自動移行: MP・必殺技タイプ・パッシブ導入前(v0.1.0)の
 * キャラクターは読み込み時にデフォルト値を補完し、対戦可能なまま残します
 * (ユーザーの作成済みキャラクターを失わせないための明示的な移行処理です)。
 */
import type { Character } from "../types";

/** 旧形式キャラクターに補完するデフォルトの最大MPです。 */
const DEFAULT_MP = 50;
/** 旧形式キャラクターの必殺技に補完するデフォルトの消費MPです。 */
const DEFAULT_SPECIAL_MP_COST = 30;

/** localStorage のキーです。 */
export const STORAGE_KEY = "image-battler:characters";

/** 永続化に失敗したときに投げるエラーです。 */
export class StorageError extends Error {
  override name = "StorageError";
}

/**
 * 保存済みキャラクターを保存順に返します。
 * @throws StorageError 保存データが壊れている場合
 */
export function loadCharacters(storage: Storage = localStorage): Character[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorageError(
      "保存データが壊れています。ブラウザの localStorage を確認してください。",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new StorageError("保存データの形式が不正です(配列ではありません)。");
  }
  return (parsed as Character[]).map(migrateCharacter);
}

/**
 * 旧形式(v0.1.0)のキャラクターに新フィールドのデフォルト値を補完します。
 * 新形式のキャラクターはそのまま返します。
 */
function migrateCharacter(stored: Character): Character {
  const specialMove = stored.specialMove;
  return {
    ...stored,
    mp: stored.mp ?? DEFAULT_MP,
    specialMove: {
      ...specialMove,
      // 旧形式の必殺技は全キャラ共通の「単発ダメージ技」だったため attack 扱いにします
      type: specialMove.type ?? "attack",
      mpCost: specialMove.mpCost ?? DEFAULT_SPECIAL_MP_COST,
      ailment: specialMove.ailment ?? null,
    },
    // 旧形式キャラはパッシブなし(null)として扱います
    passive: stored.passive ?? null,
  };
}

/**
 * キャラクターを末尾に追加保存します。
 * @throws StorageError 容量超過などで保存に失敗した場合
 */
export function saveCharacter(
  character: Character,
  storage: Storage = localStorage,
): void {
  const characters = loadCharacters(storage);
  characters.push(character);
  writeAll(characters, storage);
}

/** 指定IDのキャラクターを削除します。 */
export function deleteCharacter(
  id: string,
  storage: Storage = localStorage,
): void {
  const characters = loadCharacters(storage).filter((c) => c.id !== id);
  writeAll(characters, storage);
}

/** 全件を書き戻します。 */
function writeAll(characters: Character[], storage: Storage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(characters));
  } catch (error) {
    throw new StorageError(
      `キャラクターの保存に失敗しました。localStorage の容量超過の可能性があります(保存済み: ${characters.length - 1}体)。原因: ${String(error)}`,
    );
  }
}
