/**
 * @file ホーム画面です。保存済みファイターの一覧・対戦相手の選択・
 * バトル開始・キャラクター削除・Gemini Nano の利用可否表示を行います。
 */
import type { Character } from "../types";
import {
  STORAGE_KEY,
  StorageError,
  deleteCharacter,
  loadCharacters,
} from "../storage/repository";
import { checkNanoAvailability } from "../ai/nano";
import { characterCard } from "./card";
import { el } from "./dom";
import type { AppContext } from "./navigation";

/** ホーム画面を描画します。 */
export function renderHome(ctx: AppContext): HTMLElement {
  const screen = el("section", { className: "screen" });

  // Gemini Nano の利用可否を非同期で表示します
  const noticeArea = el("div");
  screen.append(noticeArea);
  void showNanoNotice(noticeArea);

  let characters: Character[];
  try {
    characters = loadCharacters();
  } catch (error) {
    screen.append(renderStorageError(error, ctx));
    return screen;
  }

  screen.append(
    el("div", { className: "section-head" }, [
      el("h2", { className: "section-title", text: "ファイター" }),
      button("+ 新しいファイターをつくる", "btn btn-primary", () =>
        ctx.navigate({ name: "create" }),
      ),
    ]),
  );

  if (characters.length === 0) {
    screen.append(
      el("div", { className: "empty-state" }, [
        el("p", {
          className: "empty-lead",
          text: "まだファイターがいません。",
        }),
        el("p", {
          className: "empty-sub",
          text: "写真をアップロードすると、Chrome内蔵AIのGemini Nanoが画像を見てステータスと必殺技を考えます。",
        }),
      ]),
    );
    return screen;
  }

  // 対戦させる2体の選択状態です(選択順に P1 / P2 になります)
  const selectedIds: string[] = [];

  const roster = el("div", { className: "roster" });
  const vsPanel = el("div", { className: "vs-panel" });
  screen.append(roster, vsPanel);

  function toggleSelect(id: string): void {
    const index = selectedIds.indexOf(id);
    if (index >= 0) {
      selectedIds.splice(index, 1);
    } else if (selectedIds.length < 2) {
      selectedIds.push(id);
    }
    renderRoster();
    renderVsPanel();
  }

  function removeCharacter(id: string): void {
    deleteCharacter(id);
    characters = characters.filter((c) => c.id !== id);
    const index = selectedIds.indexOf(id);
    if (index >= 0) {
      selectedIds.splice(index, 1);
    }
    renderRoster();
    renderVsPanel();
  }

  function renderRoster(): void {
    roster.replaceChildren(
      ...characters.map((character) => {
        const slot = selectedIds.indexOf(character.id);
        const wrapper = el("div", {
          className: `roster-item${slot === 0 ? " selected-p1" : ""}${slot === 1 ? " selected-p2" : ""}`,
        });
        const card = characterCard(character);
        card.classList.add("card-clickable");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute(
          "aria-label",
          `${character.name}を対戦相手として選択`,
        );
        card.addEventListener("click", () => toggleSelect(character.id));
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSelect(character.id);
          }
        });
        if (slot >= 0) {
          wrapper.append(
            el("span", {
              className: `slot-badge slot-badge-${slot === 0 ? "p1" : "p2"}`,
              text: slot === 0 ? "1P" : "2P",
            }),
          );
        }
        // 誤操作防止のため、削除は2回押して確定します(1回目で文言が変わります)
        const deleteButton = button("けす", "btn btn-ghost btn-small", () => {
          if (deleteButton.dataset["confirming"] === "true") {
            removeCharacter(character.id);
            return;
          }
          deleteButton.dataset["confirming"] = "true";
          deleteButton.textContent = "ほんとうにけす?";
          deleteButton.classList.add("btn-danger");
        });
        wrapper.append(card, deleteButton);
        return wrapper;
      }),
    );
  }

  function renderVsPanel(): void {
    const first = characters.find((c) => c.id === selectedIds[0]);
    const second = characters.find((c) => c.id === selectedIds[1]);
    const startButton = button("バトルスタート", "btn btn-primary btn-large", () => {
      if (first !== undefined && second !== undefined) {
        ctx.navigate({ name: "battle", first, second });
      }
    });
    startButton.disabled = first === undefined || second === undefined;
    vsPanel.replaceChildren(
      vsSlot(first, "p1"),
      el("span", { className: "vs-mark", text: "VS" }),
      vsSlot(second, "p2"),
      el("div", { className: "vs-panel-action" }, [
        startButton,
        el("p", {
          className: "vs-hint",
          text:
            selectedIds.length < 2
              ? "カードを2枚えらぶとバトルできます"
              : "じゅんびかんりょう!",
        }),
      ]),
    );
  }

  renderRoster();
  renderVsPanel();
  return screen;
}

/** VSパネルの片側スロットを描画します。 */
function vsSlot(character: Character | undefined, side: "p1" | "p2"): HTMLElement {
  if (character === undefined) {
    return el("div", { className: `vs-slot vs-slot-${side} vs-slot-empty` }, [
      el("span", { text: "?" }),
    ]);
  }
  return el("div", { className: `vs-slot vs-slot-${side}` }, [
    el("img", {
      attrs: { src: character.imageDataUrl, alt: `${character.name}の画像` },
    }),
    el("span", { className: "vs-slot-name", text: character.name }),
  ]);
}

/** クリックハンドラ付きのボタンを生成します。 */
function button(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = el("button", {
    className,
    text: label,
    attrs: { type: "button" },
  });
  node.addEventListener("click", onClick);
  return node;
}

/** 保存データ破損時のエラー表示です(Fail-Fast: 黙って捨てずに通知します)。 */
function renderStorageError(error: unknown, ctx: AppContext): HTMLElement {
  const message =
    error instanceof StorageError ? error.message : String(error);
  const resetButton = button(
    "保存データを初期化する",
    "btn btn-ghost btn-danger",
    () => {
      localStorage.removeItem(STORAGE_KEY);
      ctx.navigate({ name: "home" });
    },
  );
  return el("div", { className: "error-box" }, [
    el("p", { text: `保存データを読み込めませんでした: ${message}` }),
    el("p", {
      text: "初期化するとすべてのファイターが削除されます。",
    }),
    resetButton,
  ]);
}

/** Gemini Nano の利用可否を表示します。 */
async function showNanoNotice(area: HTMLElement): Promise<void> {
  const availability = await checkNanoAvailability();
  if (availability === "available") {
    return;
  }
  if (availability === "downloadable" || availability === "downloading") {
    area.append(
      el("div", { className: "notice" }, [
        el("p", {
          text: "Gemini Nano のモデルが未ダウンロードです。最初のファイター作成時に自動でダウンロードが始まります(数GB・Wi-Fi推奨)。",
        }),
      ]),
    );
    return;
  }
  area.append(
    el("div", { className: "error-box" }, [
      el("p", {
        text: "このブラウザでは Gemini Nano(Prompt API)が利用できません。このゲームにはデスクトップ版 Chrome 138 以降が必要です。",
      }),
      el("details", {}, [
        el("summary", { text: "有効化の手順を見る" }),
        el("ol", {}, [
          el("li", { text: "デスクトップ版 Chrome 138 以降を使用する(空きストレージ22GB以上・GPUまたは16GB RAM推奨)" }),
          el("li", { text: "アドレスバーに chrome://flags/#prompt-api-for-gemini-nano-multimodal-input を入力し「Enabled」にする" }),
          el("li", { text: "chrome://flags/#optimization-guide-on-device-model を「Enabled BypassPerfRequirement」にする" }),
          el("li", { text: "Chromeを再起動し、chrome://components で「Optimization Guide On Device Model」を更新する" }),
        ]),
      ]),
    ]),
  );
}
