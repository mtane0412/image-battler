/**
 * @file バトル画面です(1v1・2v2共通)。バトルの展開は battle/engine.ts が
 * 決定論的に計算し、この画面はその結果を順番に再生します。
 * 実況セリフは Gemini Nano が生成します。
 *
 * フォールバック方針(明示): 実況・前口上(演出)の生成に失敗してもバトル本体は
 * JavaScript側の計算で完結しているため、失敗をログに明示した上で
 * メカニカルなログのみで進行を続けます。キャラクター生成と異なり、
 * 実況失敗でゲーム全体を停止しない設計です(README参照)。
 *
 * 前口上(ストーリー): バトル開始前に、コード側で抽選した舞台・因縁
 * (ai/story.ts)とキャラクター設定から短いストーリーを生成して表示します。
 * モデルは決定論的なため、抽選材料が毎試合違うストーリーを担保します。
 *
 * 必殺技セリフ+カットイン: バトル展開は再生前に全イベントが確定しているため、
 * 必殺技を使う予定のキャラクターの決めゼリフを再生開始時に先行生成します。
 * 必殺技イベントの時点で生成が間に合っていればカットイン演出付きで表示し、
 * 上限時間(SPEECH_WAIT_LIMIT_MS)までに間に合わなければセリフなしで進行します
 * (テンポを守るための明示的な仕様です)。
 *
 * 断末魔と決着セリフ: 勝敗も再生前に確定しているため、倒れる予定のメンバーの
 * 断末魔と勝者の決めゼリフを再生開始時に先行生成します。断末魔は倒れた瞬間
 * (KOイベントの直後)にカットイン付きで表示します(1v1では従来どおり決着の
 * 一撃の直後です)。誰も倒れずに判定負けした場合のみ、締めの場面で敗北チームの
 * 先頭メンバーが断末魔を語ります。勝者の決めゼリフは勝利チームで生き残った
 * 先頭メンバーが担当し、決着時は「勝利ファンファーレ → 勝者のセリフ →
 * 締めの実況」の順で表示します(引き分け時はどちらもなし)。
 *
 * 実況の対象: 行動イベント(通常攻撃・ミス・必殺技・反撃)のみ実況します。
 * 毎ターン発生しうる状態異常の経過(スリップダメージ・行動不能など)や
 * パッシブによる回復(life-steal / regenerate)は実況せず、メカニカルログ
 * だけで伝えます(実況生成の待ち時間でテンポが落ちるのを防ぐ明示的な仕様です)。
 */
import type {
  AilmentType,
  BattleEvent,
  BattleSide,
  Character,
  CombatantSnapshot,
} from "../types";
import { AILMENT_LABELS } from "../types";
import { simulateTeamBattle } from "../battle/engine";
import { collectKnockedOutIds } from "../battle/analysis";
import {
  createNarrationSession,
  generateBattleStory,
  generateCharacterSpeech,
  narrateOnce,
} from "../ai/nano";
import {
  buildDefeatSpeechPrompt,
  buildIntroPrompt,
  buildNarrationPrompt,
  buildResultPrompt,
  buildSpecialMoveSpeechPrompt,
  buildStoryPrompt,
  buildVictorySpeechPrompt,
  type NarrationParams,
} from "../ai/prompts";
import { sampleStoryIngredients } from "../ai/story";
import { describeEvent } from "./format";
import { fighterInfoPanel } from "./fighter-info";
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
/** 必殺技セリフの生成を待つ上限(ミリ秒)です。超えたらセリフなしで進行します。 */
const SPEECH_WAIT_LIMIT_MS = 2500;
/** 必殺技カットインの表示時間(ミリ秒)です。 */
const CUTIN_DURATION_MS = 1600;

/** バトル中の1ファイターの表示と設定をまとめた参加者情報です。 */
interface BattleParticipant {
  character: Character;
  /** 所属サイド(1Pチーム = p1、2Pチーム = p2) */
  side: "p1" | "p2";
  block: FighterBlock;
  specialSeKey: SeKey;
}

/** チームのメンバー名を区切り文字でつないだ表示用ラベルを返します。 */
function joinNames(team: readonly Character[], separator: string): string {
  return team.map((character) => character.name).join(separator);
}

/** チームの先頭メンバーを返します。空のチームはデータ不正なので停止します。 */
function teamHead(team: readonly Character[]): Character {
  const head = team[0];
  if (head === undefined) {
    throw new Error("チームにキャラクターがいません");
  }
  return head;
}

/**
 * 勝利チームの決めゼリフを語る代表(生き残った先頭メンバー)を返します。
 * 最終スナップショットが取れない場合は先頭メンバーを返します
 * (演出用の代表選びであり、バトル進行には影響しない明示的なフォールバックです)。
 */
function victoryRepresentative(
  events: readonly BattleEvent[],
  team: readonly Character[],
): Character {
  const lastEvent = events[events.length - 1];
  if (lastEvent === undefined) {
    return teamHead(team);
  }
  const survivor = team.find((member) => {
    const snapshot = lastEvent.after[member.id];
    return snapshot !== undefined && snapshot.hp > 0;
  });
  return survivor ?? teamHead(team);
}

/** バトル画面を描画し、再生を開始します。 */
export function renderBattle(
  ctx: AppContext,
  firstTeam: Character[],
  secondTeam: Character[],
): HTMLElement {
  const screen = el("section", { className: "screen battle-screen" });
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // 画面を離れたら再生ループを止めるためのフラグです
  let aborted = false;
  // セリフ生成失敗の警告を一度だけ表示するためのフラグです
  let speechFailureNotified = false;

  // 効果音の準備(バトル開始前に先読みします)
  const sePlayer = createSePlayer();
  sePlayer.preload();

  // --- 参加者(ファイターブロック・必殺技効果音はキャラクターごとに一度だけ決定) ---
  function makeParticipants(
    team: readonly Character[],
    side: "p1" | "p2",
  ): BattleParticipant[] {
    return team.map((character) => ({
      character,
      side,
      block: fighterBlock(character, side),
      specialSeKey: selectSpecialSeKey(character.specialMove),
    }));
  }
  const firstParticipants = makeParticipants(firstTeam, "p1");
  const secondParticipants = makeParticipants(secondTeam, "p2");
  const participants = [...firstParticipants, ...secondParticipants];
  const byId: Record<string, BattleParticipant> = {};
  for (const participant of participants) {
    byId[participant.character.id] = participant;
  }

  /** キャラクターに対応する参加者情報を取り出します(欠落はデータ不正)。 */
  function participantOf(character: Character): BattleParticipant {
    const participant = byId[character.id];
    if (participant === undefined) {
      throw new Error(`参加者情報がみつかりません: ${character.name}`);
    }
    return participant;
  }

  // --- ステージ(チームごとのファイター列とHP/MPバー) ---
  const is2v2 = firstTeam.length > 1 || secondTeam.length > 1;
  const stage = el(
    "div",
    { className: `stage${is2v2 ? " stage-2v2" : ""}` },
    [
      el(
        "div",
        { className: "stage-team stage-team-p1" },
        firstParticipants.map((participant) => participant.block.root),
      ),
      el("span", { className: "vs-mark stage-vs", text: "VS" }),
      el(
        "div",
        { className: "stage-team stage-team-p2" },
        secondParticipants.map((participant) => participant.block.root),
      ),
    ],
  );

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
    ctx.navigate({ name: "battle", firstTeam, secondTeam });
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
    const result = simulateTeamBattle(firstTeam, secondTeam, Math.random);
    // 前口上とセリフで共用するストーリー材料(舞台・因縁)を抽選します。
    // 材料が毎試合変わることが、決定論的なモデルでの変化の源です
    const storyIngredients = sampleStoryIngredients();
    // 前口上(ストーリー)の生成は待ち時間を稼ぐため最初に開始し、
    // 実況セッションの準備と並行させます
    const storyPromise = generateBattleStory(
      buildStoryPrompt(firstTeam, secondTeam, storyIngredients),
    );
    // 表示前(セッション準備中など)に生成が失敗しても未処理エラーに
    // ならないよう先に握っておきます(失敗の表示は取得側の try で行います)
    void storyPromise.catch(() => undefined);
    // 必殺技の決めゼリフは、必殺技を使う予定のキャラクター分だけ先行生成します
    // (バトル展開は事前確定しているため、再生前にまとめて仕込めます)
    const speechPromises = new Map<string, Promise<string>>();
    for (const participant of participants) {
      const usesSpecial = result.events.some(
        (event) =>
          isSpecialMoveEvent(event) &&
          event.actorId === participant.character.id,
      );
      if (!usesSpecial) {
        continue;
      }
      const promise = generateCharacterSpeech(
        buildSpecialMoveSpeechPrompt(
          participant.character,
          participant.character.specialMove,
          storyIngredients,
        ),
      );
      // 待ち上限超過や再生打ち切りで誰も await しなかった場合に
      // 未処理エラーとならないよう、先に握っておきます(失敗の通知は取得側で行います)
      void promise.catch(() => undefined);
      speechPromises.set(participant.character.id, promise);
    }
    // 倒れる予定のメンバーの断末魔を先行生成します(倒れた瞬間に表示するため)
    const knockedOutIds = collectKnockedOutIds(result.events);
    const defeatSpeechPromises = new Map<string, Promise<string>>();
    for (const participant of participants) {
      if (!knockedOutIds.has(participant.character.id)) {
        continue;
      }
      const enemyTeam = participant.side === "p1" ? secondTeam : firstTeam;
      const promise = generateCharacterSpeech(
        buildDefeatSpeechPrompt(
          participant.character,
          joinNames(enemyTeam, "と"),
          storyIngredients,
        ),
      );
      void promise.catch(() => undefined);
      defeatSpeechPromises.set(participant.character.id, promise);
    }
    // 決着後のセリフ(勝者の決めゼリフ)も先行生成します(引き分けの場合はなし)。
    // 断末魔は倒れた瞬間に表示するため、締めの断末魔は誰も倒れずに
    // 判定負けした場合だけ敗北チームの先頭メンバーが語ります
    const winnerTeam = teamOfSide(result.winner);
    const loserTeam = teamOfSide(opposite(result.winner));
    let winnerSpeaker: Character | undefined;
    let loserSpeaker: Character | undefined;
    let timeoutDefeatSpeechPromise: Promise<string> | undefined;
    let victorySpeechPromise: Promise<string> | undefined;
    if (winnerTeam !== null && loserTeam !== null) {
      winnerSpeaker = victoryRepresentative(result.events, winnerTeam);
      victorySpeechPromise = generateCharacterSpeech(
        buildVictorySpeechPrompt(
          winnerSpeaker,
          joinNames(loserTeam, "と"),
          storyIngredients,
        ),
      );
      void victorySpeechPromise.catch(() => undefined);
      if (loserTeam.every((member) => !knockedOutIds.has(member.id))) {
        loserSpeaker = teamHead(loserTeam);
        timeoutDefeatSpeechPromise = generateCharacterSpeech(
          buildDefeatSpeechPrompt(
            loserSpeaker,
            joinNames(winnerTeam, "と"),
            storyIngredients,
          ),
        );
        void timeoutDefeatSpeechPromise.catch(() => undefined);
      }
    }
    // メカニカルログ用のID→表示名の対応表です
    const names: Record<string, string> = {};
    for (const participant of participants) {
      names[participant.character.id] = participant.character.name;
    }

    // 初回はセッション準備と前口上の生成で数秒待つため、固まって見えないよう
    // ローディング行を表示します(最初のメッセージが出る前に取り除きます)
    const loadingLine = el("p", {
      className: "log-line log-loading",
      text: "バトルのじゅんびちゅう",
    });
    logWindow.append(loadingLine);

    // 実況セッションの用意(失敗は明示してメカニカルログのみで続行します)
    let narrator: LanguageModelSession | null = null;
    try {
      narrator = await createNarrationSession();
    } catch (error) {
      loadingLine.remove();
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

    // ゴングの前に前口上(ストーリー)を表示します(失敗は明示して続行します)
    // ローディング行は前口上(または失敗の明示)と入れ替わりで取り除きます
    try {
      const story = await storyPromise;
      loadingLine.remove();
      await typeLine(story, "story");
    } catch (error) {
      loadingLine.remove();
      await typeLine(
        `(ストーリーの生成に失敗したため、前口上なしで進行します: ${error instanceof Error ? error.message : String(error)})`,
        "warn",
      );
    }
    if (aborted) {
      narrator?.destroy();
      return;
    }
    sePlayer.play("start");
    await typeLine(
      `${joinNames(firstTeam, "&")} 対 ${joinNames(secondTeam, "&")}! バトルスタート!`,
      "system",
    );
    if (narrator !== null) {
      try {
        await typeLine(
          await narrateOnce(narrator, buildIntroPrompt(firstTeam, secondTeam)),
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

    // 断末魔を表示済みのメンバーのIDです(同じメンバーに二度表示しないため)
    const mournedIds = new Set<string>();

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
      // 必殺技は決めゼリフ+カットインを先に挟みます(間に合わなければスキップ)
      if (isSpecialMoveEvent(event)) {
        const speech = await waitForSpeech(speechPromises.get(event.actorId));
        if (aborted) {
          return;
        }
        if (speech !== null) {
          await showCutin(
            actor,
            speech,
            `必殺技 ${actor.character.specialMove.name}`,
          );
          await typeLine(`${actor.character.name}「${speech}」`, "speech");
        }
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

      // 倒れたメンバーの断末魔を倒れた瞬間に挟みます(間に合わなければスキップ)
      for (const participant of participants) {
        const afterSnapshot = event.after[participant.character.id];
        if (
          afterSnapshot === undefined ||
          afterSnapshot.hp > 0 ||
          mournedIds.has(participant.character.id)
        ) {
          continue;
        }
        mournedIds.add(participant.character.id);
        const defeatSpeech = await waitForSpeech(
          defeatSpeechPromises.get(participant.character.id),
        );
        if (aborted) {
          return;
        }
        if (defeatSpeech !== null) {
          await showCutin(participant, defeatSpeech, "断末魔", "cutin-ko");
          await typeLine(
            `${participant.character.name}「${defeatSpeech}」`,
            "speech",
          );
        }
      }

      await pacedWait(reducedMotion ? 80 : EVENT_INTERVAL_MS);
    }

    if (aborted) {
      return;
    }

    // 誰も倒れずに判定負けした場合のみ、敗者代表の断末魔を
    // 勝利ファンファーレの前に挟みます(間に合わなければスキップ)
    if (loserSpeaker !== undefined) {
      const defeatSpeech = await waitForSpeech(timeoutDefeatSpeechPromise);
      if (aborted) {
        return;
      }
      if (defeatSpeech !== null) {
        const speaker = participantOf(loserSpeaker);
        await showCutin(speaker, defeatSpeech, "断末魔", "cutin-ko");
        await typeLine(`${loserSpeaker.name}「${defeatSpeech}」`, "speech");
      }
    }
    sePlayer.play(result.winner === null ? "draw" : "victory");
    showResult(winnerTeam);
    // 勝者代表の決めゼリフを締めの実況の前に挟みます(間に合わなければスキップ)
    if (winnerSpeaker !== undefined) {
      const victorySpeech = await waitForSpeech(victorySpeechPromise);
      if (aborted) {
        return;
      }
      if (victorySpeech !== null) {
        const speaker = participantOf(winnerSpeaker);
        await showCutin(speaker, victorySpeech, "勝利");
        await typeLine(`${winnerSpeaker.name}「${victorySpeech}」`, "speech");
      }
    }
    if (narrator !== null) {
      const prompt =
        winnerTeam !== null && loserTeam !== null
          ? buildResultPrompt(
              joinNames(winnerTeam, "と"),
              joinNames(loserTeam, "と"),
              false,
            )
          : buildResultPrompt(
              joinNames(firstTeam, "と"),
              joinNames(secondTeam, "と"),
              true,
            );
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

  /** 勝敗サイドに対応するチームを返します(null は引き分け)。 */
  function teamOfSide(side: BattleSide | null): Character[] | null {
    if (side === null) {
      return null;
    }
    return side === "first" ? firstTeam : secondTeam;
  }

  /** 勝敗サイドの反対側を返します(null は引き分けのまま)。 */
  function opposite(side: BattleSide | null): BattleSide | null {
    if (side === null) {
      return null;
    }
    return side === "first" ? "second" : "first";
  }

  /** 勝敗バナーを表示します。 */
  function showResult(winnerTeam: Character[] | null): void {
    if (winnerTeam === null) {
      resultBanner.append(
        el("span", { className: "result-word", text: "DRAW" }),
        el("span", { className: "result-name", text: "りょうしゃ ゆずらず!" }),
      );
      return;
    }
    for (const member of winnerTeam) {
      participantOf(member).block.root.classList.add("fighter-winner");
    }
    const head = teamHead(winnerTeam);
    const label =
      winnerTeam.length === 1
        ? `「${head.title}」${head.name}`
        : joinNames(winnerTeam, "&");
    resultBanner.append(
      el("span", { className: "result-word", text: "WINNER" }),
      el("span", { className: "result-name", text: label }),
    );
  }

  /**
   * 先行生成中の決めゼリフを上限時間(SPEECH_WAIT_LIMIT_MS)まで待ちます。
   * セリフの予定がない・間に合わない場合は null を返し、演出なしで進行します。
   * 生成失敗は初回のみ警告を表示します(暗黙に握りつぶさない)。
   */
  async function waitForSpeech(
    promise: Promise<string> | undefined,
  ): Promise<string | null> {
    if (promise === undefined) {
      return null;
    }
    // タイムアウト側の解決値をセリフ本文と区別するための目印です
    const timeoutMark = Symbol("speech-timeout");
    try {
      const outcome = await Promise.race([
        promise,
        pacedWait(SPEECH_WAIT_LIMIT_MS).then(() => timeoutMark),
      ]);
      return typeof outcome === "string" ? outcome : null;
    } catch (error) {
      if (!speechFailureNotified) {
        speechFailureNotified = true;
        await typeLine(
          `(セリフの生成に失敗したため、セリフなしで進行します: ${error instanceof Error ? error.message : String(error)})`,
          "warn",
        );
      }
      return null;
    }
  }

  /**
   * カットイン(キャラクター画像+セリフ)をステージ上に重ねて表示します。
   * 必殺技・勝利・断末魔で共用し、label に場面名(「必殺技 ○○」など)を渡します。
   * アニメーション抑制環境・非表示タブでは表示しません。セリフ本文はログ行でも
   * 表示するため、カットインが出なくても情報は欠けません。
   * @param extraClassName 場面ごとの見た目調整用クラス(断末魔の cutin-ko など)
   */
  async function showCutin(
    participant: BattleParticipant,
    speech: string,
    label: string,
    extraClassName?: string,
  ): Promise<void> {
    if (reducedMotion || document.hidden) {
      return;
    }
    const side = participant.side === "p1" ? "cutin-left" : "cutin-right";
    const classNames = ["cutin", side];
    if (extraClassName !== undefined) {
      classNames.push(extraClassName);
    }
    const overlay = el("div", { className: classNames.join(" ") }, [
      el("div", { className: "cutin-lines" }),
      el("img", {
        className: "cutin-portrait",
        // セリフはログ行で読み上げられるため、画像は装飾扱いにします
        attrs: { src: participant.character.imageDataUrl, alt: "" },
      }),
      el("div", { className: "cutin-balloon" }, [
        el("p", { className: "cutin-move", text: label }),
        el("p", { className: "cutin-speech", text: `「${speech}」` }),
      ]),
    ]);
    stage.append(overlay);
    await pacedWait(CUTIN_DURATION_MS);
    overlay.remove();
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
      case "life-steal":
      case "regenerate":
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
    kind: "system" | "narration" | "special" | "warn" | "story" | "speech",
  ): Promise<void> {
    const line = el("p", { className: `log-line log-${kind} typing` });
    if (kind === "narration") {
      line.append(el("span", { className: "log-mic", text: "実況" }));
    }
    if (kind === "story") {
      line.append(
        el("span", { className: "log-mic log-mic-story", text: "ストーリー" }),
      );
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

/** 必殺技イベント(決めゼリフ+カットインの対象)かどうかを判定します。 */
function isSpecialMoveEvent(event: BattleEvent): boolean {
  return (
    event.type === "special-attack" ||
    event.type === "special-heal" ||
    event.type === "special-ailment" ||
    event.type === "special-buff"
  );
}

/**
 * 実況対象のイベントを実況プロンプトの素材(NarrationParams)に変換します。
 * 実況しないイベント(状態異常の経過・endure・life-steal・regenerate)では
 * null を返します。
 */
function narrationParamsFor(
  event: BattleEvent,
  actor: BattleParticipant,
  target: BattleParticipant,
): NarrationParams | null {
  const targetSnapshot = event.after[target.character.id];
  if (targetSnapshot === undefined) {
    // エンジンは常に全員のスナップショットを付与するため、欠落はデータ不正です
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
    case "life-steal":
    case "regenerate":
      return null;
  }
}

/** イベント適用後のスナップショットを全ファイターの表示に反映します。 */
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

/** ファイター表示ブロック(画像・名前・HP/MPバー・情報パネル・状態異常バッジ)です。 */
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
  // 最大MP0のキャラ(移行データ等)で100%表示にならないよう、初期値も比率で計算します
  const mpFill = el("span", {
    className: "mp-fill",
    attrs: { style: `width:${character.mp === 0 ? 0 : 100}%` },
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
    // 観戦者向けの手の内表示です。状態異常バッジより前に置くことで、
    // バトル中にバッジが出現してもパネルの位置がずれないようにします
    fighterInfoPanel(character),
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
      // 戦闘不能のメンバーはグレーアウトします(チーム戦で戦況を読みやすくするため)
      root.classList.toggle("fighter-ko", snapshot.hp === 0);
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
