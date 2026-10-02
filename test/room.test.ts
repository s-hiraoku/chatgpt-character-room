import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RoomStore, RoomError } from "../src/server/store.js";
import { callRoomTool } from "../src/server/tools.js";

test("rooms and returned snapshots are independent", () => {
  const store = new RoomStore();
  const a = store.create();
  const b = store.create();
  assert.notEqual(a.roomId, b.roomId);
  a.scene.placements[0].x = 75;
  assert.equal(store.get(a.roomId).scene.placements[0].x, 50);
  store.update(a.roomId, a.revision, a.scene);
  assert.equal(store.get(a.roomId).scene.placements[0].x, 75);
  assert.equal(store.get(b.roomId).scene.placements[0].x, 50);
});

test("stale writes cannot overwrite a newer layout", () => {
  const store = new RoomStore();
  const room = store.create();
  const next = structuredClone(room.scene);
  next.backgroundId = "day";
  store.update(room.roomId, room.revision, next);
  assert.throws(
    () => store.update(room.roomId, room.revision, room.scene),
    (error) => error instanceof RoomError && error.code === "CONFLICT",
  );
  assert.equal(store.get(room.roomId).scene.backgroundId, "day");
});

test("expired room IDs cannot access new rooms; bounded capacity recovers after expiry", () => {
  let now = 0;
  const store = new RoomStore(() => now, 1, 100);
  const room = store.create();
  assert.throws(
    () => store.create(),
    (error) => error instanceof RoomError && error.code === "CAPACITY",
  );
  now = 100;
  assert.throws(
    () => store.get(room.roomId),
    (error) => error instanceof RoomError && error.code === "NOT_FOUND",
  );
  assert.notEqual(store.create().roomId, room.roomId);
});

test("updates reject unregistered assets, duplicate IDs, excessive counts and invalid coordinates", () => {
  const store = new RoomStore();
  const room = store.create();
  const invalidScenes = [
    { ...room.scene, backgroundId: "../../etc/passwd" },
    {
      ...room.scene,
      placements: [{ ...room.scene.placements[0], variantId: "angry" }],
    },
    { ...room.scene, placements: [{ ...room.scene.placements[0], x: 999 }] },
    {
      ...room.scene,
      placements: [room.scene.placements[0], room.scene.placements[0]],
    },
    {
      ...room.scene,
      placements: Array.from({ length: 9 }, () => ({
        ...room.scene.placements[0],
        id: randomUUID(),
      })),
    },
    { ...room.scene, privatePath: "/etc/passwd" },
  ];
  for (const scene of invalidScenes) {
    const result = callRoomTool(store, "room_update", {
      roomId: room.roomId,
      baseRevision: 0,
      scene,
    });
    assert.equal(result.isError, true);
  }
  assert.equal(store.get(room.roomId).revision, 0);
});

test("multiple characters, removal of all characters and saved layouts are supported", () => {
  const store = new RoomStore();
  const room = store.create();
  const extra = {
    ...room.scene.placements[0],
    id: randomUUID(),
    variantId: "classic",
    flipped: true,
  };
  const saved = JSON.parse(
    JSON.stringify({
      ...room.scene,
      placements: [...room.scene.placements, extra],
    }),
  );
  const updated = store.update(room.roomId, 0, saved);
  assert.equal(updated.scene.placements.length, 3);
  const empty = store.update(room.roomId, 1, {
    ...updated.scene,
    placements: [],
  });
  assert.equal(empty.scene.placements.length, 0);
  assert.deepEqual(store.update(room.roomId, 2, saved).scene, saved);
});

test("new rooms start with small Darapan, Mochipan and four movable furniture items", () => {
  const room = new RoomStore().create();
  assert.equal(room.scene.version, 2);
  assert.deepEqual(
    room.scene.placements.map((item) => [
      item.characterId,
      item.variantId,
      item.size,
    ]),
    [
      ["darapan", "cyber", 27],
      ["mochipan", "normal", 14],
    ],
  );
  assert.deepEqual(
    room.scene.furniture.map((item) => item.furnitureId),
    ["sofa", "table", "lamp", "plant"],
  );
});

test("furniture updates round trip and reject invalid IDs, rotations, scales and shared placement IDs", () => {
  const store = new RoomStore();
  const room = store.create();
  const scene = structuredClone(room.scene);
  Object.assign(scene.furniture[0], { x: 78, y: 64, rotation: 90, scale: 1.3 });
  assert.deepEqual(store.update(room.roomId, 0, scene).scene, scene);
  for (const patch of [
    { furnitureId: "unknown" },
    { rotation: 360 },
    { scale: 9 },
    { x: 0 },
    { id: scene.placements[0].id },
  ]) {
    const invalid = structuredClone(scene);
    Object.assign(invalid.furniture[0], patch);
    assert.equal(
      callRoomTool(store, "room_update", {
        roomId: room.roomId,
        baseRevision: 1,
        scene: invalid,
      }).isError,
      true,
    );
  }
  const duplicated = {
    ...scene,
    furniture: [scene.furniture[0], scene.furniture[0]],
  };
  assert.equal(
    callRoomTool(store, "room_update", {
      roomId: room.roomId,
      baseRevision: 1,
      scene: duplicated,
    }).isError,
    true,
  );
  assert.equal(store.get(room.roomId).revision, 1);
});
