// Read-only static server for the visual harness, bound to localhost only.
// Serves the harness, its fixtures, the app's fonts and local scratch fixtures.
//   npm run visual:serve            -> http://127.0.0.1:4601/tools/visual-harness/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, resolve, sep } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4601);
const allowed = ["tools/visual-harness/", "public/", "tmp/fixtures/", "tmp/bench/"];
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname).replace(/^\/+/, "");
  const file = normalize(resolve(root, path.endsWith("/") || !path ? `${path}index.html` : path));
  const rel = file
    .slice(root.length + 1)
    .split(sep)
    .join("/");
  if (!file.startsWith(root + sep) || !allowed.some((a) => rel.startsWith(a))) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Visual harness: http://127.0.0.1:${port}/tools/visual-harness/`));
