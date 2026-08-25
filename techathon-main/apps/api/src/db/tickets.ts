import { randomUUID } from "node:crypto";
import { db, friendlyId, type MessageRole, type StoredMessage } from "./schema";

export type { MessageRole, StoredMessage };

export function ensureTicket(ticketId: string, customerId?: string | null, parentTicketId?: string | null): void {
  const exists = db.prepare("SELECT 1 FROM tickets WHERE ticket_id = ?").get(ticketId);
  if (!exists) {
    const next = db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM tickets WHERE customer_id IS ?").get(customerId ?? null) as any;
    db.prepare("INSERT INTO tickets (ticket_id, created_at, customer_id, seq, parent_ticket_id) VALUES (?, ?, ?, ?, ?)").run(
      ticketId, new Date().toISOString(), customerId ?? null, Number(next?.next ?? 1), parentTicketId ?? null
    );
  }
}

export function getTicketDisplayId(ticketId: string): string {
  const row = db.prepare("SELECT seq FROM tickets WHERE ticket_id = ?").get(ticketId) as any;
  return friendlyId(row?.seq, ticketId);
}

export function getTicketCustomer(ticketId: string): string | null {
  const row = db.prepare("SELECT customer_id FROM tickets WHERE ticket_id = ?").get(ticketId) as any;
  return row?.customer_id ?? null;
}

export function ticketExists(ticketId: string): boolean {
  return !!db.prepare("SELECT 1 FROM tickets WHERE ticket_id = ?").get(ticketId);
}

export function getCustomerHistory(ticketId: string): StoredMessage[] {
  const rows = db.prepare("SELECT role, text, created_at FROM messages WHERE ticket_id = ? AND role = 'customer' ORDER BY id ASC").all(ticketId) as any[];
  return rows.map((r) => ({ role: r.role, text: r.text, timestamp: r.created_at }));
}

export function getMessages(ticketId: string): StoredMessage[] {
  const rows = db.prepare("SELECT id, role, text, created_at FROM messages WHERE ticket_id = ? ORDER BY id ASC").all(ticketId) as any[];
  return rows.map((r) => ({ id: r.id, role: r.role, text: r.text, timestamp: r.created_at }));
}

export interface TicketSummary {
  ticket_id: string; display_id: string; title: string;
  message_count: number; updated_at: string; status: TicketLifecycleStatus;
  parent_ticket_id: string | null;
  // Stable per-customer creation sequence (1, 2, 3 …). Never changes once set,
  // so it's safe to show as the in-session ticket number.
  seq: number;
}

export type TicketLifecycleStatus = "active" | "escalated" | "reopened" | "resolved";

function lifecycleStatus(escalationStatus: string | null | undefined, _runCount: number, overallStatus?: string | null, reopened = false): TicketLifecycleStatus {
  if (escalationStatus === "open") return reopened ? "reopened" : "escalated";
  if (escalationStatus === "resolved") return "resolved";
  if (overallStatus === "resolved") return "resolved";
  return "active";
}

export function listTickets(customerId?: string | null): TicketSummary[] {
  const rows = db.prepare(`
    SELECT t.ticket_id, t.seq, t.parent_ticket_id,
      (SELECT m.text FROM messages m WHERE m.ticket_id = t.ticket_id AND m.role = 'customer' ORDER BY m.id ASC LIMIT 1) AS title,
      (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.ticket_id AND m.role = 'customer') AS message_count,
      (SELECT COUNT(*) FROM runs r WHERE r.ticket_id = t.ticket_id) AS run_count,
      (SELECT r.state_json FROM runs r WHERE r.ticket_id = t.ticket_id ORDER BY r.created_at DESC LIMIT 1) AS latest_state,
      (SELECT e.status FROM escalations e WHERE e.ticket_id = t.ticket_id ORDER BY e.created_at DESC LIMIT 1) AS escalation_status,
      (SELECT e.reopened FROM escalations e WHERE e.ticket_id = t.ticket_id ORDER BY e.created_at DESC LIMIT 1) AS reopened,
      COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.ticket_id = t.ticket_id), t.created_at) AS updated_at
    FROM tickets t WHERE t.customer_id IS ? ORDER BY updated_at DESC`
  ).all(customerId ?? null) as any[];
  return rows.map((r) => {
    let overall: string | undefined;
    if (r.latest_state) { try { overall = JSON.parse(r.latest_state)?.investigation?.overall_status; } catch { overall = undefined; } }
    return {
      ticket_id: r.ticket_id, display_id: friendlyId(r.seq, r.ticket_id),
      title: r.title || friendlyId(r.seq, r.ticket_id),
      message_count: Number(r.message_count ?? 0), updated_at: r.updated_at,
      status: lifecycleStatus(r.escalation_status, Number(r.run_count ?? 0), overall, !!r.reopened),
      parent_ticket_id: r.parent_ticket_id ?? null,
      seq: Number(r.seq ?? 0),
    };
  });
}

export function deleteTicket(ticketId: string): void {
  db.prepare("DELETE FROM escalations WHERE ticket_id = ?").run(ticketId);
  db.prepare("DELETE FROM runs WHERE ticket_id = ?").run(ticketId);
  db.prepare("DELETE FROM messages WHERE ticket_id = ?").run(ticketId);
  db.prepare("DELETE FROM tickets WHERE ticket_id = ?").run(ticketId);
}

export interface PresenceClaim { customer_id: string; session_id: string; expires_at: number; }

export function prunePresenceLocks(now = Date.now()): void { db.prepare("DELETE FROM presence_locks WHERE expires_at <= ?").run(now); }

export function listPresenceLocks(now = Date.now()): Map<string, PresenceClaim> {
  prunePresenceLocks(now);
  const rows = db.prepare("SELECT customer_id, session_id, expires_at FROM presence_locks").all() as any[];
  return new Map(rows.map((r) => [String(r.customer_id), { customer_id: String(r.customer_id), session_id: String(r.session_id), expires_at: Number(r.expires_at) }]));
}

export function claimPresenceLock(customerId: string, sessionId: string, ttlMs: number): "ok" | "occupied" {
  const now = Date.now();
  prunePresenceLocks(now);
  const existing = db.prepare("SELECT session_id FROM presence_locks WHERE customer_id = ?").get(customerId) as any;
  if (existing && existing.session_id !== sessionId) return "occupied";
  const expiresAt = now + ttlMs;
  db.prepare("DELETE FROM presence_locks WHERE session_id = ? AND customer_id <> ?").run(sessionId, customerId);
  db.prepare("INSERT OR REPLACE INTO presence_locks (customer_id, session_id, expires_at) VALUES (?, ?, ?)").run(customerId, sessionId, expiresAt);
  return "ok";
}

export function releasePresenceLock(customerId: string, sessionId: string): void { db.prepare("DELETE FROM presence_locks WHERE customer_id = ? AND session_id = ?").run(customerId, sessionId); }
export function releasePresenceSession(sessionId: string): void { db.prepare("DELETE FROM presence_locks WHERE session_id = ?").run(sessionId); }
export function countCustomerMessages(ticketId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE ticket_id = ? AND role = 'customer'").get(ticketId) as any;
  return Number(row?.n ?? 0);
}
export function addMessage(ticketId: string, role: MessageRole, text: string): void {
  db.prepare("INSERT INTO messages (ticket_id, role, text, created_at) VALUES (?, ?, ?, ?)").run(ticketId, role, text, new Date().toISOString());
}
export function saveRun(runId: string, ticketId: string, state: unknown): void {
  db.prepare("INSERT OR REPLACE INTO runs (run_id, ticket_id, created_at, state_json) VALUES (?, ?, ?, ?)").run(runId, ticketId, new Date().toISOString(), JSON.stringify(state));
}
export function getLatestRun(ticketId: string): any | null {
  const row = db.prepare("SELECT state_json FROM runs WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1").get(ticketId) as any;
  return row ? JSON.parse(row.state_json) : null;
}

export interface LatestRunContext { run_id?: string; message?: string; resolution?: unknown; agent_reports?: unknown[]; investigation?: unknown; severity?: unknown; escalation?: unknown; }

export function getLatestRunContext(ticketId: string): LatestRunContext | null {
  const state = getLatestRun(ticketId);
  if (!state) return null;
  return { run_id: state.run_id, message: state.message, resolution: state.resolution, agent_reports: Array.isArray(state.agent_reports) ? state.agent_reports : [], investigation: state.investigation, severity: state.severity, escalation: state.escalation };
}

export interface TicketDashboardRow {
  ticket_id: string; display_id: string; title: string; customer_id: string | null;
  parent_ticket_id: string | null; created_at: string; updated_at: string;
  message_count: number; run_count: number; status: TicketLifecycleStatus;
  primary_intent: string | null; severity: string | null; priority: string | null;
  sentiment: string | null; sentiment_score: number | null; frustration: boolean;
  summary: string | null; escalation_id: string | null; escalation_status: "open" | "resolved" | null;
}

export interface StoredRun { run_id: string; ticket_id: string; created_at: string; state: any; }

function rowFromDb(r: any): TicketDashboardRow {
  let state: any = null;
  if (r.latest_state) { try { state = JSON.parse(r.latest_state); } catch { state = null; } }
  const escalation_status = r.escalation_status ?? null;
  return {
    ticket_id: r.ticket_id, display_id: friendlyId(r.seq, r.ticket_id),
    title: r.title || friendlyId(r.seq, r.ticket_id), customer_id: r.customer_id ?? null,
    parent_ticket_id: r.parent_ticket_id ?? null, created_at: r.created_at, updated_at: r.updated_at,
    message_count: Number(r.message_count ?? 0), run_count: Number(r.run_count ?? 0),
    status: lifecycleStatus(escalation_status, Number(r.run_count ?? 0), state?.investigation?.overall_status, !!r.reopened),
    primary_intent: state?.classification?.primary_intent ?? null, severity: state?.severity?.level ?? null,
    priority: state?.severity?.priority ?? null, sentiment: state?.sentiment?.label ?? null,
    sentiment_score: typeof state?.sentiment?.score === "number" ? state.sentiment.score : null,
    frustration: !!state?.sentiment?.frustration, summary: state?.resolution?.summary ?? null,
    escalation_id: r.escalation_id ?? null, escalation_status,
  };
}

const DASHBOARD_SELECT = `
  SELECT t.ticket_id, t.seq, t.parent_ticket_id, t.customer_id, t.created_at,
    (SELECT m.text FROM messages m WHERE m.ticket_id = t.ticket_id AND m.role = 'customer' ORDER BY m.id ASC LIMIT 1) AS title,
    (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.ticket_id AND m.role = 'customer') AS message_count,
    (SELECT COUNT(*) FROM runs r WHERE r.ticket_id = t.ticket_id) AS run_count,
    COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.ticket_id = t.ticket_id), t.created_at) AS updated_at,
    (SELECT r.state_json FROM runs r WHERE r.ticket_id = t.ticket_id ORDER BY r.created_at DESC LIMIT 1) AS latest_state,
    (SELECT e.id FROM escalations e WHERE e.ticket_id = t.ticket_id ORDER BY e.created_at DESC LIMIT 1) AS escalation_id,
    (SELECT e.status FROM escalations e WHERE e.ticket_id = t.ticket_id ORDER BY e.created_at DESC LIMIT 1) AS escalation_status,
    (SELECT e.reopened FROM escalations e WHERE e.ticket_id = t.ticket_id ORDER BY e.created_at DESC LIMIT 1) AS reopened
  FROM tickets t`;

export function listTicketsDashboard(): TicketDashboardRow[] {
  return (db.prepare(`${DASHBOARD_SELECT} ORDER BY updated_at DESC`).all() as any[]).map(rowFromDb);
}
export function getTicketDashboardRow(ticketId: string): TicketDashboardRow | null {
  const row = db.prepare(`${DASHBOARD_SELECT} WHERE t.ticket_id = ?`).get(ticketId) as any;
  return row ? rowFromDb(row) : null;
}

export interface RunSessionRow {
  run_id: string; ticket_id: string; display_id: string; created_at: string; message: string;
  category: string | null; primary_intent: string | null; is_multi_issue: boolean;
  sentiment: string | null; sentiment_score: number | null; frustration: boolean; sentiment_trend: string | null;
  severity: string | null; priority: string | null; escalated: boolean; guard_flagged: boolean;
  overall_status: string | null; agent_count: number; step_count: number; llm_steps: number;
}

function sessionRowFromRun(r: any): RunSessionRow {
  let s: any = {};
  try { s = JSON.parse(r.state_json) || {}; } catch { s = {}; }
  const audit = Array.isArray(s.audit_trail) ? s.audit_trail : [];
  return {
    run_id: r.run_id, ticket_id: r.ticket_id, display_id: friendlyId(r.seq, r.ticket_id),
    created_at: r.created_at, message: s.message ?? "", category: s.classification?.category ?? null,
    primary_intent: s.classification?.primary_intent ?? null, is_multi_issue: !!s.classification?.is_multi_issue,
    sentiment: s.sentiment?.label ?? null, sentiment_score: typeof s.sentiment?.score === "number" ? s.sentiment.score : null,
    frustration: !!s.sentiment?.frustration, sentiment_trend: s.sentiment?.trend ?? null,
    severity: s.severity?.level ?? null, priority: s.severity?.priority ?? null,
    escalated: !!s.escalation?.escalate, guard_flagged: !!s.guard?.force_escalation,
    overall_status: s.investigation?.overall_status ?? (s.resolution ? "resolved" : null),
    agent_count: Array.isArray(s.agent_reports) ? s.agent_reports.length : 0,
    step_count: audit.length, llm_steps: audit.filter((e: any) => e?.kind === "llm").length,
  };
}

export function listAllRuns(): RunSessionRow[] {
  return (db.prepare("SELECT r.run_id, r.ticket_id, r.created_at, r.state_json, t.seq FROM runs r LEFT JOIN tickets t ON t.ticket_id = r.ticket_id ORDER BY r.created_at DESC").all() as any[]).map(sessionRowFromRun);
}
export function getRunById(runId: string): { run_id: string; ticket_id: string; display_id: string; created_at: string; state: any } | null {
  const row = db.prepare("SELECT r.run_id, r.ticket_id, r.created_at, r.state_json, t.seq FROM runs r LEFT JOIN tickets t ON t.ticket_id = r.ticket_id WHERE r.run_id = ?").get(runId) as any;
  if (!row) return null;
  return { run_id: row.run_id, ticket_id: row.ticket_id, display_id: friendlyId(row.seq, row.ticket_id), created_at: row.created_at, state: JSON.parse(row.state_json) };
}
export function listRunsForTicket(ticketId: string): StoredRun[] {
  return (db.prepare("SELECT run_id, ticket_id, created_at, state_json FROM runs WHERE ticket_id = ? ORDER BY created_at ASC").all(ticketId) as any[]).map((r) => ({ run_id: r.run_id, ticket_id: r.ticket_id, created_at: r.created_at, state: JSON.parse(r.state_json) }));
}
