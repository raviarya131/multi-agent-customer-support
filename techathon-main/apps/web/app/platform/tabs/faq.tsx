"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircleQuestion, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { platform } from "@/lib/api";
import type { FaqEntry, FaqMatchMode } from "@/lib/types";
import { ErrorNote, Field, Pager, Toggle, usePager } from "../ui";

interface FaqForm { id: string | null; label: string; enabled: boolean; match: FaqMatchMode; triggers: string; answer: string; }
const EMPTY_FAQ: FaqForm = { id: null, label: "", enabled: true, match: "contains", triggers: "", answer: "" };

export function FaqTab() {
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [form, setForm] = useState<FaqForm>(EMPTY_FAQ);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { faqs } = await platform.listFaqs();
    setFaqs(faqs);
  }, []);
  useEffect(() => void load(), [load]);

  function fresh() { setForm(EMPTY_FAQ); setErr(""); }
  function edit(f: FaqEntry) {
    setForm({ id: f.id, label: f.label, enabled: f.enabled, match: f.match, triggers: f.triggers.join("\n"), answer: f.answer });
    setErr("");
  }

  async function save() {
    setErr(""); setBusy(true);
    try {
      const triggers = form.triggers.split("\n").map((s) => s.trim()).filter(Boolean);
      const body = { label: form.label.trim(), enabled: form.enabled, match: form.match, triggers, answer: form.answer.trim() };
      if (form.id) await platform.putFaq(form.id, body);
      else await platform.createFaq(body);
      await load(); fresh();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(id: string) { await platform.deleteFaq(id); if (form.id === id) fresh(); await load(); }
  async function toggleEnabled(f: FaqEntry) {
    await platform.putFaq(f.id, { label: f.label, enabled: !f.enabled, match: f.match, triggers: f.triggers, answer: f.answer });
    await load();
  }

  const { pageItems, ...pager } = usePager(faqs, 5);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div>
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5">
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            FAQs are canned answers checked <span className="font-medium text-foreground">first</span> — before
            intent routing and any specialist agent. When a customer message matches an entry&apos;s triggers, the engine
            replies with its answer and runs nothing else.
          </p>
        </div>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">FAQ entries ({faqs.length})</p>
        {faqs.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No FAQs yet. Add one on the right — e.g. trigger "what are your hours" → answer "We&apos;re open 9–6, Mon–Sat."
          </p>
        )}
        <div className="space-y-2">
          {pageItems.map((f) => (
            <div key={f.id} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{f.label}</span>
                  {f.label.startsWith("Suggested:") && <Badge variant="default">auto-suggested</Badge>}
                  <Badge variant="outline">{f.match}</Badge>
                  {f.enabled ? <Badge variant="success">enabled</Badge> : <Badge variant="secondary">disabled</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => void toggleEnabled(f)} className="text-xs text-muted-foreground hover:text-foreground">
                    {f.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => edit(f)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                  <button onClick={() => void remove(f.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{f.answer}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {f.triggers.slice(0, 6).map((t, i) => <span key={i} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{t}</span>)}
                {f.triggers.length > 6 && <span className="text-[10px] text-muted-foreground">+{f.triggers.length - 6} more</span>}
              </div>
            </div>
          ))}
        </div>
        <Pager {...pager} />
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {form.id ? `Edit FAQ "${form.label || "entry"}"` : "New FAQ"}
        </p>
        <Field label="Label (internal name)">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Store hours" className="input" />
        </Field>
        <Field label="Match mode">
          <select value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value as FaqMatchMode })} className="input">
            <option value="contains">contains — message includes the phrase</option>
            <option value="exact">exact — message equals the phrase</option>
            <option value="regex">regex — advanced pattern</option>
          </select>
        </Field>
        <Field label="Trigger phrases (one per line)">
          <textarea value={form.triggers} onChange={(e) => setForm({ ...form, triggers: e.target.value })} rows={4} placeholder={"what are your hours\nwhen are you open\nopening hours"} className="input" />
        </Field>
        <Field label="Answer (sent to the customer verbatim)">
          <textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} rows={4} placeholder="We're open 9am–6pm, Monday to Saturday." className="input" />
        </Field>
        <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" hint="Only enabled FAQs are matched against incoming messages." />
        <ErrorNote msg={err} />
        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={() => void save()} disabled={busy || !form.label.trim() || !form.triggers.trim() || !form.answer.trim()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {form.id ? "Save FAQ" : "Create FAQ"}
          </Button>
          <Button size="sm" variant="outline" onClick={fresh}>Clear</Button>
        </div>
        {form.match === "regex" && <p className="text-xs text-muted-foreground">Regex is matched case-insensitively. Invalid patterns simply never match.</p>}
      </div>
    </div>
  );
}
