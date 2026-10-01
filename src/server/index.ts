import { readFile } from "node:fs/promises";
import express from "express";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp.js";
import { RoomStore } from "./store.js";
import { callRoomTool } from "./tools.js";
import { toolSchemas, type ToolName } from "../shared/contracts.js";

const html = await readFile(new URL("./room.html", import.meta.url), "utf8");
const store = new RoomStore();
const host = process.env.HOST ?? "127.0.0.1";
export const app = express();
const allowedHosts =
  process.env.ALLOWED_HOSTS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ??
  (["127.0.0.1", "localhost", "::1"].includes(host)
    ? ["127.0.0.1", "localhost", "[::1]"]
    : null);
if (allowedHosts) app.use(hostHeaderValidation(allowedHosts));
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// The preview API runs only in local development. MCP Apps use the host bridge.
if (process.env.NODE_ENV !== "production") {
  app.get("/", (_req, res) => res.type("html").send(html));
  app.post("/api/tools/:name", (req, res) => {
    const origin = req.get("origin");
    if (origin && origin !== `${req.protocol}://${req.get("host")}`)
      return void res.status(403).json({ error: "Origin not allowed" });
    const name = req.params.name;
    if (!Object.hasOwn(toolSchemas, name))
      return void res.status(404).json({ error: "Unknown tool" });
    res.json(callRoomTool(store, name as ToolName, req.body));
  });
}

app.post("/mcp", async (req, res) => {
  const server = createMcpServer(store, html);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(
      "MCP request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    if (!res.headersSent)
      res
        .status(500)
        .json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "MCP request failed" },
          id: null,
        });
  }
});
app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
const port = Number(process.env.PORT ?? 3000);
const listener = app.listen(port, host, () => {
  const address = listener.address();
  console.log(
    `Character Room: http://${host}:${typeof address === "object" && address ? address.port : port} | MCP: /mcp`,
  );
});
