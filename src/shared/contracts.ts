import { z } from "zod";
import { backgrounds, findVariant, furnitureCatalog } from "./catalog.js";

export const placementSchema = z
  .object({
    id: z.string().uuid(),
    characterId: z.string().max(64),
    variantId: z.string().max(64),
    x: z
      .number()
      .min(10)
      .max(90)
      .describe(
        "部屋の床の左右。10=左端、50=中央、90=右端。カメラを回しても位置は変わらない。",
      ),
    y: z
      .number()
      .min(45)
      .max(96)
      .describe("部屋の床の奥行き。45=窓側、96=手前。"),
    size: z
      .number()
      .min(8)
      .max(70)
      .describe("基準高さ5mに対する画像の高さの割合。27は1.35m、14は0.7m。"),
    flipped: z.boolean(),
  })
  .strict()
  .refine(
    (item) => findVariant(item.characterId, item.variantId),
    "未登録のキャラまたはバリエーションです。",
  );

const floorPosition = {
  x: z.number().min(10).max(90),
  y: z.number().min(45).max(96),
};
export const furnitureSchema = z
  .object({
    id: z.string().uuid(),
    furnitureId: z
      .string()
      .refine(
        (id) => furnitureCatalog.some((item) => item.id === id),
        "未登録の家具です。",
      ),
    ...floorPosition,
    rotation: z.number().min(0).max(359).describe("床上の回転角度。度単位。"),
    scale: z
      .number()
      .min(0.6)
      .max(1.6)
      .describe("家具の元の大きさに対する倍率。"),
  })
  .strict();
const sceneFields = {
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
};
export const sceneSchema = z
  .object({
    version: z.literal(2),
    ...sceneFields,
    furniture: z
      .array(furnitureSchema)
      .max(12)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "家具IDが重複しています。",
      ),
  })
  .strict()
  .refine(
    (scene) =>
      new Set([...scene.placements, ...scene.furniture].map((item) => item.id))
        .size ===
      scene.placements.length + scene.furniture.length,
    "キャラと家具の配置IDが重複しています。",
  );
const legacySceneSchema = z
  .object({ version: z.literal(1), ...sceneFields })
  .strict();
export function parseSavedScene(value: unknown) {
  const current = sceneSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = legacySceneSchema.parse(value);
  return sceneSchema.parse({
    ...legacy,
    version: 2,
    furniture: [],
    placements: legacy.placements.map((item) => ({
      ...item,
      size: Math.max(8, Math.round(item.size / 2)),
    })),
  });
}
export type FurniturePlacement = z.infer<typeof furnitureSchema>;

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
        "変更後の全配置。未変更のキャラと家具を保持すること。",
      ),
    })
    .strict(),
  room_catalog: z.object({}).strict(),
};
export type ToolName = keyof typeof toolSchemas;
