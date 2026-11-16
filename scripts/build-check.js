import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/manifest.json",
  "public/service-worker.js",
  "public/manus-routes.json",
  "public/icons/favicon.png",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/assets/hero-tucano.jpg",
  "public/assets/logo-beija-flor.png",
  "src/api.js",
  "src/database.js",
  "database/schema.sql",
  "api/openapi.yaml"
];

for (const relativePath of required) {
  await access(path.join(root, relativePath));
}

const manifest = JSON.parse(await readFile(path.join(root, "public/manifest.json"), "utf8"));
if (manifest.name !== "Instituto Canto Nativo" || manifest.display !== "standalone") {
  throw new Error("O manifesto PWA não contém a identidade e o modo de exibição esperados.");
}
const routes = JSON.parse(await readFile(path.join(root, "public/manus-routes.json"), "utf8"));
if (!Array.isArray(routes.routes) || routes.routes.length !== 1 || routes.routes[0].path !== "/") {
  throw new Error("O inventário de rotas está desatualizado.");
}
console.log("Build verificado: shell, rotas, PWA, API e esquema SQLite presentes.");
