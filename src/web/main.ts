import { App } from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import {
  backgrounds,
  characters,
  findVariant,
  furnitureCatalog,
} from "../shared/catalog.js";
import {
  roomSchema,
  parseSavedScene,
  type FurniturePlacement,
  type Placement,
  type Room,
  type Scene,
  type ToolName,
} from "../shared/contracts.js";
import "./style.css";
import { RoomView } from "./room-view.js";
import { floorPoint, floorPlacement } from "../shared/room-layout.js";

declare const __ASSET_MODELS__: Record<string, string>;
declare const __ASSET_IMAGES__: Record<string, string>;
declare global {
  interface Window {
    openai?: {
      widgetState?: { privateContent?: { roomId?: string } };
      setWidgetState?: (state: unknown) => void;
    };
  }
}
type ToolResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
};
const images = __ASSET_IMAGES__;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const stage = el<HTMLDivElement>("stage");
const actors = el<HTMLDivElement>("actors");
const status = el<HTMLParagraphElement>("status");
const editMode = el<HTMLInputElement>("edit-mode");
const inHost = window.parent !== window;
const app = inHost
  ? new App({ name: "character-room", version: "0.2.0" }, {})
  : null;
const extensions = app ? new OpenAIExtensions(app) : null;
let connected = !inHost;
let room: Room | null = null;
let selectedId: string | null = null;
let selectedFurnitureId: string | null = null;
let viewer: RoomView | null = null;
let actorDraft: Placement | null = null;
let busy = false;
let contextQueue: Promise<void> = Promise.resolve();
const actorNodes = new Map<string, HTMLButtonElement>();

function selected() {
  return room?.scene.placements.find((item) => item.id === selectedId);
}
function announce(message: string) {
  status.textContent = message;
}
function describeRoom(value: Room) {
  return (
    `${backgrounds.find((item) => item.id === value.scene.backgroundId)?.name}。` +
    value.scene.placements
      .map(
        (item) =>
          `${characters.find((character) => character.id === item.characterId)?.name}（配置ID:${item.id}、横:${item.x}%、足元:${item.y}%、高さ:${item.size}%）`,
      )
      .join("、") +
    `。家具:${value.scene.furniture.map((item) => `${furnitureCatalog.find((value) => value.id === item.furnitureId)?.name}（配置ID:${item.id}、左右:${item.x}、奥行き:${item.y}、回転:${item.rotation}度、倍率:${item.scale}）`).join("、")}`
  );
}

async function callTool(
  name: ToolName,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  let result: ToolResult;
  if (app) {
    if (!connected) throw Error("ChatGPTとの接続が完了していません。");
    result = await app.callServerTool({ name, arguments: args });
  } else {
    const response = await fetch(`/api/tools/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok)
      throw Error(`サーバーに接続できませんでした (${response.status})。`);
    result = await response.json();
  }
  if (result.isError)
    throw Error(
      result.content?.find((item) => item.type === "text")?.text ??
        "操作に失敗しました。",
    );
  return result;
}

function acceptResult(result: ToolResult) {
  const parsed = roomSchema.safeParse(result.structuredContent?.room);
  if (!parsed.success) return;
  if (
    room?.roomId === parsed.data.roomId &&
    parsed.data.revision < room.revision
  )
    return;
  room = parsed.data;
  if (
    selectedFurnitureId &&
    !room.scene.furniture.some((item) => item.id === selectedFurnitureId)
  )
    selectedFurnitureId = null;
  if (
    !selectedFurnitureId &&
    !room.scene.placements.some((item) => item.id === selectedId)
  )
    selectedId = room.scene.placements[0]?.id ?? null;
  render();
  if (!app) {
    try {
      sessionStorage.setItem("character-room-id", room.roomId);
    } catch {
      /* Preview may run with browser storage disabled. */
    }
  }
  syncContext();
}

function syncContext() {
  if (!app || !connected || !room) return;
  const snapshot = structuredClone(room);
  window.openai?.setWidgetState?.({
    privateContent: { roomId: snapshot.roomId },
    modelContent: { room: snapshot },
  });
  contextQueue = contextQueue
    .then(async () => {
      await app.updateModelContext({
        content: [{ type: "text", text: describeRoom(snapshot) }],
        structuredContent: { room: snapshot },
      });
    })
    .catch(() =>
      announce(
        "画面は更新しましたが、会話への状態共有に失敗しました。次の変更前にroom_getで確認してください。",
      ),
    );
}

async function perform(operation: () => Promise<void>) {
  if (busy) return;
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  busy = true;
  render();
  try {
    await operation();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "操作に失敗しました。";
    if (message.startsWith("CONFLICT") && room) {
      try {
        acceptResult(await callTool("room_get", { roomId: room.roomId }));
        announce(
          "別の操作で配置が変わりました。最新状態を表示しました。もう一度操作してください。",
        );
      } catch {
        announce(
          "最新の配置を取得できませんでした。接続を確認して部屋を開き直してください。",
        );
      }
    } else if (message.startsWith("NOT_FOUND")) {
      try {
        acceptResult(await callTool("room_open", {}));
        announce(
          "前の部屋は期限切れでした。新しい部屋を開きました。保存済み配置を読み込めます。",
        );
      } catch {
        announce(
          "新しい部屋を開けませんでした。接続を確認して再読み込みしてください。",
        );
      }
    } else {
      render();
      announce(message);
    }
  } finally {
    busy = false;
    render();
    if (document.activeElement === document.body && previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
  }
}

async function updateScene(scene: Scene) {
  if (!room) return;
  acceptResult(
    await callTool("room_update", {
      roomId: room.roomId,
      baseRevision: room.revision,
      scene,
    }),
  );
}
function patchSelected(patch: Partial<Placement>) {
  const item = selected();
  if (!item || !room) return;
  const scene = structuredClone(room.scene);
  Object.assign(
    scene.placements.find((value) => value.id === item.id)!,
    patch,
  );
  void perform(async () => {
    await updateScene(scene);
    announce("配置を更新しました。");
  });
}

function makeActor(id: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "actor";
  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  button.append(image);
  button.addEventListener("click", () => {
    selectedId = id;
    selectedFurnitureId = null;
    render();
  });
  button.addEventListener("keydown", (event) => {
    const item = room?.scene.placements.find((value) => value.id === id);
    if (
      !item ||
      busy ||
      !editMode.checked ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    selectedId = id;
    selectedFurnitureId = null;
    const step = event.shiftKey ? 5 : 1;
    patchSelected({
      x: Math.max(
        10,
        Math.min(
          90,
          item.x +
            (event.key === "ArrowRight"
              ? step
              : event.key === "ArrowLeft"
                ? -step
                : 0),
        ),
      ),
      y: Math.max(
        45,
        Math.min(
          96,
          item.y +
            (event.key === "ArrowDown"
              ? step
              : event.key === "ArrowUp"
                ? -step
                : 0),
        ),
      ),
    });
  });
  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    item: Placement;
    moved: boolean;
    revision: number;
  } | null = null;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || busy || !room || !editMode.checked) return;
    const item = room.scene.placements.find((value) => value.id === id)!;
    selectedId = id;
    selectedFurnitureId = null;
    render();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      item: structuredClone(item),
      moved: false,
      revision: room.revision,
    };
    button.setPointerCapture(event.pointerId);
  });
  function draftPosition(event: PointerEvent) {
    if (!drag) return null;
    if (viewer) {
      const delta = viewer.floorDelta(
        drag.startX,
        drag.startY,
        event.clientX,
        event.clientY,
      );
      if (!delta) return { x: drag.item.x, y: drag.item.y };
      const point = floorPoint(drag.item);
      return floorPlacement(point.x + delta.x, point.z + delta.z);
    }
    const rect = stage.getBoundingClientRect();
    return {
      x: Math.round(
        Math.max(
          10,
          Math.min(
            90,
            drag.item.x + ((event.clientX - drag.startX) / rect.width) * 100,
          ),
        ),
      ),
      y: Math.round(
        Math.max(
          45,
          Math.min(
            96,
            drag.item.y + ((event.clientY - drag.startY) / rect.height) * 100,
          ),
        ),
      ),
    };
  }
  button.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const patch = draftPosition(event)!;
    drag.moved ||=
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3;
    actorDraft = { ...drag.item, ...patch };
    viewer?.previewPlacement(actorDraft);
    placeActor(button, actorDraft);
  });
  button.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    const patch = draftPosition(event)!;
    drag = null;
    actorDraft = null;
    button.releasePointerCapture(event.pointerId);
    if (!finished.moved) return;
    if (room?.revision !== finished.revision) {
      render();
      announce("ドラッグ中に配置が更新されました。もう一度動かしてください。");
      return;
    }
    patchSelected(patch);
  });
  button.addEventListener("pointercancel", () => {
    drag = null;
    render();
  });
  return button;
}

function placeActor(button: HTMLButtonElement, item: Placement) {
  if (viewer) {
    const projected = viewer.project(item);
    button.style.left = `${projected.left}%`;
    button.style.top = `${projected.top}%`;
    button.style.height = `${projected.height}px`;
    button.style.width = `${projected.width}px`;
    button.style.zIndex = String(Math.round(projected.top));
    button.hidden = !projected.visible;
    return;
  }
  const rect = stage.getBoundingClientRect();
  const width = (rect.height * item.size) / 100;
  const halfWidth = rect.width ? (width / rect.width) * 50 : 10;
  button.style.height = `${item.size}%`;
  button.style.left = `${Math.max(halfWidth + 1, Math.min(99 - halfWidth, item.x))}%`;
  button.style.top = `${Math.max(item.size + 1, item.y)}%`;
  button.style.zIndex = String(Math.round(item.y));
  button.querySelector("img")!.style.transform = item.flipped
    ? "scaleX(-1)"
    : "none";
}

function render() {
  actorDraft = null;
  if (room)
    viewer?.update(
      room,
      selectedFurnitureId ?? selectedId,
      editMode.checked && !busy,
    );
  renderFurniture();
  stage.classList.toggle("editing", editMode.checked);
  const currentIds = new Set(
    room?.scene.placements.map((item) => item.id) ?? [],
  );
  for (const [id, node] of actorNodes)
    if (!currentIds.has(id)) {
      node.remove();
      actorNodes.delete(id);
    }
  for (const item of room?.scene.placements ?? []) {
    let node = actorNodes.get(item.id);
    if (!node) {
      node = makeActor(item.id);
      actorNodes.set(item.id, node);
      actors.append(node);
    }
    const character = characters.find(
      (value) => value.id === item.characterId,
    )!;
    node.querySelector("img")!.src =
      images[findVariant(item.characterId, item.variantId)!.image];
    node.setAttribute("aria-label", `${character.name}を配置。矢印キーで移動`);
    node.setAttribute("aria-pressed", String(item.id === selectedId));
    node.disabled = !editMode.checked;
    node.setAttribute("aria-disabled", String(busy || !editMode.checked));
    node.classList.toggle("selected", item.id === selectedId);
    placeActor(node, item);
  }
  el("empty").hidden = !room || room.scene.placements.length !== 0;
  el("count").textContent = room
    ? `${room.scene.placements.length} / 8 キャラ`
    : "—";
  const background = backgrounds.find(
    (value) => value.id === room?.scene.backgroundId,
  );
  if (background) {
    stage.dataset.background = background.id;
    el("scene-heading").textContent = background.name;
    stage.classList.toggle("custom-background", !!background.image);
    el("room-fallback").style.backgroundImage = background.image
      ? `url("${images[background.image]}")`
      : "";
  }
  for (const button of el("backgrounds").querySelectorAll<HTMLButtonElement>(
    "button",
  )) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.id === background?.id),
    );
    button.disabled = busy || !room;
  }
  const list = el("character-list");
  const focusedPlacementId =
    document.activeElement instanceof HTMLElement &&
    list.contains(document.activeElement)
      ? document.activeElement.dataset.placement
      : undefined;
  list.replaceChildren();
  for (const item of room?.scene.placements ?? []) {
    const character = characters.find(
      (value) => value.id === item.characterId,
    )!;
    const variant = findVariant(item.characterId, item.variantId)!;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "character-choice";
    button.dataset.placement = item.id;
    button.setAttribute("aria-pressed", String(item.id === selectedId));
    const img = document.createElement("img");
    img.src = images[variant.image];
    img.alt = "";
    const text = document.createElement("span");
    text.textContent = character.name;
    const small = document.createElement("small");
    small.textContent = variant.name;
    text.append(small);
    button.append(img, text);
    button.addEventListener("click", () => {
      selectedId = item.id;
      selectedFurnitureId = null;
      render();
    });
    list.append(button);
  }
  if (focusedPlacementId)
    list
      .querySelector<HTMLButtonElement>(
        `[data-placement="${focusedPlacementId}"]`,
      )
      ?.focus({ preventScroll: true });
  const item = selected();
  el("selection").hidden = !item;
  if (item) {
    const character = characters.find(
      (value) => value.id === item.characterId,
    )!;
    el("selected-name").textContent = character.name;
    const select = el<HTMLSelectElement>("variant");
    if (select.dataset.character !== character.id) {
      select.replaceChildren(
        ...character.variants.map(
          (variant) => new Option(variant.name, variant.id),
        ),
      );
      select.dataset.character = character.id;
    }
    if (!busy) select.value = item.variantId;
    select.disabled = busy;
    for (const key of ["size", "x", "y"] as const) {
      if (!busy) {
        el<HTMLInputElement>(key).value = String(item[key]);
        el(key + "-value").textContent = `${item[key]}%`;
      }
      el<HTMLInputElement>(key).disabled = busy;
    }
    if (!busy) el<HTMLInputElement>("flip").checked = item.flipped;
    el<HTMLInputElement>("flip").disabled = busy;
    el<HTMLButtonElement>("remove").disabled = busy;
  }
  el<HTMLButtonElement>("add").disabled =
    busy || !room || room.scene.placements.length >= 8;
  for (const id of ["save", "load"])
    el<HTMLButtonElement>(id).disabled = busy || !room;
}

for (const background of backgrounds) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "background-choice";
  button.dataset.id = background.id;
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.dataset.id = background.id;
  swatch.setAttribute("aria-hidden", "true");
  if (background.image) {
    swatch.style.backgroundImage = `url("${images[background.image]}")`;
    swatch.style.backgroundSize = "cover";
  }
  const text = document.createElement("span");
  text.textContent = background.name;
  button.append(swatch, text);
  button.addEventListener(
    "click",
    () =>
      void perform(async () => {
        if (!room) return;
        await updateScene({ ...room.scene, backgroundId: background.id });
        announce(`${background.name}に切り替えました。`);
      }),
  );
  el("backgrounds").append(button);
}
el<HTMLSelectElement>("add-character").replaceChildren(
  ...characters.map((item) => new Option(item.name, item.id)),
);
editMode.addEventListener("change", render);
el("add").addEventListener(
  "click",
  () =>
    void perform(async () => {
      if (!room) return;
      const character = characters.find(
        (item) => item.id === el<HTMLSelectElement>("add-character").value,
      )!;
      const id = crypto.randomUUID();
      selectedId = id;
      selectedFurnitureId = null;
      await updateScene({
        ...room.scene,
        placements: [
          ...room.scene.placements,
          {
            id,
            characterId: character.id,
            variantId: character.variants[0].id,
            x: 35 + ((room.scene.placements.length * 7) % 35),
            y: 91,
            size: character.id === "mochipan" ? 14 : 27,
            flipped: false,
          },
        ],
      });
      announce(`${character.name}を追加しました。`);
    }),
);
el<HTMLSelectElement>("variant").addEventListener("change", (event) =>
  patchSelected({ variantId: (event.target as HTMLSelectElement).value }),
);
for (const key of ["size", "x", "y"] as const) {
  el<HTMLInputElement>(key).addEventListener("input", () => {
    const value = Number(el<HTMLInputElement>(key).value);
    el(key + "-value").textContent = `${value}%`;
    const item = selected();
    const node = item && actorNodes.get(item.id);
    if (node && item) {
      actorDraft = { ...item, [key]: value };
      viewer?.previewPlacement(actorDraft);
      placeActor(node, actorDraft);
    }
  });
  el<HTMLInputElement>(key).addEventListener("change", () =>
    patchSelected({ [key]: Number(el<HTMLInputElement>(key).value) }),
  );
}
el<HTMLInputElement>("flip").addEventListener("change", () =>
  patchSelected({ flipped: el<HTMLInputElement>("flip").checked }),
);
el("remove").addEventListener(
  "click",
  () =>
    void perform(async () => {
      if (!room) return;
      await updateScene({
        ...room.scene,
        placements: room.scene.placements.filter(
          (item) => item.id !== selectedId,
        ),
      });
      announce("キャラを部屋から外しました。素材はそのまま残っています。");
    }),
);
el("save").addEventListener("click", () => {
  if (!room) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(room.scene, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "darapan-room.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("配置ファイルを保存しました。");
});
el("load").addEventListener("click", () =>
  el<HTMLInputElement>("load-file").click(),
);
el<HTMLInputElement>("load-file").addEventListener(
  "change",
  (event) =>
    void perform(async () => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (file.size > 32_768)
        throw Error("配置ファイルが大きすぎます (32KBまで)。");
      let scene: Scene;
      try {
        scene = parseSavedScene(JSON.parse(await file.text()));
      } catch {
        throw Error(
          "この配置ファイルは読み込めません。登録されている素材と配置の形式を確認してください。",
        );
      }
      await updateScene(scene);
      announce("保存した配置を読み込みました。");
    }),
);
new ResizeObserver(() => {
  if (room)
    for (const item of room.scene.placements) {
      const node = actorNodes.get(item.id);
      if (node) placeActor(node, item);
    }
}).observe(stage);

async function start() {
  render();
  if (app) {
    app.ontoolresult = (result) => {
      if (result.isError)
        announce(
          "会話からの操作に失敗しました。最新の部屋の状態を確認してください。",
        );
      else {
        acceptResult(result);
        announce("部屋を更新しました。");
      }
    };
    app.onhostcontextchanged = () => {
      const parsed = roomSchema.safeParse(
        extensions?.modelContext?.getCurrent()?.structuredContent?.room,
      );
      if (
        parsed.success &&
        room?.roomId === parsed.data.roomId &&
        parsed.data.revision > room.revision
      )
        acceptResult({ structuredContent: { room: parsed.data } });
    };
    await app.connect();
    connected = true;
    el("connection").textContent = "接続済み";
    if (room) syncContext();
    // The entrypoint owns room creation. The result can arrive after connect().
    if (!room) {
      announce("ホストから部屋のデータを受け取っています。");
      return;
    }
  } else {
    el("connection").textContent = "プレビュー";
    let savedId: string | null = null;
    try {
      savedId = sessionStorage.getItem("character-room-id");
    } catch {
      /* No browser persistence required. */
    }
    await perform(async () => {
      acceptResult(
        await callTool(
          savedId ? "room_get" : "room_open",
          savedId ? { roomId: savedId } : {},
        ),
      );
    });
  }
  if (room) announce("だらぱんともちぱんの部屋へようこそ。");
}
function selectedFurniture() {
  return room?.scene.furniture.find((item) => item.id === selectedFurnitureId);
}
function patchFurniture(patch: Partial<FurniturePlacement>) {
  const item = selectedFurniture();
  if (!item || !room) return;
  const scene = structuredClone(room.scene);
  Object.assign(
    scene.furniture.find((value) => value.id === item.id)!,
    patch,
  );
  void perform(async () => {
    await updateScene(scene);
    announce("家具の配置を更新しました。");
  });
}
function renderFurniture() {
  const list = el("furniture-list");
  const focused =
    document.activeElement instanceof HTMLElement &&
    list.contains(document.activeElement)
      ? document.activeElement.dataset.furniture
      : undefined;
  list.replaceChildren();
  for (const item of room?.scene.furniture ?? []) {
    const info = furnitureCatalog.find(
      (value) => value.id === item.furnitureId,
    )!;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.furniture = item.id;
    button.textContent = info.name;
    button.setAttribute(
      "aria-pressed",
      String(item.id === selectedFurnitureId),
    );
    button.setAttribute("aria-disabled", String(busy));
    button.addEventListener("click", () => {
      selectedFurnitureId = item.id;
      selectedId = null;
      render();
    });
    button.addEventListener("keydown", (event) => {
      if (
        !editMode.checked ||
        busy ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      selectedFurnitureId = item.id;
      selectedId = null;
      patchFurniture({
        x: Math.max(
          10,
          Math.min(
            90,
            item.x +
              (event.key === "ArrowLeft"
                ? -1
                : event.key === "ArrowRight"
                  ? 1
                  : 0),
          ),
        ),
        y: Math.max(
          45,
          Math.min(
            96,
            item.y +
              (event.key === "ArrowUp"
                ? -1
                : event.key === "ArrowDown"
                  ? 1
                  : 0),
          ),
        ),
      });
    });
    list.append(button);
  }
  if (focused)
    list
      .querySelector<HTMLButtonElement>(`[data-furniture="${focused}"]`)
      ?.focus({ preventScroll: true });
  const item = selectedFurniture();
  el("furniture-selection").hidden = !item;
  if (item) {
    el("furniture-name").textContent = furnitureCatalog.find(
      (value) => value.id === item.furnitureId,
    )!.name;
    for (const key of ["x", "y", "rotation", "scale"] as const) {
      const input = el<HTMLInputElement>("furniture-" + key);
      input.disabled = busy;
      if (!busy) {
        input.value = String(item[key]);
        el("furniture-" + key + "-value").textContent =
          key === "rotation"
            ? `${item[key]}°`
            : key === "scale"
              ? `${item[key]}倍`
              : String(item[key]);
      }
    }
  }
  el<HTMLButtonElement>("remove-furniture").disabled = busy;
  for (const button of el(
    "furniture-catalog",
  ).querySelectorAll<HTMLButtonElement>("button"))
    button.disabled = busy || !room || room.scene.furniture.length >= 12;
  el("furniture-count").textContent = room
    ? `${room.scene.furniture.length} / 12`
    : "—";
}
for (const info of furnitureCatalog) {
  const button = document.createElement("button");
  button.type = "button";
  const icon = document.createElement("span");
  icon.textContent = info.icon;
  icon.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.textContent = info.name;
  button.append(icon, name);
  button.addEventListener(
    "click",
    () =>
      void perform(async () => {
        if (!room) return;
        const id = crypto.randomUUID();
        selectedFurnitureId = id;
        selectedId = null;
        await updateScene({
          ...room.scene,
          furniture: [
            ...room.scene.furniture,
            { id, furnitureId: info.id, x: 50, y: 85, rotation: 0, scale: 1 },
          ],
        });
        announce(`${info.name}を置きました。`);
      }),
  );
  el("furniture-catalog").append(button);
}
for (const key of ["x", "y", "rotation", "scale"] as const) {
  el<HTMLInputElement>("furniture-" + key).addEventListener("input", () => {
    const value = Number(el<HTMLInputElement>("furniture-" + key).value);
    el("furniture-" + key + "-value").textContent =
      key === "rotation"
        ? `${value}°`
        : key === "scale"
          ? `${value}倍`
          : String(value);
  });
  el<HTMLInputElement>("furniture-" + key).addEventListener("change", () =>
    patchFurniture({
      [key]: Number(el<HTMLInputElement>("furniture-" + key).value),
    }),
  );
}
el("remove-furniture").addEventListener(
  "click",
  () =>
    void perform(async () => {
      if (!room) return;
      await updateScene({
        ...room.scene,
        furniture: room.scene.furniture.filter(
          (item) => item.id !== selectedFurnitureId,
        ),
      });
      announce("家具を部屋から外しました。");
    }),
);
for (const [id, action] of Object.entries({
  "camera-reset": () => viewer?.resetCamera(),
  "camera-left": () => viewer?.rotate(-0.18),
  "camera-right": () => viewer?.rotate(0.18),
  "camera-in": () => viewer?.zoom(0.9),
  "camera-out": () => viewer?.zoom(1.1),
}))
  el(id).addEventListener("click", action);
try {
  viewer = new RoomView(stage, images, {
    project: () => {
      for (const item of room?.scene.placements ?? []) {
        const node = actorNodes.get(item.id);
        if (node)
          placeActor(node, actorDraft?.id === item.id ? actorDraft : item);
      }
    },
    selectFurniture: (id) => {
      selectedFurnitureId = id;
      selectedId = null;
      render();
    },
    moveFurniture: (id, patch, revision) => {
      if (!room || room.revision !== revision) {
        render();
        announce(
          "ドラッグ中に配置が更新されました。もう一度動かしてください。",
        );
        return;
      }
      selectedFurnitureId = id;
      patchFurniture(patch);
    },
    message: announce,
  });
  stage.classList.add("webgl");
  void viewer
    .load(__ASSET_MODELS__)
    .then(() => {
      el("scene-loading").hidden = true;
      stage.dataset.ready = "true";
    })
    .catch((error) => {
      el("scene-loading").textContent =
        "3D素材の読み込みに失敗しました。再読み込みしてください。";
      announce(
        error instanceof Error
          ? error.message
          : "3D素材を読み込めませんでした。",
      );
    });
} catch {
  viewer = null;
  el("scene-loading").textContent =
    "この環境では3D表示を利用できません。キャラの平面プレビューを表示しています。";
  stage.dataset.ready = "fallback";
  for (const button of el(
    "camera-controls",
  ).querySelectorAll<HTMLButtonElement>("button"))
    button.disabled = true;
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) viewer?.dispose();
});
void start().catch((error) => {
  el("connection").textContent = "接続できません";
  announce(error instanceof Error ? error.message : "接続に失敗しました。");
});
