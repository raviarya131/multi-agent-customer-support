/**
 * shared/agent-factory.ts
 *
 * createAgent() mints ONE isolated agent: its own Registry, loaded with its own
 * use cases, with a handle() closed over that registry. The shared, stateless
 * machinery (gateway, tool pool, KB, graph, logger) is NOT copied — every agent
 * uses the same instances. That combination (isolated state + shared stateless
 * machinery) is exactly what makes agents safe to run in parallel:
 *
 *   const billing = createAgent({ name: "billing", useCasesDir: ".../billing/usecases" });
 *   const policy  = createAgent({ name: "policy",  useCasesDir: ".../policy/usecases" });
 *   const [a, b]  = await Promise.all([billing.handle(t1), policy.handle(t2)]);
 *
 * To make a new agent: one createAgent call + a usecases/ folder. Nothing else.
 */
import type { AgentReport, Ticket } from "./core/types.js";
import { Registry } from "./core/registry.js";
import { registerAllTools } from "./tools/index.js";
import { loadUseCasesFrom } from "./handlers/loader.js";
import { runAgent } from "./core/agent.js";
import { log } from "./core/logger.js";

export interface AgentConfig {
  /** Agent name, e.g. "billing", "policy", "technical". */
  name: string;
  /** Absolute path to this agent's usecases/ directory. */
  useCasesDir: string;
}

export interface Agent {
  name: string;
  /** Where this agent's use-case JSON lives (for the live config store). */
  useCasesDir: string;
  /** Currently registered use-case ids (changes after reload()). */
  useCaseIds: string[];
  handle: (ticket: Ticket) => Promise<AgentReport>;
  /** Re-read this agent's usecases/ dir and atomically swap its registry. */
  reload: () => string[];
}

// Every agent minted in this process, by name — so the live config store can
// find an agent to reload after an admin edits its use cases.
const CREATED = new Map<string, Agent>();

export function createAgent(cfg: AgentConfig): Agent {
  // Shared tools register into the central pool (idempotent across agents).
  registerAllTools();

  // THIS agent's own isolated registry. `current` is swapped atomically on
  // reload so in-flight tickets keep the registry they started with.
  let current = new Registry();
  let useCaseIds = loadUseCasesFrom(current, cfg.useCasesDir);

  log("boot", "agent-factory", `agent "${cfg.name}" ready`, {
    useCaseIds,
    registrySize: current.size,
  });

  const reload = (): string[] => {
    const next = new Registry();
    const ids = loadUseCasesFrom(next, cfg.useCasesDir);
    current = next; // atomic swap
    useCaseIds = ids;
    log("config", "agent-factory", `agent "${cfg.name}" reloaded`, { ids });
    return ids;
  };

  const agent: Agent = {
    name: cfg.name,
    useCasesDir: cfg.useCasesDir,
    get useCaseIds() {
      return useCaseIds;
    },
    handle: (ticket: Ticket) => runAgent(current, cfg.name, ticket),
    reload,
  };
  CREATED.set(cfg.name, agent);
  return agent;
}

/** All agents created in this process (for the live config store). */
export function listCreatedAgents(): Agent[] {
  return [...CREATED.values()];
}

export function getCreatedAgent(name: string): Agent | undefined {
  return CREATED.get(name);
}
