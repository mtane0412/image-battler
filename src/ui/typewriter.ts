/**
 * @file メッセージウィンドウのタイプライター表示です。
 *
 * バトル画面(ui/battle.ts)から切り出した共通部品です。ストーリーパート画面
 * (ui/story-part.ts)・エンディング画面(ui/story-ending.ts)でも同じ見た目・
 * 挙動の表示が必要なため、ここに一本化しています。
 *
 * バックグラウンドタブでは Chrome が連鎖タイマーを強く間引く(最終的に毎分1回)
 * ため、1文字ずつの待機には依存しません。
 * - タブ非表示時: 即座に全文を表示します
 * - 表示時: 経過時間から表示すべき文字数を計算し、タイマーが遅延しても
 *   まとめて追いつくキャッチアップ方式で描画します
 */
import { el } from "./dom";
import type { SePlayer } from "../audio/se";

/** タイプライール表示の1文字あたりの間隔(ミリ秒)です。 */
const TYPE_INTERVAL_MS = 28;

/** ログ行の種別です。バッジ表示・配色を切り替えます。 */
export type LogKind =
  | "system"
  | "narration"
  | "special"
  | "warn"
  | "story"
  | "speech";

/** createTypewriter が受け取る依存です。 */
export interface TypewriterDeps {
  /** ログ行を追加するメッセージウィンドウ要素 */
  logWindow: HTMLElement;
  /** メッセージ表示音のループ再生に使います(playLoopだけ使うため型を絞っています) */
  sePlayer: Pick<SePlayer, "playLoop">;
  /** true の場合、演出(タイプライター・表示音)を省略して即座に全文表示します */
  reducedMotion: boolean;
  /**
   * 呼び出し時点で再生が中断されているかどうかを返します。
   * 演出の待機を打ち切るために使いますが、最終的な全文表示は必ず行います
   * (呼び出し元が画面を離れた後にログだけが不完全に残るのを防ぐためです)。
   */
  isAborted: () => boolean;
}

/** createTypewriter が返す表示用インターフェースです。 */
export interface Typewriter {
  /** メッセージウィンドウに1行タイプライター表示します。 */
  typeLine(text: string, kind: LogKind): Promise<void>;
  /**
   * 演出中の行があれば、1文字ずつの表示を打ち切って即座に全文を表示します。
   * メッセージウィンドウのクリックで先送りする操作(メッセージ送り)向けです。
   * 演出中の行がない場合は何もしません。
   */
  skip(): void;
}

/**
 * タイプライター表示のインスタンスを作ります。
 * @param deps ログ行の追加先・表示音プレイヤー・reducedMotion設定・中断判定
 */
export function createTypewriter(deps: TypewriterDeps): Typewriter {
  const { logWindow, sePlayer, reducedMotion, isAborted } = deps;
  // skip() は呼び出しのたびに、そのとき演出中の行だけを打ち切るためのフラグです。
  // 各 typeLine 呼び出しの先頭でリセットするため、次の行には影響しません
  let skipCurrent = false;

  return {
    async typeLine(text: string, kind: LogKind): Promise<void> {
      skipCurrent = false;
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
        // メッセージが流れている間だけ表示音をループ再生し、流れ終わったら止めます
        // (長文でも音が途切れず、表示完了と同時に音も終わります)
        const stopMessageSe = sePlayer.playLoop("message");
        try {
          const chars = [...text];
          const startedAt = performance.now();
          let shown = 0;
          while (shown < chars.length) {
            if (isAborted() || document.hidden || skipCurrent) {
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
        } finally {
          stopMessageSe();
        }
      }
      body.textContent = text;
      line.classList.remove("typing");
      logWindow.scrollTop = logWindow.scrollHeight;
    },
    skip(): void {
      skipCurrent = true;
    },
  };
}

/**
 * 演出用の待機です。タブが非表示の間はタイマーが強く間引かれ
 * バトルが数十分単位で停止してしまうため、非表示時は待たずに即座に
 * 解決します(バックグラウンドでもバトルを完走させる明示的な仕様です)。
 */
export function pacedWait(ms: number): Promise<void> {
  if (document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
