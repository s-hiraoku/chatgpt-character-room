# だらぱんの部屋

サイバーパンダの「だらぱん」と、自分のキャラ・背景を使って作るChatGPT向けMCP App。

3Dの夜のアトリエに、透過PNGのだらぱん・もちぱんを小さめに配置します。床・窓・街並み・机と、移動できるローテーブル・ソファ・フロアライト・鉢植えはBlenderで制作したGLBです。キャラはカメラに正面を向く画像で、完全な3Dモデルやアニメーションではありません。

キャラは最大8体、家具は最大12個。ドラッグ、矢印キー、スライダーで配置を変え、家具の向き・大きさや背景照明、視点を調整できます。配置はJSONで保存・読み込みできます。初版の2D配置ファイルも、小さめのキャラへ変換して読み込めます。

## 起動

Node.js 24推奨（最低22.18）。

```sh
npm ci
npm run dev
```

ブラウザで `http://127.0.0.1:3000` を開きます。MCPは `http://127.0.0.1:3000/mcp`。
変更したら停止して `npm run dev` を再実行してください。初版に自動リロードはありません。

```sh
npm run check   # 型検査、ビルド、状態管理、GLB、MCPのテスト
```

このサーバー自身はAIモデルを呼ばないため、ローカルプレビューにOpenAI APIキーは不要です。会話から操作する場合は、ChatGPT側のモデルがMCPツールを選択します。

## ChatGPTへの接続

会話横のパネル・サイドバーの入口は実装済みです。実際のChatGPTへの接続は、アクセス可能なMCPエンドポイントとDeveloper modeが必要です。

詳しくは [接続手順](docs/chatgpt-setup.md)。ブラウザのローカルプレビュー、MCPプロトコルのテスト、ChatGPT内の表示は別の検証です。

## 技術を学ぶ

制作環境は[開発環境と技術スタック](docs/development-environment.md)にまとめています。Blender・Blender MCPのセットアップ、Codex接続、Three.jsでのGLB読み込みの確認まで用意しました。実装した描画・ドラッグの仕組みは[3D版の実装解説](docs/3d-room.md)で学べます。

[仕組みとMCPの読み方](docs/architecture.md)に、通信の流れ、JSONの実例、各ファイルの役割をまとめています。

1. `src/shared/catalog.ts` — キャラと背景の一覧。
2. `src/shared/contracts.ts` — 配置とツール入力の形式。
3. `src/server/store.ts` — 部屋の状態と更新の衝突防止。
4. `src/server/tools.ts` — 操作を実行して結果を返す処理。
5. `src/server/mcp.ts` — ChatGPTに公開するツールと画面。
6. `src/web/main.ts` — 画面操作とMCP Appsの通信。
7. `src/web/room-view.ts` — Three.jsの描画、視点、床への投影。
8. `scripts/build-room-models.py` — Blenderで素材を制作するコード。

## 素材を追加する

`assets/`にPNG、JPEG、WebPを置き、`src/shared/catalog.ts`へ登録して再ビルドします。
キャラ・背景はこの一覧が共通の入口です。新しいキャラの表示処理を書き直す必要はありません。

キャラの例:

```ts
{
  id: "new-character",
  name: "新しいキャラ",
  description: "このキャラの説明。",
  variants: [{ id: "normal", name: "通常", image: "new-character.png" }],
}
```

背景の例:

```ts
{
  id: "my-room",
  name: "自分の部屋",
  description: "自分で用意した背景。",
  image: "my-room.jpg",
}
```

キャラは透過PNGの縦横比を保ち、カメラに正面を向くSpriteとして描画します。床の座標で配置するので、視点を回しても同じ場所にいます。背景は現在3Dシーンの照明プリセットです。背景画像のカタログ形式は残していますが、3D版で画像を背景として表示する機能はまだありません。
素材はファイルとして登録します。画面から新しい画像をアップロードしてサーバーへ保存する機能はまだありません。

## 状態と制約

- 部屋はサーバーのメモリに保存。最後の操作から24時間で期限切れ。サーバー再起動でも消えます。
- 最大128部屋・1部屋8体。配置を残す場合はJSONを保存してください。
- 初版にはユーザー認証とデータベースがありません。部屋IDを知る人はその部屋を取得・変更できます。部屋IDを公開しないでください。
- 公開サーバーへの一般向け提供では認証・永続保存・レート制限を追加します。複数プロセス・複数レプリカにも未対応です。
- repoの公開と、Plugin Directoryへの公開は別です。このrepoだけではChatGPTへのインストールは完了しません。
- コード・素材の再利用条件は未設定です。公開repoを見られることと、素材を自由に再配布できることは別です。[素材について](assets/README.md)

## 構成

```text
assets/             キャラ画像、制作資料、GLBと編集用.blend
src/shared/         素材一覧と入力スキーマ
src/server/         部屋の状態・MCPツール・HTTPサーバー
src/web/            部屋の画面とホストとの通信
scripts/build.mjs   画像・GLB・CSS・JSを1つのHTMLへまとめる
test/               状態管理と実際のMCP通信の検証
docs/               学習用解説とChatGPT接続手順
```

画面はThree.js、TypeScriptとCSSで実装し、大きなUIフレームワークは使っていません。MCPとMCP Appsの通信は公式SDKを使います。

GLBはチェックイン済みなので、アプリの起動にはBlenderは不要です。素材を作り直す場合はBlenderを起動し、`npm run build:models`を実行します。このコマンドは既存の生成GLBと`.blend`を上書きするため、手作業で編集した素材は先に別名で保存してください。
