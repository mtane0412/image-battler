/**
 * @file キャラクターの永続化リポジトリです。localStorage に JSON で保存します。
 * サーバーを使わない完全無料運用のため、永続化はブラウザ内で完結します。
 *
 * 保存形式はバージョン付きです({ version, characters })。
 *
 * Fail-Fast 方針: 保存データの破損・容量超過・未対応バージョンは補正・黙殺せず
 * StorageError を投げ、UI側でユーザーに通知します。
 *
 * 旧形式データの自動移行: バージョンのない生の配列は旧形式として読み込み時に
 * 移行します(ユーザーの作成済みキャラクターを失わせないための明示的な処理です):
 * - v0.1.0(MP・必殺技タイプ・パッシブ導入前)のキャラクターはデフォルト値を補完
 * - HP範囲拡大(50〜150 → 100〜300)前のキャラクターはHPを2倍に補正
 */
import type { Character } from "../types";

/** 旧形式キャラクターに補完するデフォルトの最大MPです。 */
const DEFAULT_MP = 50;
/** 旧形式キャラクターの必殺技に補完するデフォルトの消費MPです。 */
const DEFAULT_SPECIAL_MP_COST = 30;
/** HP範囲拡大(50〜150 → 100〜300)に合わせて旧形式キャラクターのHPに掛ける倍率です。 */
const HP_MIGRATION_FACTOR = 2;

/** localStorage のキーです。 */
export const STORAGE_KEY = "image-battler:characters";

/**
 * 保存データのスキーマバージョンです。
 * バージョンのない生の配列(HP範囲拡大前の形式)は旧形式として自動移行します。
 */
export const STORAGE_VERSION = 2;

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
  // バージョンのない生の配列は旧形式なので自動移行します
  if (Array.isArray(parsed)) {
    try {
      return (parsed as Character[]).map(migrateCharacter);
    } catch (error) {
      // 要素がキャラクターの形をしていない場合(specialMove欠落など)は
      // TypeErrorのまま漏らさず、UIが通知できるStorageErrorに変換します
      throw new StorageError(
        `保存データの形式が不正です(キャラクターデータを解析できません)。原因: ${String(error)}`,
      );
    }
  }
  // バージョン付きの現行形式は移行済みのため、要素の形だけ検証して返します
  if (typeof parsed === "object" && parsed !== null) {
    const envelope = parsed as { version?: unknown; characters?: unknown };
    if (
      envelope.version === STORAGE_VERSION &&
      Array.isArray(envelope.characters)
    ) {
      if (!envelope.characters.every(isCharacterLike)) {
        throw new StorageError(
          "保存データの形式が不正です(キャラクターデータを解析できません)。",
        );
      }
      return envelope.characters as Character[];
    }
    if (typeof envelope.version === "number") {
      throw new StorageError(
        `保存データのバージョン(${envelope.version})に対応していません。`,
      );
    }
  }
  throw new StorageError(
    "保存データの形式が不正です(バージョン付き形式でも配列でもありません)。",
  );
}

/**
 * 保存済みキャラクターとして最低限の形をしているかを検証します。
 * 旧形式の移行(migrateCharacter)が specialMove へのアクセスで実質的に行っている
 * 検証と同等の水準です(全フィールドの厳密検証は生成時 ai/schema.ts が担います)。
 */
function isCharacterLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const specialMove = (value as { specialMove?: unknown }).specialMove;
  return typeof specialMove === "object" && specialMove !== null;
}

/**
 * バージョンのない旧形式のキャラクターを現行形式へ移行します。
 * - v0.1.0(MP・必殺技タイプ・パッシブ導入前): 新フィールドをデフォルト値で補完します
 * - HP範囲拡大(50〜150 → 100〜300)前: HPを2倍に補正します
 */
function migrateCharacter(stored: Character): Character {
  const specialMove = stored.specialMove;
  return {
    ...stored,
    // 旧範囲(50〜150)で生成されたHPを新範囲(100〜300)に合わせて補正します
    hp: stored.hp * HP_MIGRATION_FACTOR,
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

/** 全件をバージョン付きの現行形式で書き戻します。 */
function writeAll(characters: Character[], storage: Storage): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, characters }),
    );
  } catch (error) {
    throw new StorageError(
      `キャラクターの保存に失敗しました。localStorage の容量超過の可能性があります(保存済み: ${characters.length - 1}体)。原因: ${String(error)}`,
    );
  }
}
