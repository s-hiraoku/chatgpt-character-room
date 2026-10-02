# だらぱんの部屋

サイバーパンダの「だらぱん」と、自分のキャラ・背景を使って作るChatGPT向けMCP App。

最初の版では、キャラを最大8体配置し、ドラッグ・矢印キー・スライダーで位置と大きさを調整できます。元画像2種類の切り替え、左右反転、仮背景3種類、配置のJSON保存・読み込みに対応します。表情やアニメーションの生成は含みません。

## 起動

Node.js 24推奨（最低22.18）。

```sh
npm ci
npm run dev
```

ブラウザで `http://127.0.0.1:3000` を開きます。MCPは `http://127.0.0.1:3000/mcp`。
変更したら停止して `npm run dev` を再実行してください。初版に自動リロードはありません。

```sh
npm run check   # 型検査、ビルド、状態管理とMCPのテスト
```

このサーバー自身はAIモデルを呼ばないため、ローカルプレビューにOpenAI APIキーは不要です。会話から操作する場合は、ChatGPT側のモデルがMCPツールを選択します。

## ChatGPTへの接続

会話横のパネル・サイドバーの入口は実装済みです。実際のChatGPTへの接続は、アクセス可能なMCPエンドポイントとDeveloper modeが必要です。

詳しくは [接続手順](docs/chatgpt-setup.md)。ブラウザのローカルプレビュー、MCPプロトコルのテスト、ChatGPT内の表示は別の検証です。

## 技術を学ぶ

3D制作の準備は[開発環境と技術スタック](docs/development-environment.md)にまとめています。Blender・Blender MCPのセットアップ、Codex接続、Three.jsでのGLB読み込みの確認まで用意しました。部屋の3D表示は次の実装です。

[仕組みとMCPの読み方](docs/architecture.md)に、通信の流れ、JSONの実例、各ファイルの役割をまとめています。

1. `src/shared/catalog.ts` — キャラと背景の一覧。
2. `src/shared/contracts.ts` — 配置とツール入力の形式。
3. `src/server/store.ts` — 部屋の状態と更新の衝突防止。
4. `src/server/tools.ts` — 操作を実行して結果を返す処理。
5. `src/server/mcp.ts` — ChatGPTに公開するツールと画面。
6. `src/web/main.ts` — 画面操作とMCP Appsの通信。

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

透過画像を使うと背景が透けて見えます。初版のキャラ画像枠は正方形で、縦長画像も縦横比を保って枠内に収めます。
背景は部屋の枠（16:10）に合わせて `cover` 表示するので、端が切れる場合があります。
初版では素材をファイルとして登録します。画面から新しい画像をアップロードしてサーバーへ保存する機能はまだありません。

## 状態と制約

- 部屋はサーバーのメモリに保存。最後の操作から24時間で期限切れ。サーバー再起動でも消えます。
- 最大128部屋・1部屋8体。配置を残す場合はJSONを保存してください。
- 初版にはユーザー認証とデータベースがありません。部屋IDを知る人はその部屋を取得・変更できます。部屋IDを公開しないでください。
- 公開サーバーへの一般向け提供では認証・永続保存・レート制限を追加します。複数プロセス・複数レプリカにも未対応です。
- repoの公開と、Plugin Directoryへの公開は別です。このrepoだけではChatGPTへのインストールは完了しません。
- コード・素材の再利用条件は未設定です。公開repoを見られることと、素材を自由に再配布できることは別です。[素材について](assets/README.md)

## 構成

```text
assets/             元のキャラ画像・追加する背景
src/shared/         素材一覧と入力スキーマ
src/server/         部屋の状態・MCPツール・HTTPサーバー
src/web/            部屋の画面とホストとの通信
scripts/build.mjs   画像・CSS・JSを1つのHTMLへまとめる
test/               状態管理と実際のMCP通信の検証
docs/               学習用解説とChatGPT接続手順
```

画面はTypeScriptとCSSで実装し、大きなUIフレームワークは使っていません。MCPとMCP Appsの通信は公式SDKを使います。
