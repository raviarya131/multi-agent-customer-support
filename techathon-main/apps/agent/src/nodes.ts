// Pipeline nodes. Each takes the current state and returns a partial update
// (new fields + audit events). Shared by both the LangGraph graph (graph.ts)
// and the linear fallback runner (pipeline.ts).
//
// Each audit event is tagged with `kind` (llm | heuristic) and a `detail`
// "thought" so the chat trail can show *how* each step reasoned. Note: the LLM
// steps (classify, agents, synthesize) fall back to deterministic logic if no
// provider is configured or a call fails — `kind` reflects the designed path.
import {
  audit,
  type AgentDomain,
  type AuditEvent,
  type MessageCategory,
  type PipelineState,
  type Resolution,
} from "./contracts/types";
import { runGuard } from "./steps/guard";
import { runClassifier } from "./steps/classifier";
import { triageReopen } from "./steps/continuity";
import { matchFaq } from "./shared/policies/faq";
import { analyzeSentiment } from "./steps/sentiment";
import { availableProviders } from "./shared/gateway/index";
import { runDecomposer } from "./steps/decomposer";
import { runOrchestrator } from "./steps/orchestrator";
import { assessSeverity } from "./steps/severity";
import { shouldEscalate, runEscalation } from "./steps/escalation";
import { runSynthesizer } from "./steps/synthesizer";

export async function guardNode(s: PipelineState): Promise<Partial<PipelineState>> {
  const guard = runGuard(s.message);
  return {
    guard,
    audit_trail: [
      audit(
        "guard",
        "Hard-signal guard",
        guard.force_escalation
          ? `Hard signal: "${guard.matched_phrase}" → force escalation`
          : "No hard signal detected",
        {
          kind: "heuristic",
          detail: guard.force_escalation
            ? `Matched the explicit phrase "${guard.matched_phrase}" (${guard.reason}). The pipeline still runs every step to build handoff context, but escalation is now forced.`
            : "Scanned the message for explicit legal, supervisor-request, and financial-dispute phrases (substring match). None were present, so no hard escalation was forced.",
        }
      ),
    ],
  };
}

export async function classifyNode(s: PipelineState): Promise<Partial<PipelineState>> {
  // FAQ short-circuit — checked FIRST (before the LLM router), like greetings.
  // An admin-defined canned answer skips intent routing and all specialists.
  const faq = matchFaq(s.message);
  if (faq) {
    const classification: PipelineState["classification"] = {
      primary_intent: "faq",
      is_multi_issue: false,
      fallback: false,
      intents: [],
      category: "faq",
      faq_answer: faq.answer,
      faq_label: faq.label,
    };
    return {
      classification,
      audit_trail: [
        audit("classify", "Intent classifier", `FAQ matched: ${faq.label}`, {
          kind: "heuristic",
          detail: `The message matched the admin-defined FAQ "${faq.label}", so the engine replies with its canned answer and skips intent routing and all specialist agents.`,
        }),
      ],
    };
  }

  const classification = await runClassifier(s.message, s.history, s.run_id);
  const category: MessageCategory = classification.category ?? "support";
  const top = classification.intents.map((i) => `${i.type} ${i.confidence.toFixed(2)}`).join(", ");

  // Non-support messages stop here (no domain routing) — say so plainly.
  if (category !== "support") {
    return {
      classification,
      audit_trail: [
        audit(
          "classify",
          "Intent classifier",
          category === "greeting" ? "Greeting / small talk" : "Out of customer-support scope",
          {
            kind: "llm",
            detail:
              category === "greeting"
                ? "The router judged this a greeting or small talk with no support request, so no domain routing or specialist work is needed."
                : "The router judged this outside customer-support scope, so the engine will politely decline and run no specialists.",
          }
        ),
      ],
    };
  }

  const why = classification.is_multi_issue
    ? "Two or more domains crossed the multi-issue threshold, so this is handled as a multi-issue ticket."
    : classification.fallback
      ? "The top confidence fell below the threshold, so it routes to a safe policy review rather than guessing."
      : "One domain clearly dominated.";
  const events = [
    audit(
      "classify",
      "Intent classifier",
      `${classification.primary_intent}${classification.fallback ? " (fallback)" : ""} [${top}]`,
      {
        kind: "llm",
        detail: `LLM router (temperature 0) judged which domains the message touches. Confidences: ${top || "none"}. ${why}`,
      }
    ),
  ];

  // Reopen triage — only when this ticket already had a human escalation. Decides
  // continuation (same problem → keep the existing owner) vs new issue (open a
  // fresh, load-balanced case). The routing layer reads `continuity` to assign.
  let continuity: PipelineState["continuity"];
  if (s.ticket_status?.has_escalation) {
    continuity = await triageReopen({
      message: s.message,
      history: s.history,
      priorContext: s.prior_context,
      ticketStatus: s.ticket_status,
      traceId: s.run_id,
    });
    events.push(
      audit(
        "reopen_triage",
        "Reopen triage",
        continuity.is_continuation ? "Continuation of the prior case" : "New issue (not the prior case)",
        {
          kind: continuity.method,
          detail:
            `This ticket previously reached a human (${s.ticket_status.department ?? "a team"}${s.ticket_status.assignee_name ? `, ${s.ticket_status.assignee_name}` : ""}). ` +
            `Judged the new message ${continuity.is_continuation ? "a CONTINUATION of that same problem" : "a NEW issue"}: ${continuity.reason} ` +
            (continuity.is_continuation
              ? "→ it will go back to the same owner, who already has the context."
              : "→ a fresh case will be opened and assigned to the most available agent (load-balanced)."),
        }
      )
    );
  }

  return { classification, ...(continuity ? { continuity } : {}), audit_trail: events };
}

export async function sentimentNode(s: PipelineState): Promise<Partial<PipelineState>> {
  const sentiment = await analyzeSentiment(s.message, s.history, s.run_id);
  const driverText = sentiment.drivers?.length ? ` — ${sentiment.drivers.join("; ")}` : "";
  const usedLlm = availableProviders().length > 0;
  return {
    sentiment,
    audit_trail: [
      audit(
        "sentiment",
        "Sentiment detector",
        `${sentiment.label} (${sentiment.score})${sentiment.frustration ? " · frustrated" : ""}`,
        {
          kind: usedLlm ? "llm" : "heuristic",
          detail:
            `Judged the customer's emotional tone across the conversation → ${sentiment.label} ` +
            `(score ${sentiment.score}, trend ${sentiment.trend ?? "steady"})${driverText}. ` +
            `Frustration${sentiment.frustration ? " detected" : " not detected"}. ` +
            `Used as a capped nudge to priority and as an escalation signal alongside repeat contact — never tone alone.`,
        }
      ),
    ],
  };
}

export async function decomposeNode(s: PipelineState): Promise<Partial<PipelineState>> {
  const category: MessageCategory = s.classification?.category ?? "support";

  // Greetings and out-of-scope messages have nothing to investigate — emit zero
  // sub-problems so NO specialist agent runs for them.
  if (category !== "support") {
    const label =
      category === "greeting"
        ? "Greeting — no sub-problems"
        : category === "faq"
          ? "FAQ — no sub-problems"
          : "Out of scope — no sub-problems";
    const detail =
      category === "greeting"
        ? "The message is a greeting / small talk with no support request, so there is nothing to decompose and no specialist agents are needed."
        : category === "faq"
          ? "The message matched a canned FAQ answer, so there is nothing to decompose and no specialist agents are needed."
          : "The message is outside customer-support scope, so no sub-problems are created and no specialist agents run.";
    return {
      sub_problems: [],
      audit_trail: [audit("decompose", "Decomposer", label, { kind: "heuristic", detail })],
    };
  }

  // Hard-signal messages (legal, security, human-request) bypass multi-domain
  // decomposition and go straight to the policy escalation handler.
  if (s.guard?.force_escalation) {
    const sub_problems = [
      {
        id: "SP-1",
        domain: "policy",
        description: s.message.replace(/\s+/g, " ").trim().slice(0, 200),
      },
    ];
    return {
      sub_problems,
      audit_trail: [
        audit("decompose", "Decomposer", "Hard signal → policy escalation handoff", {
          kind: "heuristic",
          detail:
            `Matched hard signal "${s.guard.matched_phrase}" (${s.guard.reason}). ` +
            "Skipping multi-domain split — routing directly to the policy escalation handler.",
        }),
      ],
    };
  }

  const { subProblems: sub_problems, method } = await runDecomposer(
    s.message,
    s.classification!,
    s.run_id
  );
  const multi = sub_problems.length > 1;
  const lead = method === "llm" ? "LLM split the ticket into independent sub-problems. " : "Rule-based clause/keyword split. ";
  return {
    sub_problems,
    audit_trail: [
      audit(
        "decompose",
        "Decomposer",
        multi
          ? `Split into ${sub_problems.length} sub-problems: ${sub_problems.map((p) => p.domain).join(", ")}`
          : `Single issue → ${sub_problems[0]?.domain}`,
        {
          kind: method === "llm" ? "llm" : "heuristic",
          detail:
            lead +
            (multi
              ? `${sub_problems.length} sub-problems will run in parallel (${sub_problems.map((p) => p.domain).join(", ")}).`
              : `One concrete issue → the ${sub_problems[0]?.domain} specialist.`),
        }
      ),
    ],
  };
}

export async function investigateNode(
  s: PipelineState,
  onAgentDone?: (agent: string, audit: AuditEvent[]) => void
): Promise<Partial<PipelineState>> {
  const subs = s.sub_problems || [];

  // No sub-problems (greeting / out-of-scope) → no specialists run at all. Use a
  // neutral "partial" investigation so severity stays low and nothing escalates,
  // and the ticket status is never flipped to resolved by an empty turn.
  if (subs.length === 0) {
    const category: MessageCategory = s.classification?.category ?? "support";
    return {
      agent_reports: [],
      investigation: { overall_status: "partial", conflicts: [] },
      audit_trail: [
        audit("orchestrate", "Orchestrator", "No specialist agents needed", {
          kind: "heuristic",
          detail:
            category === "greeting"
              ? "This message is a greeting, so no sub-problems were created and no specialist agents ran."
              : category === "faq"
                ? "This message matched a canned FAQ answer, so no specialist agents ran."
                : category === "out_of_scope"
                  ? "This message is out of scope, so no specialist agents ran."
                  : "No sub-problems to investigate, so no specialist agents ran.",
        }),
      ],
    };
  }

  const { reports, investigation, timing } = await runOrchestrator(
    subs,
    s.message,
    s.history,
    s.customer_id,
    s.prior_context,
    (agent, report) => {
      onAgentDone?.(agent, [
        audit(
          "agent",
          `${agent} agent`,
          `${report.status} — ${report.findings[0] || "no findings"}`,
          {
            kind: "llm",
            detail:
              (report.reasoning ||
                `Picked a use case, called its scoped tools/KB, and composed an answer (status: ${report.status}).`) +
              (report.duration_ms != null ? ` (took ${report.duration_ms}ms)` : ""),
          }
        ),
      ]);
    }
  );

  const saved = timing.sumMs - timing.wallMs;
  const events = [
    audit("orchestrate", "Orchestrator", `Fan-out: ${reports.length} agent(s) in parallel`, {
      kind: "heuristic",
      detail:
        `Launched ${reports.length} specialist agent(s) concurrently. Wall-clock ${timing.wallMs}ms vs ${timing.sumMs}ms of total agent time` +
        (reports.length > 1 && saved > 0
          ? ` — running in parallel saved ~${saved}ms; the early finishers waited for the slowest before merging.`
          : "."),
    }),
  ];

  for (const r of reports) {
    events.push(
      audit(
        "agent",
        `${r.agent} agent`,
        `${r.status} — ${r.findings[0] || "no findings"}${r.evidence.length ? ` [${r.evidence.join(", ")}]` : ""}`,
        {
          kind: "llm",
          detail:
            (r.reasoning ||
              `Picked a use case, called its scoped tools/KB, and composed an answer (status: ${r.status}).`) +
            (r.duration_ms != null ? ` (took ${r.duration_ms}ms)` : ""),
        }
      )
    );
    for (const t of r.trace ?? []) {
      events.push({
        step: `agent:${t.node}`,
        actor: `${r.agent} ${t.node}`,
        timestamp: t.ts,
        summary: t.message,
        kind: t.node === "tool" || t.node === "kb" ? "heuristic" : "llm",
        ...(t.data ? { detail: JSON.stringify(t.data) } : {}),
      });
    }
  }

  events.push(
    audit("merge", "Orchestrator", `Merged ${reports.length} report(s) → ${investigation.overall_status}`, {
      kind: "heuristic",
      detail: investigation.conflicts.length
        ? `Combined the specialist reports; conflicts detected: ${investigation.conflicts.join("; ")}.`
        : "Combined the specialist reports into one investigation result; no conflicts between findings.",
    })
  );

  return { agent_reports: reports, investigation, audit_trail: events };
}

export async function severityNode(s: PipelineState): Promise<Partial<PipelineState>> {
  const severity = await assessSeverity(
    s.agent_reports || [],
    s.investigation!,
    s.sentiment!,
    s.message_count,
    s.run_id
  );
  const usedLlm = availableProviders().length > 0;
  return {
    severity,
    audit_trail: [
      audit("severity", "Severity assessor", `${severity.level} / ${severity.priority}`, {
        kind: usedLlm ? "llm" : "heuristic",
        detail:
          severity.reasoning +
          (usedLlm
            ? " (LLM graded impact from the specialists' findings, then weighed the capped priority modifiers; clamped to the severity floor and a deterministic model as fallback.)"
            : " (Deterministic model — no LLM provider configured.)"),
      }),
    ],
  };
}

export async function escalationNode(s: PipelineState): Promise<Partial<PipelineState>> {
  const gate = shouldEscalate({
    guard: s.guard!,
    investigation: s.investigation!,
    severity: s.severity!,
    sentiment: s.sentiment!,
    messageCount: s.message_count,
    agentReports: s.agent_reports,
  });

  if (!gate.escalate) {
    return {
      escalation: { escalate: false },
      audit_trail: [
        audit("escalation_gate", "Escalation gate", "No escalation needed", {
          kind: "heuristic",
          detail:
            "Impact, agent conflicts, hard signals, and repeat-contact frustration were all within self-serve thresholds, so the engine handles this without a human.",
        }),
      ],
    };
  }

  const primaryDomain: AgentDomain =
    (s.sub_problems?.[0]?.domain as AgentDomain) ||
    (s.classification?.primary_intent as AgentDomain) ||
    "policy";
  const escalation = await runEscalation(gate.reasons, s.severity!, primaryDomain, {
    traceId: s.run_id,
    reports: s.agent_reports,
    investigation: s.investigation,
  });
  return {
    escalation,
    audit_trail: [
      audit("escalation_gate", "Escalation gate", `Escalate: ${gate.reasons.join("; ")}`, {
        kind: "heuristic",
        detail: `The gate opened because: ${gate.reasons.join("; ")}. Escalation is driven by impact/conflict/hard-signal, not mood alone.`,
      }),
      audit("escalation", "Escalation agent", `Handoff → ${escalation.recommended_team} (${escalation.urgency})`, {
        kind: "heuristic",
        detail: `Routed the handoff to ${escalation.recommended_team} at ${escalation.urgency}. A human owner is assigned by the application layer.`,
      }),
    ],
  };
}

// Friendly opener when the customer just says hello / thanks.
function greetingResolution(): Resolution {
  return {
    summary:
      "Hi! I'm your support assistant. Tell me what's going on — for example a technical problem, a billing or payment question, or something about our policies — and I'll look into it right away.",
    findings: [],
    actions: [],
    reasoning: "Greeting detected — no investigation needed.",
    evidence: [],
  };
}

// Canned answer for an admin-defined FAQ match — returned verbatim.
function faqResolution(answer: string): Resolution {
  return {
    summary: answer || "Thanks for reaching out!",
    findings: [],
    actions: [],
    reasoning: "Matched an admin-defined FAQ — returned the canned answer.",
    evidence: [],
  };
}

// Polite, firm refusal for anything outside customer-support scope.
function outOfScopeResolution(): Resolution {
  return {
    summary:
      "Sorry, I can only help with customer-support questions about this product — things like technical issues, billing and payments, refunds, or our policies. I can't help with that particular request, but if you have a support question just describe it and I'll get right on it.",
    findings: [],
    actions: [],
    reasoning: "Message classified as out of customer-support scope — declined.",
    evidence: [],
  };
}

export async function synthesizeNode(s: PipelineState): Promise<Partial<PipelineState>> {
  const category: MessageCategory = s.classification?.category ?? "support";

  // Greeting / FAQ / out-of-scope never reach the specialist synthesizer — answer
  // with a fixed reply (canned FAQ answer, friendly greeting, or polite refusal)
  // so we never fabricate support content or run the LLM merge over empty reports.
  if (category === "greeting" || category === "out_of_scope" || category === "faq") {
    const resolution =
      category === "greeting"
        ? greetingResolution()
        : category === "faq"
          ? faqResolution(s.classification?.faq_answer ?? "")
          : outOfScopeResolution();
    return {
      resolution,
      audit_trail: [
        audit("synthesize", "Response synthesizer", resolution.summary, {
          kind: "heuristic",
          detail:
            category === "greeting"
              ? "Recognized a greeting with no support request, so replied with a friendly prompt and skipped the specialist pipeline entirely."
              : category === "faq"
                ? `Replied with the admin-defined FAQ answer (${s.classification?.faq_label ?? "FAQ"}) and skipped the specialist pipeline entirely.`
                : "The message was outside customer-support scope, so the engine politely declined instead of answering an unrelated question or running specialists.",
        }),
      ],
    };
  }

  const resolution = await runSynthesizer(s.agent_reports || [], s.escalation, {
    traceId: s.run_id,
    message: s.message,
    history: s.history,
    ticketStatus: s.ticket_status,
    priorContext: s.prior_context,
  });
  return {
    resolution,
    audit_trail: [
      audit("synthesize", "Response synthesizer", resolution.summary, {
        kind: "llm",
        detail:
          "Merged every specialist report into one customer-ready reply via the LLM (temperature 0.3), de-duplicating overlapping points. Evidence and reasoning stay traceable to the agents; falls back to a deterministic template if the model is unavailable.",
      }),
    ],
  };
}
