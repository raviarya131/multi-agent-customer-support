"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platform } from "@/lib/api";
import type { HttpToolSpec, ToolInfo } from "@/lib/types";
import { ErrorNote, Field, SearchSelect } from "../ui";

const EMPTY_TOOL: HttpToolSpec = {
  name: "",
  description: "",
  method: "GET",
  url_template: "https://api.example.com/resource/{id}",
};

export function ToolsTab() {
  const [builtins, setBuiltins] = useState<ToolInfo[]>([]);
  const [declarative, setDeclarative] = useState<HttpToolSpec[]>([]);
  const [form, setForm] = useState<HttpToolSpec>(EMPTY_TOOL);
  const [hostsText, setHostsText] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { builtins, declarative } = await platform.listTools();
    setBuiltins(builtins);
    setDeclarative(declarative);
  }, []);
  useEffect(() => void load(), [load]);

  function editTool(t: HttpToolSpec) {
    setForm(t);
    setHostsText((t.allowed_hosts ?? []).join(", "));
    setHeadersText(t.headers ? JSON.stringify(t.headers, null, 2) : "");
    setErr("");
  }
  function fresh() { setForm(EMPTY_TOOL); setHostsText(""); setHeadersText(""); setErr(""); }

  async function save() {
    setErr(""); setBusy(true);
    try {
      const spec: Record<string, unknown> = { description: form.description, method: form.method, url_template: form.url_template };
      const hosts = hostsText.split(",").map((s) => s.trim()).filter(Boolean);
      if (hosts.length) spec.allowed_hosts = hosts;
      if (form.timeout_ms) spec.timeout_ms = Number(form.timeout_ms);
      if (headersText.trim()) spec.headers = JSON.parse(headersText);
      await platform.putTool(form.name, spec);
      await load();
      fresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(name: string) { await platform.deleteTool(name); await load(); }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          <p className="text-xs text-muted-foreground">
            HTTP tools are declarative (data, not code). Every call is SSRF-guarded: scheme + host allowlist,
            private/loopback IPs blocked, no redirects, bounded timeout, and only the headers you declare are sent.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Declarative HTTP tools</p>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={fresh}>
              <Plus className="size-3.5" /> New tool
            </Button>
          </div>
          <SearchSelect
            options={declarative.map((t) => ({ value: t.name, label: t.name, hint: t.method }))}
            value={declarative.some((t) => t.name === form.name) ? form.name : null}
            onSelect={(name) => {
              const t = declarative.find((x) => x.name === name);
              if (t) editTool(t);
            }}
            onDelete={(name) => void remove(name)}
            placeholder={declarative.length ? `${declarative.length} tool${declarative.length === 1 ? "" : "s"} — choose one to edit` : "None yet — add one on the right"}
            searchPlaceholder="Search tools…"
            emptyText="No tools match"
          />
          {form.name && declarative.some((t) => t.name === form.name) && (
            <div className="mt-2 rounded-lg border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{form.description || "No description"}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{form.url_template}</p>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Built-in tools (read-only)</p>
          <div className="flex flex-wrap gap-1">
            {builtins.map((t) => <span key={t.name} className="rounded bg-secondary px-2 py-1 text-xs" title={t.description}>{t.name}</span>)}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="weatherLookup" className="input" /></Field>
        <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this tool fetches" className="input" /></Field>
        <Field label="Method">
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as HttpToolSpec["method"] })} className="input">
            {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="URL template ({param} placeholders)">
          <input value={form.url_template} onChange={(e) => setForm({ ...form, url_template: e.target.value })} className="input font-mono text-xs" />
        </Field>
        <Field label="Allowed hosts (comma-separated; defaults to URL host)">
          <input value={hostsText} onChange={(e) => setHostsText(e.target.value)} placeholder="api.example.com" className="input" />
        </Field>
        <Field label="Headers (JSON, optional)">
          <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)} rows={3} placeholder='{ "X-Api-Key": "..." }' className="input font-mono text-xs" />
        </Field>
        <Field label="Timeout ms (optional)">
          <input type="number" value={form.timeout_ms ?? ""} onChange={(e) => setForm({ ...form, timeout_ms: e.target.value ? Number(e.target.value) : undefined })} placeholder="5000" className="input" />
        </Field>
        <ErrorNote msg={err} />
        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={() => void save()} disabled={busy || !form.name}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save tool
          </Button>
          <Button size="sm" variant="outline" onClick={fresh}>Clear</Button>
        </div>
      </div>
    </div>
  );
}
