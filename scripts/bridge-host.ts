import {
  AppBridge,
  PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-bridge";
const frame = document.querySelector("iframe")!;
let currentRoom: { roomId: string } | null = null;
const call = async (name: string, args: Record<string, unknown>) => {
  const response = await fetch("/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args }),
  });
  return response.json();
};
const bridge = new AppBridge(
  null,
  { name: "Local MCP Apps test host", version: "0.1.0" },
  { serverTools: {}, updateModelContext: {} },
);
bridge.oncalltool = (params) => call(params.name, params.arguments ?? {});
bridge.onupdatemodelcontext = async (params) => {
  currentRoom = params.structuredContent?.room as { roomId: string };
  document.getElementById("context")!.textContent = JSON.stringify(
    params.structuredContent,
    null,
    2,
  );
  return {};
};
bridge.oninitialized = async () => {
  const result = await call("room_open", {});
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult(result);
};
await bridge.connect(
  new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
);
frame.src = "/widget";
document.getElementById("model-move")!.addEventListener("click", async () => {
  if (!currentRoom) return;
  const result = await call("room_get", { roomId: currentRoom.roomId });
  const room = result.structuredContent.room;
  if (room.scene.placements[0]) room.scene.placements[0].x = 75;
  const update = await call("room_update", {
    roomId: room.roomId,
    baseRevision: room.revision,
    scene: room.scene,
  });
  await bridge.sendToolResult(update);
});
