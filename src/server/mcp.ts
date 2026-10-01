import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  OpenAIExtensions,
  type OpenAIUiToolMetadata,
} from "@openai/mcp-extensions/server";
import { roomSchema, toolSchemas, type ToolName } from "../shared/contracts.js";
import { RoomStore } from "./store.js";
import { callRoomTool } from "./tools.js";

export const UI_URI = "ui://character-room/room-v1.html";
const icon = {
  src:
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="15" cy="14" r="11"/><circle cx="49" cy="14" r="11"/><rect x="8" y="8" width="48" height="50" rx="22" fill="white" stroke="black" stroke-width="4"/><ellipse cx="23" cy="31" rx="7" ry="10"/><ellipse cx="41" cy="31" rx="7" ry="10"/><circle cx="32" cy="46" r="4"/></svg>',
    ),
  mimeType: "image/svg+xml",
};

export function createMcpServer(store: RoomStore, html: string) {
  const server = new McpServer(
    {
      name: "chatgpt-character-room",
      title: "だらぱんの部屋",
      version: "0.1.0",
      icons: [icon],
    },
    {
      instructions:
        "部屋のキャラはサイバーパンダの『だらぱん』です。room_openで開きます。変更前にroom_getで最新のroomを取得し、sceneの必要な項目だけを変更してroom_updateへ渡してください。配置IDは保持してください。追加時の配置IDは新しいUUIDを使い、既存キャラを保持してください。素材はroom_catalogで確認できます。画像や表情を生成する機能はありません。",
    },
  );
  new OpenAIExtensions(server);
  server.registerResource(
    "character-room-ui",
    UI_URI,
    { title: "だらぱんの部屋", mimeType: "text/html;profile=mcp-app" },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: "text/html;profile=mcp-app",
          text: html,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/ui": {
              preferredDisplayMode: "inline",
              availableDisplayModes: ["inline", "fullscreen"],
            },
          },
        },
      ],
    }),
  );
  const descriptions: Record<ToolName, { title: string; description: string }> =
    {
      room_open: {
        title: "だらぱんの部屋",
        description:
          "だらぱんの部屋を表示します。roomIdがなければ新しい独立した部屋を作ります。既存の部屋を開くときはそのroomIdを渡してください。",
      },
      room_get: {
        title: "部屋の配置を確認",
        description:
          "変更前に部屋の最新状態とrevisionを取得します。UIで変更した状態も含みます。",
      },
      room_update: {
        title: "部屋の配置を変更",
        description:
          "キャラの追加・削除・左右反転・位置・大きさ・バリエーション・背景を変更して画面に表示します。room_getで取得したsceneを編集し、同じrevisionをbaseRevisionへ渡してください。未変更のキャラを保持してください。",
      },
      room_catalog: {
        title: "素材一覧",
        description:
          "使用可能なキャラ、バリエーション、背景のIDと名前を取得します。未登録の素材や表情は指定できません。",
      },
    };
  for (const name of Object.keys(toolSchemas) as ToolName[]) {
    const render = name === "room_open" || name === "room_update";
    server.registerTool(
      name,
      {
        ...descriptions[name],
        inputSchema: toolSchemas[name],
        ...(name === "room_catalog"
          ? {}
          : { outputSchema: { room: roomSchema } }),
        annotations: {
          readOnlyHint: name === "room_get" || name === "room_catalog",
          destructiveHint: false,
          openWorldHint: false,
        },
        ...(render
          ? {
              _meta: {
                ui: { resourceUri: UI_URI },
                "openai/ui": {
                  ...(name === "room_open"
                    ? { entrypoints: [{ type: "thread" }, { type: "global" }] }
                    : {}),
                } satisfies OpenAIUiToolMetadata,
              },
            }
          : {}),
      },
      async (args: unknown) => callRoomTool(store, name, args),
    );
  }
  return server;
}
