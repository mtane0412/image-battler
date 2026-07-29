/**
 * @file ストーリーモードのプロローグ画面です。
 *
 * 主人公だけを立ち絵で表示し、旅の目的(quest)を語るオープニングナレーションを
 * 生成します。まだ誰とも出会っていない場面のため、相手や会話はありません。
 * 「たびにでる」を押すと、章の進行(results)はそのままに第1章のストーリー
 * パート画面(ui/story-part.ts)へ進みます。
 *
 * フォールバック方針(story-part.ts / battle.ts と同じ明示的フォールバック):
 * ナレーション生成に失敗しても警告行を表示して続行します。「たびにでる」は
 * 生成の完了を待たずに常に押せます。
 *
 * メッセージ送り(ui/message-advance.ts): 「たびにでる」ボタンは画面外に
 * 隠れがちでテンポが悪いため、表示が完了した後はメッセージウィンドウの
 * クリックでも同じ操作(次の画面へ)ができるようにし、ヒント(▼)を表示します。
 * 一定時間操作がなければ自動的に進みます。表示中のクリックは
 * タイプライター演出のスキップとして扱われます。
 */
import { buildStoryOpeningPrompt } from "../ai/prompts";
import { generateStoryOpening } from "../ai/nano";
import { storyPortrait } from "./story-portrait";
import { createTypewriter } from "./typewriter";
import { createMessageAdvance } from "./message-advance";
import { el } from "./dom";
import type { AppContext } from "./navigation";
import type { StoryRun } from "../story/plan";
import { createSePlayer } from "../audio/se";
import { getSharedBgmPlayer, loadBgmEnabled } from "../audio/bgm";

/** ストーリーモードのプロローグ画面を描画し、オープニングナレーションの生成を開始します。 */
export function renderStoryOpening(
  ctx: AppContext,
  run: StoryRun,
): HTMLElement {
  const screen = el("section", { className: "screen story-opening-screen" });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 画面を離れたらナレーションの生成待ちを打ち切るためのフラグです(story-part.tsと同じ方針)
  let aborted = false;

  const protagonist = run.plan.protagonist;

  // 効果音の準備(メッセージ表示音のループ再生に使います)
  const sePlayer = createSePlayer();
  sePlayer.preload();

  // BGMの準備(設定がONならこの画面から鳴らし始め、以降の画面へ遷移しても途切れさせません)
  const bgmPlayer = getSharedBgmPlayer();
  if (loadBgmEnabled()) {
    bgmPlayer.play();
  }

  const stageArea = el("div", { className: "story-opening-stage" }, [
    storyPortrait(protagonist, "story-portrait-center"),
  ]);

  const logWindow = el("div", {
    className: "msg-window",
    attrs: { role: "log", "aria-live": "polite" },
  });
  const { typeLine, skip } = createTypewriter({
    logWindow,
    sePlayer,
    reducedMotion,
    isAborted: () => aborted,
  });
  const messageAdvance = createMessageAdvance({ isAborted: () => aborted });
  logWindow.addEventListener("click", () => {
    skip();
    messageAdvance.handleClick();
  });

  const homeButton = el("button", {
    className: "btn btn-ghost story-opening-home-button",
    text: "← ホームへ(ちゅうだん)",
    attrs: { type: "button" },
  });
  homeButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "home" });
  });

  const startButton = el("button", {
    className: "btn btn-primary story-opening-start-button",
    text: "たびにでる",
    attrs: { type: "button" },
  });
  startButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "story-part", run });
  });

  screen.append(
    stageArea,
    logWindow,
    el("div", { className: "story-opening-controls" }, [
      homeButton,
      startButton,
    ]),
  );

  void playOpening();
  return screen;

  /** オープニングナレーションを生成しながら表示します。 */
  async function playOpening(): Promise<void> {
    const loadingLine = el("p", {
      className: "log-line log-loading",
      text: "ものがたりの まくを あけています",
    });
    logWindow.append(loadingLine);

    try {
      const opening = await generateStoryOpening(
        buildStoryOpeningPrompt(protagonist, run.plan.quest),
      );
      loadingLine.remove();
      if (aborted) {
        return;
      }
      await typeLine(opening, "story");
    } catch (error) {
      loadingLine.remove();
      if (aborted) {
        return;
      }
      await typeLine(
        `(ものがたりの生成に失敗したため、オープニングなしで進行します: ${error instanceof Error ? error.message : String(error)})`,
        "warn",
      );
    }
    if (aborted) {
      return;
    }
    // 表示が完結したので、以降はメッセージウィンドウのクリック・無操作放置でも
    // 「たびにでる」と同じ操作(第1章へ進む)ができるようにします
    logWindow.append(messageAdvance.hint);
    messageAdvance.ready(() => {
      aborted = true;
      ctx.navigate({ name: "story-part", run });
    });
  }
}
