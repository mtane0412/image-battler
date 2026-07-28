# 画像バトラー - GEMINI NANO ARENA

画像を2枚アップロードして名前をつけると、Chrome 内蔵 AI「Gemini Nano」(Prompt API)が画像を認識してステータスと必殺技を自動生成し、対戦できるブラウザゲームです。

AI はすべて端末内(オンデバイス)で動作し、サーバーも外部 API も使わないため、静的ホスティングに置くだけで**完全無料で運営できます**。作成したキャラクターは localStorage に保存されます。

## 遊び方

1. **ファイターをつくる**: 画像(ペット・ぬいぐるみ・ごはん、なんでも)をアップロードして名前をつけると、Gemini Nano が画像を観察して HP・MP・こうげき・ぼうぎょ・すばやさ・うん・二つ名・必殺技・パッシブスキルを生成します
2. **保存する**: 気に入った結果を保存します(気に入らなければ生成しなおせます)
3. **たたかう**: ホームでバトル形式(1vs1 / 2vs2)を選び、カードを2枚(2vs2 は4枚。選んだ順に 1P チーム → 2P チーム)選んで「バトルスタート」。バトル展開は JavaScript が計算し、実況セリフを Gemini Nano がリアルタイム生成します

## バトルシステム

- **バトル形式**: 1vs1 と 2vs2(タッグバトル)を選べます
  - 行動順はバトル開始時に決定します(「すばやさ無視で先攻」のパッシブ持ち優先 → すばやさ順)。全員が1ラウンドに1回ずつ行動します
  - 通常攻撃・攻撃必殺技・状態異常必殺技の対象は、生存している相手チームのメンバーから無作為に選ばれます
  - チーム全員が倒れると敗北です。決着がつかない場合はチームの平均HP残存率で判定します
- **必殺技とMP**: 必殺技はMPを消費して発動します(MPは行動後に少しずつ回復)。タイプは4種類あり、Gemini Nano が画像の印象から選びます
  - `attack`: 高威力の攻撃技
  - `heal`: 自分のHPを回復する技(HPが減っているときに使用)
  - `ailment`: 相手にステータス異常を与える技(小ダメージ付き)
  - `buff`: 自分のこうげき・ぼうぎょを上げる技(1バトル1回)
- **ステータス異常**(同時に1つだけ罹患します)
  - どく: 行動後に最大HPの1/8のダメージ
  - まひ: 25%の確率で行動不能
  - やけど: 行動後に最大HPの1/16のダメージ + こうげき半減
  - こおり: 行動不能(毎ターン30%の確率で解除)
- **パッシブスキル**: 効果はエンジン実装済みの10種。生成のたびにコード側で候補3種を無作為に抽選し、その中から Gemini Nano が画像に合う1つを選んでキャラ固有の名前を付けます(Gemini Nano は出力が決定論的で、全種類を提示すると選択が偏るための設計です)
  - クリティカル率2倍 / 状態異常無効 / 致死ダメージをHP1で1回耐える / 通常攻撃への反撃 / MP回復量2倍
  - 通常攻撃の与ダメージ30%を吸収 / 行動後に最大HPの1/16を再生 / HP30%以下でこうげき1.5倍 / 被通常攻撃のミス率20% / すばやさ無視で先攻

## 動作要件

Gemini Nano(Prompt API)の利用には以下が必要です。

- デスクトップ版 **Chrome 138 以降**(Windows 10/11・macOS 13+・Linux)
- 空きストレージ **22GB 以上**(モデルのダウンロードに使用。初回のみ)
- GPU(VRAM 4GB 超)または CPU(RAM 16GB・4コア以上)

環境によっては Prompt API のフラグ有効化が必要です。

1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` を **Enabled** にする
2. `chrome://flags/#optimization-guide-on-device-model` を **Enabled BypassPerfRequirement** にする
3. Chrome を再起動し、`chrome://components` で「Optimization Guide On Device Model」を確認する

## 開発

```bash
npm install
npm run fetch:se    # 効果音素材のダウンロード(初回と素材一覧の変更時。効果音ラボから取得)
npm run fetch:bgm   # BGM素材のダウンロード(初回と素材一覧の変更時。魔王魂から取得)
npm run dev         # 開発サーバー(http://localhost:5173)
npm test            # テスト実行(Vitest)
npm run lint        # Lint
npm run type-check  # 型チェック
npm run build       # 本番ビルド(dist/ に静的ファイルを出力)
```

## 技術構成

| 要素 | 実装 |
|------|------|
| ビルド | Vite + TypeScript(フレームワーク不使用) |
| AI | Chrome Prompt API(`LanguageModel`)= Gemini Nano。画像入力 + `responseConstraint`(JSON Schema)による構造化出力 |
| バトル進行 | `src/battle/engine.ts`(注入乱数による決定論的シミュレーション。チーム戦エンジンで1vs1・2vs2を共通処理し、MP・状態異常・パッシブ含め AI はバトル結果に関与しません) |
| 実況生成 | `src/ai/nano.ts` + `src/ai/prompts.ts`(セッションを clone してコンテキスト肥大を防止) |
| 永続化 | localStorage(`src/storage/repository.ts`。画像は 256px JPEG DataURL に縮小して保存) |
| 効果音 | [効果音ラボ](https://soundeffect-lab.info/) の素材(`src/audio/se.ts`。必殺技は技名の属性キーワードで固有音を自動割り当て) |
| BGM | [魔王魂](https://maou.audio/) のファンタジー戦闘曲(`src/audio/bgm.ts`。バトルごとにランダムに1曲をループ再生。ON/OFF設定は localStorage に保存) |
| テスト | Vitest + jsdom(バトルエンジン・パーサー・リポジトリ・プロンプト・AIラッパー) |

## 設計方針

- **Fail-Fast**: AI 出力の検証(`src/ai/schema.ts`)は範囲外・欠落を補正せずエラーにし、ユーザーに再生成を促します。保存データの破損も黙殺せず通知します
- **明示的フォールバック(1箇所のみ)**: バトル中の実況生成に失敗した場合、失敗をログに明示した上でメカニカルなバトルログのみで進行を続けます。バトル本体は JavaScript 側で完結しており、演出の失敗でゲーム全体を止めない設計です(`src/ui/battle.ts` 冒頭コメント参照)
- **完全無料運営**: オンデバイス AI + localStorage のため、GitHub Pages や Vercel などの静的ホスティングに `dist/` を置くだけで運営できます

## 音素材について

効果音は [効果音ラボ](https://soundeffect-lab.info/)、BGMは [魔王魂](https://maou.audio/) の素材を使用しています。

- 両サイトとも利用規約で**素材そのものの再配布が禁止**されているため、音声ファイルはリポジトリにコミットしていません(`public/se/`・`public/bgm/` は gitignore 済み)
- `npm run fetch:se` を実行すると `src/audio/se-manifest.json` の一覧に従って `public/se/` に、`npm run fetch:bgm` を実行すると `src/audio/bgm-manifest.json` の一覧に従って `public/bgm/` にダウンロードされます(取得済みファイルはスキップされます)
- ゲームとしてビルド・公開すること(`dist/` への同梱)は両サイトとも規約上許可されています。魔王魂の規約に従い、アプリのフッターにクレジットを表記しています
- BGMは魔王魂のファンタジー戦闘曲5曲(ファンタジー03・04・11・12・15 のループ版)で、バトルごとにランダムに1曲を選んでループ再生します。BGMのON/OFFはホーム画面(バトルスタートの隣)とバトル画面で切り替えられます

## デプロイ

### Vercel

リポジトリ直下の `vercel.json` にビルド設定を定義しています。効果音・BGM素材が git 管理外のため、ビルドコマンドは `npm run fetch:se && npm run fetch:bgm && npm run build` になっており、Vercel のビルド時に音素材を取得してから `dist/` に同梱します。

```bash
vercel login          # 初回のみ: ブラウザでログイン
vercel link           # 初回のみ: Vercel プロジェクトとリンク
vercel deploy         # プレビューデプロイ
vercel deploy --prod  # 本番デプロイ
```

GitHub リポジトリを Vercel プロジェクトに接続すると、push のたびに自動デプロイされます(ビルド設定は `vercel.json` が適用されます)。

### その他の静的ホスティング

```bash
npm run fetch:se    # 効果音素材を取得(未取得の場合)
npm run fetch:bgm   # BGM素材を取得(未取得の場合)
npm run build
# dist/ を GitHub Pages / Cloudflare Pages などにアップロード
```
