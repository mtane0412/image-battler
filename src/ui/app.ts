/**
 * @file アプリのルート(画面切り替え)です。ヘッダーと現在の画面を描画します。
 */
import { el } from "./dom";
import type { AppContext, Screen } from "./navigation";
import { renderHome } from "./home";
import { renderCreate } from "./create";
import { renderBattle } from "./battle";

/** アプリを初期化し、ホーム画面を表示します。 */
export function initApp(root: HTMLElement): void {
  const main = el("main", { className: "app-main" });

  const ctx: AppContext = {
    navigate(screen: Screen): void {
      render(screen);
    },
  };

  const logoButton = el("button", {
    className: "app-logo",
    text: "画像バトラー",
    attrs: { type: "button", "aria-label": "ホームへ戻る" },
  });
  logoButton.addEventListener("click", () => ctx.navigate({ name: "home" }));

  const header = el("header", { className: "app-header" }, [
    logoButton,
    el("span", { className: "app-tagline", text: "IMAGE BATTLE ARENA" }),
  ]);

  // プライバシーと使用モデルの説明です(どの画面でも常に確認できるようフッターに置きます)
  const footer = el("footer", { className: "app-footer" }, [
    el("p", {
      text: "🔒 画像がサーバーにアップロードされることはありません。画像の解析・キャラクター生成・バトルは、すべてブラウザの中だけで完結します。",
    }),
    el("p", {
      text: "キャラクター生成には Chrome 内蔵のローカルAI「Gemini Nano」を使用します(初回のみ数GBのモデルを端末にダウンロードします)。",
    }),
  ]);

  root.replaceChildren(header, main, footer);

  function render(screen: Screen): void {
    switch (screen.name) {
      case "home":
        main.replaceChildren(renderHome(ctx));
        break;
      case "create":
        main.replaceChildren(renderCreate(ctx));
        break;
      case "battle":
        main.replaceChildren(renderBattle(ctx, screen.first, screen.second));
        break;
    }
    window.scrollTo(0, 0);
  }

  render({ name: "home" });
}
