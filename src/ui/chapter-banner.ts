/**
 * @file ストーリーモードの章バナーです。
 * 「第N話」とその章のステージ名を表示します。全体の章数は、いま何話目かを
 * かえって分かりづらくする(例:「第3話 / 全4話」)ため表示しません。
 * ストーリーパート画面(ui/story-part.ts)とバトル画面のストーリー章再生
 * (ui/battle.ts)の両方で使う共通部品です。
 */
import { el } from "./dom";

/**
 * デフォルトステージ(未選択)の表示名です。
 * home.ts のステージロースターで使う呼称と揃えています。
 * ストーリーモードの章ナレーション生成プロンプト(ui/story-part.ts)でも
 * 同じ呼称を使うため export しています。
 */
export const DEFAULT_STAGE_DISPLAY_NAME = "イメージバトルアリーナ";

/** 章バナーに表示する情報です。 */
export interface ChapterBannerInfo {
  /** 1始まりの章番号 */
  chapterIndex: number;
  /** この章のステージ名(デフォルトステージの場合は null) */
  stageName: string | null;
}

/** 「第N話 — ステージ名」の章バナー要素を作ります。 */
export function chapterBanner(info: ChapterBannerInfo): HTMLElement {
  const { chapterIndex, stageName } = info;
  return el("div", { className: "chapter-banner" }, [
    el("span", {
      className: "chapter-banner-index",
      text: `第${chapterIndex}話`,
    }),
    el("span", {
      className: "chapter-banner-stage",
      text: stageName ?? DEFAULT_STAGE_DISPLAY_NAME,
    }),
  ]);
}
