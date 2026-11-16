import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(projectRoot, "database", "schema.sql");

export function openDatabase() {
  const configuredPath = process.env.DATABASE_PATH || path.join(projectRoot, "data", "canto-nativo.sqlite");
  const databasePath = configuredPath === ":memory:"
    ? configuredPath
    : path.resolve(projectRoot, configuredPath);

  if (databasePath !== ":memory:") {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath, { timeout: 5000 });
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA busy_timeout = 5000;");
  if (databasePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
  database.exec(readFileSync(schemaPath, "utf8"));
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());

  return database;
}
