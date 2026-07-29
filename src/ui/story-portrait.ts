/**
 * @file ストーリーモードの立ち絵です。
 * キャラクターの画像・二つ名・名前だけを表示する軽量な表示部品で、
 * ストーリーパート画面(ui/story-part.ts)とプロローグ画面
 * (ui/story-opening.ts)の両方で使います。
 */
import type { Character } from "../types";
import { el } from "./dom";

/** 立ち絵を作ります。sideClass は左右・単体などの見た目クラスです。 */
export function storyPortrait(
  character: Character,
  sideClass: string,
): HTMLElement {
  return el("div", { className: `story-portrait ${sideClass}` }, [
    el("div", { className: "story-portrait-image" }, [
      el("img", {
        attrs: { src: character.imageDataUrl, alt: `${character.name}の画像` },
      }),
    ]),
    el("p", { className: "story-portrait-title", text: character.title }),
    el("h3", { className: "story-portrait-name", text: character.name }),
  ]);
}
