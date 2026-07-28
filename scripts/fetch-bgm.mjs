/**
 * @file 魔王魂(https://maou.audio/)から戦闘BGM素材をダウンロードして
 * public/bgm/ に配置するスクリプトです(`npm run fetch:bgm` で実行します)。
 *
 * 魔王魂の利用規約では「素材そのものの再配布」が禁止されているため、
 * 音声ファイルはリポジトリにコミットせず、各開発者がこのスクリプトで取得します
 * (クレジットを表記してゲームに組み込んで公開することは規約上許可されています)。
 *
 * ダウンロード対象は src/audio/bgm-manifest.json が唯一の情報源です。
 * 取得済みのファイルはスキップするため、再実行しても差分のみ取得します。
 */
import { mkdir, readFile, writeFile, access, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** リポジトリのルートディレクトリです。 */
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
/** BGMの配置先ディレクトリです。 */
const outputDir = join(rootDir, "public", "bgm");
/** 素材一覧(キー・ファイル名・取得元URL)のパスです。 */
const manifestPath = join(rootDir, "src", "audio", "bgm-manifest.json");

/** 連続ダウンロードの間隔(ミリ秒)です。取得元サーバーへの配慮で間を空けます。 */
const DOWNLOAD_INTERVAL_MS = 300;

/**
 * ダウンロード時に付与するリクエストヘッダーです。
 * 魔王魂はホットリンク保護のため User-Agent と Referer のない
 * リクエストを 403 で拒否します。サイト上でダウンロードリンクを
 * クリックした場合と同じヘッダーを付与します。
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/** ホットリンク保護を通過するためのRefererです(魔王魂のトップページ)。 */
const REFERER = "https://maou.audio/";

/** 指定ミリ秒だけ待機します。 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ファイルが存在するかを返します。 */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
await mkdir(outputDir, { recursive: true });

let downloadedCount = 0;
let skippedCount = 0;

for (const [key, entry] of Object.entries(manifest)) {
  const outputPath = join(outputDir, entry.file);
  if (await exists(outputPath)) {
    skippedCount += 1;
    continue;
  }
  const response = await fetch(entry.source, {
    headers: { "User-Agent": USER_AGENT, Referer: REFERER },
  });
  if (!response.ok) {
    // Fail-Fast: 取得失敗を黙殺すると実行時に曲だけ欠けるため、ここで停止します
    throw new Error(
      `BGM「${key}」のダウンロードに失敗しました: ${response.status} ${entry.source}`,
    );
  }
  const data = Buffer.from(await response.arrayBuffer());
  // 途中終了で欠けたファイルを「取得済み」と誤認しないよう、
  // 一時ファイルに書き込んでからリネームで確定します(原子的な配置)
  const tempPath = `${outputPath}.download`;
  await writeFile(tempPath, data);
  await rename(tempPath, outputPath);
  downloadedCount += 1;
  console.log(`取得: ${entry.file} (${entry.label})`);
  await wait(DOWNLOAD_INTERVAL_MS);
}

console.log(
  `完了: ${downloadedCount}件を取得、${skippedCount}件は取得済みのためスキップしました(配置先: public/bgm/)`,
);
