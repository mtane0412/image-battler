/**
 * @file アップロード画像を縮小して DataURL(JPEG) に変換します。
 * localStorage の容量(約5MB)に収めるため、保存前に必ず縮小します。
 * Canvas API を使うためブラウザ専用です(jsdomでは動作しないためテスト対象外)。
 */

/** 画像の長辺の最大ピクセル数です。256pxならDataURLは概ね20〜50KBに収まります。 */
const DEFAULT_MAX_SIZE = 256;
/** JPEG品質です。 */
const DEFAULT_QUALITY = 0.85;

/**
 * 画像Blobを縮小してJPEGのDataURLに変換します。
 * @throws Error 画像として読み込めない場合、Canvasが利用できない場合
 */
export async function fileToResizedDataUrl(
  file: Blob,
  maxSize: number = DEFAULT_MAX_SIZE,
  quality: number = DEFAULT_QUALITY,
): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("画像として読み込めないファイルです。JPEGやPNGなどの画像を選択してください。");
  }
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("Canvas 2D コンテキストを取得できませんでした。");
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}
