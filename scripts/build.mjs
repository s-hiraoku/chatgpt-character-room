import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { characters, backgrounds } from "../src/shared/catalog.ts";

const images = {};
for (const file of new Set([
  ...characters.flatMap((character) =>
    character.variants.map((variant) => variant.image),
  ),
  ...backgrounds.map((item) => item.image).filter(Boolean),
])) {
  if (!/^[\w-]+\.(png|jpe?g|webp)$/.test(file))
    throw new Error(`Unsupported asset filename: ${file}`);
  const bytes = await readFile(new URL(`../assets/${file}`, import.meta.url));
  const mime = /\.png$/.test(file)
    ? "image/png"
    : /\.webp$/.test(file)
      ? "image/webp"
      : "image/jpeg";
  images[file] = `data:${mime};base64,${bytes.toString("base64")}`;
}
await mkdir("dist", { recursive: true });
const app = await build({
  entryPoints: ["src/web/main.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2022",
  outfile: "dist/app.js",
  write: false,
  define: { __ASSET_IMAGES__: JSON.stringify(images) },
});
const js = app.outputFiles
  .find((file) => file.path.endsWith(".js"))
  .text.replace(/<\/script/gi, "<\\/script");
const css = app.outputFiles.find((file) => file.path.endsWith(".css")).text;
const template = await readFile("src/web/index.html", "utf8");
await writeFile(
  "dist/room.html",
  template
    .replace("<!-- APP_STYLE -->", () => `<style>${css}</style>`)
    .replace("<!-- APP_SCRIPT -->", () => `<script>${js}</script>`),
);
await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
});
console.log(
  "Built server and self-contained MCP App (images, CSS, JS embedded).",
);
