# 開発環境の検証記録

2026-10-02、macOS arm64で確認。部屋の3D実装前の環境確認です。

| 対象 | 結果 |
| --- | --- |
| Node.js 24.19.0 | 型検査・ビルド・8件のアプリテストが成功 |
| Blender 5.2.2 LTS | GUI起動とバージョン表示を確認 |
| Blender公式配布DMG | 公式SHA256と一致 |
| uv管理のPython 3.11.11 | mcp-for-blender 2.1.3と同梱アドオンを導入 |
| Blender MCP | 公式MCP SDKでSTDIO接続、ツール一覧とシーン取得が成功 |
| アドオン | protocol 13で互換性確認が成功 |
| テレメトリー | サーバー環境変数・アドオン設定で無効。状態取得でもfalseを確認 |
| GLB書き出し | MCP経由で一時メッシュを作成し、GLB v2で出力 |
| Three.js 0.185.1 | GLTFLoaderで出力したGLBを読み込み、メッシュ1個を確認 |
| 検証後のシーン | 一時メッシュを削除し、シーンのオブジェクト名が実行前と一致 |
| Codex設定 | darapan-blenderを追加し、codex mcp getで登録先を確認 |
| 生成素材 | だらぱん・もちぱん・採用した部屋イメージ・提供デザインシートを保存。寸法とSHA256を記録 |

DMGのSHA256:

```text
dc4125399b8bfefe283cc1624d6cfc7809d1cac20ace51072127eb371f31f210
```

配布元は[Blender公式ミラー](https://mirror.blender.org/release/Blender5.2/)、比較元は[5.2.2の公式チェックサム](https://mirror.blender.org/release/Blender5.2/blender-5.2.2.sha256)です。

再確認の手順は[開発環境ドキュメント](development-environment.md)に記載しています。実行時のJSONレポートとGLBはGit除外の`.local/verification/`に残しています。確認用GLBは完成素材には含めません。

## 今回の確認に含めないこと

- この会話のツール一覧へのBlender MCP反映。Codex再起動後に確認する。
- Three.jsによるブラウザの3D描画。今回はローダーの互換性まで。
- ChatGPT実ホストでの表示・操作、公開エンドポイントへの接続。
- だらぱん・もちぱんの画面への登録、3Dモデル化、アニメーション。
- Windows・Linuxでの自動セットアップ。

既存アプリのソースと素材カタログは変更していません。
