// SLA policy: how long a case may sit with its current owner before it breaches
// and is auto-escalated. Configurable per department × priority (in HOURS) from
// the Platform panel, with sensible defaults. A warning fires at `warn_pct` of
// the window so the owner can save it before the deadline.
import { getConfig, setConfig } from "./db/config";
import { DEPARTMENTS, type Department } from "./humans";

export type Priority = "P1" | "P2" | "P3";
export const PRIORITIES: Priority[] = ["P1", "P2", "P3"];

export interface SlaConfig {
  // hours per department, keyed by priority
  matrix: Record<string, Record<Priority, number>>;
  // fraction of the window at which a warning fires (0–1)
  warn_pct: number;
}

const CONFIG_KEY = "sla.policy";

// Defaults in hours. P1 = same business day, P2 = a few days, P3 = ~a week.
// These are deliberately generous (this is a demo); tune them in the panel.
const DEFAULT_BY_PRIORITY: Record<Priority, number> = { P1: 24, P2: 72, P3: 168 };

export function defaultSlaConfig(): SlaConfig {
  const matrix: Record<string, Record<Priority, number>> = {};
  for (const dept of DEPARTMENTS) matrix[dept] = { ...DEFAULT_BY_PRIORITY };
  return { matrix, warn_pct: 0.8 };
}

/** Current SLA config merged over defaults, so new departments always resolve. */
export function getSlaConfig(): SlaConfig {
  const base = defaultSlaConfig();
  const saved = getConfig<Partial<SlaConfig> | null>(CONFIG_KEY, null);
  if (!saved) return base;
  const matrix = { ...base.matrix };
  for (const dept of Object.keys(saved.matrix ?? {})) {
    matrix[dept] = { ...(matrix[dept] ?? DEFAULT_BY_PRIORITY), ...(saved.matrix![dept] ?? {}) };
  }
  const warn_pct =
    typeof saved.warn_pct === "number" && saved.warn_pct > 0 && saved.warn_pct < 1
      ? saved.warn_pct
      : base.warn_pct;
  return { matrix, warn_pct };
}

export function setSlaConfig(partial: Partial<SlaConfig>): SlaConfig {
  const current = getSlaConfig();
  const next: SlaConfig = {
    matrix: { ...current.matrix },
    warn_pct:
      typeof partial.warn_pct === "number" && partial.warn_pct > 0 && partial.warn_pct < 1
        ? partial.warn_pct
        : current.warn_pct,
  };
  for (const dept of Object.keys(partial.matrix ?? {})) {
    const row = partial.matrix![dept] ?? ({} as Record<Priority, number>);
    next.matrix[dept] = {
      P1: clampHours(row.P1 ?? next.matrix[dept]?.P1),
      P2: clampHours(row.P2 ?? next.matrix[dept]?.P2),
      P3: clampHours(row.P3 ?? next.matrix[dept]?.P3),
    };
  }
  setConfig(CONFIG_KEY, next);
  return next;
}

function clampHours(h: unknown): number {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(24 * 90, Math.round(n)); // cap at 90 days
}

function normPriority(urgency: string | null | undefined): Priority {
  const u = String(urgency ?? "").toUpperCase();
  if (u === "P1") return "P1";
  if (u === "P2") return "P2";
  return "P3";
}

/** SLA window in hours for a department + urgency. */
export function slaHoursFor(department: string, urgency: string | null | undefined): number {
  const cfg = getSlaConfig();
  const row = cfg.matrix[department] ?? DEFAULT_BY_PRIORITY;
  return row[normPriority(urgency)];
}

/** Absolute ISO deadline given a start time. */
export function computeDueAt(
  department: string,
  urgency: string | null | undefined,
  fromISO: string = new Date().toISOString()
): string {
  const hours = slaHoursFor(department, urgency);
  return new Date(new Date(fromISO).getTime() + hours * 3_600_000).toISOString();
}

/** The instant a warning should fire for a window that started at `startISO`. */
export function computeWarnAt(
  department: string,
  urgency: string | null | undefined,
  startISO: string,
  dueISO: string
): string {
  const cfg = getSlaConfig();
  const start = new Date(startISO).getTime();
  const due = new Date(dueISO).getTime();
  return new Date(start + (due - start) * cfg.warn_pct).toISOString();
}

export { DEPARTMENTS, type Department };
