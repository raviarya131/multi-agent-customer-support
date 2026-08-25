import express from "express";
import {
  listTicketsDashboard, getTicketDashboardRow, listAllRuns, getRunById,
  listRunsForTicket, getMessages, getTicketCustomer, getLatestEscalationForTicket,
  listEscalations, listNotifications, countUnread, markNotificationRead,
  markAllNotificationsRead, listAllFeedback, upsertFeedback, getFeedbackForTicket,
  getMessageById, getQuestionForMessage, listAgentPresence, listTeamActivity,
  listRecentCaseNotes, recordAgentPresence, countOpenByAssignee, recordConfigAudit,
  listHumanAgentRows,
} from "../db";
import { assertEmailAvailable, createAgentAccount, getAccountByAgentId } from "../auth";
import { createHumanAgent, listHumanAgents, getHumanAgent, DEPARTMENTS, type Department } from "../humans";
import { addCollabClient, emitCollab } from "../collab";
import { requireRole, displayCustomerName, canAccessTicket, type AuthedRequest } from "./middleware";

const router = express.Router();

const PRESENCE_ONLINE_MS = 35_000;

// The Team dashboard is department-scoped: an agent (front-line OR manager)
// sees only their own team's roster, load, and activity. Admins see everyone.
function viewerDepartment(account: AuthedRequest["account"]): string | null {
  if (!account || account.role === "admin" || !account.agent_id) return null;
  return getHumanAgent(account.agent_id)?.department ?? null;
}

function collabOverview(account: AuthedRequest["account"]) {
  const dept = viewerDepartment(account);
  const presence = listAgentPresence();
  const seen = new Map(presence.map((p) => [p.agent_id, p.last_seen]));
  const openCounts = countOpenByAssignee();
  const now = Date.now();
  const roster = listHumanAgentRows().filter((a) => !dept || a.department === dept);
  const agents = roster.map((a) => ({
    ...a, open_cases: openCounts[a.id] ?? 0,
    online: now - (seen.get(a.id) ?? 0) < PRESENCE_ONLINE_MS,
    last_seen: seen.get(a.id) ? new Date(seen.get(a.id)!).toISOString() : null,
  }));

  // Which escalations belong to this team (by stored dept or current owner's dept).
  const deptAgentIds = new Set(roster.map((a) => a.id));
  const allEsc = listEscalations();
  const inTeam = (e: (typeof allEsc)[number]) => e.department === dept || deptAgentIds.has(e.assignee_id);
  const open = (dept ? allEsc.filter(inTeam) : allEsc).filter((e) => e.status === "open");

  // Scope the activity feed + notes to this team's cases (open OR resolved). Pull
  // a wider window first, then filter, so the team still gets a meaningful list.
  const teamEscIds = dept ? new Set(allEsc.filter(inTeam).map((e) => e.id)) : null;
  const activity = listTeamActivity(dept ? 300 : 60)
    .filter((ev) => !teamEscIds || (ev.escalation_id ? teamEscIds.has(ev.escalation_id) : false))
    .slice(0, 60);
  const notes = listRecentCaseNotes(dept ? 100 : 20)
    .filter((n) => !teamEscIds || (n.escalation_id ? teamEscIds.has(n.escalation_id) : false))
    .slice(0, 20);

  return { agents, online_count: agents.filter((a) => a.online).length, open_cases: open.length, activity, notes, open_escalations: open };
}

// Notifications
router.get("/notifications", requireRole("user", "admin", "agent"), (req: AuthedRequest, res) => {
  res.json({ notifications: listNotifications(req.account!.id), unread: countUnread(req.account!.id) });
});
router.post("/notifications/:id/read", requireRole("user", "admin", "agent"), (req: AuthedRequest, res) => {
  markNotificationRead(req.params.id, req.account!.id);
  res.json({ ok: true, unread: countUnread(req.account!.id) });
});
router.post("/notifications/read-all", requireRole("user", "admin", "agent"), (req: AuthedRequest, res) => {
  markAllNotificationsRead(req.account!.id);
  res.json({ ok: true, unread: 0 });
});

// Feedback
router.post("/feedback", requireRole("user"), (req: AuthedRequest, res) => {
  const customer = req.account!.customer_id ?? "";
  const { ticket_id, message_id, rating, comment } = (req.body ?? {}) as { ticket_id?: string; message_id?: number; rating?: string; comment?: string };
  if (!ticket_id || typeof message_id !== "number" || (rating !== "up" && rating !== "down")) return res.status(400).json({ error: "ticket_id, message_id and rating ('up'|'down') are required" });
  if (!canAccessTicket(ticket_id, customer)) return res.status(404).json({ error: "Ticket not found" });
  const msg = getMessageById(message_id);
  if (!msg || msg.ticket_id !== ticket_id || msg.role === "customer") return res.status(400).json({ error: "Invalid message for feedback" });
  upsertFeedback({ ticket_id, message_id, customer_id: customer || null, rating, comment: comment?.slice(0, 1000) ?? null, question: getQuestionForMessage(ticket_id, message_id), answer: msg.text });
  res.json({ ok: true });
});
router.get("/feedback/:ticketId", requireRole("user"), (req: AuthedRequest, res) => {
  const customer = req.account!.customer_id ?? "";
  if (!canAccessTicket(req.params.ticketId, customer)) return res.status(404).json({ error: "Ticket not found" });
  res.json({ feedback: getFeedbackForTicket(req.params.ticketId) });
});
router.get("/admin/feedback", requireRole("admin"), (_req, res) => {
  const feedback = listAllFeedback(500).map((f) => ({ ...f, customer_name: displayCustomerName(f.customer_id) }));
  res.json({ feedback });
});

// Human agents
router.get("/admin/departments", requireRole("admin"), (_req, res) => res.json({ departments: DEPARTMENTS }));
router.get("/admin/agents", requireRole("admin"), (_req, res) => {
  const escalations = listEscalations();
  const agents = listHumanAgents().map((a) => {
    const cases = escalations.filter((e) => e.assignee_id === a.id);
    const open = cases.filter((e) => e.status === "open").length;
    return { ...a, email: getAccountByAgentId(a.id)?.email ?? null, counts: { open, resolved: cases.length - open, total: cases.length } };
  });
  res.json({ agents, departments: DEPARTMENTS });
});
router.post("/admin/agents", requireRole("admin"), (req: AuthedRequest, res) => {
  const { name, title, department, email, password, level } = req.body || {};
  try {
    assertEmailAvailable(String(email || ""));
    const agent = createHumanAgent({ name: String(name || ""), title: String(title || ""), department: String(department || "") as Department, level: level === "manager" ? "manager" : "agent" });
    const account = createAgentAccount({ name: agent.name, email: String(email || ""), password: password ? String(password) : undefined, agentId: agent.id });
    recordConfigAudit({ actor_id: req.account!.id, actor_name: req.account!.name, action: "human_agent.create", target: `${agent.name} (${agent.department} · ${agent.level})`, detail: account.email });
    res.json({ agent, account });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// Tickets dashboard
router.get("/dashboard/tickets", requireRole("admin"), (_req, res) => {
  const tickets = listTicketsDashboard().map((t) => ({ ...t, customer_name: displayCustomerName(t.customer_id) }));
  res.json({ tickets });
});
router.get("/dashboard/tickets/:id", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  if (account.role === "agent") {
    const esc = getLatestEscalationForTicket(req.params.id);
    if (!esc || esc.assignee_id !== account.agent_id) return res.status(403).json({ error: "Not your case" });
  }
  const row = getTicketDashboardRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Ticket not found" });
  const runs = listRunsForTicket(req.params.id).map((r) => ({
    run_id: r.run_id, created_at: r.created_at, message: r.state?.message ?? "",
    message_count: r.state?.message_count ?? 0, primary_intent: r.state?.classification?.primary_intent ?? null,
    severity: r.state?.severity?.level ?? null, priority: r.state?.severity?.priority ?? null,
    escalated: !!r.state?.escalation?.escalate, audit_trail: r.state?.audit_trail ?? [], agent_reports: r.state?.agent_reports ?? [], state: r.state,
  }));
  res.json({ ticket: { ...row, customer_name: displayCustomerName(row.customer_id) }, messages: getMessages(req.params.id), runs, escalation: getLatestEscalationForTicket(req.params.id) });
});

// Observability
router.get("/observability/runs", requireRole("admin"), (_req, res) => {
  const runs = listAllRuns().map((r) => ({ ...r, customer_name: displayCustomerName(getTicketCustomer(r.ticket_id)) }));
  res.json({ runs });
});
router.get("/observability/runs/:runId", requireRole("admin"), (req, res) => {
  const run = getRunById(req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json({ ...run, customer_name: displayCustomerName(getTicketCustomer(run.ticket_id)) });
});

// Collaboration
router.post("/collab/heartbeat", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  if (account.agent_id) { recordAgentPresence(account.agent_id, account.id, account.name); emitCollab({ type: "presence", agent_id: account.agent_id, online: true }); }
  res.json({ ok: true });
});
router.get("/collab/overview", requireRole("admin", "agent"), (req: AuthedRequest, res) => res.json(collabOverview(req.account)));
router.get("/collab/stream", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(`data: ${JSON.stringify({ type: "hello", ts: new Date().toISOString() })}\n\n`);
  const unsubscribe = addCollabClient(res);
  req.on("close", () => { unsubscribe(); res.end(); });
});

export default router;
