/**
 * @file ホーム画面です。保存済みファイターの一覧・バトル形式(1vs1 / 2vs2 /
 * バトルロイヤル)の切り替え・対戦メンバーの選択・バトル開始・キャラクター削除・
 * Gemini Nano の利用可否表示を行います。
 *
 * チーム編成: カードを選んだ順に 1P チーム → 2P チームへ割り当てます
 * (1vs1 は各チーム1体、2vs2 は各チーム2体です)。
 * バトルロイヤル(完全FFA): チームはなく、カードを選んだ順がそのまま
 * エントリー順になります(3〜5人)。
 */
import type { Character, Stage } from "../types";
import {
  STORAGE_KEY,
  StorageError,
  deleteCharacter,
  loadCharacters,
} from "../storage/repository";
import {
  STAGE_STORAGE_KEY,
  deleteStage,
  loadStages,
} from "../storage/stage-repository";
import { checkNanoAvailability } from "../ai/nano";
import { characterCard, stageCard } from "./card";
import { bgmToggleButton } from "./bgm-toggle";
import { el } from "./dom";
import type { AppContext } from "./navigation";

/** バトル形式です。チーム戦(1vs1 / 2vs2)とバトルロイヤル(完全FFA)があります。 */
type BattleMode = "1v1" | "2v2" | "royale";

/** バトルロイヤルの最小参加人数です。 */
const ROYALE_MIN_FIGHTERS = 3;
/** バトルロイヤルの最大参加人数です(参加人数を拡張する場合はここを変えます)。 */
const ROYALE_MAX_FIGHTERS = 5;

/** バトル形式ごとの編成ルールです(チーム戦は1チームの人数、ロイヤルは参加人数の範囲)。 */
type ModeConfig =
  | { label: string; kind: "teams"; teamSize: number }
  | { label: string; kind: "royale"; minFighters: number; maxFighters: number };

/** バトル形式ごとの設定(切り替えボタンのラベルと編成ルール)です。 */
const MODE_CONFIG = {
  "1v1": { label: "1vs1", kind: "teams", teamSize: 1 },
  "2v2": { label: "2vs2", kind: "teams", teamSize: 2 },
  royale: {
    label: "バトルロイヤル",
    kind: "royale",
    minFighters: ROYALE_MIN_FIGHTERS,
    maxFighters: ROYALE_MAX_FIGHTERS,
  },
} as const satisfies Record<BattleMode, ModeConfig>;

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
    screen.append(renderStorageError(error, ctx, STORAGE_KEY, "ファイター"));
    return screen;
  }

  // ステージのデータはここで読み込みますが、DOM追加(見出し・ロースター)は
  // ファイターセクションの後に行います(表示順をファイター→ステージにするため)。
  let stages: Stage[];
  try {
    stages = loadStages();
  } catch (error) {
    screen.append(
      renderStorageError(error, ctx, STAGE_STORAGE_KEY, "ステージ"),
    );
    return screen;
  }
  // 選択中のステージ(未選択 = デフォルトステージ = null)です
  let selectedStageId: string | null = null;
  const stageRoster = el("div", { className: "roster stage-roster" });

  /** ステージセクション(見出し+ロースター)をDOMに追加して描画します。 */
  function appendStageSection(): void {
    screen.append(
      el("div", { className: "section-head" }, [
        el("h2", { className: "section-title", text: "ステージ" }),
        button("+ 新しいステージをつくる", "btn btn-primary", () =>
          ctx.navigate({ name: "stage-create" }),
        ),
      ]),
      stageRoster,
    );
    renderStageRoster();
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
    // ファイターが0体でもステージ作成への導線・選択が見えるよう追加します
    appendStageSection();
    return screen;
  }

  // 現在のバトル形式です(切り替えると選択はリセットされます)
  let mode: BattleMode = "1v1";
  // 対戦させるキャラクターの選択状態です
  // (チーム戦では選択順に 1Pチーム → 2Pチーム、ロイヤルでは選択順がエントリー順です)
  const selectedIds: string[] = [];

  /** 現在のバトル形式の編成ルールを返します。 */
  function config(): ModeConfig {
    return MODE_CONFIG[mode];
  }

  /** 現在のバトル形式で選択できるカードの上限枚数を返します。 */
  function maxSelectable(): number {
    const current = config();
    return current.kind === "teams"
      ? current.teamSize * 2
      : current.maxFighters;
  }

  /**
   * 選択スロット(選択順の位置)が属するチームを返します(チーム戦専用)。
   * 前半のスロットが 1P チーム、後半のスロットが 2P チームです。
   */
  function teamOfSlot(slot: number, teamSize: number): "p1" | "p2" {
    return slot < teamSize ? "p1" : "p2";
  }

  /**
   * 選択スロットのバッジ表示(種別とラベル)を返します。
   * チーム戦は所属チーム(1P / 2P)、ロイヤルはエントリー番号(No.1〜)です。
   */
  function slotBadgeOf(slot: number): {
    kind: "p1" | "p2" | "royale";
    text: string;
  } {
    const current = config();
    if (current.kind === "royale") {
      return { kind: "royale", text: `No.${slot + 1}` };
    }
    const team = teamOfSlot(slot, current.teamSize);
    return { kind: team, text: team === "p1" ? "1P" : "2P" };
  }

  // バトル形式(1vs1 / 2vs2 / バトルロイヤル)の切り替えボタンです
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
      makeModeButton("royale"),
    ],
  );

  const roster = el("div", { className: "roster" });
  // vsPanel(バトルスタートのバー)はステージセクションの下に表示するため、
  // DOM追加はここでは行わず appendStageSection() の後に行います
  const vsPanel = el("div", { className: "vs-panel" });
  screen.append(modeToggle, roster);

  function makeModeButton(value: BattleMode): HTMLButtonElement {
    const node = button(
      MODE_CONFIG[value].label,
      "btn btn-ghost mode-button",
      () => switchMode(value),
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
    } else if (selectedIds.length < maxSelectable()) {
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

  /**
   * VSパネルを再描画します。ファイターが0体のときは vsPanel などの変数が
   * まだ初期化されていない(空状態で早期returnしたコードパス)ため呼びません。
   */
  function renderVsPanelIfReady(): void {
    if (characters.length > 0) {
      renderVsPanel();
    }
  }

  /** 現在選択中のステージを返します(未選択はデフォルトステージ = null)。 */
  function selectedStage(): Stage | null {
    if (selectedStageId === null) {
      return null;
    }
    return stages.find((s) => s.id === selectedStageId) ?? null;
  }

  /**
   * バトルスタートの隣に表示する、選択中ステージの小さいアイコンです。
   * デフォルトステージ(未選択)のときも「—」のプレースホルダーを表示します。
   * クリックするとステージ選択セクションまでスクロールします。
   */
  function stageIndicator(): HTMLElement {
    const stage = selectedStage();
    const indicatorButton = el("button", {
      className: "stage-indicator-button",
      attrs: {
        type: "button",
        title: stage === null ? "デフォルトステージ(こうかなし)" : stage.name,
        "aria-label": "ステージ選択までスクロール",
      },
    });
    indicatorButton.append(
      stage === null
        ? el("span", {
            className: "stage-indicator stage-indicator-default",
            text: "—",
          })
        : el("img", {
            className: "stage-indicator",
            attrs: { src: stage.imageDataUrl, alt: "" },
          }),
    );
    indicatorButton.addEventListener("click", () => {
      stageRoster.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return indicatorButton;
  }

  function selectStage(id: string | null): void {
    selectedStageId = id;
    renderStageRoster();
    renderVsPanelIfReady();
  }

  function removeStage(id: string): void {
    deleteStage(id);
    stages = stages.filter((s) => s.id !== id);
    if (selectedStageId === id) {
      selectedStageId = null;
    }
    renderStageRoster();
    renderVsPanelIfReady();
  }

  /**
   * ステージロースター(デフォルトステージ + 保存済みステージ)を描画します。
   * デフォルトステージ・保存済みステージのクリック領域には .stage-clickable を
   * 付与し、ファイターカードの .card-clickable とセレクタを分離します。
   */
  function renderStageRoster(): void {
    const defaultWrapper = el("div", {
      className: `roster-item stage-roster-item${selectedStageId === null ? " selected-stage" : ""}`,
    });
    const defaultButton = el(
      "button",
      {
        className: "card stage-card stage-card-default stage-clickable",
        attrs: { type: "button", "aria-label": "デフォルトステージを選択" },
      },
      [
        el("div", {
          className: "card-portrait stage-card-portrait stage-card-default-portrait",
          text: "—",
        }),
        el("p", { className: "card-title stage-card-title", text: "こうかなし" }),
        el("h3", {
          className: "card-name stage-card-name",
          text: "デフォルトステージ",
        }),
        el("p", {
          className: "card-desc stage-card-desc",
          text: "とくに効果はありません",
        }),
        // stageCard() と行構成を揃えて縦幅を合わせるため、
        // とくしゅいべんと・とくせいの行も(内容「なし」で)表示します
        el("div", { className: "card-special stage-card-event" }, [
          el("span", { className: "card-special-label", text: "とくしゅいべんと" }),
          el("span", { className: "card-special-name", text: "なし" }),
        ]),
        el("div", { className: "card-passive stage-card-trait" }, [
          el("span", { className: "card-passive-label", text: "とくせい" }),
          el("span", { className: "card-passive-name", text: "なし" }),
        ]),
      ],
    );
    defaultButton.addEventListener("click", () => selectStage(null));
    defaultWrapper.append(defaultButton);

    stageRoster.replaceChildren(
      defaultWrapper,
      ...stages.map((stage) => {
        const wrapper = el("div", {
          className: `roster-item stage-roster-item${selectedStageId === stage.id ? " selected-stage" : ""}`,
        });
        const card = stageCard(stage);
        card.classList.add("stage-clickable");
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `${stage.name}をステージとして選択`);
        card.addEventListener("click", () => selectStage(stage.id));
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectStage(stage.id);
          }
        });
        // 誤操作防止のため、削除は2回押して確定します(1回目で文言が変わります)
        const deleteButton = button("けす", "btn btn-ghost btn-small", () => {
          if (deleteButton.dataset["confirming"] === "true") {
            removeStage(stage.id);
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

  /** 選択済みのカードを選択順に返します。 */
  function selectedCharacters(): Character[] {
    return selectedIds
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is Character => c !== undefined);
  }

  /** 選択済みのカードを選択順に 1P チーム / 2P チームへ分けて返します(チーム戦専用)。 */
  function selectedTeams(teamSize: number): {
    firstTeam: Character[];
    secondTeam: Character[];
  } {
    const selected = selectedCharacters();
    return {
      firstTeam: selected.slice(0, teamSize),
      secondTeam: selected.slice(teamSize),
    };
  }

  function renderRoster(): void {
    roster.replaceChildren(
      ...characters.map((character) => {
        const slot = selectedIds.indexOf(character.id);
        const badge = slot >= 0 ? slotBadgeOf(slot) : null;
        const wrapper = el("div", {
          className: `roster-item${badge === null ? "" : ` selected-${badge.kind}`}`,
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
        if (badge !== null) {
          wrapper.append(
            el("span", {
              className: `slot-badge slot-badge-${badge.kind}`,
              text: badge.text,
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
    const current = config();
    if (current.kind === "royale") {
      renderRoyalePanel(current);
      return;
    }
    vsPanel.classList.remove("vs-panel-royale");
    const { firstTeam, secondTeam } = selectedTeams(current.teamSize);
    const ready =
      firstTeam.length === current.teamSize &&
      secondTeam.length === current.teamSize;
    const startButton = button("バトルスタート", "btn btn-primary btn-large", () => {
      if (ready) {
        ctx.navigate({
          name: "battle",
          firstTeam,
          secondTeam,
          stage: selectedStage(),
        });
      }
    });
    startButton.disabled = !ready;
    const hintText = ready
      ? "じゅんびかんりょう!"
      : mode === "1v1"
        ? "カードを2枚えらぶとバトルできます"
        : "カードを4枚えらぶとバトルできます(えらんだ順に 1P → 2P チーム)";
    vsPanel.replaceChildren(
      vsSide(firstTeam, "p1", current.teamSize),
      el("span", { className: "vs-mark", text: "VS" }),
      vsSide(secondTeam, "p2", current.teamSize),
      el("div", { className: "vs-panel-action" }, [
        // BGM設定はバトル開始前にここで切り替えます(バトル画面でも切り替え可能)
        el("div", { className: "vs-panel-buttons" }, [
          stageIndicator(),
          startButton,
          bgmToggleButton(),
        ]),
        el("p", { className: "vs-hint", text: hintText }),
      ]),
    );
  }

  /**
   * バトルロイヤルの編成パネルを描画します。
   * チームがないためVSマークは表示せず、エントリー順のスロット列を並べます。
   */
  function renderRoyalePanel(current: {
    minFighters: number;
    maxFighters: number;
  }): void {
    vsPanel.classList.add("vs-panel-royale");
    const fighters = selectedCharacters();
    // 上限は選択時に maxSelectable で制限済みのため、下限だけ確認します
    const ready = fighters.length >= current.minFighters;
    const startButton = button("バトルスタート", "btn btn-primary btn-large", () => {
      if (ready) {
        ctx.navigate({ name: "royale", fighters, stage: selectedStage() });
      }
    });
    startButton.disabled = !ready;
    const hintText = ready
      ? "じゅんびかんりょう!"
      : `カードを${current.minFighters}〜${current.maxFighters}枚えらぶとバトルロイヤルできます(えらんだ順にエントリー)`;
    const slots: HTMLElement[] = [];
    for (let i = 0; i < current.maxFighters; i++) {
      slots.push(vsSlot(fighters[i], "royale"));
    }
    vsPanel.replaceChildren(
      el("div", { className: "vs-royale-entries" }, slots),
      el("div", { className: "vs-panel-action" }, [
        el("div", { className: "vs-panel-buttons" }, [
          stageIndicator(),
          startButton,
          bgmToggleButton(),
        ]),
        el("p", { className: "vs-hint", text: hintText }),
      ]),
    );
  }

  appendStageSection();
  screen.append(vsPanel);

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

/**
 * VSパネルの1スロットを描画します。
 * variant はスロットの見た目(1Pチーム / 2Pチーム / ロイヤルのエントリー)です。
 */
function vsSlot(
  character: Character | undefined,
  variant: "p1" | "p2" | "royale",
): HTMLElement {
  if (character === undefined) {
    return el("div", { className: `vs-slot vs-slot-${variant} vs-slot-empty` }, [
      el("span", { text: "?" }),
    ]);
  }
  return el("div", { className: `vs-slot vs-slot-${variant}` }, [
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

/**
 * 保存データ破損時のエラー表示です(Fail-Fast: 黙って捨てずに通知します)。
 * ファイター・ステージの両方の保存データエラーで共用します。
 */
function renderStorageError(
  error: unknown,
  ctx: AppContext,
  storageKey: string,
  entityLabel: string,
): HTMLElement {
  const message =
    error instanceof StorageError ? error.message : String(error);
  const resetButton = button(
    "保存データを初期化する",
    "btn btn-ghost btn-danger",
    () => {
      localStorage.removeItem(storageKey);
      ctx.navigate({ name: "home" });
    },
  );
  return el("div", { className: "error-box" }, [
    el("p", { text: `保存データを読み込めませんでした: ${message}` }),
    el("p", {
      text: `初期化するとすべての${entityLabel}が削除されます。`,
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
