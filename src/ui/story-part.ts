/**
 * @file ストーリーモードのストーリーパート画面です。
 *
 * 章の冒頭で、主人公と相手の立ち絵を向かい合わせに表示し、ナレーション→
 * 相手のセリフ→主人公のセリフの1往復2行の会話劇として見せます(2往復に
 * 増やしてみましたが会話の深みがさほど変わらず、生成の待ち時間だけが
 * 延びたため1往復に戻しています)。バトル展開はこの画面では再生せず、
 * 「たたかう」を押すとバトル画面(ui/battle.ts の renderStoryBattle)へ
 * 遷移します。
 *
 * フォールバック方針(battle.ts と同じ明示的フォールバック): 各生成は独立して
 * 失敗しうるため、失敗した段階で警告行を表示して先へ進みます。ただし
 * 各セリフは直前の生成結果(ナレーション本文・相手のセリフ)を会話の材料に
 * するため、材料そのものが無い場合は次の生成を試みません(存在しない
 * セリフへの返答を捏造しないため)。
 *
 * 三幕構成: 章ナレーションには story/plan.ts の actForChapter で判定した幕
 * (序/破/急)に応じた語り口の指示(ACT_NARRATION_TONES)を渡し、物語全体に
 * 起伏を持たせます(UIには幕を表示しません。全体の章数の表示同様、
 * かえって分かりづらくなるためです)。
 *
 * 「たたかう」ボタンは生成の完了を待たずに常に押せます。押された時点で
 * 以降の生成待ちを打ち切り、即座にバトル画面へ遷移します。
 *
 * メッセージ送り(ui/message-advance.ts): 「たたかう」ボタンは画面外に
 * 隠れがちでテンポが悪いため、会話が出そろった後はメッセージウィンドウの
 * クリックでも同じ操作(バトルへ)ができるようにし、ヒント(▼)を表示します。
 * 一定時間操作がなければ自動的に進みます。表示中のクリックは
 * タイプライター演出のスキップとして扱われます。
 */
import {
  actForChapter,
  ACT_NARRATION_TONES,
  currentChapter,
  describeMomentum,
  buildStorySummaryLines,
  type StoryRun,
} from "../story/plan";
import {
  buildChapterNarrationPrompt,
  buildChapterOpponentLinePrompt,
  buildChapterProtagonistLinePrompt,
} from "../ai/prompts";
import { generateChapterNarration, generateCharacterSpeech } from "../ai/nano";
import { chapterBanner, DEFAULT_STAGE_DISPLAY_NAME } from "./chapter-banner";
import { storyPortrait } from "./story-portrait";
import { createTypewriter } from "./typewriter";
import { createMessageAdvance } from "./message-advance";
import { el } from "./dom";
import type { AppContext } from "./navigation";
import { createSePlayer } from "../audio/se";
import { getSharedBgmPlayer, loadBgmEnabled } from "../audio/bgm";

/**
 * セリフとして許容する最大文字数です。各セリフ生成プロンプトは
 * 「20文字以内で」と指示していますが、実機では小型モデルが指示を無視し、
 * プロンプトの指示文そのものをメタ的に復唱した長文(例:「承知しました。
 * ◯◯への返答を20文字以内で作成します。実際のセリフ。」)を返すことがあります。
 * 指示文字数の倍程度の余裕を見て、明らかに指示に従っていない出力を
 * 検出し、生成失敗として扱います(Fail-Fast。捏造した短縮はしません)。
 */
const MAX_SPEECH_LENGTH = 40;

/** ストーリーパート画面を描画し、章の会話(ナレーション→相手→主人公)の生成を開始します。 */
export function renderStoryPart(ctx: AppContext, run: StoryRun): HTMLElement {
  const screen = el("section", { className: "screen story-part-screen" });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 画面を離れたら会話の生成待ちを打ち切るためのフラグです(battle.tsと同じ方針)
  let aborted = false;

  const chapter = currentChapter(run);
  const protagonist = run.plan.protagonist;
  const opponent = chapter.opponent;

  // 効果音の準備(メッセージ表示音のループ再生に使います)
  const sePlayer = createSePlayer();
  sePlayer.preload();

  // BGMの準備(設定がONならこの画面から鳴らし始め、バトルへ遷移しても途切れさせません)
  const bgmPlayer = getSharedBgmPlayer();
  if (loadBgmEnabled()) {
    bgmPlayer.play();
  }

  const banner = chapterBanner({
    chapterIndex: chapter.index,
    stageName: chapter.stage?.title ?? null,
  });

  const stageArea = el("div", { className: "story-part-stage" }, [
    storyPortrait(protagonist, "story-portrait-left"),
    el("span", { className: "vs-mark story-part-vs", text: "VS" }),
    storyPortrait(opponent, "story-portrait-right"),
  ]);
  if (chapter.stage !== null) {
    stageArea.classList.add("stage-has-background");
    stageArea.style.setProperty(
      "--stage-bg-image",
      `url(${JSON.stringify(chapter.stage.imageDataUrl)})`,
    );
  }

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
    className: "btn btn-ghost story-part-home-button",
    text: "← ホームへ(ちゅうだん)",
    attrs: { type: "button" },
  });
  homeButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "home" });
  });

  const battleButton = el("button", {
    className: "btn btn-primary story-part-fight-button",
    text: "たたかう",
    attrs: { type: "button" },
  });
  battleButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "story-battle", run });
  });

  screen.append(
    banner,
    stageArea,
    logWindow,
    el("div", { className: "story-part-controls" }, [homeButton, battleButton]),
  );

  void playStoryPart();
  return screen;

  /** 章の会話(ナレーション→相手のセリフ→主人公のセリフ)を生成しながら表示します。 */
  async function playStoryPart(): Promise<void> {
    const loadingLine = el("p", {
      className: "log-line log-loading",
      text: "ものがたりを つむいでいます",
    });
    logWindow.append(loadingLine);

    let narration: string | null = null;
    try {
      narration = await generateChapterNarration(
        buildChapterNarrationPrompt({
          protagonist,
          opponent,
          quest: run.plan.quest,
          encounter: chapter.encounter,
          stageName: chapter.stage?.title ?? DEFAULT_STAGE_DISPLAY_NAME,
          chapterIndex: chapter.index,
          chapterCount: run.plan.chapters.length,
          summaryLines: buildStorySummaryLines(run),
          momentum: describeMomentum(run.results),
          tone: ACT_NARRATION_TONES[
            actForChapter(chapter.index, run.plan.chapters.length)
          ],
        }),
      );
      loadingLine.remove();
      if (aborted) {
        return;
      }
      await typeLine(narration, "story");
    } catch (error) {
      loadingLine.remove();
      if (aborted) {
        return;
      }
      await typeLine(
        `(ものがたりの生成に失敗したため、ナレーションなしで進行します: ${error instanceof Error ? error.message : String(error)})`,
        "warn",
      );
    }
    if (aborted) {
      return;
    }
    if (narration === null) {
      finishTurn();
      return;
    }

    /**
     * 1つのセリフを生成して表示します。成功すればセリフ本文を、失敗した
     * (または画面を離れて中断した)場合は null を返します。呼び出し側は
     * null が返ったら以降の会話をすべて打ち切ります。
     * 生成結果が MAX_SPEECH_LENGTH を大きく超える場合は、指示に従っていない
     * 壊れた出力とみなし、表示せず失敗として扱います。
     */
    async function trySpeak(
      speakerName: string,
      promptText: string,
    ): Promise<string | null> {
      try {
        const line = await generateCharacterSpeech(promptText);
        if (aborted) {
          return null;
        }
        if ([...line].length > MAX_SPEECH_LENGTH) {
          throw new Error(
            `セリフが指示された文字数を大きく超えています(${[...line].length}文字)`,
          );
        }
        await typeLine(`${speakerName}「${line}」`, "speech");
        return line;
      } catch (error) {
        if (aborted) {
          return null;
        }
        await typeLine(
          `(セリフの生成に失敗したため、${speakerName}のセリフなしで進行します: ${error instanceof Error ? error.message : String(error)})`,
          "warn",
        );
        return null;
      }
    }

    // 相手のセリフ→主人公のセリフ(1往復)
    const opponentLine = await trySpeak(
      opponent.name,
      buildChapterOpponentLinePrompt(
        opponent,
        protagonist.name,
        narration,
        chapter.ingredients,
      ),
    );
    if (aborted) {
      return;
    }
    if (opponentLine === null) {
      finishTurn();
      return;
    }

    await trySpeak(
      protagonist.name,
      buildChapterProtagonistLinePrompt(
        protagonist,
        opponent.name,
        opponentLine,
        chapter.ingredients,
      ),
    );
    finishTurn();
  }

  /**
   * 章の会話が出そろった時点で呼びます。以降はメッセージウィンドウの
   * クリック・無操作放置でも「たたかう」と同じ操作(バトルへ)ができる
   * ようにします。
   */
  function finishTurn(): void {
    if (aborted) {
      return;
    }
    logWindow.append(messageAdvance.hint);
    messageAdvance.ready(() => {
      aborted = true;
      ctx.navigate({ name: "story-battle", run });
    });
  }
}
