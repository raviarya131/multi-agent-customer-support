import { randomUUID } from "node:crypto";
import { db, friendlyId } from "./schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT, ticket_id TEXT, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS config_audit (
    id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
    action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, message_id INTEGER NOT NULL,
    customer_id TEXT, rating TEXT NOT NULL, comment TEXT, question TEXT, answer TEXT,
    created_at TEXT NOT NULL, UNIQUE(message_id)
  );
`);

export interface NotificationRecord {
  id: string; account_id: string; kind: string; title: string;
  body: string | null; ticket_id: string | null; read: number; created_at: string;
}

export function createNotification(rec: { account_id: string; kind: string; title: string; body?: string | null; ticket_id?: string | null }): NotificationRecord {
  const id = `NTF-${randomUUID().slice(0, 8)}`;
  const created_at = new Date().toISOString();
  db.prepare("INSERT INTO notifications (id, account_id, kind, title, body, ticket_id, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)").run(id, rec.account_id, rec.kind, rec.title, rec.body ?? null, rec.ticket_id ?? null, created_at);
  return { id, account_id: rec.account_id, kind: rec.kind, title: rec.title, body: rec.body ?? null, ticket_id: rec.ticket_id ?? null, read: 0, created_at };
}

export function listNotifications(accountId: string): NotificationRecord[] {
  return db.prepare("SELECT * FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT 50").all(accountId) as any[];
}
export function countUnread(accountId: string): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE account_id = ? AND read = 0").get(accountId) as any)?.n ?? 0);
}
export function markNotificationRead(id: string, accountId: string): void { db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND account_id = ?").run(id, accountId); }
export function markAllNotificationsRead(accountId: string): void { db.prepare("UPDATE notifications SET read = 1 WHERE account_id = ?").run(accountId); }

export interface ConfigAuditRecord { id: string; actor_id: string; actor_name: string; action: string; target: string; detail: string | null; created_at: string; }

export function recordConfigAudit(rec: { actor_id: string; actor_name: string; action: string; target: string; detail?: string | null }): void {
  db.prepare("INSERT INTO config_audit (id, actor_id, actor_name, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(`CFG-${randomUUID().slice(0, 8)}`, rec.actor_id, rec.actor_name, rec.action, rec.target, rec.detail ?? null, new Date().toISOString());
}
export function listConfigAudit(limit = 100): ConfigAuditRecord[] {
  return db.prepare("SELECT * FROM config_audit ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
}

export interface FeedbackRecord { id: string; ticket_id: string; message_id: number; customer_id: string | null; rating: "up" | "down"; comment: string | null; question: string | null; answer: string | null; created_at: string; }
export interface FeedbackRow extends FeedbackRecord { display_id: string; department: string | null; }

// Map a routed agent domain (billing/technical/…) to its department label —
// mirrors the API's departmentFor() so feedback can be filtered by department.
const DOMAIN_DEPARTMENT: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  policy: "Policy & Compliance",
  orders: "Orders",
  products: "Merchandising",
};

export function upsertFeedback(rec: { ticket_id: string; message_id: number; customer_id?: string | null; rating: "up" | "down"; comment?: string | null; question?: string | null; answer?: string | null }): void {
  db.prepare(`INSERT INTO feedback (id, ticket_id, message_id, customer_id, rating, comment, question, answer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at`).run(`FB-${randomUUID().slice(0, 8)}`, rec.ticket_id, rec.message_id, rec.customer_id ?? null, rec.rating, rec.comment ?? null, rec.question ?? null, rec.answer ?? null, new Date().toISOString());
}
export function getFeedbackForTicket(ticketId: string): { message_id: number; rating: "up" | "down" }[] {
  return db.prepare("SELECT message_id, rating FROM feedback WHERE ticket_id = ?").all(ticketId) as any[];
}
export function listAllFeedback(limit = 500): FeedbackRow[] {
  // Pull each ticket's most recent run domain (sub-problem domain, falling back
  // to the first agent report) so we can label the feedback with a department.
  const sql = `
    SELECT f.*, t.seq AS seq,
      (SELECT COALESCE(
                json_extract(r.state_json, '$.sub_problems[0].domain'),
                json_extract(r.state_json, '$.reports[0].agent')
              )
         FROM runs r WHERE r.ticket_id = f.ticket_id
         ORDER BY r.created_at DESC LIMIT 1) AS domain
    FROM feedback f
    LEFT JOIN tickets t ON t.ticket_id = f.ticket_id
    ORDER BY f.created_at DESC LIMIT ?`;
  return (db.prepare(sql).all(limit) as any[]).map((r) => ({
    id: r.id, ticket_id: r.ticket_id, display_id: friendlyId(r.seq, r.ticket_id),
    message_id: r.message_id, customer_id: r.customer_id, rating: r.rating,
    comment: r.comment, question: r.question, answer: r.answer, created_at: r.created_at,
    department: r.domain ? DOMAIN_DEPARTMENT[r.domain] ?? null : null,
  }));
}
export function getMessageById(messageId: number): { ticket_id: string; role: string; text: string } | null {
  const row = db.prepare("SELECT ticket_id, role, text FROM messages WHERE id = ?").get(messageId) as any;
  return row ? { ticket_id: row.ticket_id, role: row.role, text: row.text } : null;
}
export function getQuestionForMessage(ticketId: string, messageId: number): string | null {
  const row = db.prepare("SELECT text FROM messages WHERE ticket_id = ? AND id < ? AND role = 'customer' ORDER BY id DESC LIMIT 1").get(ticketId, messageId) as any;
  return row?.text ?? null;
}
