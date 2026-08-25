// Common specialist-agent interface used by the orchestrator.
//
// Specialists are now backed by the LLM agent framework in ../shared (declarative
// use cases, KB retrieval, tool pool, multi-provider gateway). Each domain is
// exposed to the pipeline through an adapter (adapter.ts) that maps the
// framework's report shape onto the pipeline's AgentReport contract.
//
// `run` may be sync or async — the orchestrator awaits it either way.
import type { AgentDomain, AgentReport, Message, PriorRunContext, SubProblem } from "../contracts/types";

export interface AgentContext {
  message: string;
  history: Message[];
  /** Selected customer id — auto-attached so tools can look the customer up. */
  customerId?: string;
  /** Latest previous structured run context for follow-up reasoning. */
  priorContext?: PriorRunContext;
}

export interface SpecialistAgent {
  domain: AgentDomain;
  run(sub: SubProblem, ctx: AgentContext): AgentReport | Promise<AgentReport>;
}
