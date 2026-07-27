/**
 * @file ESLint(Flat Config)の設定ファイルです。
 * TypeScript 推奨ルールを適用し、ビルド成果物を除外します。
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
