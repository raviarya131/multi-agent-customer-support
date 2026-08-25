/**
 * policies/store.ts — the live, admin-editable policy store.
 *
 * Three policy groups the pipeline used to hardcode are now data:
 *   • guard      — the hard-signal phrase screen (steps/guard.ts)
 *   • escalation — which gate rules may open an escalation (steps/escalation.ts)
 *   • intents    — the intent-router thresholds (steps/classifier.ts)
 *
 * Persisted to runtime-config/policies.json (outside src, clearly data). Reads
 * are cached and merged over DEFAULTS, so a missing/partial file behaves exactly
 * like the original hardcoded pipeline — nothing changes until an admin edits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { log } from "../core/logger.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(HERE, "../../../runtime-config");
const POLICIES_FILE = join(CONFIG_DIR, "policies.json");

export const guardSignalSchema = z.object({
  phrase: z.string().min(1),
  category: z.string().min(1),
});
export type GuardSignal = z.infer<typeof guardSignalSchema>;

export interface PolicyConfig {
  guard: { enabled: boolean; signals: GuardSignal[] };
  escalation: {
    rules: {
      hard_guard: boolean;
      high_severity: boolean;
      unresolved: boolean;
      conflicts: boolean;
      specialist_handoff: boolean;
      frustration_repeat: boolean;
    };
  };
  intents: { multi_threshold: number; fallback_threshold: number };
}

// Seeded from the original steps/guard.ts SIGNALS — identical default behavior.
const DEFAULT_SIGNALS: GuardSignal[] = [
  { phrase: "talk to a manager", category: "human_request" },
  { phrase: "speak to a manager", category: "human_request" },
  { phrase: "speak to a supervisor", category: "human_request" },
  { phrase: "talk to a supervisor", category: "human_request" },
  { phrase: "want a human", category: "human_request" },
  { phrase: "speak to a human", category: "human_request" },
  { phrase: "speak to a person", category: "human_request" },
  { phrase: "need someone to fix", category: "human_request" },
  { phrase: "someone to actually fix", category: "human_request" },
  { phrase: "someone to fix this", category: "human_request" },
  { phrase: "get someone to fix", category: "human_request" },
  { phrase: "connect me to support", category: "human_request" },
  { phrase: "real person", category: "human_request" },
  { phrase: "real human", category: "human_request" },
  { phrase: "i'll sue", category: "legal" },
  { phrase: "i will sue", category: "legal" },
  { phrase: "sue you", category: "legal" },
  { phrase: "lawyer", category: "legal" },
  { phrase: "attorney", category: "legal" },
  { phrase: "legal action", category: "legal" },
  { phrase: "take legal action", category: "legal" },
  { phrase: "data breach", category: "security" },
  { phrase: "account was hacked", category: "security" },
  { phrase: "was hacked", category: "security" },
  { phrase: "account hacked", category: "security" },
  { phrase: "my account is hacked", category: "security" },
  { phrase: "account compromised", category: "security" },
  { phrase: "unauthorized charge", category: "security" },
  { phrase: "unauthorized charges", category: "security" },
  { phrase: "charges i didn't make", category: "security" },
  { phrase: "didn't make these charges", category: "security" },
  { phrase: "someone accessed my account", category: "security" },
  { phrase: "gdpr", category: "legal" },
  { phrase: "ccpa", category: "legal" },
  { phrase: "chargeback", category: "financial_dispute" },
  { phrase: "charge back", category: "financial_dispute" },
  { phrase: "dispute with my bank", category: "financial_dispute" },
  { phrase: "disputing with my bank", category: "financial_dispute" },
  { phrase: "contact my bank", category: "financial_dispute" },
  { phrase: "report fraud", category: "financial_dispute" },
];

export const DEFAULT_POLICIES: PolicyConfig = {
  guard: { enabled: true, signals: DEFAULT_SIGNALS },
  escalation: {
    rules: {
      hard_guard: true,
      high_severity: true,
      unresolved: true,
      conflicts: true,
      specialist_handoff: true,
      frustration_repeat: true,
    },
  },
  // Match the env defaults in shared/config (0.6 / 0.5).
  intents: { multi_threshold: 0.6, fallback_threshold: 0.5 },
};

let cache: PolicyConfig | null = null;

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/** Union default + stored guard signals so new built-in phrases appear without wiping admin edits. */
function mergeGuardSignals(defaults: GuardSignal[], fromFile: GuardSignal[]): GuardSignal[] {
  const byPhrase = new Map<string, GuardSignal>();
  for (const s of defaults) byPhrase.set(s.phrase.toLowerCase(), s);
  for (const s of fromFile) byPhrase.set(s.phrase.toLowerCase(), s);
  return [...byPhrase.values()];
}

/** Deep-merge a raw object over DEFAULTS so partial/legacy files stay valid. */
function withDefaults(raw: any): PolicyConfig {
  const fromFile = Array.isArray(raw?.guard?.signals)
    ? raw.guard.signals
        .map((s: unknown) => guardSignalSchema.safeParse(s))
        .filter((r: any) => r.success)
        .map((r: any) => r.data as GuardSignal)
    : [];
  const signals = mergeGuardSignals(DEFAULT_POLICIES.guard.signals, fromFile);
  return {
    guard: {
      enabled: typeof raw?.guard?.enabled === "boolean" ? raw.guard.enabled : DEFAULT_POLICIES.guard.enabled,
      signals,
    },
    escalation: {
      rules: { ...DEFAULT_POLICIES.escalation.rules, ...(raw?.escalation?.rules ?? {}) },
    },
    intents: {
      multi_threshold: num(raw?.intents?.multi_threshold, DEFAULT_POLICIES.intents.multi_threshold),
      fallback_threshold: num(raw?.intents?.fallback_threshold, DEFAULT_POLICIES.intents.fallback_threshold),
    },
  };
}

export function getPolicies(): PolicyConfig {
  if (cache) return cache;
  if (existsSync(POLICIES_FILE)) {
    try {
      cache = withDefaults(JSON.parse(readFileSync(POLICIES_FILE, "utf8")));
      return cache;
    } catch {
      /* fall through to defaults */
    }
  }
  cache = DEFAULT_POLICIES;
  return cache;
}

function save(p: PolicyConfig): void {
  ensureDir();
  writeFileSync(POLICIES_FILE, JSON.stringify(p, null, 2), "utf8");
  cache = p;
}

/** Replace the policy config (merged over defaults). Returns the saved config. */
export function updatePolicies(input: unknown): PolicyConfig {
  const next = withDefaults({ ...getPolicies(), ...(input as object) });
  save(next);
  log("config", "policy-store", "policies updated", {
    signals: next.guard.signals.length,
    guardEnabled: next.guard.enabled,
  });
  return next;
}

/** Force the next getPolicies() to re-read from disk. */
export function invalidatePolicyCache(): void {
  cache = null;
}
