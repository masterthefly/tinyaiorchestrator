// A tiny static file server for trying the site locally. No dependencies.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
};
const ROOT = resolve("web");
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = resolve(ROOT, "." + (urlPath.endsWith("/") ? `${urlPath}index.html` : urlPath));
  // Never serve anything outside web/.
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": `${TYPES[extname(file)] ?? "application/octet-stream"}; charset=utf-8` });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`Open http://localhost:${port}`));
