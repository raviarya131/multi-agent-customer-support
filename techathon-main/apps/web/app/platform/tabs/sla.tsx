"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platform } from "@/lib/api";
import type { SlaConfig } from "@/lib/types";

const PRIORITIES = ["P1", "P2", "P3"] as const;
const PRIORITY_HINT: Record<(typeof PRIORITIES)[number], string> = {
  P1: "Critical",
  P2: "High",
  P3: "Normal",
};

// Render hours compactly (e.g. 72 → "3d", 36 → "1d 12h").
function humanHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  const d = Math.floor(h / 24);
  const r = h % 24;
  if (d && r) return `${d}d ${r}h`;
  if (d) return `${d}d`;
  return `${h}h`;
}

export function SlaTab() {
  const [cfg, setCfg] = useState<SlaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await platform.getSla();
    setCfg(data);
    setLoading(false);
    setDirty(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const departments = useMemo(() => (cfg ? Object.keys(cfg.matrix).sort() : []), [cfg]);

  function setHours(dept: string, p: (typeof PRIORITIES)[number], value: string) {
    setCfg((prev) => {
      if (!prev) return prev;
      const n = Math.max(1, Math.min(2160, Math.round(Number(value) || 0)));
      return { ...prev, matrix: { ...prev.matrix, [dept]: { ...prev.matrix[dept], [p]: n } } };
    });
    setDirty(true);
  }

  function setWarnPct(value: string) {
    setCfg((prev) => {
      if (!prev) return prev;
      const pct = Math.max(10, Math.min(95, Math.round(Number(value) || 0)));
      return { ...prev, warn_pct: pct / 100 };
    });
    setDirty(true);
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const out = await platform.putSla(cfg);
    setCfg(out);
    setSaving(false);
    setDirty(false);
    setSavedAt(Date.now());
  }

  if (loading || !cfg) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading SLA policy…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Timer className="size-4 text-primary" /> SLA policy
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            How long a case may sit with its current owner before it breaches and is automatically
            escalated. Set deadlines in <span className="font-medium text-foreground">hours</span> per
            department and priority. When an agent misses the deadline the case is handed up to the
            department manager; if a manager misses it, it goes to the Tier-2 Escalations team and the
            admins are paged.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={saving} title="Discard changes">
            <RotateCcw className="size-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
          </Button>
        </div>
      </div>

      {/* Warning threshold */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Warning threshold</p>
          <p className="text-xs text-muted-foreground">
            Owner gets a heads-up once this much of the window has elapsed.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="number"
            min={10}
            max={95}
            value={Math.round(cfg.warn_pct * 100)}
            onChange={(e) => setWarnPct(e.target.value)}
            className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm outline-none focus:border-ring/60"
          />
          <span className="text-sm text-muted-foreground">% of window</span>
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-card/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Department</th>
              {PRIORITIES.map((p) => (
                <th key={p} className="px-4 py-2.5 text-center font-medium">
                  {p} <span className="font-normal lowercase text-muted-foreground/60">· {PRIORITY_HINT[p]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <tr key={dept} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{dept}</td>
                {PRIORITIES.map((p) => (
                  <td key={p} className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={2160}
                        value={cfg.matrix[dept]?.[p] ?? 0}
                        onChange={(e) => setHours(dept, p, e.target.value)}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-ring/60"
                      />
                      <span className="w-14 text-left text-[11px] text-muted-foreground">
                        {humanHours(cfg.matrix[dept]?.[p] ?? 0)}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Values are in hours (max 2160 = 90 days). Changes apply to cases as the monitor sweeps —
        existing open cases adopt the new deadline on their next check.
        {savedAt && !dirty && <span className="ml-1 text-emerald-500">Saved.</span>}
      </p>
    </div>
  );
}
