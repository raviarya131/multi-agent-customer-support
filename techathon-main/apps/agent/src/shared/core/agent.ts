/**
 * shared/core/agent.ts
 *
 * The per-agent entrypoint. Given THIS agent's registry + name, it handles one
 * sub-ticket: classify -> confidence gate -> registry lookup -> graph -> result.
 * It holds no global state, so two agents (or two tickets) can run through here
 * at the same time without interfering.
 */
import type { Ticket, AgentState, AgentReport, AgentOutcome, Evidence } from "./types.js";
import type { Registry } from "./registry.js";
import { classify } from "./classifier.js";
import { runGraph } from "./graph.js";
import { log, drainTrace } from "./logger.js";
import { config } from "../config/index.js";

function routingText(ticket: Ticket): string {
  const prior = ticket.priorContext ? JSON.stringify(ticket.priorContext) : "";
  const history = ticket.history?.length
    ? ticket.history
        .slice(-4)
        .map((m) => `${m.role}: ${m.text}`)
        .join("\n")
    : "";
  return [
    ticket.focus ? `Sub-problem focus: ${ticket.focus}` : "",
    history ? `Prior conversation:\n${history}` : "",
    prior ? `Latest prior run context:\n${prior}` : "",
    `Latest customer message:\n${ticket.text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runAgent(
  registry: Registry,
  agentName: string,
  ticket: Ticket
): Promise<AgentReport> {
  const { traceId } = ticket;
  log(traceId, "agent", `[${agentName}] received ticket`, { text: ticket.text });

  // 1. Classify against THIS agent's use cases only.
  const cls = await classify(registry, agentName, traceId, routingText(ticket));

  // 2a. Domain gate — no match, or confidence below the (low) domain threshold,
  //     means this simply isn't this agent's specialty. Signal "out_of_domain"
  //     so the orchestrator routes it elsewhere — do NOT pester the customer.
  if (!cls.handlerId || cls.confidence < config.domainThreshold) {
    log(traceId, "agent", `[${agentName}] out of domain`, {
      confidence: cls.confidence,
      domainThreshold: config.domainThreshold,
    });
    return report(agentName, ticket, cls.handlerId, cls.confidence, "out_of_domain", {
      findings: "",
      reasoning: [
        `Confidence ${cls.confidence} below domain threshold ${config.domainThreshold}; not this agent's specialty.`,
      ],
    });
  }

  // 2b. Uncertainty gate — it's plausibly ours, but we're not confident enough
  //     to act. Ask the customer for more detail (distinct from out_of_domain).
  if (cls.confidence < config.confidenceThreshold) {
    log(traceId, "agent", `[${agentName}] below confidence, clarifying`, {
      confidence: cls.confidence,
      confidenceThreshold: config.confidenceThreshold,
    });
    return report(agentName, ticket, cls.handlerId, cls.confidence, "needs_clarification", {
      findings:
        "I want to make sure I help with the right thing. Could you share a bit " +
        "more detail about your request?",
      reasoning: [`Classifier confidence ${cls.confidence} below threshold.`],
    });
  }

  // 3. Look up the handler in THIS agent's registry. A missing handler for a
  //    classified id is an internal fault we can't resolve => escalate.
  const handler = registry.get(cls.handlerId);
  if (!handler) {
    log(traceId, "agent", `[${agentName}] unknown handler id`, {
      handlerId: cls.handlerId,
    });
    return report(agentName, ticket, cls.handlerId, cls.confidence, "needs_escalation", {
      findings: "",
      reasoning: [`No handler registered for id "${cls.handlerId}".`],
    });
  }

  // 4. Run the generic execution graph with the chosen handler.
  const initial: AgentState = {
    ticket,
    handlerId: cls.handlerId,
    confidence: cls.confidence,
    scratch: {},
    evidence: [],
    reasoning: [`Routed to "${handler.id}" (confidence ${cls.confidence}).`],
    done: false,
  };
  const finalState = await runGraph(initial, handler);

  // 5. Derive the status from how the handler finished and shape the report.
  return report(
    agentName,
    ticket,
    cls.handlerId,
    cls.confidence,
    statusFromState(finalState),
    {
      findings: finalState.findings ?? finalState.answer ?? "",
      actions: finalState.actions ?? [],
      reasoning: finalState.reasoning,
      evidence: finalState.evidence,
    }
  );
}

/** Map a finished graph state onto one of the four agent statuses. */
function statusFromState(state: AgentState): AgentOutcome {
  if (state.clarificationNeeded) return "needs_clarification";
  // Escalate when: the loop bailed (escalate), the handler explicitly said it
  // couldn't resolve (resolved === false), or no usable answer was produced.
  if (state.escalate || state.resolved === false || !state.answer) {
    return "needs_escalation";
  }
  return "resolved";
}

/** Assemble the orchestrator-facing AgentReport and drain the audit trace. */
function report(
  agentName: string,
  ticket: Ticket,
  handlerId: string | null,
  confidence: number | null,
  status: AgentOutcome,
  fields: { findings?: string; actions?: string[]; reasoning?: string[]; evidence?: Evidence[] }
): AgentReport {
  return {
    agent: agentName,
    sub_problem_id: ticket.subProblemId ?? ticket.traceId,
    findings: fields.findings ?? "",
    actions: fields.actions ?? [],
    reasoning: fields.reasoning ?? [],
    evidence: fields.evidence ?? [],
    status,
    confidence,
    handlerId,
    traceId: ticket.traceId,
    trace: drainTrace(ticket.traceId),
  };
}
