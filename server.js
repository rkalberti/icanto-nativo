import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./src/api.js";
import { openDatabase } from "./src/database.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(currentDir, "public");
const port = Number(process.env.PORT || 3000);
const database = openDatabase();
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};
const mutableFiles = new Set([".html", ".css", ".js", ".json"]);

function sendStaticFile(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad request");
    return;
  }

  if (decodedPath === "/") decodedPath = "/index.html";
  const filePath = path.resolve(publicRoot, `.${decodedPath}`);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("Forbidden");
    return;
  }

  let fileStat;
  try {
    fileStat = statSync(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const isServiceWorker = filePath.endsWith("service-worker.js");
  const headers = {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Content-Length": fileStat.size,
    "Cache-Control": mutableFiles.has(extension) || isServiceWorker ? "no-cache" : "public, max-age=86400",
    "X-Content-Type-Options": "nosniff"
  };
  if (isServiceWorker) headers["Service-Worker-Allowed"] = "/";

  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, url, database);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    sendStaticFile(request, response, url.pathname);
  })().catch((error) => {
    console.error("Falha no servidor:", error);
    if (!response.headersSent) {
      response.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
    }
    if (!response.writableEnded) response.end(JSON.stringify({
      ok: false,
      error: { code: "internal_error", message: "Ocorreu um erro no servidor." }
    }));
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Instituto Canto Nativo disponível em http://localhost:${port}`);
  console.log("Banco SQLite local inicializado.");
});

function closeServer() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
