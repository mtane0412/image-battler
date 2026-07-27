/**
 * @file Vite / Vitest の設定ファイルです。
 * 静的サイトとしてビルドし、テストは jsdom 環境で実行します。
 */
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
