/**
 * @file ストーリーモードの立ち絵(story-portrait.ts)のテストです。
 * ストーリーパート画面とプロローグ画面で共用する表示部品で、
 * キャラクターの画像・二つ名・名前だけを表示します。
 */
import { describe, expect, it } from "vitest";
import { storyPortrait } from "./story-portrait";
import { makeCharacter } from "../testing/fixtures";

describe("storyPortrait", () => {
  it("画像・二つ名・名前を表示し、渡したクラスを見た目に反映する", () => {
    const character = makeCharacter({
      name: "もふ吉",
      title: "深淵の眠り猫",
      imageDataUrl: "data:image/png;base64,dGVzdA==",
    });
    const portrait = storyPortrait(character, "story-portrait-left");

    expect(portrait.className).toBe("story-portrait story-portrait-left");
    expect(portrait.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,dGVzdA==",
    );
    expect(portrait.querySelector("img")?.getAttribute("alt")).toBe(
      "もふ吉の画像",
    );
    expect(portrait.querySelector(".story-portrait-title")?.textContent).toBe(
      "深淵の眠り猫",
    );
    expect(portrait.querySelector(".story-portrait-name")?.textContent).toBe(
      "もふ吉",
    );
  });
});
