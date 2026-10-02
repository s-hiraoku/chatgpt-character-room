import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const dest = new URL("../assets/models/", import.meta.url);
await mkdir(dest, { recursive: true });
const code = (
  await readFile(new URL("./build-room-models.py", import.meta.url), "utf8")
).replace(
  "__ASSET_DIR__",
  JSON.stringify(fileURLToPath(dest).replace(/\/$/, "")),
);
const client = new Client({
  name: "darapan-room-model-builder",
  version: "0.2.0",
});
try {
  await client.connect(
    new StdioClientTransport({
      command: "bash",
      args: [root + "scripts/blender-mcp.sh"],
      cwd: root,
    }),
  );
  const result = await client.callTool(
    {
      name: "execute_blender_code",
      arguments: {
        code,
        user_prompt: "マージしたので、実装をしよう。これで環境はできたよね？",
      },
    },
    undefined,
    { timeout: 120000 },
  );
  const text = result.content
    .filter((x) => x.type === "text")
    .map((x) => x.text)
    .join("\n");
  if (result.isError || !text.startsWith("Code executed successfully:"))
    throw Error(text);
  console.log(text);
} finally {
  await client.close();
}

// Keep unrelated scenes in the live Blender session out of the public source file.
const blender =
  process.env.BLENDER_BIN ??
  root + ".local/blender/Blender.app/Contents/MacOS/Blender";
const { stdout } = await promisify(execFile)(
  blender,
  [
    "--background",
    "--factory-startup",
    "--disable-autoexec",
    "--python-exit-code",
    "1",
    "--python",
    root + "scripts/save-model-source.py",
    "--",
    fileURLToPath(dest),
  ],
  {
    env: {
      ...process.env,
      BLENDER_USER_CONFIG: root + ".local/blender-user/config",
      BLENDER_USER_SCRIPTS: root + ".local/blender-user/scripts",
    },
    timeout: 120000,
  },
);
console.log(stdout);
