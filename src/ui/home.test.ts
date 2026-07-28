/**
 * @file ホーム画面(home.ts)のテストです。
 * バトル形式(1vs1 / 2vs2)の切り替えと、カード選択からチーム編成で
 * バトル画面へ遷移することを確認します。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHome } from "./home";
import { STORAGE_KEY, STORAGE_VERSION } from "../storage/repository";
import { makeCharacter } from "../testing/fixtures";
import type { AppContext } from "./navigation";
import type { Character } from "../types";

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
