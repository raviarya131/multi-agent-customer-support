import { randomUUID } from "node:crypto";
import { db } from "./schema";

export type SlaState = "on_track" | "warning" | "breached";
export type EscalationSource = "auto" | "agent" | "sla" | "manager" | "admin";

export interface EscalationRecord {
  id: string; ticket_id: string; customer_id: string | null; customer_name: string;
  subject: string; department: string; team: string | null; urgency: string | null;
  reason: string | null; assignee_id: string; assignee_name: string; assignee_title: string;
  assignee_level?: string | null; handoff_note?: string | null; reopened?: number;
  status: "open" | "resolved"; created_at: string;
  // SLA tracking
  sla_started_at?: string | null; sla_due_at?: string | null; sla_state?: SlaState;
  escalation_source?: EscalationSource; missed_by_id?: string | null; missed_by_name?: string | null;
  manager_disposition?: string | null; breach_count?: number;
}

type CreateInput = Omit<
  EscalationRecord,
  "id" | "created_at" | "status" | "assignee_level" | "handoff_note" |
  "sla_started_at" | "sla_due_at" | "sla_state" | "missed_by_id" | "missed_by_name" |
  "manager_disposition" | "breach_count"
> & {
  assignee_level?: string;
  escalation_source?: EscalationSource;
  sla_due_at?: string | null;
};

export function createEscalation(rec: CreateInput): EscalationRecord {
  const id = `ESC-${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();
  const reopened = rec.reopened ? 1 : 0;
  const level = rec.assignee_level ?? "agent";
  const source: EscalationSource = rec.escalation_source ?? "auto";
  const sla_started_at = created_at;
  const sla_due_at = rec.sla_due_at ?? null;
  db.prepare(
    `INSERT INTO escalations (id, ticket_id, customer_id, customer_name, subject, department, team, urgency, reason,
       assignee_id, assignee_name, assignee_title, assignee_level, status, reopened, created_at,
       sla_started_at, sla_due_at, sla_state, escalation_source, breach_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, 'on_track', ?, 0)`
  ).run(
    id, rec.ticket_id, rec.customer_id ?? null, rec.customer_name, rec.subject, rec.department,
    rec.team ?? null, rec.urgency ?? null, rec.reason ?? null, rec.assignee_id, rec.assignee_name,
    rec.assignee_title, level, reopened, created_at, sla_started_at, sla_due_at, source
  );
  return {
    id, status: "open", created_at, assignee_level: level, handoff_note: null,
    sla_started_at, sla_due_at, sla_state: "on_track", escalation_source: source,
    missed_by_id: null, missed_by_name: null, manager_disposition: null, breach_count: 0,
    ...rec, reopened,
  };
}

/**
 * Reassign a case to a new owner and (re)start its SLA clock. Used by the
 * handoff, manager-reassign, and SLA-breach paths. `opts.missedBy` records who
 * let it breach (so that prior owner sees it as "Missed").
 */
export function assignEscalation(
  id: string,
  assignee: { id: string; name: string; title: string },
  opts: {
    level?: string;
    source?: EscalationSource;
    note?: string | null;
    disposition?: string | null;
    slaDueAt?: string | null;
    slaState?: SlaState;
    missedBy?: { id: string; name: string } | null;
    bumpBreach?: boolean;
  } = {}
): void {
  const now = new Date().toISOString();
  const sets: string[] = [
    "assignee_id = ?", "assignee_name = ?", "assignee_title = ?",
    "sla_started_at = ?", "sla_state = ?",
  ];
  const params: any[] = [
    assignee.id, assignee.name, assignee.title, now, opts.slaState ?? "on_track",
  ];
  if (opts.level !== undefined) { sets.push("assignee_level = ?"); params.push(opts.level); }
  if (opts.source !== undefined) { sets.push("escalation_source = ?"); params.push(opts.source); }
  if (opts.note !== undefined) { sets.push("handoff_note = ?"); params.push(opts.note ?? null); }
  if (opts.disposition !== undefined) { sets.push("manager_disposition = ?"); params.push(opts.disposition ?? null); }
  if (opts.slaDueAt !== undefined) { sets.push("sla_due_at = ?"); params.push(opts.slaDueAt ?? null); }
  if (opts.missedBy !== undefined) {
    sets.push("missed_by_id = ?", "missed_by_name = ?");
    params.push(opts.missedBy?.id ?? null, opts.missedBy?.name ?? null);
  }
  if (opts.bumpBreach) sets.push("breach_count = breach_count + 1");
  params.push(id);
  db.prepare(`UPDATE escalations SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

/** Back-compat thin wrapper used by the manual "pass to manager" handoff. */
export function reassignEscalation(
  id: string,
  assignee: { id: string; name: string; title: string },
  level: string,
  note: string | null,
  source: EscalationSource = "agent",
  slaDueAt?: string | null
): void {
  assignEscalation(id, assignee, { level, note, source, slaDueAt, disposition: null });
}

export function setSlaState(id: string, state: SlaState): void {
  db.prepare("UPDATE escalations SET sla_state = ? WHERE id = ?").run(state, id);
}
export function setSlaDueAt(id: string, dueAt: string | null, startedAt?: string): void {
  if (startedAt) db.prepare("UPDATE escalations SET sla_due_at = ?, sla_started_at = ? WHERE id = ?").run(dueAt, startedAt, id);
  else db.prepare("UPDATE escalations SET sla_due_at = ? WHERE id = ?").run(dueAt, id);
}
export function setManagerDisposition(id: string, disposition: string | null): void {
  db.prepare("UPDATE escalations SET manager_disposition = ? WHERE id = ?").run(disposition, id);
}
export function setEscalationRouting(id: string, opts: { department?: string; urgency?: string }): void {
  const sets: string[] = []; const params: any[] = [];
  if (opts.department !== undefined) { sets.push("department = ?"); params.push(opts.department); }
  if (opts.urgency !== undefined) { sets.push("urgency = ?"); params.push(opts.urgency); }
  if (!sets.length) return;
  params.push(id);
  db.prepare(`UPDATE escalations SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function getOpenEscalationForTicket(ticketId: string): EscalationRecord | null {
  return (db.prepare("SELECT * FROM escalations WHERE ticket_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1").get(ticketId) as any) ?? null;
}
export function getLatestEscalationForTicket(ticketId: string): EscalationRecord | null {
  return (db.prepare("SELECT * FROM escalations WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1").get(ticketId) as any) ?? null;
}
export function listEscalations(): EscalationRecord[] {
  return db.prepare("SELECT * FROM escalations ORDER BY created_at DESC").all() as any[];
}
export function listOpenEscalations(): EscalationRecord[] {
  return db.prepare("SELECT * FROM escalations WHERE status = 'open' ORDER BY created_at ASC").all() as any[];
}
export function getEscalationById(id: string): EscalationRecord | null {
  return (db.prepare("SELECT * FROM escalations WHERE id = ?").get(id) as any) ?? null;
}
export function countOpenByAssignee(): Record<string, number> {
  const rows = db.prepare("SELECT assignee_id, COUNT(*) AS n FROM escalations WHERE status = 'open' GROUP BY assignee_id").all() as any[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.assignee_id] = Number(r.n);
  return out;
}
export function resolveEscalation(id: string): void { db.prepare("UPDATE escalations SET status = 'resolved' WHERE id = ?").run(id); }
export function reopenEscalation(id: string): void { db.prepare("UPDATE escalations SET status = 'open', reopened = 1 WHERE id = ?").run(id); }
