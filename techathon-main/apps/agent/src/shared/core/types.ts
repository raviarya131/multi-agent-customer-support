/**
 * core/types.ts
 *
 * These are the contracts that make the skeleton reusable.
 * Nothing here mentions "billing" — a Policy agent would reuse this file as-is.
 */

/** A request entering the agent (one sub-ticket from the orchestrator). */
export interface Ticket {
  /** Unique id for tracing this request end to end. */
  traceId: string;
  /**
   * The decomposed sub-problem id the orchestrator assigned. Echoed back on the
   * AgentReport so the merger can map each report to its sub-problem. Falls back
   * to traceId when an agent is invoked directly (single-agent demos).
   */
  subProblemId?: string;
  /** Raw customer text for this sub-ticket. */
  text: string;
  /** Optional structured context the orchestrator already knows. */
  context?: Record<string, unknown>;
  /**
   * Prior turns on the same ticket (follow-ups). Lets the agent's answer take
   * the conversation into account without polluting param extraction.
   */
  history?: { role: string; text: string }[];
  /**
   * For a decomposed multi-issue ticket, the specific sub-problem this agent
   * should focus on (the decomposer's description). Empty for single-issue.
   */
  focus?: string;
  /**
   * Compact structured context from the latest previous pipeline run on this
   * ticket. Used for follow-ups so agents can reference prior findings/actions.
   */
  priorContext?: unknown;
}

/**
 * The four mutually-exclusive ways an agent can finish a sub-ticket. This is the
 * signal the (future) orchestrator/merger routes on — see AgentReport.status.
 *   - resolved:            handled it; findings/actions hold the result.
 *   - out_of_domain:       not this agent's specialty; route to another agent.
 *   - needs_clarification: it's ours, but we need a param from the customer.
 *   - needs_escalation:    it's ours, we tried, but it's unresolved/high-risk.
 */
export type AgentOutcome =
  | "resolved"
  | "out_of_domain"
  | "needs_clarification"
  | "needs_escalation";

/**
 * The state object that flows through the LangGraph-style execution loop.
 * Each node reads from it and returns a partial patch that gets merged in.
 */
export interface AgentState {
  ticket: Ticket;
  /** Which handler the classifier chose. */
  handlerId?: string;
  /** Classifier confidence 0..1. */
  confidence?: number;
  /** Free-form scratch space a handler accumulates while working. */
  scratch: Record<string, unknown>;
  /** Evidence collected (e.g. DB rows, policy snippets) — feeds traceability. */
  evidence: Evidence[];
  /** Step-by-step reasoning the handler wants surfaced to the user/judges. */
  reasoning: string[];
  /** What the handler determined from the gathered data (-> report.findings). */
  findings?: string;
  /** Concrete recommended next steps / actions taken (-> report.actions). */
  actions?: string[];
  /** Handler's self-assessment: did it actually resolve the request? */
  resolved?: boolean;
  /**
   * Customer-facing summary. Mirrors `findings` for handlers that produce one;
   * the graph's verify node uses its presence to decide the run is done.
   */
  answer?: string;
  /** True when the loop should stop. */
  done: boolean;
  /** Set when we need to bail out and ask the customer something. */
  clarificationNeeded?: string;
  /** Set when the handler tried but couldn't resolve — surfaces as escalation. */
  escalate?: boolean;
}

/** A single piece of evidence, always traceable back to a source. */
export interface Evidence {
  source: string; // e.g. "db:transactions", "kb:refund_policy.md"
  detail: string; // human-readable summary of what was found
  raw?: unknown; // the underlying data, optional
}

/**
 * The contract every use case implements. This is the heart of the design:
 * register one of these and the classifier + graph pick it up automatically.
 */
export interface UseCaseHandler {
  /** Stable machine id, e.g. "explain_charge". */
  id: string;
  /** One-line description the classifier uses to decide routing. */
  description: string;
  /** A few example phrasings that should route here. */
  examples: string[];
  /** Names of tools this handler may use (documentation + future guardrails). */
  requiredTools: string[];
  /**
   * The actual work. Receives the current state, returns a patch.
   * In Stage 0 this just echoes; in later stages it queries DBs, reads the KB, etc.
   */
  run: (state: AgentState) => Promise<Partial<AgentState>>;
}

// ============================================================================
// DECLARATIVE USE CASES (data, not code)
// ----------------------------------------------------------------------------
// A use case can be described as a JSON object instead of a hand-written
// handler. One common handler (shared/handlers/declarative.handler.ts) runs any
// of them. To add a use case you drop a JSON file in an agent's usecases/ dir.
// ============================================================================

/** A required/optional parameter a use case needs to do its work. */
export interface ParamSpec {
  type: string;
  format?: string;
  description?: string;
  prompt_if_missing?: string;
}

/** A KB file a use case is scoped to. */
export interface KBScopeEntry {
  library_name?: string;
  knowledge_file: string; // filename inside shared/kb/library
  description?: string;
}

/** Which tools and KB a use case is ALLOWED to touch (the scope). */
export interface UseCaseCapabilities {
  tools?: string[];
  knowledge_base?: KBScopeEntry[];
  can_ask_user?: boolean;
}

/** The full JSON shape of a declarative use case. */
export interface UseCaseDefinition {
  use_case_id: string;
  version?: number;
  enabled?: boolean;
  description: string;
  example_utterances: string[];
  prompt: string;
  capabilities?: UseCaseCapabilities;
  required_params?: Record<string, ParamSpec>;
  optional_params?: Record<string, ParamSpec>;
  side_effecting?: boolean;
  response_templates?: Record<string, string>;
  error_template?: string;
  status_routing?: Record<string, string[]>;
  [extra: string]: unknown;
}

/**
 * The narrowed view handed to the common handler at runtime. It can ONLY reach
 * the tools and KB the use case declared — this is the "scoped model" over the
 * SHARED central pools.
 */
export interface ScopedContext {
  useCaseId: string;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  retrieve: (query: string) => Promise<RetrievalResult[]>;
  toolScope: string[];
  kbScope: string[];
}

/** A tool in the shared pool. Tools are "dumb": fetch/compute, return data. */
export interface Tool {
  name: string;
  description: string;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

/** One section/chunk returned by the KB retriever, always with a source. */
export interface RetrievalResult {
  source: string; // e.g. "kb:refund_policy.md"
  text: string;
  score?: number;
}

/**
 * The structured report an agent returns to the orchestrator/merger. The field
 * names match the spec's AgentReport contract exactly
 * ({ agent, sub_problem_id, findings, actions, reasoning, evidence, status,
 * confidence }); the trailing fields are extras the orchestrator may ignore but
 * that power the audit trail.
 */
export interface AgentReport {
  /** Which specialized agent produced this report. */
  agent: string;
  /** The decomposed sub-problem this report answers. */
  sub_problem_id: string;
  /** What the agent determined from the gathered data. */
  findings: string;
  /** Concrete recommended next steps / actions. */
  actions: string[];
  /** Step-by-step reasoning (constraint: every recommendation includes reasoning). */
  reasoning: string[];
  /** Sources backing every claim. */
  evidence: Evidence[];
  /** Terminal status — the signal the orchestrator routes on. */
  status: AgentOutcome;
  /** Routing/answer confidence 0..1. */
  confidence: number | null;

  // --- extras beyond the spec minimum ---------------------------------------
  /** Which use-case handler ran (null if none matched). */
  handlerId: string | null;
  /** End-to-end correlation id for this sub-ticket. */
  traceId: string;
  /** The ordered log of everything that happened, for observability/audit. */
  trace: TraceEntry[];
}

/** One structured log line. */
export interface TraceEntry {
  traceId: string;
  ts: string; // ISO timestamp
  node: string; // which part of the pipeline emitted this
  message: string;
  data?: Record<string, unknown>;
}
