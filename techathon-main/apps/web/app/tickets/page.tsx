"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Inbox,
  MessageSquare,
  Search,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetBody, SheetHeader } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeader } from "@/components/admin-nav";
import { SentimentBadge } from "@/components/sentiment-badge";
import { getDashboardTicket, listDashboardTickets } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type {
  TicketDashboardDetail,
  TicketDashboardRow,
  TicketLifecycleStatus,
} from "@/lib/types";
import { LifecycleStepper } from "@/components/views";

type StatusFilter = "all" | TicketLifecycleStatus;
type SortKey = "recent" | "oldest" | "messages" | "runs";

const PAGE_SIZE = 12;

function statusVariant(s: TicketLifecycleStatus) {
  if (s === "escalated") return "destructive" as const;
  if (s === "reopened") return "warning" as const;
  if (s === "resolved") return "success" as const;
  return "warning" as const;
}

function relativeTime(iso: string) {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function TicketsDashboardPage() {
  const account = useRequireRole("admin");
  const [tickets, setTickets] = useState<TicketDashboardRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<TicketDashboardDetail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(0);

  async function loadList() {
    setLoading(true);
    setTickets(await listDashboardTickets());
    setLoading(false);
  }

  function openTicket(id: string) {
    setSelectedId(id);
    setSheetOpen(true);
  }

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    setDetail(null);
    void getDashboardTicket(selectedId).then((d) => {
      setDetail(d);
      setDetailLoading(false);
    });
  }, [selectedId]);

  useEffect(() => {
    setPage(0);
  }, [query, filter, customerFilter, intentFilter, sort]);

  const customers = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tickets) m.set(t.customer_id ?? "__guest__", t.customer_name || "Guest");
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const intents = useMemo(() => {
    const s = new Set<string>();
    for (const t of tickets) if (t.primary_intent) s.add(t.primary_intent);
    return [...s].sort();
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = tickets.filter((t) => {
      if (filter !== "all" && t.status !== filter) return false;
      if (customerFilter !== "all" && (t.customer_id ?? "__guest__") !== customerFilter) return false;
      if (intentFilter !== "all" && t.primary_intent !== intentFilter) return false;
      if (!q) return true;
      return (
        t.ticket_id.toLowerCase().includes(q) ||
        t.display_id.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.customer_name.toLowerCase().includes(q) ||
        (t.primary_intent ?? "").toLowerCase().includes(q)
      );
    });
    out.sort((a, b) => {
      if (sort === "recent") return +new Date(b.updated_at) - +new Date(a.updated_at);
      if (sort === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
      if (sort === "messages") return b.message_count - a.message_count;
      return b.run_count - a.run_count;
    });
    return out;
  }, [tickets, query, filter, customerFilter, intentFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const stats = useMemo(() => {
    const escalated = tickets.filter((t) => t.status === "escalated").length;
    const resolved = tickets.filter((t) => t.status === "resolved").length;
    const active = tickets.filter((t) => t.status === "active").length;
    return { total: tickets.length, escalated, resolved, active };
  }, [tickets]);

  const hasActiveFilters = filter !== "all" || customerFilter !== "all" || intentFilter !== "all" || !!query;

  if (!account) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AdminHeader
        title="Tickets"
        subtitle="All conversations, statuses & pipeline traces"
        role="admin"
        onRefresh={() => void loadList()}
        refreshing={loading}
      />

      <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-6 py-6">
        {/* KPI band — clickable to filter */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Total tickets" value={stats.total} active={filter === "all"} onClick={() => setFilter("all")} tone="neutral" />
          <Kpi label="Active" value={stats.active} active={filter === "active"} onClick={() => setFilter("active")} tone="amber" />
          <Kpi label="Escalated" value={stats.escalated} active={filter === "escalated"} onClick={() => setFilter("escalated")} tone="red" />
          <Kpi label="Resolved" value={stats.resolved} active={filter === "resolved"} onClick={() => setFilter("resolved")} tone="green" />
        </div>

        {/* Toolbar */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, ID, customer, intent…"
              className="w-full rounded-lg border border-border bg-card py-2 pl-8 pr-8 text-sm outline-none focus:border-ring/60 focus:ring-1 focus:ring-ring/20"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-2 text-xs outline-none focus:border-ring/60"
          >
            <option value="all">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={intentFilter}
            onChange={(e) => setIntentFilter(e.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-2 text-xs outline-none focus:border-ring/60"
          >
            <option value="all">All intents</option>
            {intents.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-card px-2 py-2 text-xs outline-none focus:border-ring/60"
          >
            <option value="recent">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="messages">Most messages</option>
            <option value="runs">Most runs</option>
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
            {hasActiveFilters && tickets.length !== filtered.length ? ` of ${tickets.length}` : ""}
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setQuery("");
                setFilter("all");
                setCustomerFilter("all");
                setIntentFilter("all");
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
                <th className="px-4 py-2.5 font-medium">Ticket</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Intent</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Mood</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Activity</th>
                <th className="px-4 py-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="mt-1.5 h-3.5 w-48" />
                    </td>
                    <td className="px-4 py-3"><Skeleton className="h-3.5 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="hidden px-4 py-3 lg:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="hidden px-4 py-3 md:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="hidden px-4 py-3 md:table-cell"><Skeleton className="h-3.5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-3.5 w-14" /></td>
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <Inbox className="size-6 opacity-40" />
                      No tickets match your filters.
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map((t) => (
                  <tr
                    key={t.ticket_id}
                    onClick={() => openTicket(t.ticket_id)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground/70">{t.display_id}</span>
                        {t.parent_ticket_id && <Badge variant="outline">linked</Badge>}
                      </div>
                      <p className="mt-0.5 max-w-[320px] truncate font-medium">{t.title}</p>
                      {t.summary && (
                        <p className="mt-0.5 max-w-[320px] truncate text-[11px] text-muted-foreground/70">
                          {t.summary}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.customer_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {t.primary_intent && <Badge variant="outline">{t.primary_intent}</Badge>}
                        {t.severity && <Badge variant="outline">{t.severity}</Badge>}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <SentimentBadge
                        label={t.sentiment}
                        score={t.sentiment_score}
                        frustration={t.frustration}
                        size="xs"
                      />
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                      {t.message_count} msg · {t.run_count} run{t.run_count === 1 ? "" : "s"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">{relativeTime(t.updated_at)}</td>
                  </tr>
                ))
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
      </div>

      {/* ── Detail sheet ───────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} side="right">
        {detailLoading || !detail ? (
          <SheetBody>
            {detailLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ticket not found.</p>
            )}
          </SheetBody>
        ) : (
          <TicketDetail detail={detail} />
        )}
      </Sheet>
    </div>
  );
}

function Kpi({
  label,
  value,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: "neutral" | "amber" | "red" | "green";
}) {
  const dot =
    tone === "amber" ? "bg-amber-400" : tone === "red" ? "bg-red-500" : tone === "green" ? "bg-emerald-500" : "bg-muted-foreground/40";
  return (
    <button
      onClick={onClick}
      className={
        "flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/30 " +
        (active ? "border-primary/50 ring-1 ring-inset ring-primary/30" : "border-border")
      }
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span className={`size-1.5 rounded-full ${dot}`} /> {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </button>
  );
}

function TicketDetail({ detail }: { detail: TicketDashboardDetail }) {
  const { ticket, messages, runs, escalation } = detail;
  const latestState = runs.length ? runs[runs.length - 1].state : null;

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary ring-1 ring-inset ring-primary/20">
            {ticket.display_id}
          </span>
          <Badge variant={statusVariant(ticket.status)}>{ticket.status}</Badge>
        </div>
        <h2 className="mt-2 text-lg font-semibold leading-snug">{ticket.title}</h2>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
          {ticket.customer_name}
          {ticket.customer_id ? ` (${ticket.customer_id})` : " (guest)"} · {ticket.message_count} msg ·{" "}
          {ticket.run_count} run{ticket.run_count === 1 ? "" : "s"} · created {new Date(ticket.created_at).toLocaleString()}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {ticket.primary_intent && <Badge variant="outline">intent: {ticket.primary_intent}</Badge>}
          {ticket.severity && <Badge variant="outline">severity: {ticket.severity}</Badge>}
          {ticket.priority && <Badge variant="outline">{ticket.priority}</Badge>}
          <SentimentBadge
            label={ticket.sentiment}
            score={ticket.sentiment_score}
            frustration={ticket.frustration}
            size="xs"
          />
          <div className="ml-auto flex gap-2">
            {escalation && (
              <Link href="/escalations">
                <Button variant="outline" size="sm">Escalation</Button>
              </Link>
            )}
            <Link href={`/?ticket=${ticket.ticket_id}`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="size-3.5" /> Open in chat
              </Button>
            </Link>
          </div>
        </div>
      </SheetHeader>

      <SheetBody>
        {escalation && (
          <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">
              Escalation {escalation.status} · {escalation.assignee_name} ({escalation.department})
            </p>
            {escalation.reason && <p className="mt-1 text-xs text-muted-foreground">{escalation.reason}</p>}
          </div>
        )}

        {latestState && (
          <section className="mb-6">
            <LifecycleStepper s={latestState} />
          </section>
        )}

        {/* Conversation */}
        <section className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="size-4" /> Conversation
            <span className="text-xs font-normal text-muted-foreground">({messages.length})</span>
          </h3>
          <div className="space-y-3 rounded-lg border border-border bg-card/40 p-4">
            {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  "rounded-lg px-3 py-2 text-sm " +
                  (m.role === "customer"
                    ? "bg-primary/10 ring-1 ring-inset ring-primary/15"
                    : "border border-border bg-background/40")
                }
              >
                <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>{m.role === "customer" ? "Customer" : "Support"}</span>
                  {m.timestamp && <span className="font-mono normal-case">{new Date(m.timestamp).toLocaleString()}</span>}
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline trace */}
        <section>
          <h3 className="mb-1 text-sm font-medium">Pipeline trace</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {runs.length} run{runs.length === 1 ? "" : "s"} recorded · open the full agent trace in a
            dedicated tab to keep this view focused.
          </p>
          <Link href={`/trace/${encodeURIComponent(ticket.ticket_id)}`} target="_blank">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Workflow className="size-3.5" /> Open full trace in new tab
              <ExternalLink className="size-3 opacity-60" />
            </Button>
          </Link>
        </section>
      </SheetBody>
    </>
  );
}

