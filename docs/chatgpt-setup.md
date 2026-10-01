# ChatGPTへ接続する

このrepoをGitHubへ公開するだけでは、ChatGPTからサーバーは呼べません。起動しているMCPサーバーへChatGPTが到達できる接続方法を用意します。

## 1. ローカルで確かめる

```sh
npm ci
npm run dev
```

画面は `http://127.0.0.1:3000`、MCPは `http://127.0.0.1:3000/mcp`。

別のターミナルでMCP Inspectorを起動できます。

```sh
npx @modelcontextprotocol/inspector
```

InspectorでStreamable HTTPを選び、MCPのURLを入力します。4つのツールを確認し、`room_open`を空の引数`{}`で呼びます。返された`roomId`で`room_get`を呼べることを確認してください。

## 2. 接続方法を選ぶ

### 個人用の開発: Secure MCP Tunnel

OpenAI公式のSecure MCP Tunnelを使うと、ローカルサーバーを一般公開せず、ChatGPTへ接続できます。別途`tunnel_id`とトンネル用のAPIキー・権限が必要です。アプリ自身がモデルを呼ぶためのAPIキーとは別です。

1. [PlatformのTunnels設定](https://platform.openai.com/settings/organization/tunnels)でトンネルを作成し、対象のChatGPTワークスペースへ関連付けます。
2. 設定画面または[公式リリース](https://github.com/openai/tunnel-client/releases/latest)から`tunnel-client`を用意します。
3. `tunnel-client help quickstart`と[公式手順](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)を確認し、HTTPの接続先に`http://127.0.0.1:3000/mcp`を指定します。
4. `tunnel-client doctor`で確認し、`tunnel-client run`を動かしたままにします。

APIキーはターミナルや秘密情報の管理に設定し、repoへ保存しないでください。トンネルの作成・実行権限とChatGPTのDeveloper mode権限は別です。使える設定はアカウント・ワークスペースによります。

### 継続運用: HTTPSサーバー

Node.jsを動かせるホスティングへ配置し、HTTPSの`https://自分のドメイン/mcp`を接続先にします。GitHub Pagesは静的ファイル用なので、このNode.jsサーバーを動かす場所にはなりません。

Docker用の`Dockerfile`を用意しています。

```sh
docker build -t character-room .
docker run --rm -p 3000:3000 -e ALLOWED_HOSTS=localhost,127.0.0.1 character-room
```

ホスティング側では `NODE_ENV=production`、`HOST=0.0.0.0`、適切な`PORT`を設定します。Dockerでは初期設定済みです。必要に応じて`ALLOWED_HOSTS`へ公開ドメインのホスト名をカンマ区切りで設定します。プロトコルやポート番号は含めません。

初版の部屋は単一プロセスのメモリ内だけにあります。常時起動する1プロセスで動かしてください。一般向けの公開運用にする前にユーザー認証・永続保存・レート制限が必要です。Dockerの実行は、このrepoの自動テストには含めていません。

## 3. ChatGPTで登録

1. 設定 → **Security and login** → **Developer mode**を有効にします。
2. [ChatGPT Plugins](https://chatgpt.com/plugins)のプラスボタンから作成します。
3. 名前を「だらぱんの部屋」とし、接続方法に応じてHTTPS URLまたはTunnelを選びます。
4. `room_open`、`room_get`、`room_update`、`room_catalog`が検出されることを確認します。
5. プラグインをインストールし、対応する会話で有効にします。

Developer modeやExtensionsの提供状況はアカウントと管理者設定に依存します。[公式資料](https://developers.openai.com/plugins/build/extensions)では、Web版のFree・Go向けExtensionsは近日提供とされています（2026-10-02確認）。

## 4. 確認する会話

- 「だらぱんの部屋を開いて」→ `room_open`で部屋が表示される。
- 「だらぱんを右に寄せて」→ `room_get`で読んでから`room_update`。他の項目は保持される。
- 「背景を昼のアトリエにして」→ `backgroundId`が`day`になる。
- 「だらぱんをもう1体追加して」→ 配置IDが別になり、元のだらぱんも残る。
- 画面から位置を変えた後「今どこにいる？」→ `room_get`の最新配置で答える。
- 「怒った表情にして」→ 未登録の表情は使えないと説明する。勝手に素材IDを作らない。

会話横・サイドバーの入口から開けることも確認します。ツール呼び出し、画面表示、状態共有をそれぞれ確認してください。

サーバーやUIを更新したら、プラグイン側の **Refresh** を実行して新しい会話で再確認します。UIを互換性のない形で変更した場合は`UI_URI`の版も更新します。

## 提供の境界

個人用の接続テストは、Plugin Directoryへ一般公開する手順とは別です。公開審査へ進む場合は、安定した公開HTTPSエンドポイントとプラグインパッケージが必要です。初版には提出用`plugin.json`を置いていません。接続・動作確認を終えてから実際のサーバー設定で作成します。

出典: [接続とテスト](https://developers.openai.com/plugins/deploy/connect-chatgpt)、[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。
