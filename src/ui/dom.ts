/**
 * @file DOM要素を宣言的に生成する小さなヘルパーです。
 * フレームワークを使わない(完全無料・依存最小)方針のため、
 * document.createElement の薄いラッパーだけを提供します。
 */

/** el() のオプションです。 */
export interface ElOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
}

/** 要素を生成し、クラス・テキスト・属性・子要素をまとめて設定します。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.attrs !== undefined) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  node.append(...children);
  return node;
}
