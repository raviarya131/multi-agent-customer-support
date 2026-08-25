import { randomUUID } from "node:crypto";
import { db } from "./schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_presence (
    agent_id TEXT PRIMARY KEY, account_id TEXT, name TEXT, last_seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS team_activity (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, actor_id TEXT, actor_name TEXT,
    ticket_id TEXT, escalation_id TEXT, summary TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS case_notes (
    id TEXT PRIMARY KEY, escalation_id TEXT NOT NULL, ticket_id TEXT,
    author_id TEXT, author_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);

export interface PresenceRow { agent_id: string; account_id: string | null; name: string | null; last_seen: number; }
export function recordAgentPresence(agentId: string, accountId: string | null, name: string | null): void {
  db.prepare("INSERT INTO agent_presence (agent_id, account_id, name, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT(agent_id) DO UPDATE SET account_id = excluded.account_id, name = excluded.name, last_seen = excluded.last_seen").run(agentId, accountId, name, Date.now());
}
export function listAgentPresence(): PresenceRow[] {
  return db.prepare("SELECT agent_id, account_id, name, last_seen FROM agent_presence").all() as any[];
}

export interface TeamActivityRow { id: string; kind: string; actor_id: string | null; actor_name: string | null; ticket_id: string | null; escalation_id: string | null; summary: string; created_at: string; }
export function recordTeamActivity(rec: { kind: string; actor_id?: string | null; actor_name?: string | null; ticket_id?: string | null; escalation_id?: string | null; summary: string }): TeamActivityRow {
  const row: TeamActivityRow = { id: `TA-${randomUUID().slice(0, 8)}`, kind: rec.kind, actor_id: rec.actor_id ?? null, actor_name: rec.actor_name ?? null, ticket_id: rec.ticket_id ?? null, escalation_id: rec.escalation_id ?? null, summary: rec.summary, created_at: new Date().toISOString() };
  db.prepare("INSERT INTO team_activity (id, kind, actor_id, actor_name, ticket_id, escalation_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.kind, row.actor_id, row.actor_name, row.ticket_id, row.escalation_id, row.summary, row.created_at);
  return row;
}
export function listTeamActivity(limit = 50): TeamActivityRow[] {
  return db.prepare("SELECT * FROM team_activity ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
}

export interface CaseNoteRow { id: string; escalation_id: string; ticket_id: string | null; author_id: string | null; author_name: string; body: string; created_at: string; }
export function addCaseNote(rec: { escalation_id: string; ticket_id?: string | null; author_id?: string | null; author_name: string; body: string }): CaseNoteRow {
  const row: CaseNoteRow = { id: `CN-${randomUUID().slice(0, 8)}`, escalation_id: rec.escalation_id, ticket_id: rec.ticket_id ?? null, author_id: rec.author_id ?? null, author_name: rec.author_name, body: rec.body, created_at: new Date().toISOString() };
  db.prepare("INSERT INTO case_notes (id, escalation_id, ticket_id, author_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(row.id, row.escalation_id, row.ticket_id, row.author_id, row.author_name, row.body, row.created_at);
  return row;
}
export function listCaseNotes(escalationId: string): CaseNoteRow[] {
  return db.prepare("SELECT * FROM case_notes WHERE escalation_id = ? ORDER BY created_at ASC").all(escalationId) as any[];
}
export function listRecentCaseNotes(limit = 20): CaseNoteRow[] {
  return db.prepare("SELECT * FROM case_notes ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
}
