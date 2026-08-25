import { db } from "./schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS human_agents (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL,
    department TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);
{
  const cols = db.prepare("PRAGMA table_info(human_agents)").all() as any[];
  if (!cols.some((c) => c.name === "level")) db.exec("ALTER TABLE human_agents ADD COLUMN level TEXT");
}

export interface HumanAgentRow { id: string; name: string; title: string; department: string; level: string; }

export function seedHumanAgentsIfEmpty(roster: HumanAgentRow[]): void {
  const count = (db.prepare("SELECT COUNT(*) AS n FROM human_agents").get() as any)?.n ?? 0;
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO human_agents (id, name, title, department, level, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const now = new Date().toISOString();
  for (const a of roster) insert.run(a.id, a.name, a.title, a.department, a.level ?? "agent", now);
}

export function listHumanAgentRows(): HumanAgentRow[] {
  return db.prepare("SELECT id, name, title, department, COALESCE(level, 'agent') AS level FROM human_agents ORDER BY department, level DESC, name").all() as any[];
}
export function getHumanAgentRow(id: string): HumanAgentRow | null {
  return (db.prepare("SELECT id, name, title, department, COALESCE(level, 'agent') AS level FROM human_agents WHERE id = ?").get(id) as any) ?? null;
}
export function insertHumanAgentRow(row: HumanAgentRow): void {
  db.prepare("INSERT INTO human_agents (id, name, title, department, level, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.name, row.title, row.department, row.level ?? "agent", new Date().toISOString());
}
export function backfillHumanAgentLevels(roster: { id: string; title: string; level: string }[]): void {
  const upd = db.prepare("UPDATE human_agents SET level = ?, title = ? WHERE id = ? AND (level IS NULL OR level = '')");
  for (const a of roster) upd.run(a.level, a.title, a.id);
  db.prepare("UPDATE human_agents SET level = 'agent' WHERE level IS NULL OR level = ''").run();
}
