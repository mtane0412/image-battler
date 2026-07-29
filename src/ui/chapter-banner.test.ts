/**
 * @file ストーリーモードの章バナー(chapter-banner.ts)のテストです。
 * ストーリーパート画面とバトル画面のストーリー章再生で共用する表示部品で、
 * 「第N話」とステージ名(未選択時はデフォルトステージ名)を表示します。
 * 全体の章数はいま何話目かをかえって分かりづらくするため表示しません。
 */
import { describe, expect, it } from "vitest";
import { chapterBanner } from "./chapter-banner";

describe("chapterBanner", () => {
  it("章番号を「第N話」の形式で表示する(全体の章数は表示しない)", () => {
    const banner = chapterBanner({
      chapterIndex: 2,
      stageName: "満月の闘技場",
    });
    expect(banner.querySelector(".chapter-banner-index")?.textContent).toBe(
      "第2話",
    );
  });

  it("ステージ名を表示する", () => {
    const banner = chapterBanner({
      chapterIndex: 1,
      stageName: "炎の谷",
    });
    expect(banner.querySelector(".chapter-banner-stage")?.textContent).toBe(
      "炎の谷",
    );
  });

  it("ステージ未選択(null)のときはデフォルトステージ名を表示する", () => {
    const banner = chapterBanner({
      chapterIndex: 1,
      stageName: null,
    });
    expect(banner.querySelector(".chapter-banner-stage")?.textContent).toBe(
      "イメージバトルアリーナ",
    );
  });
});
