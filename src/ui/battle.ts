/**
 * @file バトル画面です。バトルの展開は battle/engine.ts が決定論的に計算し、
 * この画面はその結果を順番に再生します。実況セリフは Gemini Nano が生成します。
 *
 * フォールバック方針(明示): 実況(演出)の生成に失敗してもバトル本体は
 * JavaScript側の計算で完結しているため、失敗をログに明示した上で
 * メカニカルなログのみで進行を続けます。キャラクター生成と異なり、
 * 実況失敗でゲーム全体を停止しない設計です(README参照)。
 */
import type { BattleEvent, Character } from "../types";
import { simulateBattle } from "../battle/engine";
import { createNarrationSession, narrateOnce } from "../ai/nano";
import {
  buildIntroPrompt,
  buildNarrationPrompt,
  buildResultPrompt,
} from "../ai/prompts";
import { describeEvent } from "./format";
import { el } from "./dom";
import type { AppContext } from "./navigation";

/** イベント間の待ち時間(ミリ秒)です。 */
const EVENT_INTERVAL_MS = 450;
/** タイプライター表示の1文字あたりの間隔(ミリ秒)です。 */
const TYPE_INTERVAL_MS = 28;

/** バトル画面を描画し、再生を開始します。 */
export function renderBattle(
  ctx: AppContext,
  first: Character,
  second: Character,
): HTMLElement {
  const screen = el("section", { className: "screen battle-screen" });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 画面を離れたら再生ループを止めるためのフラグです
  let aborted = false;

  // --- ステージ(ファイター2体とHPバー) ---
  const p1 = fighterBlock(first, "p1");
  const p2 = fighterBlock(second, "p2");
  const stage = el("div", { className: "stage" }, [
    p1.root,
    el("span", { className: "vs-mark stage-vs", text: "VS" }),
    p2.root,
  ]);

  // --- メッセージウィンドウ(レトロRPG風・シグネチャ要素) ---
  const logWindow = el("div", {
    className: "msg-window",
    attrs: { role: "log", "aria-live": "polite" },
  });

  const resultBanner = el("div", { className: "result-banner" });

  const homeButton = el("button", {
    className: "btn btn-ghost",
    text: "← ホームへ",
    attrs: { type: "button" },
  });
  homeButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "home" });
  });
  const rematchButton = el("button", {
    className: "btn btn-primary",
    text: "もう一度たたかう",
    attrs: { type: "button", hidden: "" },
  });
  rematchButton.addEventListener("click", () => {
    aborted = true;
    ctx.navigate({ name: "battle", first, second });
  });

  screen.append(
    stage,
    logWindow,
    resultBanner,
    el("div", { className: "battle-controls" }, [homeButton, rematchButton]),
  );

  void playBattle();
  return screen;

  /** バトル全体を再生します。 */
  async function playBattle(): Promise<void> {
    const result = simulateBattle(first, second, Math.random);
    const byId: Record<string, { character: Character; block: FighterBlock }> = {
      [first.id]: { character: first, block: p1 },
      [second.id]: { character: second, block: p2 },
    };

    // 実況セッションの用意(失敗は明示してメカニカルログのみで続行します)
    let narrator: LanguageModelSession | null = null;
    try {
      narrator = await createNarrationSession();
    } catch (error) {
      await typeLine(
        `(実況を利用できません: ${error instanceof Error ? error.message : String(error)})`,
        "warn",
      );
    }

    await typeLine(
      `${first.name} 対 ${second.name}! バトルスタート!`,
      "system",
    );
    if (narrator !== null) {
      try {
        await typeLine(
          await narrateOnce(narrator, buildIntroPrompt(first, second)),
          "narration",
        );
      } catch (error) {
        await typeLine(
          `(実況の生成に失敗したため、実況なしで進行します: ${error instanceof Error ? error.message : String(error)})`,
          "warn",
        );
        narrator = null;
      }
    }

    for (const event of result.events) {
      if (aborted) {
        return;
      }
      const attacker = byId[event.attackerId];
      const defender = byId[event.defenderId];
      if (attacker === undefined || defender === undefined) {
        throw new Error(`イベントのIDが不正です: ${event.attackerId}`);
      }

      // 実況の生成は先に始めておき、メカニカルログの表示と並行させます
      const narrationPromise =
        narrator === null
          ? null
          : narrateOnce(narrator, buildNarrationPrompt({
              attackerName: attacker.character.name,
              defenderName: defender.character.name,
              type: event.type,
              critical: event.critical,
              damage: event.damage,
              defenderHpAfter: event.defenderHpAfter,
              defenderMaxHp: defender.character.hp,
              specialMoveName: attacker.character.specialMove.name,
            }));

      animateAttack(attacker.block, defender.block, event);
      await typeLine(
        describeEvent(
          event,
          attacker.character.name,
          defender.character.name,
          attacker.character.specialMove.name,
        ),
        event.type === "special" ? "special" : "system",
      );
      defender.block.setHp(event.defenderHpAfter, defender.character.hp);
      logWindow.scrollTop = logWindow.scrollHeight;

      if (narrationPromise !== null) {
        try {
          const text = await narrationPromise;
          if (aborted) {
            return;
          }
          await typeLine(text, "narration");
        } catch (error) {
          // 実況失敗はここで明示し、以降の実況を停止します(暗黙に握りつぶさない)
          await typeLine(
            `(実況の生成に失敗したため、以降は実況なしで進行します: ${error instanceof Error ? error.message : String(error)})`,
            "warn",
          );
          narrator = null;
        }
      }
      await pacedWait(reducedMotion ? 80 : EVENT_INTERVAL_MS);
    }

    if (aborted) {
      return;
    }
    showResult(result.winnerId, byId);
    if (narrator !== null) {
      const winner = result.winnerId === null ? null : byId[result.winnerId];
      const loser = result.loserId === null ? null : byId[result.loserId];
      const prompt =
        winner !== undefined && winner !== null && loser !== undefined && loser !== null
          ? buildResultPrompt(winner.character.name, loser.character.name, false)
          : buildResultPrompt(first.name, second.name, true);
      try {
        await typeLine(await narrateOnce(narrator, prompt), "narration");
      } catch (error) {
        await typeLine(
          `(実況の生成に失敗しました: ${error instanceof Error ? error.message : String(error)})`,
          "warn",
        );
      }
      narrator.destroy();
    }
    rematchButton.hidden = false;
  }

  /** 勝敗バナーを表示します。 */
  function showResult(
    winnerId: string | null,
    byId: Record<string, { character: Character; block: FighterBlock }>,
  ): void {
    if (winnerId === null) {
      resultBanner.append(
        el("span", { className: "result-word", text: "DRAW" }),
        el("span", { className: "result-name", text: "りょうしゃ ゆずらず!" }),
      );
      return;
    }
    const winner = byId[winnerId];
    if (winner === undefined) {
      return;
    }
    winner.block.root.classList.add("fighter-winner");
    resultBanner.append(
      el("span", { className: "result-word", text: "WINNER" }),
      el("span", {
        className: "result-name",
        text: `「${winner.character.title}」${winner.character.name}`,
      }),
    );
  }

  /** 攻撃アニメーション(踏み込み+被弾シェイク)を適用します。 */
  function animateAttack(
    attacker: FighterBlock,
    defender: FighterBlock,
    event: BattleEvent,
  ): void {
    if (reducedMotion) {
      return;
    }
    attacker.root.classList.remove("lunge");
    defender.root.classList.remove("shake", "flash");
    // 再適用のためリフローを挟みます
    void attacker.root.offsetWidth;
    attacker.root.classList.add("lunge");
    if (event.type !== "miss") {
      defender.root.classList.add(event.type === "special" ? "flash" : "shake");
    }
  }

  /**
   * メッセージウィンドウに1行タイプライター表示します。
   *
   * バックグラウンドタブでは Chrome が連鎖タイマーを強く間引く
   * (最終的に毎分1回)ため、1文字ずつの待機には依存しません。
   * - タブ非表示時: 即座に全文を表示します
   * - 表示時: 経過時間から表示すべき文字数を計算し、タイマーが遅延しても
   *   まとめて追いつくキャッチアップ方式で描画します
   */
  async function typeLine(
    text: string,
    kind: "system" | "narration" | "special" | "warn",
  ): Promise<void> {
    const line = el("p", { className: `log-line log-${kind} typing` });
    if (kind === "narration") {
      line.append(el("span", { className: "log-mic", text: "実況" }));
    }
    const body = el("span");
    line.append(body);
    logWindow.append(line);
    logWindow.scrollTop = logWindow.scrollHeight;
    if (!reducedMotion && !document.hidden) {
      const chars = [...text];
      const startedAt = performance.now();
      let shown = 0;
      while (shown < chars.length) {
        if (aborted || document.hidden) {
          break;
        }
        await pacedWait(TYPE_INTERVAL_MS);
        const elapsed = performance.now() - startedAt;
        shown = Math.max(
          shown + 1,
          Math.min(chars.length, Math.floor(elapsed / TYPE_INTERVAL_MS)),
        );
        body.textContent = chars.slice(0, shown).join("");
        logWindow.scrollTop = logWindow.scrollHeight;
      }
    }
    body.textContent = text;
    line.classList.remove("typing");
    logWindow.scrollTop = logWindow.scrollHeight;
  }
}

/** ファイター表示ブロック(画像・名前・HPバー)です。 */
interface FighterBlock {
  root: HTMLElement;
  setHp(current: number, max: number): void;
}

/** ファイターブロックを生成します。 */
function fighterBlock(character: Character, side: "p1" | "p2"): FighterBlock {
  const hpFill = el("span", { className: "hp-fill hp-high" });
  const hpText = el("span", {
    className: "hp-text",
    text: `${character.hp}/${character.hp}`,
  });
  const root = el("div", { className: `fighter fighter-${side}` }, [
    el("div", { className: "fighter-portrait" }, [
      el("img", {
        attrs: { src: character.imageDataUrl, alt: `${character.name}の画像` },
      }),
    ]),
    el("p", { className: "fighter-title", text: character.title }),
    el("p", { className: "fighter-name", text: character.name }),
    el("div", { className: "hp-bar" }, [hpFill]),
    hpText,
  ]);
  return {
    root,
    setHp(current: number, max: number): void {
      const ratio = current / max;
      hpFill.style.width = `${ratio * 100}%`;
      hpFill.className = `hp-fill ${ratio > 0.5 ? "hp-high" : ratio > 0.2 ? "hp-mid" : "hp-low"}`;
      hpText.textContent = `${current}/${max}`;
    },
  };
}

/**
 * 演出用の待機です。タブが非表示の間はタイマーが強く間引かれ
 * バトルが数十分単位で停止してしまうため、非表示時は待たずに即座に
 * 解決します(バックグラウンドでもバトルを完走させる明示的な仕様です)。
 */
function pacedWait(ms: number): Promise<void> {
  if (document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
