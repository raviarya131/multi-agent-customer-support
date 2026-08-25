// Agent registry. Maps a pipeline domain to its LLM-backed specialist agent
// (wrapped by adapter.ts). The orchestrator only knows domains, never the
// concrete framework agents.
import type { AgentDomain } from "../contracts/types";
import type { SpecialistAgent } from "./base";
import { adaptAgent } from "./adapter";
import { billingAgent } from "./billing/index";
import { policyAgent } from "./policy/index";
import { technicalAgent } from "./technical/index";
import { ordersAgent } from "./orders/index";
import { productsAgent } from "./products/index";
import { getCreatedAgent } from "../shared/agent-factory";
import { initCustomAgents } from "../shared/policies/agents";

export const AGENT_REGISTRY: Record<string, SpecialistAgent> = {
  technical: adaptAgent("technical", technicalAgent),
  billing: adaptAgent("billing", billingAgent),
  policy: adaptAgent("policy", policyAgent),
  orders: adaptAgent("orders", ordersAgent),
  products: adaptAgent("products", productsAgent),
};

// Re-create any admin-defined specialist agents on boot so they're routable
// after a restart (built-ins above are created via their index modules).
initCustomAgents();

export function getAgent(domain: AgentDomain): SpecialistAgent {
  const builtin = AGENT_REGISTRY[domain];
  if (builtin) return builtin;
  // Admin-defined specialist: adapt its live framework agent on the fly.
  const fw = getCreatedAgent(domain);
  if (fw) return adaptAgent(domain, fw);
  return AGENT_REGISTRY.policy; // policy is the safe default
}
