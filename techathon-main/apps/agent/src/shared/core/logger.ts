/**
 * core/logger.ts
 *
 * A tiny structured logger. Every pipeline node calls log(...) with the
 * traceId so the whole journey of one ticket can be reconstructed.
 * Each entry is (1) printed to the console, (2) collected per-trace so the
 * final AgentReport can carry its own trace, and (3) appended to a durable
 * JSONL audit file so "all agent interactions must be logged" survives a
 * restart (the in-memory buffer alone would not).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { TraceEntry } from "./types.js";
import { config } from "../config/index.js";

const buffers = new Map<string, TraceEntry[]>();

// Resolve the audit file once, relative to the process cwd if not absolute.
const AUDIT_FILE = isAbsolute(config.auditLogFile)
  ? config.auditLogFile
  : join(process.cwd(), config.auditLogFile);

let auditDirReady = false;
let auditDisabled = !config.auditLogEnabled;

function appendAudit(entry: TraceEntry): void {
  if (auditDisabled) return;
  try {
    if (!auditDirReady) {
      mkdirSync(dirname(AUDIT_FILE), { recursive: true });
      auditDirReady = true;
    }
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n");
  } catch (err) {
    // Never let audit-logging failures break the request path; warn once.
    auditDisabled = true;
    console.error(`[logger] audit log disabled (write failed): ${String(err)}`);
  }
}

export function log(
  traceId: string,
  node: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: TraceEntry = {
    traceId,
    ts: new Date().toISOString(),
    node,
    message,
    data,
  };
  // 1. Structured console output (minimum observability requirement).
  console.log(JSON.stringify(entry));
  // 2. Per-trace buffer so we can attach the trace to the result.
  if (!buffers.has(traceId)) buffers.set(traceId, []);
  buffers.get(traceId)!.push(entry);
  // 3. Durable append-only audit trail.
  appendAudit(entry);
}

/** Pull the collected trace for a request and clear it. */
export function drainTrace(traceId: string): TraceEntry[] {
  const entries = buffers.get(traceId) ?? [];
  buffers.delete(traceId);
  return entries;
}
