/**
 * collab.ts — a tiny in-memory pub/sub for the real-time collaboration feed.
 *
 * Express SSE clients subscribe via `addCollabClient(res)`; anywhere in the API
 * can broadcast an event with `emitCollab(...)`. Single-process, best-effort:
 * if the API restarts, clients reconnect and re-fetch the snapshot. This is the
 * live transport behind the Team dashboard (escalation lifecycle + presence).
 */
import type { Response } from "express";

export type CollabEventType =
  | "presence"
  | "escalation_created"
  | "escalation_resolved"
  | "escalation_handoff"
  | "agent_reply"
  | "case_note"
  | "ping";

export interface CollabEvent {
  type: CollabEventType;
  [key: string]: unknown;
}

const clients = new Set<Response>();

/** Register an SSE response stream. Returns an unsubscribe function. */
export function addCollabClient(res: Response): () => void {
  clients.add(res);
  return () => clients.delete(res);
}

/** Broadcast an event to every connected dashboard. */
export function emitCollab(event: CollabEvent): void {
  const payload = `data: ${JSON.stringify({ ...event, ts: new Date().toISOString() })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function collabClientCount(): number {
  return clients.size;
}

// Keep connections warm through proxies and prune dead sockets.
setInterval(() => {
  emitCollab({ type: "ping" });
}, 25000).unref?.();
