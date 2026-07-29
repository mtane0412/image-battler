/**
 * @file ストーリーモードのエンディング画面です。
 *
 * 全章の決着(戦績)からエンディングランクを判定し、ランクに応じた見出し・
 * 効果音・語り口でエンディング本文を生成して表示します。フォールバック方針は
 * 他のAI生成テキストと同じで、生成に失敗しても戦績一覧だけで締められます。
 *
 * この画面には「ホームへ」「もういちど あそぶ」の2つの操作が常に表示されて
 * おり、他の画面(story-opening.ts / story-part.ts / battle.ts)のような
 * 単一の「次へ」操作がないため、ui/message-advance.ts によるクリック送り・
 * 自動進行の統合は行いません。メッセージウィンドウのクリックは、タイプ
 * ライター演出のスキップ(表示中の行を即座に全文表示)のみを行います。
 */
import type { StoryOutcome, StoryRun } from "../story/plan";
import {
  ENDING_RANK_LABELS,
  buildStoryPlan,
  buildStorySummaryLines,
  judgeEndingRank,
  tallyRecord,
} from "../story/plan";
import { buildStoryEndingPrompt } from "../ai/prompts";
import { generateStoryEnding } from "../ai/nano";
import { createTypewriter } from "./typewriter";
import { el } from "./dom";
import type { AppContext } from "./navigation";
import { createSePlayer } from "../audio/se";
import { loadCharacters } from "../storage/repository";
import { loadStages } from "../storage/stage-repository";

/** 章の決着(勝敗)の表示ラベルです(レトロRPG風にひらがなで表します)。 */
const OUTCOME_LABELS = {
  win: "かち",
  lose: "まけ",
  draw: "ひきわけ",
} as const satisfies Record<StoryOutcome, string>;

/** ストーリーモードのエンディング画面を描画し、エンディング本文の生成を開始します。 */
export function renderStoryEnding(ctx: AppContext, run: StoryRun): HTMLElement {
  const screen = el("section", { className: "screen story-ending-screen" });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 画面を離れたらエンディング本文の生成待ちを打ち切るためのフラグです
  let aborted = false;

  const record = tallyRecord(run.results);
  const rank = judgeEndingRank(record);

  // 決着の勢いに合わせて効果音を鳴らします(全勝・勝ち越しは勝利、それ以外は引き分けのファンファーレを流用します)
  const sePlayer = createSePlayer();
  sePlayer.play(rank === "perfect" || rank === "good" ? "victory" : "draw");

  const rankBanner = el("div", {
    className: `ending-rank ending-rank-${rank}`,
    text: ENDING_RANK_LABELS[rank],
  });

  const recordList = el(
    "ul",
    { className: "story-ending-record" },
    run.results.map((result) =>
      el(
        "li",
        {
          className: `story-ending-record-item story-ending-record-${result.outcome}`,
        },
        [
          el("span", {
            className: "story-ending-record-index",
            text: `第${result.index}話`,
          }),
          el("span", {
            className: "story-ending-record-stage",
            text: result.stageName,
          }),
          el("span", {
            className: "story-ending-record-opponent",
            text: result.opponentName,
          }),
          el("span", {
            className: "story-ending-record-outcome",
            text: OUTCOME_LABELS[result.outcome],
          }),
        ],
      ),
    ),
  );
  const summary = el("p", {
    className: "story-ending-summary",
    text: `${record.wins}勝${record.losses}敗${record.draws}分`,
  });

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
  logWindow.addEventListener("click", () => {
    skip();
  });

  const homeButton = el("button", {
    className: "btn btn-ghost",
    text: "← ホームへ",
    attrs: { type: "button" },
  });
  homeButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "home" });
  });

  const retryButton = el("button", {
    className: "btn btn-primary",
    text: "もういちど ストーリーを あそぶ",
    attrs: { type: "button" },
  });
  retryButton.addEventListener("click", () => {
    aborted = true;
    // 保存済みの最新のファイター・ステージから、同じ主人公で新しい物語を
    // 組み立て直します(旅の相手・ステージは毎回ランダムに再抽選されます)
    const characters = loadCharacters();
    const stages = loadStages();
    const others = characters.filter(
      (character) => character.id !== run.plan.protagonist.id,
    );
    const plan = buildStoryPlan(run.plan.protagonist, others, stages);
    ctx.navigate({ name: "story-opening", run: { plan, results: [] } });
  });

  screen.append(
    rankBanner,
    logWindow,
    recordList,
    summary,
    el("div", { className: "story-ending-controls" }, [
      homeButton,
      retryButton,
    ]),
  );

  void playEnding();
  return screen;

  /** エンディング本文を生成しながら表示します(失敗しても戦績表示は既に済んでいます)。 */
  async function playEnding(): Promise<void> {
    const loadingLine = el("p", {
      className: "log-line log-loading",
      text: "むすびを つむいでいます",
    });
    logWindow.append(loadingLine);

    try {
      const ending = await generateStoryEnding(
        buildStoryEndingPrompt({
          protagonist: run.plan.protagonist,
          quest: run.plan.quest,
          summaryLines: buildStorySummaryLines(run),
          record,
          rank,
        }),
      );
      loadingLine.remove();
      if (aborted) {
        return;
      }
      await typeLine(ending, "story");
    } catch (error) {
      loadingLine.remove();
      if (aborted) {
        return;
      }
      await typeLine(
        `(むすびの生成に失敗したため、戦績だけでしめます: ${error instanceof Error ? error.message : String(error)})`,
        "warn",
      );
    }
  }
}
