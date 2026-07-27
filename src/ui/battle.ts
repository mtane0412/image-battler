/**
 * @file バトル画面です。バトルの展開は battle/engine.ts が決定論的に計算し、
 * この画面はその結果を順番に再生します。実況セリフは Gemini Nano が生成します。
 *
 * フォールバック方針(明示): 実況(演出)の生成に失敗してもバトル本体は
 * JavaScript側の計算で完結しているため、失敗をログに明示した上で
 * メカニカルなログのみで進行を続けます。キャラクター生成と異なり、
 * 実況失敗でゲーム全体を停止しない設計です(README参照)。
 *
 * 実況の対象: 行動イベント(通常攻撃・ミス・必殺技・反撃)のみ実況します。
 * 毎ターン発生しうる状態異常の経過(スリップダメージ・行動不能など)は
 * 実況せず、メカニカルログだけで伝えます(実況生成の待ち時間で
 * テンポが落ちるのを防ぐ明示的な仕様です)。
 */
import type {
  AilmentType,
  BattleEvent,
  Character,
  CombatantSnapshot,
} from "../types";
import { AILMENT_LABELS } from "../types";
import { simulateBattle } from "../battle/engine";
import { createNarrationSession, narrateOnce } from "../ai/nano";
import {
  buildIntroPrompt,
  buildNarrationPrompt,
  buildResultPrompt,
  type NarrationParams,
} from "../ai/prompts";
import { describeEvent } from "./format";
import { el } from "./dom";
import type { AppContext } from "./navigation";
import {
  createSePlayer,
  seKeyForEvent,
  selectSpecialSeKey,
  type SeKey,
} from "../audio/se";

/** イベント間の待ち時間(ミリ秒)です。 */
const EVENT_INTERVAL_MS = 450;
/** タイプライター表示の1文字あたりの間隔(ミリ秒)です。 */
const TYPE_INTERVAL_MS = 28;

/** バトル中の1ファイターの表示と設定をまとめた参加者情報です。 */
interface BattleParticipant {
  character: Character;
  block: FighterBlock;
  specialSeKey: SeKey;
}

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

  // 効果音の準備(バトル開始前に先読みします)
  const sePlayer = createSePlayer();
  sePlayer.preload();

  // --- ステージ(ファイター2体とHP/MPバー) ---
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
    // 必殺技の固有効果音はキャラクターごとに一度だけ決定します
    const byId: Record<string, BattleParticipant> = {
      [first.id]: {
        character: first,
        block: p1,
        specialSeKey: selectSpecialSeKey(first.specialMove),
      },
      [second.id]: {
        character: second,
        block: p2,
        specialSeKey: selectSpecialSeKey(second.specialMove),
      },
    };
    // メカニカルログ用のID→表示名の対応表です
    const names: Record<string, string> = {
      [first.id]: first.name,
      [second.id]: second.name,
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

    // 実況セッションの準備待ちの間に画面を離れた場合はここで打ち切ります
    // (離脱後にゴングが鳴る・セッションがリークするのを防ぎます)
    if (aborted) {
      narrator?.destroy();
      return;
    }
    sePlayer.play("start");
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
      const actor = byId[event.actorId];
      const target = byId[event.targetId];
      if (actor === undefined || target === undefined) {
        throw new Error(`イベントのIDが不正です: ${event.actorId}`);
      }

      // 実況の生成は先に始めておき、メカニカルログの表示と並行させます
      const narrationParams = narrationParamsFor(event, actor, target);
      const narrationPromise =
        narrator === null || narrationParams === null
          ? null
          : narrateOnce(narrator, buildNarrationPrompt(narrationParams));

      const seKey = seKeyForEvent(event, actor.specialSeKey);
      if (seKey !== null) {
        sePlayer.play(seKey);
      }
      animateEvent(actor.block, target.block, event);
      await typeLine(describeEvent(event, names), logKindFor(event));
      applySnapshots(event.after, byId);
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
    sePlayer.play(result.winnerId === null ? "draw" : "victory");
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
    byId: Record<string, BattleParticipant>,
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

  /**
   * イベント種別に応じたアニメーションを適用します。
   * 自己対象のイベントでは actor と target が同じブロックになります。
   */
  function animateEvent(
    actor: FighterBlock,
    target: FighterBlock,
    event: BattleEvent,
  ): void {
    if (reducedMotion) {
      return;
    }
    actor.root.classList.remove("lunge", "shake", "flash");
    target.root.classList.remove("lunge", "shake", "flash");
    // 再適用のためリフローを挟みます
    void actor.root.offsetWidth;
    switch (event.type) {
      case "attack":
      case "counter":
        actor.root.classList.add("lunge");
        target.root.classList.add("shake");
        break;
      case "miss":
        actor.root.classList.add("lunge");
        break;
      case "special-attack":
      case "special-ailment":
        actor.root.classList.add("lunge");
        target.root.classList.add("flash");
        break;
      case "special-heal":
      case "special-buff":
        actor.root.classList.add("flash");
        break;
      case "ailment-damage":
        actor.root.classList.add("shake");
        break;
      case "ailment-skip":
      case "ailment-cure":
      case "endure":
        break;
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

/**
 * 実況対象のイベントを実況プロンプトの素材(NarrationParams)に変換します。
 * 実況しないイベント(状態異常の経過・endure)では null を返します。
 */
function narrationParamsFor(
  event: BattleEvent,
  actor: BattleParticipant,
  target: BattleParticipant,
): NarrationParams | null {
  const targetSnapshot = event.after[target.character.id];
  if (targetSnapshot === undefined) {
    // エンジンは常に両者のスナップショットを付与するため、欠落はデータ不正です
    throw new Error(
      `イベントに対象「${target.character.name}」のスナップショットがありません`,
    );
  }
  const base = {
    actorName: actor.character.name,
    targetName: target.character.name,
    targetHpAfter: targetSnapshot.hp,
    targetMaxHp: target.character.hp,
  };
  switch (event.type) {
    case "attack":
      return { ...base, type: "attack", critical: event.critical, damage: event.damage };
    case "miss":
      return { ...base, type: "miss" };
    case "special-attack":
      return { ...base, type: "special-attack", moveName: event.moveName, damage: event.damage };
    case "special-heal":
      return { ...base, type: "special-heal", moveName: event.moveName, healed: event.healed };
    case "special-ailment":
      return {
        ...base,
        type: "special-ailment",
        moveName: event.moveName,
        ailment: event.ailment,
        damage: event.damage,
      };
    case "special-buff":
      return { ...base, type: "special-buff", moveName: event.moveName };
    case "counter": {
      // counter イベントはパッシブ保持者しか起こさないため、欠落はデータ不正です
      const passive = actor.character.passive;
      if (passive === null) {
        throw new Error(
          `反撃イベントの行動者「${actor.character.name}」がパッシブを持っていません`,
        );
      }
      return { ...base, type: "counter", passiveName: passive.name, damage: event.damage };
    }
    case "ailment-damage":
    case "ailment-skip":
    case "ailment-cure":
    case "endure":
      return null;
  }
}

/** イベント適用後のスナップショットを両ファイターの表示に反映します。 */
function applySnapshots(
  after: Record<string, CombatantSnapshot>,
  byId: Record<string, BattleParticipant>,
): void {
  for (const [id, participant] of Object.entries(byId)) {
    const snapshot = after[id];
    if (snapshot !== undefined) {
      participant.block.applySnapshot(snapshot);
    }
  }
}

/** イベント種別に応じたログの表示スタイルを返します。 */
function logKindFor(event: BattleEvent): "system" | "special" {
  switch (event.type) {
    case "special-attack":
    case "special-heal":
    case "special-ailment":
    case "special-buff":
      return "special";
    default:
      return "system";
  }
}

/** ファイター表示ブロック(画像・名前・HP/MPバー・状態異常バッジ)です。 */
interface FighterBlock {
  root: HTMLElement;
  /** HP・MP・状態異常の表示を戦闘状態のスナップショットに同期します。 */
  applySnapshot(snapshot: CombatantSnapshot): void;
}

/** ファイターブロックを生成します。 */
function fighterBlock(character: Character, side: "p1" | "p2"): FighterBlock {
  const hpFill = el("span", { className: "hp-fill hp-high" });
  const hpText = el("span", {
    className: "hp-text",
    text: `${character.hp}/${character.hp}`,
  });
  const mpFill = el("span", {
    className: "mp-fill",
    attrs: { style: "width:100%" },
  });
  const mpText = el("span", {
    className: "mp-text",
    text: `MP ${character.mp}/${character.mp}`,
  });
  const ailmentBadge = el("span", {
    className: "ailment-badge",
    attrs: { hidden: "" },
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
    el("div", { className: "mp-bar" }, [mpFill]),
    mpText,
    ailmentBadge,
  ]);

  /** HPバーと数値表示を更新します。 */
  function setHp(current: number): void {
    const ratio = current / character.hp;
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.className = `hp-fill ${ratio > 0.5 ? "hp-high" : ratio > 0.2 ? "hp-mid" : "hp-low"}`;
    hpText.textContent = `${current}/${character.hp}`;
  }

  /** MPバーと数値表示を更新します。最大MP0のキャラでは0%表示にします。 */
  function setMp(current: number): void {
    const ratio = character.mp === 0 ? 0 : current / character.mp;
    mpFill.style.width = `${ratio * 100}%`;
    mpText.textContent = `MP ${current}/${character.mp}`;
  }

  /** 状態異常バッジの表示を更新します。 */
  function setAilment(ailment: AilmentType | null): void {
    if (ailment === null) {
      ailmentBadge.hidden = true;
      ailmentBadge.className = "ailment-badge";
      return;
    }
    ailmentBadge.hidden = false;
    ailmentBadge.textContent = AILMENT_LABELS[ailment];
    ailmentBadge.className = `ailment-badge ailment-${ailment}`;
  }

  return {
    root,
    applySnapshot(snapshot: CombatantSnapshot): void {
      setHp(snapshot.hp);
      setMp(snapshot.mp);
      setAilment(snapshot.ailment);
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
