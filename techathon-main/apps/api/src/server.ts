import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { ENV } from "./env";
import {
  ensureTicket, addMessage, getMessages, saveRun, getLatestRun, getLatestRunContext,
  getTicketDisplayId, ticketExists, getTicketCustomer, listTickets, getCustomerHistory,
  countCustomerMessages, getOpenEscalationForTicket, getLatestEscalationForTicket,
  createEscalation, reopenEscalation, countOpenByAssignee, deleteTicket, listRunsForTicket,
  getTicketDashboardRow, type EscalationRecord,
} from "./db";
import { runAgentPipeline, runAgentPipelineStream, type RunRequest } from "./agentClient";
import { seedAccounts, login, signup, deleteSession, type Account } from "./auth";
import { seedHumanAgents, pickAssignee, type Department } from "./humans";
import { computeDueAt } from "./sla";
import { startSlaSweeper } from "./slaScheduler";
import { notifyCustomerReply } from "./notify";
import { recordTeamActivity } from "./db";
import { emitCollab } from "./collab";
import { authMiddleware, requireRole, displayCustomerName, canAccessTicket, tokenFromReq, type AuthedRequest } from "./routes/middleware";
import platformRouter from "./routes/platform";
import escalationRouter from "./routes/escalations";
import adminRouter from "./routes/admin";
import helpRouter from "./routes/help";
import { observeResolvedRun } from "./faqAuto";

seedAccounts();
seedHumanAgents();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(authMiddleware);

app.get("/health", (_req, res) => res.json({ ok: true, service: "api" }));

// ---- Auth routes ------------------------------------------------------------
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const result = login(String(email || ""), String(password || ""));
  if (!result.ok) return res.status(401).json({ error: "Invalid email or password" });
  res.json({ token: result.token, account: result.account });
});
app.post("/api/auth/signup", (req, res) => {
  const { email, password, name } = req.body || {};
  const result = signup(String(email || ""), String(password || ""), String(name || ""));
  if (!result.ok) return res.status(400).json({ error: result.message || "Could not create account" });
  res.json({ token: result.token, account: result.account });
});
app.post("/api/auth/logout", (req: AuthedRequest, res) => {
  const token = tokenFromReq(req);
  if (token) deleteSession(token);
  res.json({ ok: true });
});
app.get("/api/auth/me", (req: AuthedRequest, res) => {
  if (!req.account) return res.status(401).json({ error: "Not signed in" });
  res.json({ account: req.account });
});

// ---- Shared ticket helpers --------------------------------------------------
type Assignee = { id: string; name: string; title: string; department: string };

function departmentFor(state: any): Department {
  if (state?.guard?.force_escalation) return "Trust & Safety";
  const domain = state?.sub_problems?.[0]?.domain || state?.classification?.primary_intent;
  if (domain === "billing") return "Billing";
  if (domain === "technical") return "Technical";
  if (domain === "policy") return "Policy & Compliance";
  if (domain === "orders") return "Orders";
  if (domain === "products") return "Merchandising";
  if (state?.severity?.priority === "P1") return "Escalations";
  return "Escalations";
}

function composeReply(state: any, displayId: string, assignee: Assignee | undefined, priorEsc: EscalationRecord | null, isFollowUp: boolean, firstCustomerMessage: string): string {
  const r = state?.resolution;
  const header = isFollowUp ? `Update on ticket ${displayId}.` : `Ticket ${displayId} has been created.`;
  const lines: string[] = [header];
  if (r?.summary) lines.push("", r.summary);
  const actions: string[] = Array.isArray(r?.actions) ? r.actions.filter(Boolean) : [];
  if (actions.length) { lines.push("", "Next steps:"); for (const a of actions) lines.push(`• ${a}`); }
  const escalatedNow = !!state?.escalation?.escalate;
  const openEsc = priorEsc?.status === "open" ? priorEsc : null;
  const resolvedEsc = priorEsc?.status === "resolved" ? priorEsc : null;
  if (escalatedNow && assignee) {
    const urgency = state.escalation.urgency ? ` (${state.escalation.urgency})` : "";
    lines.push("", `This case has been escalated to ${assignee.name} — ${assignee.title}, ${assignee.department}${urgency}. They'll follow up with you shortly.`);
    if (firstCustomerMessage && firstCustomerMessage !== state.message) {
      lines.push(`(Regarding: "${firstCustomerMessage.slice(0, 120)}${firstCustomerMessage.length > 120 ? "…" : ""}")`);
    }
  } else if (openEsc) {
    const urgency = openEsc.urgency ? ` (${openEsc.urgency})` : "";
    lines.push("", `Your case is still with ${openEsc.assignee_name} — ${openEsc.assignee_title}, ${openEsc.department}${urgency}. No further action needed from you right now; they'll follow up.`);
  } else if (resolvedEsc && isFollowUp) {
    lines.push("", `Your escalation was marked resolved by ${resolvedEsc.assignee_name} (${resolvedEsc.assignee_title}). If you need more help, reply here and we'll reopen the case.`);
  }
  return lines.join("\n");
}

function assigneeFromRecord(rec: EscalationRecord): Assignee {
  return { id: rec.assignee_id, name: rec.assignee_name, title: rec.assignee_title, department: rec.department };
}

// Surface the reopen/continuity decision as a visible "thought" in the trace, so
// the routing choice (same case vs. new issue) is explainable like every other
// agentic step — Observe (prior case) → Think (compare domains) → Decide (route).
function pushReopenThought(state: any, summary: string, detail: string): void {
  if (!Array.isArray(state.audit_trail)) state.audit_trail = [];
  state.audit_trail.push({ step: "reopen_triage", actor: "Continuity router", timestamp: new Date().toISOString(), summary, kind: "llm", detail });
}

function finalizeTicketRun(opts: { state: any; ticketId: string; customerId: string | null; parentTicketId?: string | null; isNewTicket?: boolean; history: { role: string; text: string }[]; message: string; isFollowUp: boolean; priorEsc: EscalationRecord | null; runId: string }) {
  const { state, ticketId, customerId, parentTicketId, isNewTicket, history, message, isFollowUp, priorEsc, runId } = opts;
  const category: string = state?.classification?.category ?? "support";
  const nonSupport = category === "greeting" || category === "out_of_scope" || category === "faq";

  if (isNewTicket && nonSupport) {
    const now = new Date().toISOString();
    const reply = state?.resolution?.summary ?? "Thanks for reaching out!";
    return { ticket_id: "", display_id: "", status: "active" as const, summary: state?.resolution?.summary ?? null, run: state, messages: [{ role: "customer", text: message, timestamp: now }, { role: "system", text: reply, timestamp: now }], escalation_id: null, escalation_status: null, ephemeral: true };
  }

  if (isNewTicket) { ensureTicket(ticketId, customerId, parentTicketId ?? null); addMessage(ticketId, "customer", message); }

  const displayId = getTicketDisplayId(ticketId);
  const firstCustomerMessage = history.find((m) => m.role === "customer")?.text ?? message;
  let assignee: Assignee | undefined;
  let escalationRecord: EscalationRecord | null = priorEsc;

  if (state?.escalation?.escalate) {
    const existingOpen = getOpenEscalationForTicket(ticketId);
    const newDept = departmentFor(state);
    // A genuine continuation is the SAME problem coming back — which, by definition,
    // is the same domain. So we require BOTH the agent's reopen-triage to say
    // "continuation" AND the new message to land in the prior case's department.
    // A different domain (e.g. a billing dispute after a resolved login issue) is
    // always a new issue, no matter what the triage text says.
    const sameDomain = !!priorEsc && priorEsc.department === newDept;
    const treatAsContinuation = !!state?.continuity?.is_continuation && sameDomain;
    if (existingOpen) {
      // A human case is already open on this ticket — keep it with its owner.
      assignee = assigneeFromRecord(existingOpen); escalationRecord = existingOpen;
    }
    else if (priorEsc && treatAsContinuation) {
      // Reopened, same domain, and judged the SAME problem → genuine continuation.
      // Reuse the original case and route back to the human who has the context.
      reopenEscalation(priorEsc.id);
      escalationRecord = { ...priorEsc, status: "open", reopened: 1 };
      assignee = assigneeFromRecord(escalationRecord);
      pushReopenThought(
        state,
        `Reopened — same ${priorEsc.department} problem → back to ${assignee.name}`,
        `Observed: this ticket was already escalated to ${priorEsc.department} (handled by ${priorEsc.assignee_name}). Reopen-triage judged the new message a continuation of that same problem (${state.continuity?.reason ?? "same issue"}), and it still classifies as ${newDept}. Decision: reopen the original case and route it back to ${assignee.name} (${assignee.title}), who already has the history.`
      );
      const act = recordTeamActivity({ kind: "escalation_reopened", actor_name: "Engine", ticket_id: ticketId, escalation_id: escalationRecord.id, summary: `Reopened ${escalationRecord.department} case → ${escalationRecord.assignee_name}` });
      emitCollab({ type: "escalation_created", activity: act });
    }
    else if (priorEsc) {
      // Reopened, but it's a NEW issue — either a different domain than the prior
      // case, or the same domain but a different problem. Open a fresh case and pick
      // the LEAST-LOADED front-line agent in the right department, so a busy prior
      // owner isn't piled on again. The prior case stays resolved.
      const human = pickAssignee(newDept, countOpenByAssignee());
      assignee = { id: human.id, name: human.name, title: human.title, department: newDept };
      escalationRecord = createEscalation({ ticket_id: ticketId, customer_id: customerId, customer_name: displayCustomerName(customerId), subject: firstCustomerMessage.slice(0, 140), department: newDept, team: state.escalation.recommended_team ?? null, urgency: state.escalation.urgency ?? null, reason: state.escalation.reason ?? null, assignee_id: human.id, assignee_name: human.name, assignee_title: human.title, reopened: 1, sla_due_at: computeDueAt(newDept, state.escalation.urgency) });
      const why = !sameDomain
        ? `it now classifies as ${newDept} (different from the prior ${priorEsc.department} case), so it's a new issue`
        : `reopen-triage judged it a new problem (${state.continuity?.reason ?? "different problem"}), not the prior case`;
      pushReopenThought(
        state,
        `Reopened — new ${newDept} issue → ${human.name}`,
        `Observed: this ticket was previously escalated to ${priorEsc.department} (handled by ${priorEsc.assignee_name}) and resolved. Thought: ${why}. Decision: open a fresh ${newDept} case and assign the most available front-line agent, ${human.name} (${human.title}), by current open-case load; the prior ${priorEsc.department} case stays resolved.`
      );
      const act = recordTeamActivity({ kind: "escalation_created", actor_name: "Engine", ticket_id: ticketId, escalation_id: escalationRecord.id, summary: `Reopened ticket, new ${newDept} issue → ${human.name}` });
      emitCollab({ type: "escalation_created", activity: act });
    }
    else {
      const human = pickAssignee(newDept, countOpenByAssignee());
      assignee = { id: human.id, name: human.name, title: human.title, department: newDept };
      escalationRecord = createEscalation({ ticket_id: ticketId, customer_id: customerId, customer_name: displayCustomerName(customerId), subject: firstCustomerMessage.slice(0, 140), department: newDept, team: state.escalation.recommended_team ?? null, urgency: state.escalation.urgency ?? null, reason: state.escalation.reason ?? null, assignee_id: human.id, assignee_name: human.name, assignee_title: human.title, sla_due_at: computeDueAt(newDept, state.escalation.urgency) });
      const act = recordTeamActivity({ kind: "escalation_created", actor_name: "Engine", ticket_id: ticketId, escalation_id: escalationRecord.id, summary: `New ${state.escalation.urgency ?? ""} case → ${human.name} (${newDept})`.replace(/\s+/g, " ").trim() });
      emitCollab({ type: "escalation_created", activity: act });
    }
    state.escalation.assigned_agent = assignee;
    if (escalationRecord) state.escalation.escalation_id = escalationRecord.id;
  } else if (priorEsc?.status === "open") {
    assignee = assigneeFromRecord(priorEsc);
    state.escalation = { ...(state.escalation ?? {}), escalate: true, assigned_agent: assignee };
  }

  const reply = nonSupport ? state?.resolution?.summary ?? "Thanks for reaching out!" : composeReply(state, displayId, assignee, escalationRecord, isFollowUp, firstCustomerMessage);
  addMessage(ticketId, "system", reply);
  saveRun(runId, ticketId, state);
  // Learn from this run: if the same question keeps getting asked, suggest an FAQ
  // draft for admin review. Best-effort — never blocks or breaks the response.
  observeResolvedRun(state, message);
  const status = escalationRecord ? (escalationRecord.status === "open" ? "escalated" : "resolved") : state?.investigation?.overall_status === "resolved" ? "resolved" : "active";
  return { ticket_id: ticketId, display_id: displayId, status, summary: state?.resolution?.summary ?? null, run: state, messages: getMessages(ticketId), escalation_id: escalationRecord?.id ?? null, escalation_status: escalationRecord?.status ?? null };
}

async function executeTicketRun(body: Record<string, unknown>, authCustomerId: string) {
  const { ticket_id, message, link_to } = body || {};
  if (!message || typeof message !== "string" || !message.trim()) return { error: "Please enter a message", status: 400 as const };
  let parentTicketId: string | null = null;
  let ticketId: string;
  if (link_to && String(link_to).trim()) {
    const parent = String(link_to).trim();
    if (!ticketExists(parent) || getTicketCustomer(parent) !== authCustomerId) return { error: "Linked ticket not found", status: 404 as const };
    parentTicketId = parent;
    ticketId = `T-${randomUUID().slice(0, 8)}`;
  } else {
    ticketId = ticket_id && String(ticket_id).trim() ? String(ticket_id) : `T-${randomUUID().slice(0, 8)}`;
  }
  const exists = ticketExists(ticketId);
  const existingCustomer = getTicketCustomer(ticketId);
  if (exists && existingCustomer !== authCustomerId) return { error: "Ticket does not belong to the selected customer", status: 403 as const };
  const customerId = exists ? existingCustomer : authCustomerId;
  const isNewTicket = !exists;
  if (!isNewTicket) ensureTicket(ticketId, customerId, parentTicketId);
  const resolvedHistory = exists ? getCustomerHistory(ticketId) : [];
  const isFollowUp = resolvedHistory.length > 0;
  const priorContext = isFollowUp ? getLatestRunContext(ticketId) : null;
  const priorEsc = exists ? getLatestEscalationForTicket(ticketId) : null;
  const ticketStatus = priorEsc ? { has_escalation: true, escalation_status: priorEsc.status, assignee_name: priorEsc.assignee_name, department: priorEsc.department, urgency: priorEsc.urgency } : { has_escalation: false };
  if (!isNewTicket) addMessage(ticketId, "customer", String(message));
  const messageCount = isNewTicket ? 1 : countCustomerMessages(ticketId);
  const runId = `R-${randomUUID().slice(0, 8)}`;
  const runReq: RunRequest = { ticket_id: ticketId, run_id: runId, message: String(message), message_count: messageCount, ...(customerId ? { customer_id: customerId } : {}), ticket_status: ticketStatus, ...(priorContext ? { prior_context: priorContext } : {}), history: resolvedHistory };
  return { ticketId, customerId, parentTicketId, isNewTicket, history: resolvedHistory, isFollowUp, priorEsc, runId, runReq };
}

// ---- Ticket routes ----------------------------------------------------------
app.post("/api/tickets", requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const prep = await executeTicketRun(req.body || {}, req.account!.customer_id ?? "");
    if ("error" in prep) return res.status(prep.status).json({ error: prep.error });
    let state: any;
    try { state = await runAgentPipeline(prep.runReq); }
    catch (err) { return res.status(502).json({ error: "The resolution engine is unavailable. Please try again.", detail: (err as Error).message }); }
    res.json(finalizeTicketRun({ state, ticketId: prep.ticketId, customerId: prep.customerId, parentTicketId: prep.parentTicketId, isNewTicket: prep.isNewTicket, history: prep.history, message: prep.runReq.message, isFollowUp: prep.isFollowUp, priorEsc: prep.priorEsc, runId: prep.runId }));
  } catch (err) { console.error("[api] /api/tickets failed:", err); res.status(500).json({ error: "Something went wrong", detail: (err as Error).message }); }
});

app.post("/api/tickets/stream", requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const prep = await executeTicketRun(req.body || {}, req.account!.customer_id ?? "");
    if ("error" in prep) return res.status(prep.status).json({ error: prep.error });
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    let state: any;
    try {
      for await (const evt of runAgentPipelineStream(prep.runReq)) {
        if (evt.type === "done" && evt.state) { state = evt.state; continue; }
        send(evt);
      }
    } catch (err) {
      send({ type: "step_start", message: `Live progress failed; retrying without streaming: ${(err as Error).message}` });
      try { state = await runAgentPipeline(prep.runReq); }
      catch (fallbackErr) { send({ type: "error", message: (fallbackErr as Error).message }); res.end(); return; }
    }
    if (!state) { send({ type: "error", message: "Pipeline finished without a result" }); res.end(); return; }
    send({ type: "complete", ...finalizeTicketRun({ state, ticketId: prep.ticketId, customerId: prep.customerId, parentTicketId: prep.parentTicketId, isNewTicket: prep.isNewTicket, history: prep.history, message: prep.runReq.message, isFollowUp: prep.isFollowUp, priorEsc: prep.priorEsc, runId: prep.runId }) });
    res.end();
  } catch (err) {
    console.error("[api] /api/tickets/stream failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong", detail: (err as Error).message });
    else { res.write(`data: ${JSON.stringify({ type: "error", message: (err as Error).message })}\n\n`); res.end(); }
  }
});

app.get("/api/tickets", requireRole("user"), (req: AuthedRequest, res) => {
  res.json({ tickets: listTickets(req.account!.customer_id ?? "") });
});

app.get("/api/tickets/:id", requireRole("user"), (req: AuthedRequest, res) => {
  const customer = req.account!.customer_id ?? "";
  if (!canAccessTicket(req.params.id, customer)) return res.status(404).json({ error: "Ticket not found" });
  const run = getLatestRun(req.params.id);
  const messages = getMessages(req.params.id);
  if (!run && messages.length === 0) return res.status(404).json({ error: "Ticket not found" });
  const esc = getLatestEscalationForTicket(req.params.id);
  const row = getTicketDashboardRow(req.params.id);
  const runs = listRunsForTicket(req.params.id).map((r) => r.state).filter(Boolean);
  res.json({ ticket_id: req.params.id, display_id: getTicketDisplayId(req.params.id), status: row?.status ?? "active", parent_ticket_id: row?.parent_ticket_id ?? null, summary: run?.resolution?.summary ?? null, run, runs, messages, escalation_id: esc?.id ?? null, escalation_status: esc?.status ?? null, escalation_assignee: esc && esc.status === "open" ? esc.assignee_name : null });
});

app.post("/api/tickets/:id/messages", requireRole("user"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const customer = account.customer_id ?? "";
  if (!canAccessTicket(req.params.id, customer)) return res.status(404).json({ error: "Ticket not found" });
  const esc = getOpenEscalationForTicket(req.params.id);
  if (!esc) return res.status(409).json({ error: "no_open_escalation" });
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Message is empty" });
  addMessage(req.params.id, "customer", text);
  notifyCustomerReply(esc.assignee_id, req.params.id, account.name, text);
  res.json({ ok: true, messages: getMessages(req.params.id) });
});

app.delete("/api/tickets/:id", requireRole("user"), (req: AuthedRequest, res) => {
  const customer = req.account!.customer_id ?? "";
  if (!canAccessTicket(req.params.id, customer)) return res.status(404).json({ error: "Ticket not found" });
  deleteTicket(req.params.id);
  res.json({ ok: true });
});

// ---- Mount routers ----------------------------------------------------------
app.use("/api/escalations", escalationRouter);
app.use("/api/platform", platformRouter);
app.use("/api/help", helpRouter);
app.use("/api", adminRouter);

app.listen(ENV.API_PORT, () => {
  console.log(`[api] listening on http://localhost:${ENV.API_PORT}`);
  console.log(`[api] agent at ${ENV.AGENT_URL}`);
  startSlaSweeper();
});
