/**
 * @file 画面遷移の型定義です。ゲームはホーム・キャラ作成・バトル(チーム戦/
 * バトルロイヤル)の画面を単純な状態機械として切り替えます。
 */
import type { Character } from "../types";

/**
 * 表示中の画面を表す状態です。バトルは1v1・2v2共通でチーム配列を、
 * バトルロイヤル(完全FFA)は参加者の配列を渡します。
 */
export type Screen =
  | { name: "home" }
  | { name: "create" }
  | { name: "battle"; firstTeam: Character[]; secondTeam: Character[] }
  | { name: "royale"; fighters: Character[] };

/** 各画面に渡される遷移用コンテキストです。 */
export interface AppContext {
  navigate(screen: Screen): void;
}
