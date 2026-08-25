// The human support org: agents across departments. Escalations are routed
// to a department and assigned to the least-loaded agent in it, so the
// escalation dashboard shows a realistic, balanced workload.
//
// The roster is now DB-backed (so admins can add agents at runtime). The array
// below is the one-time SEED; all reads go through the DB helpers.
import {
  backfillHumanAgentLevels,
  getHumanAgentRow,
  insertHumanAgentRow,
  listHumanAgentRows,
  seedHumanAgentsIfEmpty,
} from "./db";
import { randomUUID } from "node:crypto";

export const DEPARTMENTS = [
  "Billing",
  "Technical",
  "Policy & Compliance",
  "Orders",
  "Merchandising",
  "Trust & Safety",
  "Escalations",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

/**
 * The human org is two-tier: front-line `agent`s handle escalations, and each
 * department has one `manager`. When an agent can't resolve a case they hand it
 * up to their department manager (see `pickManager` + the handoff route).
 */
export type AgentLevel = "agent" | "manager";

export interface HumanAgent {
  id: string;
  name: string;
  title: string;
  department: Department;
  level: AgentLevel;
}

const SEED_AGENTS: HumanAgent[] = [
  // Billing
  { id: "ha_01", name: "Maya Fernandez", title: "Billing Specialist", department: "Billing", level: "agent" },
  { id: "ha_02", name: "Tom Becker", title: "Billing Specialist", department: "Billing", level: "agent" },
  { id: "ha_03", name: "Priya Nair", title: "Senior Billing Analyst", department: "Billing", level: "agent" },
  { id: "ha_04", name: "Liam Walsh", title: "Billing Manager", department: "Billing", level: "manager" },

  // Technical
  { id: "ha_05", name: "Sofia Rossi", title: "Support Engineer", department: "Technical", level: "agent" },
  { id: "ha_06", name: "Daniel Kim", title: "Support Engineer", department: "Technical", level: "agent" },
  { id: "ha_07", name: "Aisha Bello", title: "Senior Support Engineer", department: "Technical", level: "agent" },
  { id: "ha_08", name: "Marcus Webb", title: "Engineering On-call", department: "Technical", level: "agent" },
  { id: "ha_09", name: "Elena Petrova", title: "Engineering Manager", department: "Technical", level: "manager" },

  // Policy & Compliance
  { id: "ha_10", name: "Grace Adeyemi", title: "Policy Specialist", department: "Policy & Compliance", level: "agent" },
  { id: "ha_11", name: "Noah Schmidt", title: "Compliance Analyst", department: "Policy & Compliance", level: "agent" },
  { id: "ha_12", name: "Hana Suzuki", title: "Policy Manager", department: "Policy & Compliance", level: "manager" },

  // Orders (order operations: tracking, delivery, cancel/change)
  { id: "ha_19", name: "Ananya Rao", title: "Order Operations Specialist", department: "Orders", level: "agent" },
  { id: "ha_20", name: "Diego Santos", title: "Order Operations Specialist", department: "Orders", level: "agent" },
  { id: "ha_21", name: "Yuki Tanaka", title: "Order Operations Manager", department: "Orders", level: "manager" },

  // Merchandising (catalog: availability, pricing, product info)
  { id: "ha_22", name: "Farah Ali", title: "Merchandising Specialist", department: "Merchandising", level: "agent" },
  { id: "ha_23", name: "Oliver Grant", title: "Catalog Specialist", department: "Merchandising", level: "agent" },
  { id: "ha_24", name: "Mei Lin", title: "Merchandising Manager", department: "Merchandising", level: "manager" },

  // Trust & Safety
  { id: "ha_13", name: "Omar Haddad", title: "Trust & Safety Agent", department: "Trust & Safety", level: "agent" },
  { id: "ha_14", name: "Bianca Costa", title: "Trust & Safety Agent", department: "Trust & Safety", level: "agent" },
  { id: "ha_15", name: "Victor Ngata", title: "Trust & Safety Manager", department: "Trust & Safety", level: "manager" },

  // Escalations (Tier-2)
  { id: "ha_16", name: "Lena Hoffman", title: "Escalation Manager", department: "Escalations", level: "manager" },
  { id: "ha_17", name: "Raj Malhotra", title: "Tier-2 Specialist", department: "Escalations", level: "agent" },
  { id: "ha_18", name: "Chloe Dubois", title: "Tier-2 Specialist", department: "Escalations", level: "agent" },
];

/** The static roster used to seed the DB and to seed agent login accounts. */
export const HUMAN_AGENTS = SEED_AGENTS;

/** Seed the DB roster once (idempotent). Call on boot before serving. */
export function seedHumanAgents(): void {
  seedHumanAgentsIfEmpty(SEED_AGENTS);
  // Existing DBs were seeded before `level` existed → set manager levels now.
  backfillHumanAgentLevels(
    SEED_AGENTS.map((a) => ({ id: a.id, title: a.title, level: a.level }))
  );
}

/** All human agents (DB-backed; includes admin-created ones). */
export function listHumanAgents(): HumanAgent[] {
  const rows = listHumanAgentRows();
  return rows.length ? (rows as HumanAgent[]) : SEED_AGENTS;
}

export function agentsByDepartment(dept: Department): HumanAgent[] {
  return listHumanAgents().filter((a) => a.department === dept);
}

/** The manager for a department (the next level up for handoffs), if any. */
export function pickManager(dept: Department): HumanAgent | null {
  const inDept = listHumanAgents().filter((a) => a.department === dept);
  return inDept.find((a) => a.level === "manager") ?? null;
}

/** Create a new human agent (admin). Returns the persisted record. */
export function createHumanAgent(opts: {
  name: string;
  title: string;
  department: Department;
  level?: AgentLevel;
}): HumanAgent {
  if (!DEPARTMENTS.includes(opts.department)) {
    throw new Error(`Unknown department: ${opts.department}`);
  }
  const agent: HumanAgent = {
    id: `ha_${randomUUID().slice(0, 8)}`,
    name: opts.name.trim(),
    title: opts.title.trim(),
    department: opts.department,
    level: opts.level === "manager" ? "manager" : "agent",
  };
  if (!agent.name || !agent.title) throw new Error("Name and title are required");
  insertHumanAgentRow(agent);
  return agent;
}

export function getHumanAgent(id: string): HumanAgent | null {
  return (getHumanAgentRow(id) as HumanAgent | null) ?? null;
}

/**
 * Pick the least-loaded agent in a department, given a map of current open
 * counts per agent id. Ties resolve by roster order, so assignment is
 * deterministic and spreads load evenly.
 */
export function pickAssignee(
  dept: Department,
  openCounts: Record<string, number>
): HumanAgent {
  const pool = agentsByDepartment(dept);
  // New escalations go to FRONT-LINE agents; managers only receive cases via an
  // explicit hand-up (see the /handoff route). Fall back to the manager only if a
  // department has no front-line agents, and to the whole roster as a last resort.
  const frontline = pool.filter((a) => a.level === "agent");
  const candidates =
    frontline.length ? frontline : pool.length ? pool : listHumanAgents().filter((a) => a.level === "agent");
  const finalPool = candidates.length ? candidates : listHumanAgents();
  return finalPool.reduce((best, a) =>
    (openCounts[a.id] ?? 0) < (openCounts[best.id] ?? 0) ? a : best
  );
}
