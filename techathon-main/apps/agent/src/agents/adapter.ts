// Adapter: wrap an LLM-backed framework Agent (../shared/agent-factory) as a
// pipeline SpecialistAgent. This is the single seam between the orchestration
// backbone (which speaks the AgentReport contract in ../contracts/types) and
// the agent framework (which speaks its own richer report shape).
import { randomUUID } from "node:crypto";
import type { AgentDomain, AgentReport, AgentStatus, SubProblem } from "../contracts/types";
import type { AgentContext, SpecialistAgent } from "./base";
import type { Agent as FrameworkAgent } from "../shared/agent-factory";

// Framework outcomes → pipeline statuses.
//   resolved            → resolved
//   needs_clarification → needs_info  (agent needs more from the customer)
//   needs_escalation    → unresolved  (agent tried, couldn't close it)
//   out_of_domain       → needs_info  (shouldn't happen often — domain is pre-routed)
const STATUS_MAP: Record<string, AgentStatus> = {
  resolved: "resolved",
  needs_clarification: "needs_info",
  needs_escalation: "unresolved",
  out_of_domain: "needs_info",
};

export function adaptAgent(domain: AgentDomain, fw: FrameworkAgent): SpecialistAgent {
  return {
    domain,
    async run(sub: SubProblem, ctx: AgentContext): Promise<AgentReport> {
      const report = await fw.handle({
        traceId: `${sub.id}-${randomUUID().slice(0, 8)}`,
        subProblemId: sub.id,
        text: ctx.message,
        // The selected customer id is structured context the agent already knows,
        // so tools (dbQuery/paymentStatus/…) resolve without asking the customer.
        context: ctx.customerId ? { customerId: ctx.customerId } : {},
        // Prior turns let the agent reason about follow-ups; we keep them off the
        // param-extraction path (separate field) so they don't become tool args.
        history: ctx.history.map((m) => ({ role: m.role, text: m.text })),
        // For a multi-issue split, point the agent at its specific sub-problem.
        ...(sub.description && sub.description !== ctx.message
          ? { focus: sub.description }
          : {}),
        ...(ctx.priorContext ? { priorContext: ctx.priorContext } : {}),
      });

      // The framework distinguishes "matched my domain but I'm unsure — ask the
      // customer" (needs_clarification) from a generic needs_info. The pipeline
      // status contract has no `needs_clarification`, so we keep status as
      // needs_info but preserve the distinction (and the actual question) on
      // dedicated fields the UI can surface back to the customer.
      const needsClarification = report.status === "needs_clarification";

      return {
        agent: domain,
        sub_problem_id: report.sub_problem_id || sub.id,
        findings: report.findings ? [report.findings] : [],
        actions: report.actions ?? [],
        reasoning: (report.reasoning ?? []).join(" "),
        evidence: (report.evidence ?? []).map((e) => e.source),
        status: STATUS_MAP[report.status] ?? "needs_info",
        confidence: report.confidence ?? 0.5,
        ...(needsClarification
          ? { clarification_needed: true, clarification_question: report.findings }
          : {}),
        trace: report.trace.map((t) => ({
          traceId: t.traceId,
          ts: t.ts,
          node: t.node,
          message: t.message,
          data: t.data,
        })),
      };
    },
  };
}
