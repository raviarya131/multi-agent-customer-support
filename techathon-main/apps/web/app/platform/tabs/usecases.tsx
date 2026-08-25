"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { platform } from "@/lib/api";
import type { StoredUseCase } from "@/lib/types";
import { ErrorNote, Field, MultiSearchSelect, Pager, usePager } from "../ui";

interface UseCaseForm {
  use_case_id: string;
  description: string;
  prompt: string;
  utterances: string;
  tools: string[];
  kbFiles: string[];
  canAskUser: boolean;
}

const EMPTY_FORM: UseCaseForm = {
  use_case_id: "",
  description: "",
  prompt: "",
  utterances: "",
  tools: [],
  kbFiles: [],
  canAskUser: true,
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function UseCasesTab() {
  const [agents, setAgents] = useState<string[]>([]);
  const [items, setItems] = useState<StoredUseCase[]>([]);
  const [agent, setAgent] = useState("");
  const [mode, setMode] = useState<"form" | "json">("form");
  const [form, setForm] = useState<UseCaseForm>(EMPTY_FORM);
  const [json, setJson] = useState("");
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [availableKb, setAvailableKb] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ agents, usecases }, tools, kb] = await Promise.all([
      platform.listUseCases(),
      platform.listTools(),
      platform.listKb(),
    ]);
    setAgents(agents);
    setItems(usecases);
    setAvailableTools([...tools.builtins.map((t) => t.name), ...tools.declarative.map((t) => t.name)]);
    setAvailableKb(kb.docs.map((d) => d.file));
    if (!agent && agents.length) setAgent(agents[0]);
  }, [agent]);
  useEffect(() => void load(), [load]);

  function formToDef(f: UseCaseForm) {
    const utterances = f.utterances.split("\n").map((s) => s.trim()).filter(Boolean);
    return {
      use_case_id: f.use_case_id.trim(),
      description: f.description.trim(),
      example_utterances: utterances,
      prompt: f.prompt.trim(),
      capabilities: {
        tools: f.tools,
        knowledge_base: f.kbFiles.map((knowledge_file) => ({ knowledge_file })),
        can_ask_user: f.canAskUser,
      },
    };
  }

  async function save() {
    setErr(""); setBusy(true);
    try {
      const def = mode === "form" ? formToDef(form) : JSON.parse(json);
      await platform.putUseCase(agent, def);
      await load();
      setForm(EMPTY_FORM);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(a: string, id: string) { await platform.deleteUseCase(a, id); await load(); }
  function editInForm(u: StoredUseCase) {
    setAgent(u.agent);
    setMode("form");
    setForm({
      use_case_id: u.def.use_case_id,
      description: u.def.description ?? "",
      prompt: (u.def as any).prompt ?? "",
      utterances: (u.def.example_utterances ?? []).join("\n"),
      tools: u.def.capabilities?.tools ?? [],
      kbFiles: (u.def.capabilities?.knowledge_base ?? []).map((k) => k.knowledge_file),
      canAskUser: (u.def.capabilities as any)?.can_ask_user ?? true,
    });
  }

  const { pageItems, ...pager } = usePager(items, 5);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_420px]">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Registered use cases ({items.length})
        </p>
        <div className="space-y-2">
          {pageItems.map((u) => (
            <div key={`${u.agent}/${u.def.use_case_id}`} className="rounded-lg border border-border px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{u.agent}</Badge>
                  <span className="text-sm font-medium">{u.def.use_case_id}</span>
                  {u.def.enabled === false && <Badge variant="secondary">disabled</Badge>}
                </div>
                <button onClick={() => void remove(u.agent, u.def.use_case_id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {u.def.description && <p className="mt-1 text-xs text-muted-foreground">{u.def.description}</p>}
              <div className="mt-1 flex flex-wrap gap-1">
                {(u.def.capabilities?.tools ?? []).map((t) => (
                  <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{t}</span>
                ))}
                {(u.def.capabilities?.knowledge_base ?? []).map((k) => (
                  <span key={k.knowledge_file} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">KB:{k.knowledge_file}</span>
                ))}
              </div>
              <button onClick={() => editInForm(u)} className="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline">
                Edit →
              </button>
            </div>
          ))}
        </div>
        <Pager {...pager} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Agent</label>
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className="input max-w-[140px]">
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="ml-auto flex rounded-md border border-border p-0.5 text-xs">
            {(["form", "json"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { if (m === "json") setJson(JSON.stringify(formToDef(form), null, 2)); setMode(m); }}
                className={"rounded px-2 py-1 capitalize " + (mode === m ? "bg-secondary text-foreground" : "text-muted-foreground")}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {mode === "form" ? (
          <div className="space-y-3">
            <Field label="Use case id (e.g. reset_password)">
              <input value={form.use_case_id} onChange={(e) => setForm({ ...form, use_case_id: e.target.value })} placeholder="reset_password" className="input" />
            </Field>
            <Field label="Description">
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this use case handles" className="input" />
            </Field>
            <Field label="Example utterances (one per line)">
              <textarea value={form.utterances} onChange={(e) => setForm({ ...form, utterances: e.target.value })} rows={3} placeholder={"I forgot my password\nhow do I reset my login"} className="input" />
            </Field>
            <Field label="Prompt (instructions for the handler)">
              <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={4} className="input" />
            </Field>
            <Field label="Tools">
              {availableTools.length === 0 ? (
                <span className="text-xs text-muted-foreground">No tools available.</span>
              ) : (
                <MultiSearchSelect
                  options={availableTools.map((t) => ({ value: t, label: t }))}
                  values={form.tools}
                  onToggle={(t) => setForm({ ...form, tools: toggle(form.tools, t) })}
                  placeholder="Choose tools…"
                  searchPlaceholder="Search tools…"
                  emptyText="No tools match"
                />
              )}
            </Field>
            <Field label="Knowledge base docs">
              {availableKb.length === 0 ? (
                <span className="text-xs text-muted-foreground">No KB docs available.</span>
              ) : (
                <MultiSearchSelect
                  options={availableKb.map((f) => ({ value: f, label: f }))}
                  values={form.kbFiles}
                  onToggle={(f) => setForm({ ...form, kbFiles: toggle(form.kbFiles, f) })}
                  placeholder="Choose KB docs…"
                  searchPlaceholder="Search docs…"
                  emptyText="No docs match"
                />
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.canAskUser} onChange={(e) => setForm({ ...form, canAskUser: e.target.checked })} />
              Can ask the user follow-up questions
            </label>
          </div>
        ) : (
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={20} className="input font-mono text-xs" />
        )}

        <ErrorNote msg={err} />
        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={() => void save()} disabled={busy || !agent}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save & reload agent
          </Button>
          <Button size="sm" variant="outline" onClick={() => setForm(EMPTY_FORM)}>Clear</Button>
        </div>
      </div>
    </div>
  );
}
