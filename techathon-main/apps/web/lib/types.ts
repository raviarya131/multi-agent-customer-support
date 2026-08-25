// Authenticated account (user = customer, admin = admin+developer, agent = human support agent).
export type Role = "user" | "admin" | "agent";
export interface Account {
  id: string;
  email: string;
  role: Role;
  name: string;
  customer_id: string | null;
  agent_id: string | null;
}

// Mirror of the agent PipelineState (subset the UI renders).
export interface Message {
  role: "customer" | "system" | "agent";
  text: string;
  timestamp?: string;
  /** DB row id (persisted messages only) — used to attach feedback. */
  id?: number;
}
export type StepKind = "llm" | "heuristic";
export interface AuditEvent {
  step: string;
  actor: string;
  timestamp: string;
  summary: string;
  kind?: StepKind;
  detail?: string;
}
export interface IntentScore { type: string; confidence: number; }
export interface Classification {
  primary_intent: string;
  is_multi_issue: boolean;
  fallback: boolean;
  intents: IntentScore[];
  category?: "support" | "greeting" | "out_of_scope" | "faq";
}
export interface Sentiment {
  label: string;
  score: number;
  frustration?: boolean;
  drivers?: string[];
  trend?: "rising" | "steady" | "easing";
}
export interface SubProblem { id: string; domain: string; description: string; }
export interface AgentReport {
  agent: string;
  sub_problem_id: string;
  findings: string[];
  actions: string[];
  reasoning: string;
  evidence: string[];
  status: string;
  confidence: number;
  duration_ms?: number;
  clarification_needed?: boolean;
  clarification_question?: string;
  trace?: AgentTraceEvent[];
}
export interface AgentTraceEvent {
  traceId: string;
  ts: string;
  node: string;
  message: string;
  data?: Record<string, unknown>;
}
export interface Investigation { overall_status: string; conflicts: string[]; }
export interface Severity { level: string; priority: string; reasoning: string; }
export interface AssignedAgent {
  id: string;
  name: string;
  title: string;
  department: string;
}
export interface Escalation {
  escalate: boolean;
  reason?: string;
  recommended_team?: string;
  urgency?: string;
  internal_actions?: string[];
  customer_addendum?: string;
  assigned_agent?: AssignedAgent;
  escalation_id?: string;
}
export interface Resolution {
  summary: string;
  findings: string[];
  actions: string[];
  reasoning: string;
  evidence: string[];
}
export interface PriorRunContext {
  run_id?: string;
  message?: string;
  resolution?: Resolution;
  agent_reports?: AgentReport[];
  investigation?: Investigation;
  severity?: Severity;
  escalation?: Escalation;
}
// Sidebar list item (server-backed).
export interface TicketSummary {
  ticket_id: string;
  display_id: string;
  title: string;
  message_count: number;
  updated_at: string;
  status: TicketLifecycleStatus;
  parent_ticket_id: string | null;
  // Stable per-session ticket number (creation order). Shown in the dashboard.
  seq: number;
}

// A customer you can act as, with live presence info.
export interface UserPresence {
  id: string;
  name: string;
  plan: string;
  occupied: boolean;
  mine: boolean;
}

// Human support agent + a persisted escalation case (for the dashboard).
export type AgentLevel = "agent" | "manager";
export interface HumanAgent {
  id: string;
  name: string;
  title: string;
  department: string;
  level: AgentLevel;
}
export interface EscalationRecord {
  id: string;
  ticket_id: string;
  customer_id: string | null;
  customer_name: string;
  subject: string;
  department: string;
  team: string | null;
  urgency: string | null;
  reason: string | null;
  assignee_id: string;
  assignee_name: string;
  assignee_title: string;
  assignee_level?: string | null;
  handoff_note?: string | null;
  status: "open" | "resolved";
  created_at: string;
  reopened?: number;
  // SLA tracking
  sla_started_at?: string | null;
  sla_due_at?: string | null;
  sla_state?: "on_track" | "warning" | "breached";
  escalation_source?: "auto" | "agent" | "sla" | "manager" | "admin";
  missed_by_id?: string | null;
  missed_by_name?: string | null;
  manager_disposition?: string | null;
  breach_count?: number;
}

// SLA policy editable in the Platform panel: deadlines (in hours) per
// department × priority, plus the fraction of the window at which a warning fires.
export interface SlaConfig {
  matrix: Record<string, { P1: number; P2: number; P3: number }>;
  warn_pct: number;
}

// Customer-facing Help Center article (self-service knowledge).
export interface HelpArticle {
  file: string;
  title: string;
  content: string;
  bytes: number;
}

// A customer-safe FAQ for the browsable Help Center list (no internal triggers).
export interface PublicFaq {
  id: string;
  label: string;
  answer: string;
}

// One self-service answer from the Help Center (read-only; no ticket).
export interface HelpAnswer {
  answer: string;
  answered: boolean;
  source: "faq" | "kb" | "none";
  sources: { title: string; file: string }[];
  suggestEscalation: boolean;
}

// In-app notification addressed to the signed-in account.
export interface NotificationRecord {
  id: string;
  account_id: string;
  kind: string;
  title: string;
  body: string | null;
  ticket_id: string | null;
  read: number;
  created_at: string;
}

// ---- Live config store (platform admin) ------------------------------------
export interface KbDoc {
  file: string;
  content: string;
  bytes: number;
}

export interface KbDraft {
  title: string;
  filename: string;
  content: string;
  summary: string;
  source: "llm" | "template";
}
export interface StoredUseCase {
  agent: string;
  file: string;
  def: Record<string, unknown> & {
    use_case_id: string;
    description?: string;
    example_utterances?: string[];
    enabled?: boolean;
    capabilities?: { tools?: string[]; knowledge_base?: { knowledge_file: string }[] };
  };
}
export interface HttpToolSpec {
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  url_template: string;
  allowed_hosts?: string[];
  headers?: Record<string, string>;
  timeout_ms?: number;
}
export interface ToolInfo {
  name: string;
  description: string;
}
export interface HumanAgentAdmin {
  id: string;
  name: string;
  title: string;
  department: string;
  level: AgentLevel;
  email: string | null;
  counts: { open: number; resolved: number; total: number };
}
export interface ConfigAuditRecord {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target: string;
  detail: string | null;
  created_at: string;
}

export type TicketLifecycleStatus = "active" | "escalated" | "reopened" | "resolved";

/** Row in the tickets ops dashboard. */
export interface TicketDashboardRow {
  ticket_id: string;
  display_id: string;
  title: string;
  customer_id: string | null;
  parent_ticket_id: string | null;
  customer_name: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  run_count: number;
  status: TicketLifecycleStatus;
  primary_intent: string | null;
  severity: string | null;
  priority: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  frustration: boolean;
  summary: string | null;
  escalation_id: string | null;
  escalation_status: "open" | "resolved" | null;
}

/** One persisted pipeline run — includes the full audit trace. */
export interface TicketRunRecord {
  run_id: string;
  created_at: string;
  message: string;
  message_count: number;
  primary_intent: string | null;
  severity: string | null;
  priority: string | null;
  escalated: boolean;
  audit_trail: AuditEvent[];
  agent_reports: AgentReport[];
  state: PipelineState;
}

export interface TicketDashboardDetail {
  ticket: TicketDashboardRow;
  messages: Message[];
  runs: TicketRunRecord[];
  escalation: EscalationRecord | null;
}

/** One agent run in the observability feed (a "session"). */
export interface RunSessionRow {
  run_id: string;
  ticket_id: string;
  display_id: string;
  created_at: string;
  customer_name: string;
  message: string;
  category: string | null;
  primary_intent: string | null;
  is_multi_issue: boolean;
  sentiment: string | null;
  sentiment_score: number | null;
  frustration: boolean;
  sentiment_trend: string | null;
  severity: string | null;
  priority: string | null;
  escalated: boolean;
  guard_flagged: boolean;
  overall_status: string | null;
  agent_count: number;
  step_count: number;
  llm_steps: number;
}

// ---- Platform: policies + specialist agents --------------------------------

export interface GuardSignal {
  phrase: string;
  category: string;
}

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

export interface SpecialistAgentRecord {
  name: string;
  label: string;
  description: string;
  keywords: string[];
  team: string;
  builtin: boolean;
}

// ---- Platform: FAQ / canned responses --------------------------------------

export type FaqMatchMode = "contains" | "exact" | "regex";

export interface FaqEntry {
  id: string;
  label: string;
  enabled: boolean;
  match: FaqMatchMode;
  triggers: string[];
  answer: string;
}

// ---- Real-time agent collaboration -----------------------------------------

export interface CollabAgent {
  id: string;
  name: string;
  title: string;
  department: string;
  level: "agent" | "manager";
  open_cases: number;
  online: boolean;
  last_seen: string | null;
}

export interface TeamActivity {
  id: string;
  kind: string;
  actor_id: string | null;
  actor_name: string | null;
  ticket_id: string | null;
  escalation_id: string | null;
  summary: string;
  created_at: string;
}

export interface CaseNote {
  id: string;
  escalation_id: string;
  ticket_id: string | null;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

export interface CollabOverview {
  agents: CollabAgent[];
  online_count: number;
  open_cases: number;
  activity: TeamActivity[];
  notes: CaseNote[];
  open_escalations: EscalationRecord[];
}

// ---- Feedback (thumbs up/down on AI replies) -------------------------------

export interface FeedbackRow {
  id: string;
  ticket_id: string;
  display_id: string;
  message_id: number;
  customer_id: string | null;
  customer_name: string;
  rating: "up" | "down";
  comment: string | null;
  question: string | null;
  answer: string | null;
  created_at: string;
  department: string | null;
}

/** Full detail for one run — the complete pipeline state for the trace view. */
export interface RunSessionDetail {
  run_id: string;
  ticket_id: string;
  display_id: string;
  created_at: string;
  customer_name: string;
  state: PipelineState;
}

// Response for a single ticket: the latest run (details) + full chat thread.
export interface TicketDetail {
  ticket_id: string;
  display_id?: string;
  status?: TicketLifecycleStatus;
  parent_ticket_id?: string | null;
  summary?: string | null;
  run: PipelineState | null;
  /** Per-turn pipeline states (one per customer message), oldest → newest. */
  runs?: PipelineState[];
  messages: Message[];
  escalation_id?: string | null;
  escalation_status?: "open" | "resolved" | null;
  /** Name of the human agent handling an open escalation (live chat mode). */
  escalation_assignee?: string | null;
}

export type PipelineStepId =
  | "guard"
  | "classify"
  | "sentiment"
  | "decompose"
  | "investigate"
  | "severity"
  | "escalation"
  | "synthesize";

export interface PipelineProgressEvent {
  type: "step_start" | "step_done" | "agent_done" | "done" | "error" | "complete";
  step?: PipelineStepId;
  audit?: AuditEvent[];
  agent?: string;
  message?: string;
  snapshot?: Partial<PipelineState>;
  state?: PipelineState;
  ticket_id?: string;
  display_id?: string;
  status?: TicketLifecycleStatus;
  summary?: string | null;
  run?: PipelineState;
  messages?: Message[];
  escalation_id?: string | null;
}

/** Live pipeline progress while a run is in flight (driven by SSE, not timers). */
export interface RunProgress {
  activeStep: PipelineStepId | null;
  completedSteps: PipelineStepId[];
  liveAudit: AuditEvent[];
  agentsDone: string[];
  snapshot: Partial<PipelineState>;
}

export interface PipelineState {
  ticket_id: string;
  run_id: string;
  message: string;
  message_count: number;
  history?: Message[];
  prior_context?: PriorRunContext;
  guard?: { force_escalation: boolean; reason: string | null; matched_phrase: string | null };
  classification?: Classification;
  sentiment?: Sentiment;
  sub_problems?: SubProblem[];
  agent_reports?: AgentReport[];
  investigation?: Investigation;
  severity?: Severity;
  escalation?: Escalation;
  resolution?: Resolution;
  audit_trail: AuditEvent[];
}
