/**
 * policies/agents.ts — the live registry of specialist (AI) agents.
 *
 * The pipeline used to hardcode three domains (technical/billing/policy). They
 * are now records: the three built-ins are seeded with their original routing
 * keywords + handoff team, and admins can add new specialists. A new agent is
 * "materialized" by pointing the shared agent-factory at a runtime usecases dir,
 * so it shows up in the use-cases editor and is routable by the orchestrator.
 *
 *   agents.json (custom only)  →  runtime-config/agents/<name>/usecases/*.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createAgent, getCreatedAgent } from "../agent-factory.js";
import { log } from "../core/logger.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(HERE, "../../../runtime-config");
const AGENTS_FILE = join(CONFIG_DIR, "agents.json");
const AGENTS_ROOT = join(CONFIG_DIR, "agents");

export const agentRecordSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "name must be lowercase letters/numbers/underscore, starting with a letter"),
  label: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  team: z.string().min(1),
});
export type AgentRecordInput = z.infer<typeof agentRecordSchema>;
export interface AgentRecord extends AgentRecordInput {
  builtin: boolean;
}

// The five e-commerce specialists. Keywords drive offline routing; teams drive
// the escalation handoff target. Built-ins are seeded here and created via
// agents/registry.ts (their use cases live under agents/<name>/usecases).
const BUILTINS: AgentRecord[] = [
  {
    name: "technical",
    label: "Technical",
    description: "store/app issues: login & account access, checkout/payment-page errors, website or app not working, outages",
    keywords: [
      "login", "log in", "logged", "sign in", "password", "otp", "account access",
      "crash", "crashes", "error", "bug", "broken", "not working", "doesn't work",
      "loading", "load", "freeze", "frozen", "slow", "500", "404", "checkout",
      "page", "app", "website", "site", "screen", "button", "glitch", "down",
    ],
    team: "Engineering On-call",
    builtin: true,
  },
  {
    name: "billing",
    label: "Billing & Payments",
    description: "money matters: charges, double/failed charges, declined cards, invoices, receipts, refund processing, and explaining payment/billing policies (billing cycle, plans, proration, dunning)",
    keywords: [
      "charge", "charged", "charges", "refund", "refunded", "invoice", "receipt",
      "payment", "paid", "billed", "billing", "card", "declined", "double", "twice",
      "$", "money", "overcharged", "transaction",
    ],
    team: "Billing Lead",
    builtin: true,
  },
  {
    name: "policy",
    label: "Policy",
    description: "store policies & eligibility: return policy, cancellation rules, warranty, and data/GDPR/privacy",
    keywords: [
      "policy", "policies", "eligible", "eligibility", "terms", "allowed", "rules",
      "warranty", "entitled", "return policy", "refund policy", "deadline", "window",
      "gdpr", "privacy", "data",
    ],
    team: "Policy & Compliance",
    builtin: true,
  },
  {
    name: "orders",
    label: "Orders",
    description: "order lifecycle: order status, tracking, delivery updates, and cancelling or changing an order",
    keywords: [
      "order", "orders", "track", "tracking", "status", "where is my", "wheres my",
      "delivery", "deliver", "delivered", "shipped", "shipping", "dispatch", "parcel",
      "package", "courier", "eta", "cancel order", "change order", "modify order", "address",
    ],
    team: "Order Operations",
    builtin: true,
  },
  {
    name: "products",
    label: "Products",
    description: "pre-purchase catalog questions: availability, stock, price, sizes/variants, specifications and recommendations",
    keywords: [
      "product", "item", "in stock", "stock", "available", "availability", "price",
      "cost", "size", "sizing", "variant", "color", "colour", "spec", "specs",
      "specification", "feature", "recommend", "compare", "do you have", "restock",
    ],
    team: "Merchandising",
    builtin: true,
  },
];

const BUILTIN_NAMES = new Set(BUILTINS.map((b) => b.name));

export function isBuiltinAgent(name: string): boolean {
  return BUILTIN_NAMES.has(name);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readCustom(): AgentRecord[] {
  if (!existsSync(AGENTS_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(AGENTS_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    const out: AgentRecord[] = [];
    for (const item of raw) {
      const parsed = agentRecordSchema.safeParse(item);
      if (parsed.success && !isBuiltinAgent(parsed.data.name)) {
        out.push({ ...parsed.data, builtin: false });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function saveCustom(records: AgentRecord[]): void {
  ensureDir(CONFIG_DIR);
  const data = records
    .filter((r) => !r.builtin)
    .map(({ name, label, description, keywords, team }) => ({ name, label, description, keywords, team }));
  writeFileSync(AGENTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

/** Every specialist agent: the three built-ins plus any admin-defined ones. */
export function listAgentRecords(): AgentRecord[] {
  return [...BUILTINS, ...readCustom()];
}

export function getAgentRecord(name: string): AgentRecord | undefined {
  return listAgentRecords().find((a) => a.name === name);
}

/** Ordered list of routable domain names (= specialist agent names). */
export function listDomains(): string[] {
  return listAgentRecords().map((a) => a.name);
}

export function teamByDomain(): Record<string, string> {
  return Object.fromEntries(listAgentRecords().map((a) => [a.name, a.team]));
}

export function keywordsByDomain(): Record<string, string[]> {
  return Object.fromEntries(listAgentRecords().map((a) => [a.name, a.keywords]));
}

function usecasesDirFor(name: string): string {
  return join(AGENTS_ROOT, name, "usecases");
}

/** Make sure a custom agent has a live framework agent backing it (so it routes). */
export function materializeAgent(name: string): void {
  if (isBuiltinAgent(name)) return; // built-ins are created via agents/registry
  if (getCreatedAgent(name)) return; // already minted this process
  const dir = usecasesDirFor(name);
  ensureDir(dir);
  createAgent({ name, useCasesDir: dir });
}

/** Boot hook: re-create every stored custom agent so they survive a restart. */
export function initCustomAgents(): void {
  for (const rec of readCustom()) materializeAgent(rec.name);
}

/** Validate + persist a specialist agent, then materialize it. */
export function upsertAgentRecord(input: unknown): AgentRecord {
  const rec = agentRecordSchema.parse(input);
  if (isBuiltinAgent(rec.name)) {
    throw new Error(`"${rec.name}" is a built-in specialist and cannot be redefined`);
  }
  const next = readCustom().filter((a) => a.name !== rec.name);
  next.push({ ...rec, builtin: false });
  saveCustom(next);
  materializeAgent(rec.name);
  log("config", "agent-store", "specialist agent upserted", { name: rec.name });
  return { ...rec, builtin: false };
}

export function deleteAgentRecord(name: string): void {
  if (isBuiltinAgent(name)) throw new Error(`"${name}" is a built-in specialist and cannot be deleted`);
  saveCustom(readCustom().filter((a) => a.name !== name));
  log("config", "agent-store", "specialist agent deleted", { name });
}
