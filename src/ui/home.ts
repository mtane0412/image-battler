/**
 * @file ホーム画面です。保存済みファイターの一覧・バトル形式(1vs1 / 2vs2)の
 * 切り替え・対戦チームの選択・バトル開始・キャラクター削除・
 * Gemini Nano の利用可否表示を行います。
 *
 * チーム編成: カードを選んだ順に 1P チーム → 2P チームへ割り当てます
 * (1vs1 は各チーム1体、2vs2 は各チーム2体です)。
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

/** バトル形式です。チーム1体の1vs1と、チーム2体の2vs2があります。 */
type BattleMode = "1v1" | "2v2";

/** バトル形式ごとの1チームの人数です。 */
const TEAM_SIZE = {
  "1v1": 1,
  "2v2": 2,
} as const satisfies Record<BattleMode, number>;

/** バトル形式の切り替えボタンに表示するラベルです。 */
const MODE_LABELS = {
  "1v1": "1vs1",
  "2v2": "2vs2",
} as const satisfies Record<BattleMode, string>;

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

  // 現在のバトル形式です(切り替えると選択はリセットされます)
  let mode: BattleMode = "1v1";
  // 対戦させるキャラクターの選択状態です(選択順に 1Pチーム → 2Pチームになります)
  const selectedIds: string[] = [];

  /** 現在のバトル形式での1チームの人数を返します。 */
  function teamSize(): number {
    return TEAM_SIZE[mode];
  }

  /** 現在のバトル形式で選択が必要なカードの合計枚数を返します。 */
  function requiredCount(): number {
    return teamSize() * 2;
  }

  /**
   * 選択スロット(選択順の位置)が属するチームを返します。
   * 前半のスロットが 1P チーム、後半のスロットが 2P チームです。
   */
  function teamOfSlot(slot: number): "p1" | "p2" {
    return slot < teamSize() ? "p1" : "p2";
  }

  // バトル形式(1vs1 / 2vs2)の切り替えボタンです
  const modeButtons = new Map<BattleMode, HTMLButtonElement>();
  const modeToggle = el(
    "div",
    {
      className: "mode-toggle",
      attrs: { role: "group", "aria-label": "バトル形式" },
    },
    [
      el("span", { className: "mode-label", text: "バトル形式" }),
      makeModeButton("1v1"),
      makeModeButton("2v2"),
    ],
  );

  const roster = el("div", { className: "roster" });
  const vsPanel = el("div", { className: "vs-panel" });
  screen.append(modeToggle, roster, vsPanel);

  function makeModeButton(value: BattleMode): HTMLButtonElement {
    const node = button(MODE_LABELS[value], "btn btn-ghost mode-button", () =>
      switchMode(value),
    );
    node.setAttribute("aria-pressed", value === mode ? "true" : "false");
    modeButtons.set(value, node);
    return node;
  }

  function switchMode(next: BattleMode): void {
    if (next === mode) {
      return;
    }
    mode = next;
    // 形式ごとに必要枚数とチーム分けが異なるため、切り替え時は選択をリセットします
    selectedIds.length = 0;
    for (const [value, node] of modeButtons) {
      node.setAttribute("aria-pressed", value === mode ? "true" : "false");
    }
    renderRoster();
    renderVsPanel();
  }

  function toggleSelect(id: string): void {
    const index = selectedIds.indexOf(id);
    if (index >= 0) {
      selectedIds.splice(index, 1);
    } else if (selectedIds.length < requiredCount()) {
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

  /** 選択済みのカードを選択順に 1P チーム / 2P チームへ分けて返します。 */
  function selectedTeams(): { firstTeam: Character[]; secondTeam: Character[] } {
    const selected = selectedIds
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is Character => c !== undefined);
    return {
      firstTeam: selected.slice(0, teamSize()),
      secondTeam: selected.slice(teamSize()),
    };
  }

  function renderRoster(): void {
    roster.replaceChildren(
      ...characters.map((character) => {
        const slot = selectedIds.indexOf(character.id);
        const team = slot >= 0 ? teamOfSlot(slot) : null;
        const wrapper = el("div", {
          className: `roster-item${team === "p1" ? " selected-p1" : ""}${team === "p2" ? " selected-p2" : ""}`,
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
        if (team !== null) {
          wrapper.append(
            el("span", {
              className: `slot-badge slot-badge-${team}`,
              text: team === "p1" ? "1P" : "2P",
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
    const { firstTeam, secondTeam } = selectedTeams();
    const ready =
      firstTeam.length === teamSize() && secondTeam.length === teamSize();
    const startButton = button("バトルスタート", "btn btn-primary btn-large", () => {
      if (ready) {
        ctx.navigate({ name: "battle", firstTeam, secondTeam });
      }
    });
    startButton.disabled = !ready;
    const hintText = ready
      ? "じゅんびかんりょう!"
      : mode === "1v1"
        ? "カードを2枚えらぶとバトルできます"
        : "カードを4枚えらぶとバトルできます(えらんだ順に 1P → 2P チーム)";
    vsPanel.replaceChildren(
      vsSide(firstTeam, "p1", teamSize()),
      el("span", { className: "vs-mark", text: "VS" }),
      vsSide(secondTeam, "p2", teamSize()),
      el("div", { className: "vs-panel-action" }, [
        startButton,
        el("p", { className: "vs-hint", text: hintText }),
      ]),
    );
  }

  renderRoster();
  renderVsPanel();
  return screen;
}

/** VSパネルの片側(1チーム分のスロット列)を描画します。 */
function vsSide(
  team: readonly Character[],
  side: "p1" | "p2",
  slotCount: number,
): HTMLElement {
  const slots: HTMLElement[] = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push(vsSlot(team[i], side));
  }
  return el("div", { className: `vs-side vs-side-${side}` }, slots);
}

/** VSパネルの1スロットを描画します。 */
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
