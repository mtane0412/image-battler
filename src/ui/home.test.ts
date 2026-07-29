/**
 * @file ホーム画面(home.ts)のテストです。
 * バトル形式(1vs1 / 2vs2)の切り替えと、カード選択からチーム編成で
 * バトル画面へ遷移すること、BGM設定(ON/OFF)の切り替えを確認します。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHome } from "./home";
import { STORAGE_KEY, STORAGE_VERSION } from "../storage/repository";
import {
  STAGE_STORAGE_KEY,
  STAGE_STORAGE_VERSION,
} from "../storage/stage-repository";
import { loadBgmEnabled, saveBgmEnabled } from "../audio/bgm";
import { makeCharacter, makeStage } from "../testing/fixtures";
import type { AppContext } from "./navigation";
import type { Character, Stage } from "../types";

/** テスト用の4体のファイターを localStorage に保存して返します。 */
function seedCharacters(): Character[] {
  const characters = [
    makeCharacter({ id: "c1", name: "もふ吉" }),
    makeCharacter({ id: "c2", name: "がぶ太" }),
    makeCharacter({ id: "c3", name: "ぴよ助" }),
    makeCharacter({ id: "c4", name: "くろ丸" }),
  ];
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, characters }),
  );
  return characters;
}

/** ロースター上の index 番目のカードをクリックして選択します。 */
function clickCard(screen: HTMLElement, index: number): void {
  const card = screen.querySelectorAll<HTMLElement>(".card-clickable").item(index);
  expect(card).not.toBeNull();
  card.click();
}

/** テスト用のステージを localStorage に保存して返します。 */
function seedStages(): Stage[] {
  const stages = [
    makeStage({ id: "s1", name: "灼熱の闘技場" }),
    makeStage({ id: "s2", name: "極寒の氷原" }),
  ];
  localStorage.setItem(
    STAGE_STORAGE_KEY,
    JSON.stringify({ version: STAGE_STORAGE_VERSION, stages }),
  );
  return stages;
}

/** ステージロースター上の index 番目の選択可能要素をクリックして選択します。 */
function clickStage(screen: HTMLElement, index: number): void {
  const item = screen
    .querySelectorAll<HTMLElement>(".stage-clickable")
    .item(index);
  expect(item).not.toBeNull();
  item.click();
}

/** 表示中の「バトルスタート」ボタンを取得します。 */
function findStartButton(screen: HTMLElement): HTMLButtonElement {
  const found = [...screen.querySelectorAll("button")].find(
    (node) => node.textContent === "バトルスタート",
  );
  if (found === undefined) {
    throw new Error("バトルスタートボタンがみつかりません");
  }
  return found;
}

/** バトル形式の切り替えボタン(「1vs1」「2vs2」)を取得します。 */
function findModeButton(screen: HTMLElement, label: string): HTMLButtonElement {
  const found = [...screen.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`バトル形式ボタン「${label}」がみつかりません`);
  }
  return found;
}

describe("renderHome: バトル形式の切り替えとチーム編成", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("既定の1vs1ではカードを2枚えらぶと、1体ずつのチームでバトルへ遷移する", () => {
    const characters = seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    clickCard(screen, 0);
    clickCard(screen, 1);
    const startButton = findStartButton(screen);
    expect(startButton.disabled).toBe(false);
    startButton.click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "battle",
      firstTeam: [characters[0]],
      secondTeam: [characters[1]],
      stage: null,
    });
  });

  it("1vs1では3枚目のカードを選択できない", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);

    // 3枚目は選択されず、スロットバッジは2枚のまま
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(2);
  });

  it("2vs2に切り替えると4枚えらぶまでバトルスタートが無効で、ヒントに必要枚数が表示される", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const modeButton = findModeButton(screen, "2vs2");
    modeButton.click();
    expect(modeButton.getAttribute("aria-pressed")).toBe("true");

    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);

    expect(findStartButton(screen).disabled).toBe(true);
    expect(screen.querySelector(".vs-hint")?.textContent).toContain("4枚");
  });

  it("2vs2で4枚えらぶと、えらんだ順に2体ずつのチームでバトルへ遷移する", () => {
    const characters = seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "2vs2").click();
    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);
    clickCard(screen, 3);
    findStartButton(screen).click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "battle",
      firstTeam: [characters[0], characters[1]],
      secondTeam: [characters[2], characters[3]],
      stage: null,
    });
  });

  it("2vs2では1P側2枚・2P側2枚のスロットバッジが付く", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "2vs2").click();
    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);
    clickCard(screen, 3);

    const badges = [...screen.querySelectorAll(".slot-badge")].map(
      (node) => node.textContent,
    );
    expect(badges).toEqual(["1P", "1P", "2P", "2P"]);
  });

  it("バトル形式を切り替えると選択がリセットされる", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    clickCard(screen, 0);
    clickCard(screen, 1);
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(2);

    findModeButton(screen, "2vs2").click();
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(0);
  });
});

/** テスト用に指定した数のファイターを localStorage に保存して返します(バトルロイヤル用)。 */
function seedManyCharacters(count: number): Character[] {
  const characters = Array.from({ length: count }, (_, i) =>
    makeCharacter({ id: `c${i + 1}`, name: `ファイター${i + 1}号` }),
  );
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, characters }),
  );
  return characters;
}

describe("renderHome: バトルロイヤル(3〜5人)の編成", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("「バトルロイヤル」ボタンで形式を切り替えられる", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const modeButton = findModeButton(screen, "バトルロイヤル");
    modeButton.click();
    expect(modeButton.getAttribute("aria-pressed")).toBe("true");
    expect(findModeButton(screen, "1vs1").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("2人まではバトルスタートが無効で、ヒントに必要枚数が表示される", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "バトルロイヤル").click();
    clickCard(screen, 0);
    clickCard(screen, 1);

    expect(findStartButton(screen).disabled).toBe(true);
    expect(screen.querySelector(".vs-hint")?.textContent).toContain("3〜5枚");
  });

  it("3人えらぶとバトルスタートが有効になり、えらんだ順の参加者でロイヤルへ遷移する", () => {
    const characters = seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "バトルロイヤル").click();
    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);
    const startButton = findStartButton(screen);
    expect(startButton.disabled).toBe(false);
    startButton.click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "royale",
      fighters: [characters[0], characters[1], characters[2]],
      stage: null,
    });
  });

  it("5人が上限で、6枚目のカードは選択できない", () => {
    const characters = seedManyCharacters(6);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "バトルロイヤル").click();
    for (let i = 0; i < 6; i++) {
      clickCard(screen, i);
    }

    // 6枚目は選択されず、スロットバッジは5枚のまま
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(5);
    findStartButton(screen).click();
    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "royale",
      fighters: characters.slice(0, 5),
      stage: null,
    });
  });

  it("スロットバッジはエントリー番号(No.1〜)で表示される", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "バトルロイヤル").click();
    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);

    const badges = [...screen.querySelectorAll(".slot-badge")].map(
      (node) => node.textContent,
    );
    expect(badges).toEqual(["No.1", "No.2", "No.3"]);
  });

  it("ロイヤルの編成パネルにはVSマークが表示されない", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    // 既定の1vs1ではVSマークがある
    expect(screen.querySelector(".vs-mark")).not.toBeNull();
    findModeButton(screen, "バトルロイヤル").click();
    expect(screen.querySelector(".vs-mark")).toBeNull();
  });

  it("ロイヤルから別形式へ切り替えると選択がリセットされる", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "バトルロイヤル").click();
    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(3);

    findModeButton(screen, "1vs1").click();
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(0);
  });
});

/** 表示中のBGM切り替えボタンを取得します。 */
function findBgmButton(screen: HTMLElement): HTMLButtonElement {
  const found = [...screen.querySelectorAll("button")].find((node) =>
    node.textContent?.includes("BGM"),
  );
  if (found === undefined) {
    throw new Error("BGMボタンがみつかりません");
  }
  return found;
}

describe("renderHome: BGM設定の切り替え", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("未設定のときBGMボタンはON表示になる(既定はON)", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const bgmButton = findBgmButton(screen);
    expect(bgmButton.textContent).toContain("BGM ON");
    expect(bgmButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("BGMボタンを押すとOFF表示に切り替わり、設定が保存される", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const bgmButton = findBgmButton(screen);
    bgmButton.click();

    expect(bgmButton.textContent).toContain("BGM OFF");
    expect(bgmButton.getAttribute("aria-pressed")).toBe("false");
    expect(loadBgmEnabled()).toBe(false);
  });

  it("保存されたOFF設定は画面を描画し直しても維持される", () => {
    seedCharacters();
    saveBgmEnabled(false);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const bgmButton = findBgmButton(screen);
    expect(bgmButton.textContent).toContain("BGM OFF");
    expect(bgmButton.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("renderHome: ステージの選択", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ステージ未選択(デフォルト)のままバトルへ遷移すると stage は null になる", () => {
    const characters = seedCharacters();
    seedStages();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    clickCard(screen, 0);
    clickCard(screen, 1);
    findStartButton(screen).click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "battle",
      firstTeam: [characters[0]],
      secondTeam: [characters[1]],
      stage: null,
    });
  });

  it("ステージを選択してバトルへ遷移すると選択したステージが渡される", () => {
    const characters = seedCharacters();
    const stages = seedStages();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    // 先頭(index 0)はデフォルトステージのため、1番目が保存済みステージの先頭になる
    clickStage(screen, 1);
    clickCard(screen, 0);
    clickCard(screen, 1);
    findStartButton(screen).click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "battle",
      firstTeam: [characters[0]],
      secondTeam: [characters[1]],
      stage: stages[0],
    });
  });

  it("バトルロイヤルでも選択したステージが渡される", () => {
    const characters = seedCharacters();
    const stages = seedStages();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "バトルロイヤル").click();
    clickStage(screen, 1);
    clickCard(screen, 0);
    clickCard(screen, 1);
    clickCard(screen, 2);
    findStartButton(screen).click();

    expect(ctx.navigate).toHaveBeenCalledWith({
      name: "royale",
      fighters: [characters[0], characters[1], characters[2]],
      stage: stages[0],
    });
  });

  it("「+ 新しいステージをつくる」を押すとステージ作成画面へ遷移する", () => {
    seedCharacters();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const createButton = [...screen.querySelectorAll("button")].find(
      (node) => node.textContent === "+ 新しいステージをつくる",
    );
    expect(createButton).not.toBeUndefined();
    createButton?.click();

    expect(ctx.navigate).toHaveBeenCalledWith({ name: "stage-create" });
  });

  it("ファイターが0体でもステージ作成への導線とステージ選択が表示される", () => {
    seedStages();
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    expect(
      [...screen.querySelectorAll("button")].some(
        (node) => node.textContent === "+ 新しいステージをつくる",
      ),
    ).toBe(true);
    expect(screen.querySelectorAll(".stage-clickable")).toHaveLength(3);
  });
});

describe("renderHome: ストーリーモードの選択", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("保存ファイターが2体以下だとストーリーの形式ボタンが無効になる", () => {
    seedManyCharacters(2);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const modeButton = findModeButton(screen, "ストーリー");
    expect(modeButton.disabled).toBe(true);
  });

  it("保存ファイターが3体以上だとストーリーの形式ボタンが有効になる", () => {
    seedManyCharacters(3);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    const modeButton = findModeButton(screen, "ストーリー");
    expect(modeButton.disabled).toBe(false);
  });

  it("ストーリーでは主人公を1体しかえらべない", () => {
    seedManyCharacters(4);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "ストーリー").click();
    clickCard(screen, 0);
    clickCard(screen, 1);

    // 2枚目は選択されず、スロットバッジは1枚のまま
    expect(screen.querySelectorAll(".slot-badge")).toHaveLength(1);
    expect(screen.querySelector(".slot-badge")?.textContent).toBe("主人公");
  });

  it("主人公を選ぶと「ストーリーをはじめる」ボタンが有効になり、押すとプロローグ(story-opening)画面へ遷移する", () => {
    const characters = seedManyCharacters(4);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "ストーリー").click();
    clickCard(screen, 0);

    const startButton = [...screen.querySelectorAll("button")].find(
      (node) => node.textContent === "ストーリーをはじめる",
    );
    if (startButton === undefined) {
      throw new Error("ストーリーをはじめるボタンがみつかりません");
    }
    expect(startButton.disabled).toBe(false);
    startButton.click();

    expect(ctx.navigate).toHaveBeenCalledOnce();
    const [call] = vi.mocked(ctx.navigate).mock.calls[0] ?? [];
    expect(call?.name).toBe("story-opening");
    if (call?.name !== "story-opening") {
      throw new Error("想定外の遷移です");
    }
    expect(call.run.results).toEqual([]);
    expect(call.run.plan.protagonist.id).toBe(characters[0]?.id);
    // 主人公以外の全員(3体)が相手候補になり、5章より少ないため全員分の章になる
    expect(call.run.plan.chapters).toHaveLength(3);
  });

  it("主人公を選ぶ前は「ストーリーをはじめる」ボタンが無効になっている", () => {
    seedManyCharacters(4);
    const ctx: AppContext = { navigate: vi.fn() };
    const screen = renderHome(ctx);

    findModeButton(screen, "ストーリー").click();

    const startButton = [...screen.querySelectorAll("button")].find(
      (node) => node.textContent === "ストーリーをはじめる",
    );
    if (startButton === undefined) {
      throw new Error("ストーリーをはじめるボタンがみつかりません");
    }
    expect(startButton.disabled).toBe(true);
  });
});
