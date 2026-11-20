import { createServer } from "node:http";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { createAiHandler } from "./ai.ts";

const root = resolve("dist");
if (!existsSync(resolve(root, "index.html")))
  throw Error("Run npm run build before npm start.");
const ai = createAiHandler();
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

const server = createServer({ requestTimeout: 30_000 }, (req, res) => {
  if (req.url?.startsWith("/api/")) {
    void ai(req, res);
    return;
  }
  try {
    if (!["GET", "HEAD"].includes(req.method ?? "")) {
      res.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (
      !file.startsWith(root + sep) ||
      !existsSync(file) ||
      !realpathSync(file).startsWith(realpathSync(root) + sep) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; frame-ancestors 'none'",
    });
    if (req.method === "HEAD") res.end();
    else
      createReadStream(file)
        .on("error", () => res.destroy())
        .pipe(res);
  } catch {
    res.writeHead(400).end();
  }
});
const port = Number(process.env.IDBUILD_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("IDBUILD_PORT must be between 1 and 65535.");
server.listen(port, "127.0.0.1", () =>
  console.log(`3D IDbuild home · http://127.0.0.1:${port}/`),
);
