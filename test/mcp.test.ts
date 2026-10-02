import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { get } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, UI_URI } from "../src/server/mcp.js";
import { RoomStore } from "../src/server/store.js";
import { roomSchema } from "../src/shared/contracts.js";

const data = (result: Record<string, unknown>) =>
  result.structuredContent as Record<string, unknown>;

test("bundled HTML contains valid inline JavaScript and no unbundled asset requests", async () => {
  const html = await readFile("dist/room.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Script(script));
  assert.ok(html.includes("data:image/png;base64,"));
  assert.ok(!html.includes("<!-- APP_SCRIPT -->"));
  assert.ok(!/<script[^>]*src=/.test(html));
});

test("MCP discovery, UI metadata, resource and tool call contracts", async () => {
  const server = createMcpServer(
    new RoomStore(),
    "<!doctype html><title>だらぱんの部屋</title>",
  );
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await server.connect(left);
  await client.connect(right);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 4);
    const open = tools.find((item) => item.name === "room_open")!;
    assert.deepEqual(
      (open._meta?.["openai/ui"] as { entrypoints: unknown[] }).entrypoints,
      [{ type: "thread" }, { type: "global" }],
    );
    assert.equal(
      (open._meta?.ui as { resourceUri: string }).resourceUri,
      UI_URI,
    );
    const resource = await client.readResource({ uri: UI_URI });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    const opened = await client.callTool({ name: "room_open", arguments: {} });
    const room = roomSchema.parse(data(opened).room);
    const catalog = await client.callTool({
      name: "room_catalog",
      arguments: {},
    });
    assert.equal(
      (data(catalog).characters as { name: string }[])[0].name,
      "だらぱん",
    );
    const updated = await client.callTool({
      name: "room_update",
      arguments: {
        roomId: room.roomId,
        baseRevision: 0,
        scene: { ...room.scene, backgroundId: "day" },
      },
    });
    assert.equal(roomSchema.parse(data(updated).room).revision, 1);
    const stale = await client.callTool({
      name: "room_update",
      arguments: { roomId: room.roomId, baseRevision: 0, scene: room.scene },
    });
    assert.equal(stale.isError, true);
    const invalid = await client.callTool({
      name: "room_open",
      arguments: { roomId: "invalid" },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test("built server works over Streamable HTTP; production preview endpoints stay disabled", async () => {
  const child = spawn(process.execPath, ["dist/server.mjs"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const client = new Client({ name: "http-test", version: "1.0.0" });
  try {
    const address = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Server startup timed out: " + stderr)),
        10_000,
      );
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(Error(`Server exited (${code}): ${stderr}`));
      });
      child.stdout.on("data", (chunk) => {
        const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(address + "/mcp")),
    );
    assert.equal((await client.listTools()).tools.length, 4);
    const opened = await client.callTool({ name: "room_open", arguments: {} });
    const room = roomSchema.parse(data(opened).room);
    const read = await client.callTool({
      name: "room_get",
      arguments: { roomId: room.roomId },
    });
    assert.deepEqual(data(read).room, room);
    const resource = await client.readResource({ uri: UI_URI });
    assert.ok(
      "text" in resource.contents[0] &&
        resource.contents[0].text.includes("data:image/png;base64,"),
    );
    assert.equal((await fetch(address + "/mcp")).status, 405);
    assert.equal((await fetch(address + "/")).status, 404);
    assert.equal(
      (
        await fetch(address + "/api/tools/room_open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      404,
    );
    const forgedHostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        get(
          address + "/health",
          { headers: { Host: "untrusted.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        ).on("error", reject);
      },
    );
    assert.equal(forgedHostStatus, 403);
  } finally {
    await client.close();
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
  }
});
