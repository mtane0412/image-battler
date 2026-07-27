/**
 * @file 画面遷移の型定義です。ゲームは3画面(ホーム・キャラ作成・バトル)を
 * 単純な状態機械として切り替えます。
 */
import type { Character } from "../types";

/** 表示中の画面を表す状態です。 */
export type Screen =
  | { name: "home" }
  | { name: "create" }
  | { name: "battle"; first: Character; second: Character };

/** 各画面に渡される遷移用コンテキストです。 */
export interface AppContext {
  navigate(screen: Screen): void;
}
