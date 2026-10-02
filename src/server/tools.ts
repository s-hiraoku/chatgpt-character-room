import { z } from "zod";
import {
  characters,
  backgrounds,
  furnitureCatalog,
} from "../shared/catalog.js";
import { toolSchemas, type ToolName } from "../shared/contracts.js";
import { RoomStore, RoomError } from "./store.js";

export function callRoomTool(store: RoomStore, name: ToolName, args: unknown) {
  try {
    let data: Record<string, unknown>;
    switch (name) {
      case "room_open": {
        const input = toolSchemas.room_open.parse(args);
        data = {
          room: input.roomId ? store.get(input.roomId) : store.create(),
        };
        break;
      }
      case "room_get":
        data = { room: store.get(toolSchemas.room_get.parse(args).roomId) };
        break;
      case "room_update": {
        const input = toolSchemas.room_update.parse(args);
        data = {
          room: store.update(input.roomId, input.baseRevision, input.scene),
        };
        break;
      }
      case "room_catalog":
        toolSchemas.room_catalog.parse(args);
        data = { characters, backgrounds, furnitureCatalog };
        break;
      default:
        throw new Error("未登録のツールです。");
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data,
    };
  } catch (error) {
    const code = error instanceof RoomError ? error.code : "INVALID_INPUT";
    const message =
      error instanceof z.ZodError
        ? "入力が不正です。ツールのスキーマと登録済み素材を確認してください。"
        : error instanceof Error
          ? error.message
          : "操作に失敗しました。";
    return {
      isError: true,
      content: [{ type: "text" as const, text: `${code}: ${message}` }],
    };
  }
}
