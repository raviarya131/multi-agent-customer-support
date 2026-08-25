"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Scale, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platform } from "@/lib/api";
import type { PolicyConfig } from "@/lib/types";
import { ErrorNote, ThresholdField, Toggle } from "../ui";

export function PoliciesTab() {
  const [cfg, setCfg] = useState<PolicyConfig | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { void platform.getPolicies().then(({ policies }) => setCfg(policies)); }, []);

  async function save() {
    if (!cfg) return;
    setErr(""); setBusy(true); setSaved(false);
    try {
      const { policies } = await platform.putPolicies(cfg);
      setCfg(policies);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!cfg) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading policies…
      </div>
    );
  }

  const rules = cfg.escalation.rules;
  const setRule = (k: keyof PolicyConfig["escalation"]["rules"], v: boolean) =>
    setCfg({ ...cfg, escalation: { rules: { ...rules, [k]: v } } });

  return (
    <div className="space-y-6">
      {/* Hard checks */}
      <section className="rounded-xl border border-border bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="size-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Hard checks</h3>
          <span className="text-xs text-muted-foreground">Explicit phrases that force an escalation</span>
          <div className="ml-auto w-36">
            <Toggle
              checked={cfg.guard.enabled}
              onChange={(v) => setCfg({ ...cfg, guard: { ...cfg.guard, enabled: v } })}
              label={cfg.guard.enabled ? "Enabled" : "Disabled"}
            />
          </div>
        </div>
        <div className="space-y-2">
          {cfg.guard.signals.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={s.phrase}
                onChange={(e) => { const signals = [...cfg.guard.signals]; signals[i] = { ...signals[i], phrase: e.target.value }; setCfg({ ...cfg, guard: { ...cfg.guard, signals } }); }}
                placeholder="phrase (substring, case-insensitive)"
                className="input flex-1"
              />
              <input
                value={s.category}
                onChange={(e) => { const signals = [...cfg.guard.signals]; signals[i] = { ...signals[i], category: e.target.value }; setCfg({ ...cfg, guard: { ...cfg.guard, signals } }); }}
                placeholder="category"
                className="input max-w-[180px]"
              />
              <button onClick={() => setCfg({ ...cfg, guard: { ...cfg.guard, signals: cfg.guard.signals.filter((_, j) => j !== i) } })} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-3 gap-1.5"
          onClick={() => setCfg({ ...cfg, guard: { ...cfg.guard, signals: [...cfg.guard.signals, { phrase: "", category: "human_request" }] } })}>
          <Plus className="size-3.5" /> Add phrase
        </Button>
      </section>

      {/* Escalation rules */}
      <section className="rounded-xl border border-border bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Escalation rules</h3>
          <span className="text-xs text-muted-foreground">Which conditions are allowed to open a human escalation</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={rules.hard_guard} onChange={(v) => setRule("hard_guard", v)} label="Hard signal match" hint="A hard-check phrase was detected" />
          <Toggle checked={rules.high_severity} onChange={(v) => setRule("high_severity", v)} label="High severity" hint="Impact assessed as high" />
          <Toggle checked={rules.unresolved} onChange={(v) => setRule("unresolved", v)} label="Unresolved by agents" hint="Investigation could not resolve it" />
          <Toggle checked={rules.conflicts} onChange={(v) => setRule("conflicts", v)} label="Conflicting findings" hint="Agents disagreed" />
          <Toggle checked={rules.specialist_handoff} onChange={(v) => setRule("specialist_handoff", v)} label="Specialist handoff" hint="A specialist explicitly requested a human" />
          <Toggle checked={rules.frustration_repeat} onChange={(v) => setRule("frustration_repeat", v)} label="Frustration + repeat" hint="Frustrated tone on a repeat/unresolved contact" />
        </div>
      </section>

      {/* Intent router */}
      <section className="rounded-xl border border-border bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Scale className="size-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">Intent router</h3>
          <span className="text-xs text-muted-foreground">Confidence thresholds for routing</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ThresholdField
            label="Multi-issue threshold"
            hint="A domain counts toward a multi-issue split at/above this confidence."
            value={cfg.intents.multi_threshold}
            onChange={(v) => setCfg({ ...cfg, intents: { ...cfg.intents, multi_threshold: v } })}
          />
          <ThresholdField
            label="Fallback threshold"
            hint="Below this top confidence, route to the safe policy review instead of guessing."
            value={cfg.intents.fallback_threshold}
            onChange={(v) => setCfg({ ...cfg, intents: { ...cfg.intents, fallback_threshold: v } })}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Per-domain routing keywords live on each specialist (Specialists tab).</p>
      </section>

      <ErrorNote msg={err} />
      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-2" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save policies
        </Button>
        {saved && <span className="text-xs text-emerald-500">Saved — live on the next ticket.</span>}
      </div>
    </div>
  );
}
