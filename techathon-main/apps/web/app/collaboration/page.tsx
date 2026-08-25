"use client";
// Real-time agent collaboration dashboard ("Team"). Live roster with presence
// and load, a streaming activity feed (SSE), and recent internal case notes.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  MessageSquare,
  Radio,
  StickyNote,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminHeader } from "@/components/admin-nav";
import { collabStreamUrl, getCollabOverview, sendHeartbeat } from "@/lib/api";
import { useRequireRole } from "@/lib/auth";
import type { CollabAgent, CollabOverview, TeamActivity } from "@/lib/types";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CollaborationPage() {
  const account = useRequireRole("admin", "agent");
  const [data, setData] = useState<CollabOverview | null>(null);
  const [live, setLive] = useState(false);
  const [feed, setFeed] = useState<TeamActivity[]>([]);

  const load = useCallback(async () => {
    const d = await getCollabOverview();
    if (d) {
      setData(d);
      setFeed(d.activity);
    }
  }, []);

  // Initial load + slow polling fallback (covers reconnects / missed events).
  useEffect(() => {
    if (!account) return;
    void load();
    const t = setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, [account, load]);

  // Heartbeat so this agent shows as online to the team.
  useEffect(() => {
    if (!account) return;
    void sendHeartbeat();
    const t = setInterval(() => void sendHeartbeat(), 15000);
    return () => clearInterval(t);
  }, [account]);

  // Live SSE feed.
  useEffect(() => {
    if (!account) return;
    const es = new EventSource(collabStreamUrl());
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "ping" || msg.type === "hello") return;
        if (msg.type === "presence") {
          void load();
          return;
        }
        if (msg.activity) {
          setFeed((prev) => [msg.activity as TeamActivity, ...prev].slice(0, 80));
          // Refresh roster counts on lifecycle changes (debounced by SSE cadence).
          void load();
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => es.close();
  }, [account, load]);

  const byDept = useMemo(() => {
    const m = new Map<string, CollabAgent[]>();
    for (const a of data?.agents ?? []) {
      if (!m.has(a.department)) m.set(a.department, []);
      m.get(a.department)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

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
        title="Team"
        subtitle="Live agent collaboration"
        role={account.role as "admin" | "agent"}
        onRefresh={() => void load()}
      >
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
            (live
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-border bg-secondary/50 text-muted-foreground")
          }
          title={live ? "Live updates connected" : "Reconnecting…"}
        >
          <Radio className={"size-3 " + (live ? "animate-pulse" : "")} />
          {live ? "Live" : "Offline"}
        </span>
      </AdminHeader>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Agents online" value={data?.online_count ?? 0} tone="online" />
          <Stat label="Open cases" value={data?.open_cases ?? 0} />
          <Stat label="Team members" value={data?.agents.length ?? 0} />
          <Stat label="Recent notes" value={data?.notes.length ?? 0} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Roster grouped by department */}
          <div>
            <h2 className="mb-3 text-sm font-semibold">Roster</h2>
            <div className="space-y-5">
              {byDept.map(([dept, agents]) => (
                <div key={dept}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {dept}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">
                      {agents.filter((a) => a.online).length}/{agents.length} online
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {agents.map((a) => (
                      <AgentCard key={a.id} a={a} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live activity + notes */}
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 text-sm font-semibold">Live activity</h2>
              <div className="space-y-2">
                {feed.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    No team activity yet. Escalations, replies, handoffs, and notes appear here in real time.
                  </p>
                )}
                {feed.slice(0, 40).map((ev) => (
                  <ActivityRow key={ev.id} ev={ev} />
                ))}
              </div>
            </div>

            {data?.notes && data.notes.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-semibold">Recent team notes</h2>
                <div className="space-y-2">
                  {data.notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{n.author_name}</span>
                        <span className="text-[10px] text-muted-foreground">{relativeTime(n.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "online" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={"mt-1 text-2xl font-semibold tabular-nums " + (tone === "online" ? "text-emerald-500" : "")}>
        {value}
      </p>
    </div>
  );
}

function AgentCard({ a }: { a: CollabAgent }) {
  const load = Math.min(a.open_cases, 5);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Circle
            className={"size-2.5 shrink-0 " + (a.online ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground/30 text-muted-foreground/30")}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{a.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{a.title}</p>
          </div>
        </div>
        {a.level === "manager" && <Badge variant="secondary">mgr</Badge>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5" title={`${a.open_cases} open case(s)`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={"h-1.5 w-4 rounded-full " + (i < load ? "bg-primary" : "bg-secondary")}
            />
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {a.open_cases} open · {a.online ? "online" : relativeTime(a.last_seen)}
        </span>
      </div>
    </div>
  );
}

function activityStyle(kind: string) {
  switch (kind) {
    case "escalation_created":
      return { Icon: UserPlus, cls: "text-sky-400" };
    case "escalation_resolved":
      return { Icon: CheckCircle2, cls: "text-emerald-500" };
    case "escalation_handoff":
      return { Icon: ArrowUpRight, cls: "text-amber-400" };
    case "agent_reply":
      return { Icon: MessageSquare, cls: "text-primary" };
    case "case_note":
      return { Icon: StickyNote, cls: "text-violet-400" };
    default:
      return { Icon: Circle, cls: "text-muted-foreground" };
  }
}

function ActivityRow({ ev }: { ev: TeamActivity }) {
  const { Icon, cls } = activityStyle(ev.kind);
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      <Icon className={"mt-0.5 size-4 shrink-0 " + cls} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{ev.summary}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{relativeTime(ev.created_at)}</p>
      </div>
    </div>
  );
}
