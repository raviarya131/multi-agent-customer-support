// SLA sweeper — a lightweight background job that watches open cases against
// their deadlines and acts the way a real support org would:
//
//   • at the warning threshold  → flag the case + nudge its current owner
//   • deadline blown by an AGENT → auto-hand it up to the department MANAGER,
//                                   mark the agent's copy as "Missed"
//   • deadline blown by a MANAGER → there's no higher official, so we treat the
//                                   cross-functional Escalations (Tier-2) group
//                                   as the war-room: bump to P1, route it there,
//                                   and page the admins
//   • deadline blown at Tier-2    → terminal "breached" state + admin alert
//
// Each transition fires exactly once (state guards prevent re-firing/spam) and
// is written to the team activity feed so it's fully auditable.
import {
  listOpenEscalations, assignEscalation, setSlaState, setSlaDueAt, setEscalationRouting,
  recordTeamActivity, createNotification, countOpenByAssignee, type EscalationRecord,
} from "./db";
import { getHumanAgent, pickManager, pickAssignee, type Department } from "./humans";
import { getAccountByAgentId, listAccounts } from "./auth";
import { computeDueAt, computeWarnAt } from "./sla";
import { emitCollab } from "./collab";

const SWEEP_MS = 60_000; // once a minute is plenty for this clock granularity

function deptOf(esc: EscalationRecord): Department {
  const a = getHumanAgent(esc.assignee_id);
  return (a?.department ?? esc.department) as Department;
}

function notifyAgent(agentId: string | null | undefined, kind: string, title: string, body: string, ticketId: string) {
  if (!agentId) return;
  const acct = getAccountByAgentId(agentId);
  if (acct) createNotification({ account_id: acct.id, kind, title, body, ticket_id: ticketId });
}

function notifyAdmins(kind: string, title: string, body: string, ticketId: string) {
  for (const a of listAccounts().filter((x) => x.role === "admin")) {
    createNotification({ account_id: a.id, kind, title, body, ticket_id: ticketId });
  }
}

function activity(esc: EscalationRecord, summary: string) {
  const act = recordTeamActivity({ kind: "sla", actor_name: "SLA monitor", ticket_id: esc.ticket_id, escalation_id: esc.id, summary });
  emitCollab({ type: "escalation_handoff", activity: act });
}

function sweepOne(esc: EscalationRecord, now: number): void {
  const dept = deptOf(esc);
  const startedAt = esc.sla_started_at ?? esc.created_at;

  // Backfill a deadline for legacy rows created before SLA tracking existed.
  let dueAt = esc.sla_due_at;
  if (!dueAt) {
    dueAt = computeDueAt(dept, esc.urgency, startedAt);
    setSlaDueAt(esc.id, dueAt, startedAt);
  }

  const due = new Date(dueAt).getTime();
  const warn = new Date(computeWarnAt(dept, esc.urgency, startedAt, dueAt)).getTime();
  const level = (esc.assignee_level ?? "agent") as "agent" | "manager";
  const subject = esc.subject || esc.ticket_id;

  // ── Deadline blown ────────────────────────────────────────────────────────
  if (now >= due) {
    if (level === "agent") {
      const manager = pickManager(dept);
      if (manager && manager.id !== esc.assignee_id) {
        const newDue = computeDueAt(dept, esc.urgency, new Date(now).toISOString());
        assignEscalation(esc.id, manager, {
          level: "manager", source: "sla", slaState: "on_track", slaDueAt: newDue,
          missedBy: { id: esc.assignee_id, name: esc.assignee_name }, bumpBreach: true, disposition: null,
        });
        notifyAgent(esc.assignee_id, "sla_missed", `Missed SLA · ${subject}`, `This case passed its ${dept} deadline and was escalated to your manager, ${manager.name}.`, esc.ticket_id);
        notifyAgent(manager.id, "sla_escalation", `SLA escalation · ${subject}`, `${esc.assignee_name} missed the deadline on this ${dept} case. It's now yours.`, esc.ticket_id);
        activity(esc, `${esc.assignee_name} missed SLA on "${subject}" → escalated to manager ${manager.name}`);
        return;
      }
      // No manager configured for the dept → straight to the top tier.
    }

    // Manager (or no-manager agent) blew the deadline → top tier.
    if (dept !== "Escalations") {
      const human = pickAssignee("Escalations", countOpenByAssignee());
      const newDue = computeDueAt("Escalations", "P1", new Date(now).toISOString());
      setEscalationRouting(esc.id, { department: "Escalations", urgency: "P1" });
      assignEscalation(esc.id, human, {
        level: human.level, source: "sla", slaState: "on_track", slaDueAt: newDue,
        missedBy: { id: esc.assignee_id, name: esc.assignee_name }, bumpBreach: true, disposition: null,
      });
      notifyAgent(esc.assignee_id, "sla_missed", `Missed SLA · ${subject}`, `This case passed its deadline at manager level and was escalated to the Tier-2 Escalations team.`, esc.ticket_id);
      notifyAgent(human.id, "sla_escalation", `Tier-2 escalation · ${subject}`, `Escalated to Tier-2 after the ${dept} manager missed the deadline. Bumped to P1.`, esc.ticket_id);
      notifyAdmins("sla_breach", `Case breached at manager level · ${subject}`, `${esc.assignee_name} (${dept} manager) missed the SLA. Auto-routed to Tier-2 Escalations and bumped to P1.`, esc.ticket_id);
      activity(esc, `Manager ${esc.assignee_name} missed SLA on "${subject}" → escalated to Tier-2 (P1), admins notified`);
      return;
    }

    // Already at Tier-2 and still breaching → terminal breached state. Page the
    // admins once on transition, then stop auto-routing (nowhere higher to go).
    if (esc.sla_state !== "breached") {
      setSlaState(esc.id, "breached");
      // Push the clock forward so we don't re-evaluate this branch every minute.
      setSlaDueAt(esc.id, computeDueAt("Escalations", esc.urgency, new Date(now).toISOString()));
      notifyAdmins("sla_breach", `BREACHED · ${subject}`, `This case has now breached its SLA at the top (Tier-2) tier with ${esc.assignee_name}. Needs hands-on attention.`, esc.ticket_id);
      activity(esc, `"${subject}" breached SLA at Tier-2 with ${esc.assignee_name} — admins paged`);
    }
    return;
  }

  // ── Warning threshold ───────────────────────────────────────────────────────
  if (now >= warn && esc.sla_state === "on_track") {
    setSlaState(esc.id, "warning");
    notifyAgent(esc.assignee_id, "sla_warning", `SLA warning · ${subject}`, `You're approaching the deadline on this ${dept} case. Resolve or hand it up before it breaches.`, esc.ticket_id);
    activity(esc, `SLA warning on "${subject}" — ${esc.assignee_name} approaching deadline`);
  }
}

let started = false;
export function startSlaSweeper(): void {
  if (started) return;
  started = true;
  const tick = () => {
    const now = Date.now();
    try {
      for (const esc of listOpenEscalations()) {
        try { sweepOne(esc, now); } catch (err) { console.warn("[sla] sweep failed for", esc.id, err); }
      }
    } catch (err) {
      console.warn("[sla] sweep cycle failed", err);
    }
  };
  // Kick once shortly after boot, then on an interval.
  setTimeout(tick, 5_000);
  const handle = setInterval(tick, SWEEP_MS);
  handle.unref?.();
  console.log(`[api] SLA sweeper started (every ${SWEEP_MS / 1000}s)`);
}
