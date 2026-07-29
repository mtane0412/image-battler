/**
 * @file アプリのルート(画面切り替え)です。ヘッダーと現在の画面を描画します。
 * BGMを鳴らし続ける画面(BGM_SCREENS)以外へ切り替わるときにBGMを停止します
 * (ヘッダーのロゴなど、どの経路でバトル画面を離れても確実に止めるため、
 * ここで一括して行います)。
 */
import { el } from "./dom";
import type { AppContext, Screen } from "./navigation";
import { renderHome } from "./home";
import { renderCreate } from "./create";
import { renderStageCreate } from "./stage-create";
import { renderBattle, renderRoyale, renderStoryBattle } from "./battle";
import { renderStoryOpening } from "./story-opening";
import { renderStoryPart } from "./story-part";
import { renderStoryEnding } from "./story-ending";
import { getSharedBgmPlayer } from "../audio/bgm";
import { createSettingsPanel } from "./settings-panel";
import { GITHUB_ICON_SVG } from "./icons";

/**
 * BGMを鳴らし続ける画面です。ストーリーモードはプロローグ(story-opening)・
 * 章(story-part)・バトル(story-battle)を行き来しても曲が途切れないよう、
 * すべて含めます。
 */
const BGM_SCREENS: ReadonlySet<Screen["name"]> = new Set([
  "battle",
  "royale",
  "story-opening",
  "story-part",
  "story-battle",
]);

/** GitHubリポジトリのURLです。 */
const GITHUB_REPO_URL = "https://github.com/mtane0412/image-battler";

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

  const settingsPanel = createSettingsPanel();

  const githubLink = el("a", {
    className: "icon-button github-link",
    attrs: {
      href: GITHUB_REPO_URL,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": "GitHubリポジトリを開く",
    },
  });
  githubLink.innerHTML = GITHUB_ICON_SVG;

  const headerActions = el("div", { className: "header-actions" }, [
    settingsPanel.trigger,
    githubLink,
  ]);

  const header = el("header", { className: "app-header" }, [
    logoButton,
    el("span", { className: "app-tagline", text: "IMAGE BATTLE ARENA" }),
    headerActions,
  ]);

  // プライバシーと使用モデルの説明です(どの画面でも常に確認できるようフッターに置きます)
  const footer = el("footer", { className: "app-footer" }, [
    el("p", {
      text: "🔒 画像がサーバーにアップロードされることはありません。画像の解析・キャラクター生成・バトルは、すべてブラウザの中だけで完結します。",
    }),
    el("p", {
      text: "キャラクター生成には Chrome 内蔵のローカルAI「Gemini Nano」を使用します(初回のみ数GBのモデルを端末にダウンロードします)。",
    }),
    // 音素材のクレジット表記です(各サイトの利用規約に従い、配布元リンクを併記します)
    el("p", { className: "app-credits" }, [
      "BGM: ",
      el("a", {
        text: "魔王魂",
        attrs: {
          href: "https://maou.audio/",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      " / 効果音: ",
      el("a", {
        text: "効果音ラボ",
        attrs: {
          href: "https://soundeffect-lab.info/",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ]),
  ]);

  root.replaceChildren(header, main, footer, settingsPanel.overlay);

  function render(screen: Screen): void {
    // BGM_SCREENS以外ではBGMを止めます(再生の開始は各画面側で行います)
    if (!BGM_SCREENS.has(screen.name)) {
      getSharedBgmPlayer().stop();
    }
    switch (screen.name) {
      case "home":
        main.replaceChildren(renderHome(ctx));
        break;
      case "create":
        main.replaceChildren(renderCreate(ctx));
        break;
      case "stage-create":
        main.replaceChildren(renderStageCreate(ctx));
        break;
      case "battle":
        main.replaceChildren(
          renderBattle(ctx, screen.firstTeam, screen.secondTeam, screen.stage),
        );
        break;
      case "royale":
        main.replaceChildren(
          renderRoyale(ctx, screen.fighters, screen.stage),
        );
        break;
      case "story-opening":
        main.replaceChildren(renderStoryOpening(ctx, screen.run));
        break;
      case "story-part":
        main.replaceChildren(renderStoryPart(ctx, screen.run));
        break;
      case "story-battle":
        main.replaceChildren(renderStoryBattle(ctx, screen.run));
        break;
      case "story-ending":
        main.replaceChildren(renderStoryEnding(ctx, screen.run));
        break;
    }
    window.scrollTo(0, 0);
  }

  render({ name: "home" });
}
