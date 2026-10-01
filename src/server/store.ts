import { randomUUID } from "node:crypto";
import {
  roomSchema,
  sceneSchema,
  type Room,
  type Scene,
} from "../shared/contracts.js";

export class RoomError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "CAPACITY",
    message: string,
  ) {
    super(message);
  }
}

export class RoomStore {
  private rooms = new Map<string, { room: Room; touched: number }>();
  constructor(
    private readonly now = Date.now,
    private readonly capacity = 128,
    private readonly ttlMs = 86_400_000,
  ) {}

  create(): Room {
    this.expire();
    if (this.rooms.size >= this.capacity)
      throw new RoomError(
        "CAPACITY",
        "部屋の作成上限に達しました。時間をおいて試してください。",
      );
    const room: Room = {
      roomId: randomUUID(),
      revision: 0,
      scene: {
        version: 1,
        backgroundId: "night",
        placements: [
          {
            id: randomUUID(),
            characterId: "darapan",
            variantId: "chibi",
            x: 50,
            y: 91,
            size: 57,
            flipped: false,
          },
        ],
      },
    };
    this.rooms.set(room.roomId, { room, touched: this.now() });
    return structuredClone(room);
  }

  get(roomId: string): Room {
    this.expire();
    const entry = this.rooms.get(roomId);
    if (!entry)
      throw new RoomError(
        "NOT_FOUND",
        "部屋が見つかりません。期限切れかサーバー再起動の可能性があります。room_openで新しい部屋を開いてください。",
      );
    entry.touched = this.now();
    return structuredClone(entry.room);
  }

  update(roomId: string, baseRevision: number, scene: Scene): Room {
    const current = this.get(roomId);
    if (current.revision !== baseRevision)
      throw new RoomError(
        "CONFLICT",
        "他の操作で配置が更新されました。room_getで最新状態を取得してから変更を適用し直してください。",
      );
    const room = roomSchema.parse({
      roomId,
      revision: current.revision + 1,
      scene: sceneSchema.parse(scene),
    });
    this.rooms.set(roomId, { room, touched: this.now() });
    return structuredClone(room);
  }

  private expire() {
    for (const [id, entry] of this.rooms)
      if (this.now() - entry.touched >= this.ttlMs) this.rooms.delete(id);
  }
}
