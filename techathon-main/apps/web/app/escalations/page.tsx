"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Headset,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  StickyNote,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeader } from "@/components/admin-nav";
import { SentimentBadge } from "@/components/sentiment-badge";
import {
  getCaseNotes,
  getDashboardTicket,
  handoffEscalation,
  listEscalations,
  postAgentReply,
  postCaseNote,
  reassignEscalation,
  resolveEscalation,
  sendHeartbeat,
  type EscalationScope,
  type EscalationViewer,
} from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { CaseNote, EscalationRecord, HumanAgent, Message, TicketDashboardDetail } from "@/lib/types";

type Filter = "open" | "resolved" | "all";
type SortKey = "recent" | "oldest" | "urgency";

const PAGE_SIZE = 10;
const URGENCY_RANK: Record<string, number> = { P1: 3, P2: 2, P3: 1 };

function urgencyVariant(u: string | null) {
  if (u === "P1") return "destructive" as const;
  if (u === "P2") return "warning" as const;
  return "secondary" as const;
}

const SOURCE_LABEL: Record<string, string> = {
  auto: "Auto-routed",
  agent: "Handed up",
  sla: "SLA escalation",
  manager: "Delegated",
  admin: "Admin",
};

// Compact "time left / overdue" string from an ISO deadline.
function dueLabel(dueAt: string | null | undefined): { text: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  const short = d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return { text: overdue ? `${short} overdue` : `${short} left`, overdue };
}

// SLA pill: reflects sla_state, with a live countdown for open cases.
function SlaBadge({ e }: { e: EscalationRecord }) {
  if (e.status !== "open") return null;
  const state = e.sla_state ?? "on_track";
  const due = dueLabel(e.sla_due_at);
  if (state === "breached") return <Badge variant="destructive">SLA breached</Badge>;
  if (state === "warning")
    return <Badge variant="warning">Due soon{due ? ` · ${due.text}` : ""}</Badge>;
  if (due?.overdue) return <Badge variant="destructive">Overdue · {due.text}</Badge>;
  return (
    <span className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {due ? due.text : "On track"}
    </span>
  );
}

export default function EscalationsPage() {
  const account = useRequireRole("admin", "agent");
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<EscalationScope>("agent");
  const [me, setMe] = useState<EscalationViewer | null>(null);
  const [agents, setAgents] = useState<HumanAgent[]>([]);

  // Front-line agent view (own cases only) vs. team view (admin/manager).
  const isManager = scope === "manager";
  const teamView = scope === "admin" || scope === "manager";
  const isAgent = scope === "agent";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await listEscalations();
    setEscalations(data.escalations);
    setAgents(data.agents ?? []);
    if (data.scope) setScope(data.scope);
    if (data.me) setMe(data.me);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!account) return;
    void load();
  }, [account, load]);

  // Near-real-time: poll so newly assigned cases appear without a manual refresh.
  useEffect(() => {
    if (!account) return;
    const t = setInterval(() => void load(true), 10000);
    return () => clearInterval(t);
  }, [account, load]);

  // Heartbeat so this agent shows as online on the Team dashboard while working.
  useEffect(() => {
    if (!account) return;
    void sendHeartbeat();
    const t = setInterval(() => void sendHeartbeat(), 15000);
    return () => clearInterval(t);
  }, [account]);

  useEffect(() => {
    setPage(0);
  }, [filter, query, deptFilter, sort]);

  async function onResolve(id: string) {
    await resolveEscalation(id);
    await load(true);
  }

  async function onHandoff(id: string, note: string) {
    await handoffEscalation(id, note);
    await load(true);
  }

  async function onReassign(id: string, assigneeId: string, disposition: "handling" | "delegated") {
    await reassignEscalation(id, assigneeId, disposition);
    await load(true);
  }

  const open = escalations.filter((e) => e.status === "open");

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const e of escalations) if (e.department) s.add(e.department);
    return [...s].sort();
  }, [escalations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = escalations.filter((e) => {
      if (filter !== "all" && e.status !== filter) return false;
      if (deptFilter !== "all" && e.department !== deptFilter) return false;
      if (!q) return true;
      return (
        (e.subject ?? "").toLowerCase().includes(q) ||
        e.customer_name.toLowerCase().includes(q) ||
        e.assignee_name.toLowerCase().includes(q) ||
        (e.reason ?? "").toLowerCase().includes(q)
      );
    });
    out.sort((a, b) => {
      if (sort === "recent") return +new Date(b.created_at) - +new Date(a.created_at);
      if (sort === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
      return (URGENCY_RANK[b.urgency ?? ""] ?? 0) - (URGENCY_RANK[a.urgency ?? ""] ?? 0);
    });
    return out;
  }, [escalations, filter, query, deptFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of open) m.set(e.department, (m.get(e.department) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [open]);

  // Manager: how many open cases are with ME right now, broken down by how they
  // reached me (handed up by an agent, SLA-escalated, delegated, or by admin).
  const myAgentId = me?.agent_id ?? null;
  const passedToMe = useMemo(() => {
    if (!isManager || !myAgentId) return null;
    const mine = open.filter((e) => e.assignee_id === myAgentId);
    const bySource: Record<string, number> = {};
    for (const e of mine) {
      const s = e.escalation_source ?? "auto";
      bySource[s] = (bySource[s] ?? 0) + 1;
    }
    return { total: mine.length, bySource };
  }, [isManager, myAgentId, open]);

  // Count of cases the team has let breach (SLA-missed), for a quick health read.
  // Only true SLA misses — not cases a manager deliberately reassigned.
  const missedCount = useMemo(
    () => (teamView ? open.filter((e) => !!e.missed_by_id && e.escalation_source === "sla").length : 0),
    [teamView, open],
  );

  const hasFilters = filter !== "open" || !!query || deptFilter !== "all";
  const selected = escalations.find((e) => e.id === selectedId) ?? null;

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader
        title={isManager ? "Team queue" : isAgent ? "My cases" : "Escalations"}
        subtitle={
          isManager
            ? `${me?.department ?? "Your"} team — every case assigned to your team`
            : isAgent
            ? `Signed in as ${account.name} — cases routed to you`
            : "Human handoffs across departments"
        }
        role={account.role as "admin" | "agent"}
        onRefresh={() => void load()}
        refreshing={loading}
      />

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat
            label={isAgent ? "My open cases" : "Open cases"}
            value={isAgent ? open.filter((e) => e.assignee_id === me?.agent_id).length : open.length}
            tone="amber"
          />
          <Stat label="Resolved" value={escalations.length - open.length} tone="green" />
          <Stat label="Total" value={escalations.length} tone="neutral" />
        </div>

        {/* Load by department (admin view only) */}
        {scope === "admin" && byDept.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {byDept.map(([dept, n]) => (
              <Badge key={dept} variant="outline">{dept}: {n}</Badge>
            ))}
          </div>
        )}

        {/* Manager insights: what's currently on my plate + how it got here. */}
        {isManager && passedToMe && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">With me now: <span className="font-medium text-foreground">{passedToMe.total}</span></span>
            {Object.entries(passedToMe.bySource).map(([src, n]) => (
              <Badge key={src} variant="outline">{SOURCE_LABEL[src] ?? src}: {n}</Badge>
            ))}
            {missedCount > 0 && <Badge variant="destructive">Missed by team: {missedCount}</Badge>}
          </div>
        )}

        {/* Toolbar */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(["open", "resolved", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "rounded-lg px-3 py-1.5 text-sm capitalize transition-colors " +
                  (filter === f ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60")
                }
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subject, customer, assignee…"
              className="w-56 rounded-lg border border-border bg-card py-1.5 pl-8 pr-8 text-sm outline-none focus:border-ring/60 focus:ring-1 focus:ring-ring/20"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {departments.length > 1 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-ring/60"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-ring/60"
          >
            <option value="recent">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="urgency">Urgency</option>
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filtered.length} case{filtered.length === 1 ? "" : "s"}</span>
          {hasFilters && (
            <button
              onClick={() => {
                setFilter("open");
                setQuery("");
                setDeptFilter("all");
              }}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-card/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Department</th>
                <th className="px-4 py-2.5 font-medium">{teamView ? "Handling" : "Reason"}</th>
                <th className="px-4 py-2.5 font-medium">Urgency</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">SLA</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <Skeleton className="h-3.5 w-52" />
                      <Skeleton className="mt-1.5 h-3 w-28" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell"><Skeleton className="h-3.5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3.5 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="hidden px-4 py-3 lg:table-cell"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="hidden px-4 py-3 sm:table-cell"><Skeleton className="ml-auto h-3.5 w-14" /></td>
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <Inbox className="size-6 opacity-40" />
                      No cases match your filters.
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map((e) => {
                  const atManager = (e.assignee_level ?? "agent") === "manager";
                  // A case moved off this front-line agent (SLA breach, or a manager
                  // reassigned it). Source tells us how to label it.
                  const movedAway = !!e.missed_by_id && e.missed_by_id === me?.agent_id && e.assignee_id !== me?.agent_id;
                  const missedByMe = isAgent && movedAway;
                  const bySla = e.escalation_source === "sla";
                  const teamMissed = teamView && !!e.missed_by_id;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="max-w-[280px] truncate font-medium">{e.subject || "(no subject)"}</span>
                          {missedByMe && (
                            bySla
                              ? <Badge variant="destructive">Missed</Badge>
                              : <Badge variant="warning">Reassigned away</Badge>
                          )}
                          {teamMissed && !missedByMe && (
                            bySla
                              ? <Badge variant="destructive">Missed by {e.missed_by_name}</Badge>
                              : <Badge variant="warning">Reassigned from {e.missed_by_name}</Badge>
                          )}
                          {e.status === "open" && atManager && <Badge variant="warning">with manager</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{e.customer_name}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{e.department}</td>
                      <td className="px-4 py-3">
                        {teamView ? (
                          <>
                            <div className="text-sm">{e.assignee_name}</div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>{e.assignee_title}</span>
                              {e.escalation_source && e.escalation_source !== "auto" && (
                                <span className="rounded bg-secondary px-1 py-px text-[10px] text-muted-foreground">{SOURCE_LABEL[e.escalation_source] ?? e.escalation_source}</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="line-clamp-2 max-w-[260px] text-xs text-muted-foreground">{e.reason}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={urgencyVariant(e.urgency)}>{e.urgency || "—"}</Badge>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <SlaBadge e={e} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={e.status === "open" ? "warning" : "success"}>{e.status}</Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-right text-xs text-muted-foreground sm:table-cell">
                        {new Date(e.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Showing {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length} · Page {safePage + 1}/{totalPages}
            </span>
            <Button variant="ghost" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </main>

      {/* ── Case sheet ─────────────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)} side="right">
        {selected && (
          <CaseDetail
            e={selected}
            canManage={teamView}
            viewerRole={scope}
            myAgentId={me?.agent_id ?? null}
            teamAgents={
              scope === "manager" && me?.department
                ? agents.filter((a) => a.department === me.department)
                : scope === "admin"
                ? agents.filter((a) => a.department === selected.department)
                : []
            }
            onResolve={async () => {
              await onResolve(selected.id);
              setSelectedId(null);
            }}
            onHandoff={async (note) => {
              await onHandoff(selected.id, note);
              setSelectedId(null);
            }}
            onReassign={async (assigneeId, disposition) => {
              await onReassign(selected.id, assigneeId, disposition);
              setSelectedId(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function CaseDetail({
  e,
  canManage,
  viewerRole,
  myAgentId,
  teamAgents,
  onResolve,
  onHandoff,
  onReassign,
}: {
  e: EscalationRecord;
  canManage: boolean;
  viewerRole: EscalationScope;
  myAgentId: string | null;
  teamAgents: HumanAgent[];
  onResolve: () => Promise<void>;
  onHandoff: (note: string) => Promise<void>;
  onReassign: (assigneeId: string, disposition: "handling" | "delegated") => Promise<void>;
}) {
  const [detail, setDetail] = useState<TicketDashboardDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateTo, setDelegateTo] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const convoRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const atManager = (e.assignee_level ?? "agent") === "manager";
  const isHandler = myAgentId != null && e.assignee_id === myAgentId;
  // Who may actually work this case: the current handler, or a manager/admin
  // overseeing the team. A front-line agent looking at a case they MISSED (now
  // owned by someone else) is read-only — they can see it, not act on it.
  const canAct = isHandler || canManage;
  // Resolve is only for the person actually working the case: a front-line agent
  // on their own case, or a manager who has taken it themselves. Admins never
  // resolve from here; a manager who isn't the handler can't either.
  const canResolve = e.status === "open" && isHandler && viewerRole !== "admin";
  // A front-line agent viewing a case that slipped past its SLA to someone else.
  const missedByViewer = viewerRole === "agent" && !isHandler;

  // Load internal team notes for this case, then poll so teammates' notes appear.
  useEffect(() => {
    let alive = true;
    void getCaseNotes(e.id).then((n) => alive && setNotes(n));
    const id = setInterval(() => {
      void getCaseNotes(e.id).then((n) => alive && setNotes(n));
    }, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [e.id]);

  async function addNote() {
    const body = noteText.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    const res = await postCaseNote(e.id, body);
    if (res.note) {
      setNotes((prev) => [...prev, res.note!]);
      setNoteText("");
    }
    setSavingNote(false);
  }

  // Load once on open, then poll so the agent sees customer replies live.
  useEffect(() => {
    let alive = true;
    setLoadingDetail(true);
    setDetail(null);
    setMessages([]);
    const fetchDetail = async (initial: boolean) => {
      const d = await getDashboardTicket(e.ticket_id);
      if (!alive) return;
      if (d) {
        setDetail(d);
        setMessages(d.messages ?? []);
      }
      if (initial) setLoadingDetail(false);
    };
    void fetchDetail(true);
    const id = setInterval(() => {
      if (!sendingRef.current) void fetchDetail(false);
    }, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.ticket_id]);

  // Keep the conversation pinned to the newest message.
  useEffect(() => {
    convoRef.current?.scrollTo({ top: convoRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function confirmHandoff() {
    setBusy(true);
    await onHandoff(note.trim());
    setBusy(false);
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text || sending) return;
    setReplyError("");
    setSending(true);
    sendingRef.current = true;
    // Optimistic append.
    setMessages((prev) => [...prev, { role: "agent", text }]);
    setReply("");
    const res = await postAgentReply(e.id, text);
    if (res.messages) setMessages(res.messages);
    else if (res.error) {
      setReplyError(res.error);
      setMessages((prev) => prev.slice(0, -1));
      setReply(text);
    }
    setSending(false);
    sendingRef.current = false;
  }

  const lastRun = detail && detail.runs.length > 0 ? detail.runs[detail.runs.length - 1].state : null;
  const suggested = lastRun?.resolution?.summary ?? null;
  const mood = lastRun?.sentiment ?? null;
  const canReply = e.status === "open" && canAct;

  return (
    <>
      <SheetHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={e.status === "open" ? "warning" : "success"}>{e.status}</Badge>
          <Badge variant={urgencyVariant(e.urgency)}>{e.urgency || "—"}</Badge>
          <SlaBadge e={e} />
          {e.status === "open" && atManager && <Badge variant="outline">with manager</Badge>}
          {e.status === "open" && e.escalation_source && e.escalation_source !== "auto" && (
            <Badge variant="outline">{SOURCE_LABEL[e.escalation_source] ?? e.escalation_source}</Badge>
          )}
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug">{e.subject || "(no subject)"}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {e.customer_name} · {e.department} · routed to {e.assignee_name}
          {e.assignee_title ? ` (${e.assignee_title})` : ""} · {new Date(e.created_at).toLocaleString()}
        </p>
        {e.missed_by_name && e.missed_by_id !== e.assignee_id && (
          e.escalation_source === "sla" ? (
            <p className="mt-1 text-[11px] font-medium text-destructive">
              Missed by {e.missed_by_name} — escalated past the SLA deadline.
            </p>
          ) : (
            <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Reassigned from {e.missed_by_name}.
            </p>
          )
        )}
        {e.reason && <p className="mt-2 text-sm text-muted-foreground">{e.reason}</p>}

        {/* Actions */}
        <div className="mt-3 flex flex-wrap gap-2">
          {e.status !== "open" ? (
            <Button size="sm" variant="ghost" disabled>Closed</Button>
          ) : (
            <>
              {canResolve && <Button size="sm" onClick={() => void onResolve()}>Resolve case</Button>}
              {/* Front-line agents can escalate up to their manager — but only on
                  a case they actually own (not one they've already missed). */}
              {viewerRole === "agent" && isHandler && !atManager && (
                <Button variant="outline" size="sm" onClick={() => setHandoffOpen((v) => !v)}>
                  Pass to manager
                </Button>
              )}
              {/* Managers/admins re-route the case. A manager can assign it to
                  themselves here, which is the only way they can then resolve it. */}
              {canManage && teamAgents.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setDelegateOpen((v) => !v)}>
                  Change assignee
                </Button>
              )}
            </>
          )}
        </div>
        {/* Tell a manager who isn't the handler why they can't resolve. */}
        {viewerRole === "manager" && e.status === "open" && !isHandler && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {e.assignee_name} is handling this. Use <span className="font-medium text-foreground">Change assignee</span> to take it
            yourself before you can resolve it.
          </p>
        )}
        {/* Front-line agent looking at a case that left them — view only. */}
        {missedByViewer && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {e.escalation_source === "sla"
              ? "This case moved to "
              : "This case was reassigned to "}
            <span className="font-medium text-foreground">{e.assignee_name}</span>
            {e.escalation_source === "sla" ? " after its SLA deadline." : "."}
            {" "}You can view it for reference, but you can no longer reply or act on it.
          </p>
        )}

        {canManage && delegateOpen && e.status === "open" && (
          <div className="mt-3 rounded-xl border border-border bg-card/60 p-3">
            <p className="mb-1 text-sm font-medium">Change who&apos;s handling this case</p>
            <p className="mb-2 text-xs text-muted-foreground">
              The new owner can reply and resolve it, the SLA clock restarts for them, and the customer is told who&apos;s now handling it.
              {viewerRole === "manager" && " Assign it to yourself if you want to resolve it."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={delegateTo}
                onChange={(ev) => setDelegateTo(ev.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring/60"
              >
                <option value="">Choose a team member…</option>
                {viewerRole === "manager" && myAgentId && (
                  <option value={myAgentId}>
                    Assign to me (I&apos;ll handle it){e.assignee_id === myAgentId ? " (current)" : ""}
                  </option>
                )}
                {teamAgents
                  .filter((a) => !(viewerRole === "manager" && a.id === myAgentId))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.title}
                      {a.id === e.assignee_id ? " (current)" : ""}
                    </option>
                  ))}
              </select>
              <Button
                size="sm"
                disabled={!delegateTo || reassigning || delegateTo === e.assignee_id}
                onClick={async () => {
                  if (!delegateTo) return;
                  setReassigning(true);
                  await onReassign(delegateTo, delegateTo === myAgentId ? "handling" : "delegated");
                  setReassigning(false);
                }}
              >
                {reassigning ? "Assigning…" : "Assign"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDelegateOpen(false)} disabled={reassigning}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {handoffOpen && (
          <div className="mt-3 rounded-xl border border-border bg-card/60 p-3">
            <p className="mb-1 text-sm font-medium">Pass this case up to the {e.department} manager</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Add a short description of what you tried and what the manager needs to know.
            </p>
            <textarea
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              placeholder="e.g. Customer disputes the charge; refund needs manager approval over $200."
              className="input min-h-[72px] resize-y"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => void confirmHandoff()} disabled={busy}>
                {busy ? "Passing…" : "Pass to manager"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setHandoffOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SheetHeader>

      <SheetBody>
        {mood && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 p-3.5">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Customer mood
              </p>
              {mood.drivers?.length ? (
                <p className="text-xs text-muted-foreground">{mood.drivers.join(" · ")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Tone detected by the engine</p>
              )}
            </div>
            <SentimentBadge
              label={mood.label}
              score={mood.score}
              frustration={mood.frustration}
              trend={mood.trend}
            />
          </div>
        )}
        {e.handoff_note && (
          <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              Handoff note → {e.assignee_name}
            </p>
            <p className="text-sm leading-relaxed">{e.handoff_note}</p>
          </div>
        )}

        {suggested && (
          <div className="mb-4 rounded-xl border border-border bg-card/40 p-3.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Suggested resolution (from the engine)
            </p>
            <p className="text-sm leading-relaxed">{suggested}</p>
          </div>
        )}

        {/* Conversation */}
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Conversation {messages.length ? `(${messages.length})` : ""}
        </p>
        {loadingDetail ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-3/4 rounded-xl" />
            <Skeleton className="ml-auto h-12 w-2/3 rounded-xl" />
            <Skeleton className="h-12 w-4/5 rounded-xl" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">Could not load this conversation.</p>
        ) : (
          <div ref={convoRef} className="max-h-[42vh] space-y-2.5 overflow-y-auto pr-1">
            {messages.map((m, i) => (
              <CaseMessage key={i} m={m} agentName={e.assignee_name} />
            ))}
          </div>
        )}

        {/* Reply composer — the assigned agent talks to the customer directly */}
        {canReply && (
          <div className="mt-3">
            {replyError && <p className="mb-1.5 text-xs font-medium text-destructive">{replyError}</p>}
            <div className="flex items-end gap-2 rounded-2xl border border-emerald-500/30 bg-card p-2 transition-colors focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20">
              <textarea
                value={reply}
                onChange={(ev) => setReply(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    void sendReply();
                  }
                }}
                rows={1}
                placeholder={`Reply to ${e.customer_name} as ${e.assignee_name}…`}
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button size="icon" className="size-8 shrink-0 rounded-xl" onClick={() => void sendReply()} disabled={sending || !reply.trim()}>
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
              </Button>
            </div>
            <p className="mt-1 px-0.5 text-[10px] text-muted-foreground/50">
              The customer is notified and sees your reply in their chat. Enter to send.
            </p>
          </div>
        )}

        {/* Internal team notes — agent-to-agent collaboration, not customer-visible */}
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <StickyNote className="size-3.5" /> Team notes ({notes.length})
          </p>
          {notes.length > 0 && (
            <div className="mb-2 space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border bg-card/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{n.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </div>
          )}
          {canAct ? (
            <>
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 transition-colors focus-within:border-foreground/30">
                <textarea
                  value={noteText}
                  onChange={(ev) => setNoteText(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" && !ev.shiftKey) {
                      ev.preventDefault();
                      void addNote();
                    }
                  }}
                  rows={1}
                  placeholder="Add an internal note for the team…"
                  className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button size="icon" variant="outline" className="size-8 shrink-0 rounded-xl" onClick={() => void addNote()} disabled={savingNote || !noteText.trim()}>
                  {savingNote ? <Loader2 className="size-3.5 animate-spin" /> : <StickyNote className="size-3.5" />}
                </Button>
              </div>
              <p className="mt-1 px-0.5 text-[10px] text-muted-foreground/50">
                Visible to the team on the Team dashboard. The customer never sees these.
              </p>
            </>
          ) : (
            notes.length === 0 && <p className="text-xs text-muted-foreground">No notes on this case.</p>
          )}
        </div>

        {/* Full pipeline trace — opens the dedicated trace viewer in a new tab */}
        {detail && detail.runs.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Full pipeline trace ({detail.runs.length} run{detail.runs.length === 1 ? "" : "s"})
            </p>
            <Link href={`/trace/${encodeURIComponent(e.ticket_id)}`} target="_blank">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Workflow className="size-3.5" /> Open full trace in new tab
                <ExternalLink className="size-3 opacity-60" />
              </Button>
            </Link>
          </div>
        )}
      </SheetBody>
    </>
  );
}

// One message row in the case conversation, styled by role.
function CaseMessage({ m, agentName }: { m: Message; agentName: string }) {
  if (m.role === "customer") {
    return (
      <div className="rounded-xl bg-primary/10 px-3.5 py-2.5 text-sm ring-1 ring-inset ring-primary/15">
        <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-primary/70">Customer</span>
        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
      </div>
    );
  }
  if (m.role === "agent") {
    const UPDATE = "[[case-update]] ";
    if (m.text.startsWith(UPDATE)) {
      return (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[11px] text-amber-600 dark:text-amber-400">
            <RefreshCw className="size-3" />
            <span className="font-semibold uppercase tracking-wide">Update</span>
            <span className="opacity-50">·</span>
            {m.text.slice(UPDATE.length)}
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-2.5 text-sm">
        <span className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-emerald-500/80">
          <Headset className="size-3" /> {agentName}
        </span>
        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-background/40 px-3.5 py-2.5 text-sm">
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">AI assistant</span>
      <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "green" | "neutral" }) {
  const dot = tone === "amber" ? "bg-amber-400" : tone === "green" ? "bg-emerald-500" : "bg-muted-foreground/40";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={`size-1.5 rounded-full ${dot}`} /> {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
