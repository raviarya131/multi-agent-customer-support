"use client";
import { useState } from "react";
import { BookOpen, Bot, FileJson, HelpCircle, History, LifeBuoy, MessageCircleQuestion, PanelLeftClose, PanelLeftOpen, Scale, Timer, Users, Wrench, X } from "lucide-react";
import { AdminHeader } from "@/components/admin-nav";
import { useRequireRole } from "@/lib/auth";
import { KbTab } from "./tabs/kb";
import { UseCasesTab } from "./tabs/usecases";
import { HumanAgentsTab } from "./tabs/human-agents";
import { ToolsTab } from "./tabs/tools";
import { SpecialistsTab } from "./tabs/specialists";
import { FaqTab } from "./tabs/faq";
import { PoliciesTab } from "./tabs/policies";
import { AuditTab } from "./tabs/audit";
import { SlaTab } from "./tabs/sla";
import { HelpCenterTab } from "./tabs/helpcenter";

type Tab = "kb" | "usecases" | "tools" | "specialists" | "policies" | "faq" | "helpcenter" | "agents" | "sla" | "audit";

type TabDef = { id: Tab; label: string; icon: typeof BookOpen; description: string };

const GROUPS: { name: string; tabs: TabDef[] }[] = [
  {
    name: "Agents",
    tabs: [
      { id: "specialists", label: "Specialists", icon: Bot, description: "The AI agents the pipeline routes work to. Define each one's tools, knowledge and routing keywords." },
      { id: "usecases", label: "Use cases", icon: FileJson, description: "Specific intents an agent handles, with example utterances and the capabilities it's allowed to use." },
    ],
  },
  {
    name: "Knowledge",
    tabs: [
      { id: "kb", label: "Knowledge base", icon: BookOpen, description: "Markdown documents the agents can retrieve answers from at runtime." },
      { id: "faq", label: "FAQ", icon: MessageCircleQuestion, description: "Canned answers matched by trigger phrases before the agents run — fast paths for common questions." },
      { id: "tools", label: "HTTP tools", icon: Wrench, description: "HTTP endpoints the agents can call to fetch or act on live data." },
      { id: "helpcenter", label: "Help Center", icon: LifeBuoy, description: "Customer-facing self-service articles. The Help widget answers customers from these (and only these) via semantic search, before any ticket is raised." },
    ],
  },
  {
    name: "Governance",
    tabs: [
      { id: "policies", label: "Policies", icon: Scale, description: "Guardrails, escalation rules and routing thresholds that constrain the pipeline." },
      { id: "agents", label: "Human agents", icon: Users, description: "The human specialists who receive escalations, grouped by department and level." },
      { id: "sla", label: "SLA policy", icon: Timer, description: "Per-department, per-priority deadlines (in hours). Misses auto-escalate agent → manager → Tier-2." },
      { id: "audit", label: "Audit log", icon: History, description: "Every config change — who changed what, and when." },
    ],
  },
];

const TABS: TabDef[] = GROUPS.flatMap((g) => g.tabs);

export default function PlatformPage() {
  const account = useRequireRole("admin");
  const [tab, setTab] = useState<Tab>("specialists");
  const [collapsed, setCollapsed] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminHeader title="Platform" subtitle="Live config store — changes hot-reload the agent" role="admin" />

      <div className="mx-auto flex max-w-[1400px]">
        <aside
          className={
            "shrink-0 border-r border-border transition-all duration-200 " +
            (collapsed ? "w-16" : "w-60")
          }
        >
          <div className="sticky top-0 flex flex-col gap-4 p-3">
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex items-center gap-2 self-end rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>

            <nav className="flex flex-col gap-4">
              {GROUPS.map((g) => (
                <div key={g.name} className="flex flex-col gap-1">
                  {!collapsed && (
                    <span className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {g.name}
                    </span>
                  )}
                  {g.tabs.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        title={collapsed ? t.label : undefined}
                        className={
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors " +
                          (collapsed ? "justify-center " : "") +
                          (active
                            ? "bg-secondary font-medium text-foreground"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground")
                        }
                      >
                        <Icon className="size-4 shrink-0" />
                        {!collapsed && <span className="truncate">{t.label}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-6 py-6">
          <div className="mx-auto max-w-5xl">
            {tab === "specialists" && <SpecialistsTab />}
            {tab === "usecases"   && <UseCasesTab />}
            {tab === "policies"   && <PoliciesTab />}
            {tab === "faq"        && <FaqTab />}
            {tab === "helpcenter" && <HelpCenterTab />}
            {tab === "kb"         && <KbTab />}
            {tab === "tools"      && <ToolsTab />}
            {tab === "agents"     && <HumanAgentsTab />}
            {tab === "sla"        && <SlaTab />}
            {tab === "audit"      && <AuditTab />}
          </div>
        </main>
      </div>

      <button
        onClick={() => setDocsOpen(true)}
        title="How to use the platform"
        className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <HelpCircle className="size-5" />
      </button>

      {docsOpen && <DocsModal onClose={() => setDocsOpen(false)} />}
    </div>
  );
}

function DocsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">How to use the platform</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          This is the live config store — every change hot-reloads the agent. Pick a section from the sidebar; here&apos;s what each one does.
        </p>
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.name}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {g.name}
              </p>
              <div className="space-y-2.5">
                {g.tabs.map((t) => {
                  const Icon = t.icon;
                  return (
                    <div key={t.id} className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
