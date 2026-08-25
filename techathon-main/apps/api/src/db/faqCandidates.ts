import { randomUUID } from "node:crypto";
import { db } from "./schema";

// Tracks how often customers ask the same (normalized) question. Once a question
// crosses the promotion threshold it can be auto-suggested as a disabled FAQ
// draft for an admin to review. See ../faqAuto.ts for the orchestration.
db.exec(`
  CREATE TABLE IF NOT EXISTS faq_candidates (
    id              TEXT PRIMARY KEY,
    norm_question   TEXT NOT NULL UNIQUE,
    sample_question TEXT NOT NULL,
    intent          TEXT,
    answer          TEXT NOT NULL,
    count           INTEGER NOT NULL DEFAULT 1,
    promoted        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
`);

export interface FaqCandidate {
  id: string;
  norm_question: string;
  sample_question: string;
  intent: string | null;
  answer: string;
  count: number;
  promoted: number;
  created_at: string;
  updated_at: string;
}

/**
 * Insert a new candidate or increment an existing one (keyed by normalized
 * question). The latest sample wording, answer, and intent overwrite the prior
 * values so a promoted draft uses the most recent resolved answer. Returns the
 * updated row including its new count.
 */
export function recordCandidate(input: {
  normQuestion: string;
  sample: string;
  intent?: string | null;
  answer: string;
}): FaqCandidate {
  const now = new Date().toISOString();
  const existing = getCandidate(input.normQuestion);
  if (existing) {
    db.prepare(
      "UPDATE faq_candidates SET count = count + 1, sample_question = ?, intent = ?, answer = ?, updated_at = ? WHERE id = ?"
    ).run(input.sample, input.intent ?? null, input.answer, now, existing.id);
    return getCandidate(input.normQuestion)!;
  }
  const id = `FAQC-${randomUUID().slice(0, 8)}`;
  db.prepare(
    "INSERT INTO faq_candidates (id, norm_question, sample_question, intent, answer, count, promoted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)"
  ).run(id, input.normQuestion, input.sample, input.intent ?? null, input.answer, now, now);
  return getCandidate(input.normQuestion)!;
}

export function getCandidate(normQuestion: string): FaqCandidate | null {
  return (db.prepare("SELECT * FROM faq_candidates WHERE norm_question = ?").get(normQuestion) as FaqCandidate) ?? null;
}

export function markCandidatePromoted(id: string): void {
  db.prepare("UPDATE faq_candidates SET promoted = 1, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}

export function listFaqCandidates(): FaqCandidate[] {
  return db.prepare("SELECT * FROM faq_candidates ORDER BY count DESC, updated_at DESC").all() as FaqCandidate[];
}
