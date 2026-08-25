import express from "express";
import {
  getEscalationById, resolveEscalation, reassignEscalation, assignEscalation, getMessages, addMessage,
  addCaseNote, listCaseNotes, recordTeamActivity,
  createNotification, listEscalations, type EscalationRecord,
} from "../db";
import { getAccountByAgentId } from "../auth";
import { pickManager, listHumanAgents, getHumanAgent, type Department } from "../humans";
import { computeDueAt } from "../sla";
import { notifyTicketResolved, notifyAgentReply, notifyCaseReassigned } from "../notify";
import { emitCollab } from "../collab";
import { requireRole, type AuthedRequest } from "./middleware";

const router = express.Router();

// True when this escalation belongs to a department a manager owns — either the
// case's department, or the department of whoever currently holds it (the two
// can differ once a case has been routed around).
function inDepartment(e: EscalationRecord, dept: string): boolean {
  if (e.department === dept) return true;
  const a = getHumanAgent(e.assignee_id);
  return a?.department === dept;
}

router.get("/", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const all = listEscalations();
  const me = account.role === "agent" && account.agent_id ? getHumanAgent(account.agent_id) : null;
  const isManager = me?.level === "manager";
  let scope: "admin" | "manager" | "agent" = "agent";
  let escalations = all;
  if (account.role === "admin") {
    scope = "admin";
  } else if (isManager && me) {
    // Managers see their whole team's queue, not just cases assigned to them.
    scope = "manager";
    escalations = all.filter((e) => inDepartment(e, me.department));
  } else {
    // Front-line: their own cases, plus any they MISSED (now owned by someone
    // else) so they can see what slipped away.
    escalations = all.filter((e) => e.assignee_id === account.agent_id || e.missed_by_id === account.agent_id);
  }
  res.json({
    escalations,
    agents: listHumanAgents(),
    me: { ...account, level: me?.level ?? null, department: me?.department ?? null },
    scope,
  });
});

// Manager (or admin) reassigns a case to any team member — or claims it. The
// manager MUST declare a disposition: "handling" (taking it themselves) or
// "delegated" (handing it to a team member). Restarts the SLA clock.
router.post("/:id/reassign", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const esc = getEscalationById(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  if (esc.status !== "open") return res.status(400).json({ error: "Case is already closed" });

  const me = account.role === "agent" && account.agent_id ? getHumanAgent(account.agent_id) : null;
  const isAdmin = account.role === "admin";
  const isManager = me?.level === "manager";
  if (!isAdmin && !isManager) return res.status(403).json({ error: "Only managers or admins can reassign cases" });
  if (isManager && me && !inDepartment(esc, me.department)) {
    return res.status(403).json({ error: "That case isn't in your team" });
  }

  const targetId = String(req.body?.assignee_id || "").trim();
  const target = targetId ? getHumanAgent(targetId) : null;
  if (!target) return res.status(400).json({ error: "Unknown team member" });
  if (isManager && me && target.department !== me.department) {
    return res.status(400).json({ error: "You can only assign within your own team" });
  }

  const isSelf = target.id === account.agent_id;
  const disposition = String(req.body?.disposition || "").trim() || (isSelf ? "handling" : "delegated");
  const note = String(req.body?.note || "").trim() || null;
  const dueAt = computeDueAt(target.department, esc.urgency, new Date().toISOString());
  // When ownership moves away from a front-line agent, keep that former owner in
  // the loop (read-only) so they can see a case that was taken off their plate.
  // The source ("manager"/"admin") lets the UI label it "Reassigned away" rather
  // than the SLA-driven "Missed".
  const ownerChanged = esc.assignee_id !== target.id;
  const prevWasManager = (esc.assignee_level ?? "agent") === "manager";
  const missedBy = ownerChanged && !prevWasManager ? { id: esc.assignee_id, name: esc.assignee_name } : undefined;
  assignEscalation(esc.id, target, {
    level: target.level, source: isAdmin ? "admin" : "manager", disposition,
    note, slaDueAt: dueAt, slaState: "on_track", missedBy,
  });

  const targetAccount = getAccountByAgentId(target.id);
  if (targetAccount && !isSelf) {
    createNotification({ account_id: targetAccount.id, kind: "case_assigned", title: `Case assigned: ${esc.subject || esc.ticket_id}`, body: note ? `From ${account.name}: ${note}` : `Assigned by ${account.name}.`, ticket_id: esc.ticket_id });
  }
  // Let the customer know who's handling their case now (the owner changed) —
  // both as a notification and as a line in their chat thread.
  if (esc.assignee_id !== target.id) {
    void notifyCaseReassigned(esc.customer_id, esc.ticket_id, target.name);
    addMessage(esc.ticket_id, "agent", `[[case-update]] ${target.name} is now handling your case and will follow up with you shortly.`);
  }
  const verb = isSelf ? "is handling" : `delegated to ${target.name}`;
  const act = recordTeamActivity({ kind: "escalation_reassigned", actor_id: account.agent_id, actor_name: account.name, ticket_id: esc.ticket_id, escalation_id: esc.id, summary: `${account.name} ${verb} "${esc.subject || esc.ticket_id}"` });
  emitCollab({ type: "escalation_handoff", activity: act });
  res.json({ ok: true, assignee: target, disposition });
});

router.post("/:id/resolve", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const esc = getEscalationById(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  if (account.role === "agent" && esc.assignee_id !== account.agent_id) return res.status(403).json({ error: "Not your case" });
  resolveEscalation(req.params.id);
  if (esc.customer_id) void notifyTicketResolved(esc.customer_id, esc.ticket_id, esc.subject);
  const act = recordTeamActivity({ kind: "escalation_resolved", actor_id: account.agent_id, actor_name: account.name, ticket_id: esc.ticket_id, escalation_id: esc.id, summary: `${account.name} resolved ${esc.subject || esc.ticket_id}` });
  emitCollab({ type: "escalation_resolved", activity: act });
  res.json({ ok: true });
});

router.post("/:id/handoff", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const esc = getEscalationById(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  if (esc.status !== "open") return res.status(400).json({ error: "Case is already closed" });
  if (account.role === "agent" && esc.assignee_id !== account.agent_id) return res.status(403).json({ error: "Not your case" });
  if ((esc.assignee_level ?? "agent") === "manager") return res.status(400).json({ error: "Case is already with a manager" });
  // Hand up to the manager of the department of the agent CURRENTLY on the case.
  // (Falls back to the escalation's stored department if the assignee isn't found.)
  // This keeps the handoff correct even if the stored department ever drifts from
  // who's actually handling it.
  const currentAgent = getHumanAgent(esc.assignee_id);
  const handoffDept = (currentAgent?.department ?? esc.department) as Department;
  const manager = pickManager(handoffDept);
  if (!manager) return res.status(409).json({ error: `No manager configured for ${handoffDept}` });
  const note = String(req.body?.note || "").trim() || null;
  const dueAt = computeDueAt(manager.department, esc.urgency, new Date().toISOString());
  reassignEscalation(req.params.id, manager, "manager", note, "agent", dueAt);
  if (esc.assignee_id !== manager.id) {
    void notifyCaseReassigned(esc.customer_id, esc.ticket_id, manager.name);
    addMessage(esc.ticket_id, "agent", `[[case-update]] ${manager.name} is now handling your case and will follow up with you shortly.`);
  }
  const managerAccount = getAccountByAgentId(manager.id);
  if (managerAccount) {
    createNotification({ account_id: managerAccount.id, kind: "escalation_handoff", title: `Case handed up: ${esc.subject || esc.ticket_id}`, body: note ? `From ${account.name}: ${note}` : `Handed up by ${account.name}.`, ticket_id: esc.ticket_id });
  }
  const act = recordTeamActivity({ kind: "escalation_handoff", actor_id: account.agent_id, actor_name: account.name, ticket_id: esc.ticket_id, escalation_id: esc.id, summary: `${account.name} handed ${esc.subject || esc.ticket_id} up to ${manager.name}` });
  emitCollab({ type: "escalation_handoff", activity: act });
  res.json({ ok: true, assignee: manager });
});

router.post("/:id/reply", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const esc = getEscalationById(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  if (esc.status !== "open") return res.status(400).json({ error: "Case is already closed" });
  if (account.role === "agent" && esc.assignee_id !== account.agent_id) return res.status(403).json({ error: "Not your case" });
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Message is empty" });
  addMessage(esc.ticket_id, "agent", text);
  void notifyAgentReply(esc.customer_id, esc.ticket_id, account.name, text);
  const act = recordTeamActivity({ kind: "agent_reply", actor_id: account.agent_id, actor_name: account.name, ticket_id: esc.ticket_id, escalation_id: esc.id, summary: `${account.name} replied to ${esc.customer_name} on ${esc.subject || esc.ticket_id}` });
  emitCollab({ type: "agent_reply", activity: act });
  res.json({ ok: true, messages: getMessages(esc.ticket_id) });
});

router.post("/:id/note", requireRole("admin", "agent"), (req: AuthedRequest, res) => {
  const account = req.account!;
  const esc = getEscalationById(req.params.id);
  if (!esc) return res.status(404).json({ error: "Escalation not found" });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Note is empty" });
  const note = addCaseNote({ escalation_id: esc.id, ticket_id: esc.ticket_id, author_id: account.agent_id ?? account.id, author_name: account.name, body: body.slice(0, 2000) });
  const act = recordTeamActivity({ kind: "case_note", actor_id: account.agent_id, actor_name: account.name, ticket_id: esc.ticket_id, escalation_id: esc.id, summary: `${account.name} noted on ${esc.subject || esc.ticket_id}: ${body.slice(0, 80)}` });
  emitCollab({ type: "case_note", note, activity: act });
  res.json({ ok: true, note });
});

router.get("/:id/notes", requireRole("admin", "agent"), (req, res) => {
  res.json({ notes: listCaseNotes(req.params.id) });
});

export default router;
