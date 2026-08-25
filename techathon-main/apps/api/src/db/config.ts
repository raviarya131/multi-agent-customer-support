// Generic key/value config store, JSON-encoded. Used for operational settings
// the API owns at runtime (e.g. SLA policy). Distinct from the agent's config
// store, which holds prompt/agent definitions.
import { db } from "./schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
`);

export function getConfig<T>(key: string, fallback: T): T {
  const row = db.prepare("SELECT value_json FROM app_config WHERE key = ?").get(key) as any;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setConfig<T>(key: string, value: T): void {
  db.prepare(
    "INSERT OR REPLACE INTO app_config (key, value_json, updated_at) VALUES (?, ?, ?)"
  ).run(key, JSON.stringify(value), new Date().toISOString());
}
