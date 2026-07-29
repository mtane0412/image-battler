/**
 * @file 全データ一括リセットモジュール(reset.ts)のテストです。
 *
 * 検証項目:
 * - resetAllData: "image-battler:" プレフィックスのキーだけを削除し、
 *   他アプリ・他用途のキーは残すこと
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetAllData } from "./reset";

describe("resetAllData", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("image-battler:プレフィックスのキーをすべて削除する", () => {
    localStorage.setItem("image-battler:characters", "山田太郎のデータ");
    localStorage.setItem("image-battler:stages", "闘技場のデータ");
    localStorage.setItem("image-battler:bgm-enabled", "on");

    resetAllData();

    expect(localStorage.getItem("image-battler:characters")).toBeNull();
    expect(localStorage.getItem("image-battler:stages")).toBeNull();
    expect(localStorage.getItem("image-battler:bgm-enabled")).toBeNull();
  });

  it("image-battler:以外のプレフィックスのキーは削除しない", () => {
    localStorage.setItem("image-battler:characters", "山田太郎のデータ");
    localStorage.setItem("other-app:setting", "他アプリの設定");

    resetAllData();

    expect(localStorage.getItem("image-battler:characters")).toBeNull();
    expect(localStorage.getItem("other-app:setting")).toBe("他アプリの設定");
  });

  it("保存データが何もない場合でもエラーにならない", () => {
    expect(() => resetAllData()).not.toThrow();
  });

  it("新しく増えたimage-battler:キーも将来的な追加対応なしに削除できる", () => {
    localStorage.setItem("image-battler:se-volume", "0.5");
    localStorage.setItem("image-battler:bgm-volume", "0.25");

    resetAllData();

    expect(localStorage.length).toBe(0);
  });
});
