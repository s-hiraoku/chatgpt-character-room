import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { characters, furnitureCatalog } from "../src/shared/catalog.js";
import {
  floorPoint,
  floorPlacement,
  characterHeight,
} from "../src/shared/room-layout.js";
import { parseSavedScene, sceneSchema } from "../src/shared/contracts.js";
import { RoomStore } from "../src/server/store.js";

test("all GLB models are self contained and load with the runtime GLTFLoader", async () => {
  for (const file of [
    "room.glb",
    ...furnitureCatalog.map((item) => item.model),
  ]) {
    const bytes = await readFile("assets/models/" + file);
    assert.equal(bytes.subarray(0, 4).toString(), "glTF");
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    assert.ok(data.buffers.every((item: { uri?: string }) => !item.uri));
    assert.ok(!data.images?.length);
    assert.equal(
      data.scenes.length,
      1,
      file + " must contain only its production scene",
    );
    const expectedNodes: Record<string, number> = {
      "room.glb": 133,
      "table.glb": 7,
      "sofa.glb": 14,
      "lamp.glb": 4,
      "plant.glb": 10,
    };
    assert.equal(
      data.nodes.length,
      expectedNodes[file],
      file + " must not include objects selected in other scenes",
    );
    const model = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    assert.ok(model.scene.children.length > 0);
  }
});

test("every character variant points to an existing PNG", async () => {
  for (const file of characters.flatMap((item) =>
    item.variants.map((v) => v.image),
  )) {
    const bytes = await readFile("assets/" + file);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  }
});

test("floor positions stay in bounds and inverse mapping survives camera independent coordinates", () => {
  for (const x of [10, 50, 90])
    for (const y of [45, 70, 96]) {
      const point = floorPoint({ x, y });
      assert.deepEqual(floorPlacement(point.x, point.z), { x, y });
    }
  assert.deepEqual(floorPlacement(-100, 100), { x: 10, y: 96 });
  assert.equal(characterHeight({ size: 27 }), 1.35);
});

test("saved v1 character layouts import at half size while v2 furniture is preserved", () => {
  const scene = new RoomStore().create().scene;
  const legacy = {
    version: 1,
    backgroundId: "night",
    placements: [{ ...scene.placements[0], variantId: "classic", size: 56 }],
  };
  const restored = parseSavedScene(legacy);
  assert.equal(restored.version, 2);
  assert.equal(restored.placements[0].size, 28);
  assert.deepEqual(restored.furniture, []);
  assert.deepEqual(parseSavedScene(JSON.parse(JSON.stringify(scene))), scene);
  assert.equal(
    sceneSchema.safeParse({
      ...scene,
      furniture: Array.from({ length: 13 }, (_, i) => ({
        ...scene.furniture[0],
        id: crypto.randomUUID(),
      })),
    }).success,
    false,
  );
  assert.throws(() => parseSavedScene({ ...legacy, backgroundId: "missing" }));
});
