/**
 * @file 候補一覧からの無作為抽選の共通ヘルパーです。
 *
 * Gemini Nano は同一入力に対して出力が決定論的なため、コード側の乱数で
 * 候補を絞り込んだり材料を抽選したりすることで、生成に多様性を持たせます
 * (ai/stages.ts のステージ候補抽選、ai/story.ts のストーリー材料抽選、
 * story/plan.ts の物語計画抽選で共通して使う考え方です)。
 * 乱数は常に[0, 1)の値を要求し、範囲外の値はFail-Fastでthrowします。
 */

/**
 * 抽選に使う乱数値を検証します。[0, 1)の範囲外はFail-Fastでthrowします。
 * @param value 検証対象の乱数値
 * @param errorLabel エラーメッセージに使う抽選対象のラベル(例: "ステージ候補")
 */
function validateRandomValue(value: number, errorLabel: string): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `${errorLabel}の抽選に失敗しました(乱数が範囲[0, 1)外です: ${value})`,
    );
  }
}

/**
 * 一覧から1要素を無作為に選びます。
 * @param pool 抽選対象の一覧
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @param errorLabel エラーメッセージに使う抽選対象のラベル(例: "ストーリー材料")
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
export function pickOne<T>(
  pool: readonly T[],
  rng: () => number,
  errorLabel: string,
): T {
  const value = rng();
  validateRandomValue(value, errorLabel);
  const picked = pool[Math.floor(value * pool.length)];
  if (picked === undefined) {
    throw new Error(
      `${errorLabel}の抽選に失敗しました(不正なインデックス: ${value})`,
    );
  }
  return picked;
}

/**
 * プールから重複なく count 件を無作為に抽選します。
 * @param pool 抽選対象の一覧
 * @param count 抽選する件数
 * @param rng [0, 1) の乱数を返す関数(テストでは決め打ちの列を注入します)
 * @param errorLabel エラーメッセージに使う抽選対象のラベル(例: "ステージ候補")
 * @throws Error 乱数が範囲[0, 1)外の値を返した場合(Fail-Fast)
 */
export function sampleWithoutReplacement<T>(
  pool: readonly T[],
  count: number,
  rng: () => number,
  errorLabel: string,
): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  while (picked.length < count) {
    // インデックス計算の前に乱数値そのものを検証します([0, 1) 以外は不正)
    const value = rng();
    validateRandomValue(value, errorLabel);
    const index = Math.floor(value * remaining.length);
    const [id] = remaining.splice(index, 1);
    if (id === undefined) {
      throw new Error(
        `${errorLabel}の抽選に失敗しました(不正なインデックス: ${index})`,
      );
    }
    picked.push(id);
  }
  return picked;
}
