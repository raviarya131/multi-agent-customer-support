"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminAgents, listEscalations } from "@/lib/api";
import type { EscalationRecord, HumanAgentAdmin } from "@/lib/types";
import { ErrorNote, Field, Pager, usePager } from "../ui";

export function HumanAgentsTab() {
  const [agents, setAgents] = useState<HumanAgentAdmin[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [escalations, setEscalations] = useState<EscalationRecord[]>([]);
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "agent" | "manager">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState<"open" | "resolved" | "all">("all");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [dept, setDept] = useState("");
  const [level, setLevel] = useState<"agent" | "manager">("agent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ agents, departments }, esc] = await Promise.all([adminAgents.list(), listEscalations()]);
    setAgents(agents);
    setDepartments(departments);
    setEscalations(esc.escalations);
    if (!dept && departments.length) setDept(departments[0]);
  }, [dept]);
  useEffect(() => void load(), [load]);

  const visible = useMemo(
    () =>
      agents.filter(
        (a) =>
          (deptFilter === "all" || a.department === deptFilter) &&
          (levelFilter === "all" || a.level === levelFilter) &&
          a.name.toLowerCase().includes(query.toLowerCase())
      ),
    [agents, deptFilter, levelFilter, query]
  );

  const { pageItems, ...pager } = usePager(visible, 5);

  async function create() {
    setErr(""); setBusy(true);
    try {
      await adminAgents.create({ name, title, department: dept, level, email, password: password || undefined });
      setName(""); setTitle(""); setEmail(""); setPassword(""); setLevel("agent");
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-3 space-y-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name…" className="input h-11 w-full text-base" />
          <div className="flex items-center gap-2">
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input flex-1">
              <option value="all">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as "all" | "agent" | "manager")} className="input flex-1">
              <option value="all">All levels</option>
              <option value="agent">Agent (front-line)</option>
              <option value="manager">Manager</option>
            </select>
            <span className="shrink-0 text-xs text-muted-foreground">{visible.length} agents</span>
          </div>
        </div>

        <div className="space-y-2">
          {pageItems.map((a) => {
            const isOpen = expanded === a.id;
            const cases = escalations.filter((e) => e.assignee_id === a.id).filter((e) => (caseFilter === "all" ? true : e.status === caseFilter));
            return (
              <div key={a.id} className="overflow-hidden rounded-lg border border-border">
                <button onClick={() => setExpanded(isOpen ? null : a.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40">
                  {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{a.name}</span>
                      <Badge variant="outline">{a.department}</Badge>
                      {a.level === "manager" && <Badge variant="secondary">Manager</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{a.title} · {a.email ?? "no login"}</p>
                  </div>
                  <div className="flex gap-1.5 text-[11px]">
                    <Badge variant="warning">{a.counts.open} open</Badge>
                    <Badge variant="success">{a.counts.resolved} resolved</Badge>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-card/40 px-3 py-3">
                    <div className="mb-2 flex gap-1">
                      {(["open", "resolved", "all"] as const).map((f) => (
                        <button key={f} onClick={() => setCaseFilter(f)}
                          className={"rounded px-2 py-1 text-xs capitalize " + (caseFilter === f ? "bg-secondary text-foreground" : "text-muted-foreground")}>
                          {f}
                        </button>
                      ))}
                    </div>
                    {cases.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No {caseFilter === "all" ? "" : caseFilter} cases.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {cases.map((e) => (
                          <div key={e.id} className="rounded-md border border-border px-2.5 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium">{e.subject || "(no subject)"}</span>
                              <Badge variant={e.status === "open" ? "warning" : "success"}>{e.status}</Badge>
                            </div>
                            <p className="mt-0.5 text-muted-foreground">{e.customer_name} · {new Date(e.created_at).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Pager {...pager} />
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New escalation agent</p>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" className="input" /></Field>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Billing Specialist" className="input" /></Field>
        <Field label="Department">
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="input">
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Level">
          <select value={level} onChange={(e) => setLevel(e.target.value as "agent" | "manager")} className="input">
            <option value="agent">Agent (front-line)</option>
            <option value="manager">Manager (handles handoffs)</option>
          </select>
        </Field>
        <Field label="Login email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@support.test" className="input" /></Field>
        <Field label="Password (optional — defaults to demo1234)"><input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="demo1234" className="input" /></Field>
        <ErrorNote msg={err} />
        <Button size="sm" className="gap-2" onClick={() => void create()} disabled={busy || !name || !email}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Create agent + login
        </Button>
      </div>
    </div>
  );
}
