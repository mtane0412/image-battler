/**
 * @file アプリのルート(app.ts)のテストです。
 * ヘッダーのタグライン文言と、プライバシー・ローカルAIの説明フッター、
 * 音素材(魔王魂・効果音ラボ)のクレジット表記が表示されることを確認します。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initApp } from "./app";

describe("initApp", () => {
  beforeEach(() => {
    // 前のテストで保存されたファイターが残らないようにします
    localStorage.clear();
  });

  it("ヘッダーのタグラインに「IMAGE BATTLE ARENA」を表示する", () => {
    const root = document.createElement("div");
    initApp(root);
    const tagline = root.querySelector(".app-tagline");
    expect(tagline?.textContent).toBe("IMAGE BATTLE ARENA");
  });

  it("フッターに画像がサーバーへアップロードされないことを表示する", () => {
    const root = document.createElement("div");
    initApp(root);
    const footer = root.querySelector(".app-footer");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain(
      "画像がサーバーにアップロードされることはありません",
    );
  });

  it("フッターにローカルAI(Gemini Nano)を使用することとモデル容量の目安を表示する", () => {
    const root = document.createElement("div");
    initApp(root);
    const footer = root.querySelector(".app-footer");
    expect(footer?.textContent).toContain("Gemini Nano");
    expect(footer?.textContent).toContain("数GB");
  });

  it("フッターに魔王魂(BGM)と効果音ラボ(効果音)のクレジットをリンク付きで表示する", () => {
    const root = document.createElement("div");
    initApp(root);
    const footer = root.querySelector(".app-footer");
    expect(footer?.textContent).toContain("魔王魂");
    expect(footer?.textContent).toContain("効果音ラボ");
    // 素材サイトの規約に従い、配布元へのリンクを併記します
    expect(
      footer?.querySelector('a[href="https://maou.audio/"]'),
    ).not.toBeNull();
    expect(
      footer?.querySelector('a[href="https://soundeffect-lab.info/"]'),
    ).not.toBeNull();
  });
});
