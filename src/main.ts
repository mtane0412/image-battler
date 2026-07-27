/**
 * @file エントリーポイントです。スタイルを読み込み、#app にアプリを描画します。
 */
import "./styles.css";
import { initApp } from "./ui/app";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("#app 要素が見つかりません。index.html を確認してください。");
}
initApp(root);
