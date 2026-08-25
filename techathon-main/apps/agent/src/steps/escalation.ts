// Step 6 — Escalation gate + handoff.
// Gate decides IF we escalate (impact/conflict/force, not mood alone).
// The handoff itself is produced by a named Escalation agent: LLM + escalation
// matrix when available, deterministic fallback when not.
import type {
  AgentDomain,
  AgentReport,
  Escalation,
  Guard,
  Investigation,
  Severity,
  Sentiment,
} from "../contracts/types";
import { callLLM, availableProviders } from "../shared/gateway/index";
import { retrieveFromScope } from "../shared/kb/retriever";
import { log } from "../shared/core/logger";
import { getPolicies } from "../shared/policies/store";
import { teamByDomain } from "../shared/policies/agents";
import { GUARDRAILS_BLOCK } from "../shared/core/guardrails";

export interface GateInput {
  guard: Guard;
  investigation: Investigation;
  severity: Severity;
  sentiment: Sentiment;
  messageCount: number;
  agentReports?: AgentReport[];
}

// The gate rules are admin-toggleable "do / don't" policies. Each rule below is
// only allowed to open an escalation when its toggle is on (all default on, so
// behavior matches the original hardcoded gate until changed).
export function shouldEscalate(input: GateInput): { escalate: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const reports = input.agentReports ?? [];
  const rules = getPolicies().escalation.rules;

  if (rules.hard_guard && input.guard.force_escalation) {
    reasons.push(input.guard.reason || "Hard signal");
  }
  if (rules.high_severity && input.severity.level === "high") {
    reasons.push("High severity impact");
  }
  if (rules.unresolved && input.investigation.overall_status === "unresolved") {
    reasons.push("Unresolved by agents");
  }
  // Mixed resolved + unresolved on a multi-issue ticket is normal partial coverage,
  // not contradictory findings that require a human.
  const anyResolved = reports.some((r) => r.status === "resolved");
  const productivePartial =
    input.investigation.overall_status === "partial" && anyResolved;
  if (
    rules.conflicts &&
    input.investigation.conflicts.length > 0 &&
    !productivePartial
  ) {
    reasons.push("Conflicting agent findings");
  }

  // "Specialist handoff" means NO agent at all could help — the whole
  // investigation came back unresolved, not just one agent having a KB gap in
  // an otherwise partial result. A single unresolved agent when others resolved
  // is normal partial coverage, not a signal that a human must take over.
  const handoff = reports.filter((r) => r.status === "unresolved");
  if (
    rules.specialist_handoff &&
    handoff.length > 0 &&
    input.investigation.overall_status === "unresolved"
  ) {
    reasons.push(
      `Specialist handoff requested (${handoff.map((r) => r.agent).join(", ")})`
    );
  }

  const frustrated =
    input.sentiment.frustration ??
    (input.sentiment.label === "frustrated" || input.sentiment.label === "angry");
  const repeat = input.messageCount > 1;
  const status = input.investigation.overall_status;
  // Frustration alone on a first message where at least one specialist already
  // helped is not an escalation signal — give self-serve a chance on follow-ups.
  const repeatAndStillBlocked = repeat && frustrated && status !== "resolved";
  const firstContactTotalFailure =
    !repeat && frustrated && status === "unresolved" && !anyResolved;
  if (rules.frustration_repeat && (repeatAndStillBlocked || firstContactTotalFailure)) {
    const why = input.sentiment.trend === "rising" ? "rising frustration" : "frustration";
    reasons.push(`${why} with repeat contact / unresolved`);
  }

  return { escalate: reasons.length > 0, reasons };
}

function deterministicEscalation(
  reasons: string[],
  severity: Severity,
  primaryDomain: AgentDomain
): Escalation {
  const team = teamByDomain()[primaryDomain] || "Support Lead";
  return {
    escalate: true,
    reason: reasons.join("; "),
    recommended_team: team,
    urgency: severity.priority,
    internal_actions: [`Assign to ${team}`, "Review full audit trail and agent reports"],
    customer_addendum: `We've escalated your case to our ${team} for priority handling and will follow up shortly.`,
  };
}

interface EscalationAgentOutput {
  recommended_team?: string;
  urgency?: "P1" | "P2" | "P3";
  internal_actions?: string[];
  customer_addendum?: string;
}

export async function runEscalation(
  reasons: string[],
  severity: Severity,
  primaryDomain: AgentDomain,
  opts: {
    traceId?: string;
    reports?: AgentReport[];
    investigation?: Investigation;
  } = {}
): Promise<Escalation> {
  const fallback = deterministicEscalation(reasons, severity, primaryDomain);
  const traceId = opts.traceId ?? "escalation";
  const kbHits = await retrieveFromScope(
    `${primaryDomain} ${severity.level} ${severity.priority} ${reasons.join(" ")}`,
    ["escalation_matrix.md"]
  );

  if (availableProviders().length === 0) {
    return fallback;
  }

  const system = [
    GUARDRAILS_BLOCK,
    "",
    "You are the Escalation Agent for a multi-agent customer-support engine.",
    "Your job is to build a human handoff plan from the escalation reasons,",
    "severity/priority, specialist reports, and the escalation matrix.",
    "Use only the provided facts. Do not invent names or ticket details.",
    'Respond with STRICT JSON only, shaped: { "recommended_team": string, "urgency": "P1"|"P2"|"P3", "internal_actions": string[], "customer_addendum": string }',
  ].join("\n");

  const reportBlock = (opts.reports ?? [])
    .map(
      (r) =>
        `${r.agent} (${r.status}, confidence ${r.confidence}): findings=${r.findings.join(" | ") || "(none)"}; ` +
        `actions=${r.actions.join(" | ") || "(none)"}; evidence=${r.evidence.join(" | ") || "(none)"}`
    )
    .join("\n");

  const user = [
    `PRIMARY DOMAIN: ${primaryDomain}`,
    `SEVERITY: ${severity.level} / ${severity.priority}`,
    `SEVERITY REASONING: ${severity.reasoning}`,
    `ESCALATION REASONS: ${reasons.join("; ")}`,
    `INVESTIGATION: ${opts.investigation ? JSON.stringify(opts.investigation) : "(none)"}`,
    "SPECIALIST REPORTS:",
    reportBlock || "(none)",
    "",
    "ESCALATION MATRIX SNIPPETS:",
    kbHits.map((h) => `[${h.source}]\n${h.text}`).join("\n\n") || "(none)",
    "",
    "Return the JSON object now.",
  ].join("\n");

  try {
    const out = await callLLM<EscalationAgentOutput>({
      traceId,
      system,
      user,
      json: true,
      options: { temperature: 0.1, maxTokens: 600 },
    });

    return {
      escalate: true,
      reason: reasons.join("; "),
      recommended_team: out.recommended_team?.trim() || fallback.recommended_team,
      urgency: out.urgency || fallback.urgency,
      internal_actions: out.internal_actions?.length ? out.internal_actions : fallback.internal_actions,
      customer_addendum: out.customer_addendum?.trim() || fallback.customer_addendum,
    };
  } catch (err) {
    log(traceId, "escalation", "Escalation agent failed, deterministic fallback", {
      error: String(err),
    });
    return fallback;
  }
}
