/**
 * @file アプリの全データを一括削除するモジュールです。
 * 設定パネルの「データを全て削除」ボタンから呼び出します。
 *
 * 保存キーは既存の repository.ts / stage-repository.ts / bgm.ts / se.ts が
 * すべて "image-battler:" プレフィックスで統一しているため、キー名を個別に
 * 列挙せずプレフィックス一致で削除します(保存キーが増えても対応不要です)。
 */

/** image-battler が保存するlocalStorageキーの共通プレフィックスです。 */
const STORAGE_KEY_PREFIX = "image-battler:";

/**
 * image-battler が保存したlocalStorageのデータをすべて削除します。
 * @param storage 削除対象(テストではフェイクを注入できます)
 */
export function resetAllData(storage: Storage = localStorage): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}
