// Shared pipeline contracts. One object flows through the pipeline and each
// step adds its own fields.

// Domains are admin-extensible (new specialist agents can be added at runtime),
// so these are open strings. The built-ins are technical | billing | policy, and
// IntentType additionally carries the router-only sentinels mixed | unknown.
export type IntentType = string;
export type AgentDomain = string;
// How the engine should treat an inbound message:
// - support: a real support request/question/complaint/follow-up → run the pipeline.
// - greeting: a greeting, thanks, or small talk → friendly reply, no specialists, no ticket.
// - out_of_scope: unrelated to customer support → polite refusal, no specialists, no ticket.
// - faq: matched an admin-defined canned answer → reply with it, no specialists, no ticket.
export type MessageCategory = "support" | "greeting" | "out_of_scope" | "faq";
export type SentimentLabel = "neutral" | "frustrated" | "angry";
export type AgentStatus = "resolved" | "needs_info" | "unresolved" | "failed";
export type SeverityLevel = "low" | "medium" | "high";
export type PriorityLevel = "P3" | "P2" | "P1";

export interface Message {
  role: "customer" | "system" | "agent";
  text: string;
  timestamp: string;
}

export interface Guard {
  force_escalation: boolean;
  reason: string | null;
  matched_phrase: string | null;
}

export interface IntentScore {
  type: IntentType;
  confidence: number;
}

export interface Classification {
  primary_intent: IntentType;
  is_multi_issue: boolean;
  fallback: boolean;
  intents: IntentScore[];
  /** Whether this message is a support request, a greeting, or out of scope. */
  category?: MessageCategory;
  /** When category is "faq": the matched canned answer + which entry matched. */
  faq_answer?: string;
  faq_label?: string;
}

export interface Sentiment {
  label: SentimentLabel;
  score: number;
  /** True when the customer shows clear frustration/anger needing care. */
  frustration?: boolean;
  /** Short human-readable reasons the tone/frustration was detected. */
  drivers?: string[];
  /** How tone is moving across the conversation. */
  trend?: "rising" | "steady" | "easing";
}

export interface SubProblem {
  id: string;
  domain: AgentDomain;
  description: string;
}

export interface AgentReport {
  agent: AgentDomain;
  sub_problem_id: string;
  findings: string[];
  actions: string[];
  reasoning: string;
  evidence: string[];
  status: AgentStatus;
  confidence: number;
  /** Wall-clock time this agent took (ms) — set by the orchestrator fan-out. */
  duration_ms?: number;

  // Set when the agent matched its domain but was not confident enough to act
  // and needs more detail from the customer (framework status
  // "needs_clarification"). Distinct from a generic `needs_info`: this carries a
  // specific question to put back to the customer. Optional + additive so the
  // status contract and all downstream steps are unchanged.
  clarification_needed?: boolean;
  clarification_question?: string;
  /** Internal framework/tool/KB/LLM trace rows captured while this agent ran. */
  trace?: AgentTraceEvent[];
}

export interface AgentTraceEvent {
  traceId: string;
  ts: string;
  node: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface Investigation {
  overall_status: "resolved" | "partial" | "unresolved";
  conflicts: string[];
}

export interface Severity {
  level: SeverityLevel;
  priority: PriorityLevel;
  reasoning: string;
}

export interface Escalation {
  escalate: boolean;
  reason?: string;
  recommended_team?: string;
  urgency?: PriorityLevel;
  internal_actions?: string[];
  customer_addendum?: string;
  // Assigned by the Application API after the pipeline runs (it owns the human
  // org + dashboard). The agent leaves this unset.
  assigned_agent?: { id: string; name: string; title: string; department: string };
  escalation_id?: string;
}

export interface Resolution {
  summary: string;
  findings: string[];
  actions: string[];
  reasoning: string;
  evidence: string[];
}

// Live status of the ticket itself (owned by the application layer), passed in
// so the synthesizer can answer follow-ups/"what's the update?" without asking
// the customer to re-identify themselves.
export interface TicketStatus {
  has_escalation: boolean;
  escalation_status?: "open" | "resolved" | null;
  assignee_name?: string | null;
  department?: string | null;
  urgency?: string | null;
}

// Compact structured context from the latest previous run on the same ticket.
// Follow-ups can use this to build on what was already investigated instead of
// relying only on the raw chat transcript.
export interface PriorRunContext {
  run_id?: string;
  message?: string;
  resolution?: Resolution;
  agent_reports?: AgentReport[];
  investigation?: Investigation;
  severity?: Severity;
  escalation?: Escalation;
}

export type StepKind = "llm" | "heuristic";

// Reopen triage — on a ticket that already had a human escalation, decide whether
// the new message continues that SAME problem (route back to the same owner who
// has the context) or raises a NEW issue (open a fresh, load-balanced case).
export interface ContinuityDecision {
  is_continuation: boolean;
  reason: string;
  method: "llm" | "heuristic";
}

export interface AuditEvent {
  step: string;
  actor: string;
  timestamp: string;
  summary: string;
  /** Whether this step reasoned with the LLM or a deterministic rule. */
  kind?: StepKind;
  /** A fuller "thought" — the reasoning behind this step, for the chat trail. */
  detail?: string;
}

// The full object that grows as it moves through the pipeline.
export interface PipelineState {
  ticket_id: string;
  run_id: string;
  message: string;
  message_count: number;
  /** The customer this ticket is acting as (selected in the UI), if any. */
  customer_id?: string;
  /** Live ticket status (escalation open/resolved, assignee) for follow-ups. */
  ticket_status?: TicketStatus;
  /** Latest previous structured run, if this is a follow-up. */
  prior_context?: PriorRunContext;
  history: Message[];

  guard?: Guard;
  classification?: Classification;
  /** On a reopened ticket: is this the same problem or a new one? */
  continuity?: ContinuityDecision;
  sentiment?: Sentiment;
  sub_problems?: SubProblem[];
  agent_reports?: AgentReport[];
  investigation?: Investigation;
  severity?: Severity;
  escalation?: Escalation;
  resolution?: Resolution;

  audit_trail: AuditEvent[];
}

export interface PipelineInput {
  ticket_id: string;
  run_id: string;
  message: string;
  message_count: number;
  customer_id?: string;
  ticket_status?: TicketStatus;
  prior_context?: PriorRunContext;
  history: Message[];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function audit(
  step: string,
  actor: string,
  summary: string,
  extra?: { kind?: StepKind; detail?: string }
): AuditEvent {
  return {
    step,
    actor,
    timestamp: nowIso(),
    summary,
    ...(extra?.kind ? { kind: extra.kind } : {}),
    ...(extra?.detail ? { detail: extra.detail } : {}),
  };
}
