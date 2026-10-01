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
  assert.equal(updated.scene.placements.length, 2);
  const empty = store.update(room.roomId, 1, {
    ...updated.scene,
    placements: [],
  });
  assert.equal(empty.scene.placements.length, 0);
  assert.deepEqual(store.update(room.roomId, 2, saved).scene, saved);
});
