/**
 * @file 画面遷移の型定義です。ゲームはホーム・キャラ作成・ステージ作成・
 * バトル(チーム戦/バトルロイヤル)・ストーリー(パート/バトル/エンディング)の
 * 画面を単純な状態機械として切り替えます。
 */
import type { Character, Stage } from "../types";
import type { StoryRun } from "../story/plan";

/**
 * 表示中の画面を表す状態です。バトルは1v1・2v2共通でチーム配列を、
 * バトルロイヤル(完全FFA)は参加者の配列を渡します。stage は選択中のステージで、
 * 未選択(デフォルトステージ)の場合は null です。
 *
 * ストーリーモードは進行中の物語(StoryRun)を画面間で受け渡します。plan は
 * 開始時に確定した不変の計画、results は決着済みの章の記録です
 * (story-opening(プロローグ) → story-part → story-battle → 次の
 * story-part、または全章終了時は story-ending へ遷移します)。
 */
export type Screen =
  | { name: "home" }
  | { name: "create" }
  | { name: "stage-create" }
  | {
      name: "battle";
      firstTeam: Character[];
      secondTeam: Character[];
      stage: Stage | null;
    }
  | { name: "royale"; fighters: Character[]; stage: Stage | null }
  | { name: "story-opening"; run: StoryRun }
  | { name: "story-part"; run: StoryRun }
  | { name: "story-battle"; run: StoryRun }
  | { name: "story-ending"; run: StoryRun };

/** 各画面に渡される遷移用コンテキストです。 */
export interface AppContext {
  navigate(screen: Screen): void;
}
