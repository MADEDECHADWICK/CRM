// A dependency-free static server for the exported web bundle (dist/).
// Lets you present the built web app on the LAN with `pnpm --filter web serve`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const requested = normalize(join(root, urlPath === "/" ? "index.html" : urlPath));

    // Never serve outside the bundle directory.
    if (!requested.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let filePath = requested;
    let data;
    try {
      data = await readFile(filePath);
    } catch {
      // Single-page output: unknown paths fall back to index.html.
      filePath = join(root, "index.html");
      data = await readFile(filePath);
    }

    res.writeHead(200, { "Content-Type": TYPES[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(500).end("Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Web bundle served at http://<this-machine-ip>:${port}  (from ${root})`);
});
