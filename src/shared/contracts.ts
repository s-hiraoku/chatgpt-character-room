import { z } from "zod";
import { backgrounds, findVariant } from "./catalog.js";

export const placementSchema = z
  .object({
    id: z.string().uuid(),
    characterId: z.string().max(64),
    variantId: z.string().max(64),
    x: z
      .number()
      .min(10)
      .max(90)
      .describe("画面横幅に対する中心位置の割合。10=左、50=中央、90=右。"),
    y: z
      .number()
      .min(45)
      .max(96)
      .describe("画面高さに対する足元の位置の割合。下に移すほど大きい値。"),
    size: z
      .number()
      .min(20)
      .max(70)
      .describe("画面高さに対するキャラ画像の高さの割合。"),
    flipped: z.boolean(),
  })
  .strict()
  .refine(
    (item) => findVariant(item.characterId, item.variantId),
    "未登録のキャラまたはバリエーションです。",
  );

export const sceneSchema = z
  .object({
    version: z.literal(1),
    backgroundId: z
      .string()
      .refine(
        (id) => backgrounds.some((item) => item.id === id),
        "未登録の背景です。",
      ),
    placements: z
      .array(placementSchema)
      .max(8)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "配置IDが重複しています。",
      ),
  })
  .strict();

export const roomSchema = z
  .object({
    roomId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    scene: sceneSchema,
  })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type Room = z.infer<typeof roomSchema>;

export const toolSchemas = {
  room_open: z.object({ roomId: z.string().uuid().optional() }).strict(),
  room_get: z.object({ roomId: z.string().uuid() }).strict(),
  room_update: z
    .object({
      roomId: z.string().uuid(),
      baseRevision: z
        .number()
        .int()
        .nonnegative()
        .describe("room_getまたは最新のモデルコンテキストにあるrevision。"),
      scene: sceneSchema.describe(
        "変更後の全配置。指定されていないキャラを削除しないこと。",
      ),
    })
    .strict(),
  room_catalog: z.object({}).strict(),
};
export type ToolName = keyof typeof toolSchemas;
