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
    el("span", { className: "app-tagline", text: "GEMINI NANO ARENA" }),
  ]);

  root.replaceChildren(header, main);

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
