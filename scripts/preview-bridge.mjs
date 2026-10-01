import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "local-ui-test-host", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(
    new URL(process.env.MCP_URL ?? "http://127.0.0.1:3000/mcp"),
  ),
);
const bundle = await build({
  entryPoints: ["scripts/bridge-host.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  write: false,
});
const html = await readFile("dist/room.html", "utf8");
const host = createMcpExpressApp();
host.use(express.json({ limit: "32kb" }));
host.get("/", (_req, res) =>
  res
    .type("html")
    .send(
      '<!doctype html><html lang="ja"><meta charset="UTF-8"><title>MCP Apps テストホスト</title><style>body{margin:0;font:14px system-ui}header{padding:12px;background:#e7eee2}iframe{border:0;width:100%;height:1100px}pre{white-space:pre-wrap;padding:12px}</style><header>MCP Appsのローカルテスト（ChatGPT実環境ではありません） <button id="model-move">模擬モデル：右へ移動</button></header><iframe title="だらぱんの部屋" sandbox="allow-scripts allow-downloads"></iframe><details><summary>画面から共有されたモデルコンテキスト</summary><pre id="context"></pre></details><script type="module" src="/host.js"></script></html>',
    ),
);
host.get("/favicon.ico", (_req, res) => res.status(204).end());
host.get("/host.js", (_req, res) =>
  res.type("js").send(bundle.outputFiles[0].text),
);
host.get("/widget", (_req, res) => res.type("html").send(html));
host.post("/tools", async (req, res) => {
  if (req.get("origin") && req.get("origin") !== `http://${req.get("host")}`)
    return void res.status(403).end();
  try {
    res.json(await client.callTool(req.body));
  } catch {
    res
      .status(502)
      .json({
        isError: true,
        content: [{ type: "text", text: "MCP request failed" }],
      });
  }
});
host.listen(3001, "127.0.0.1", () =>
  console.log("MCP Apps test host: http://127.0.0.1:3001"),
);
