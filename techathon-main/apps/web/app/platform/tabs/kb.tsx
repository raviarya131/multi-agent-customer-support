"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDashboardTickets, platform } from "@/lib/api";
import type { KbDoc, TicketDashboardRow } from "@/lib/types";
import { ErrorNote, SearchSelect } from "../ui";

export function KbTab() {
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<TicketDashboardRow[]>([]);
  const [suggestTicket, setSuggestTicket] = useState("");
  const [generating, setGenerating] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { docs } = await platform.listKb();
    setDocs(docs);
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void listDashboardTickets().then((all) =>
      setResolved(all.filter((t) => t.status === "resolved" || t.run_count > 0))
    );
  }, []);

  async function generate() {
    if (!suggestTicket) return;
    setErr("");
    setDraftNote("");
    setGenerating(true);
    try {
      const { draft } = await platform.suggestKb({ ticket_id: suggestTicket });
      setSel(null);
      setFile(draft.filename);
      setContent(draft.content);
      setDraftNote(
        draft.source === "llm"
          ? "AI draft loaded — review and edit, then Save to publish."
          : "Draft assembled from the ticket (no LLM configured) — review and edit, then Save."
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function edit(d: KbDoc) { setSel(d.file); setFile(d.file); setContent(d.content); setErr(""); }
  function fresh() { setSel(null); setFile(""); setContent(""); setErr(""); }

  // Load a .md (or .markdown/.txt) file from disk into the editor. The admin
  // reviews it and clicks Save to publish — nothing is uploaded automatically.
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    setErr("");
    if (!/\.(md|markdown|txt)$/i.test(f.name)) {
      setErr("Please choose a .md, .markdown, or .txt file.");
      return;
    }
    try {
      const text = await f.text();
      const filename = f.name.replace(/\.(markdown|txt)$/i, ".md");
      setSel(null);
      setFile(filename);
      setContent(text);
      setDraftNote(`Loaded "${f.name}" — review and click Save to publish.`);
    } catch {
      setErr("Could not read that file.");
    }
  }

  async function save() {
    setErr(""); setBusy(true);
    try { await platform.putKb(file, content); await load(); setSel(file); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(f: string) {
    await platform.deleteKb(f);
    if (sel === f) fresh();
    await load();
  }

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown"
          className="hidden"
          onChange={onFilePicked}
        />
        <Button size="sm" variant="outline" className="mb-3 w-full gap-2" onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-3.5" /> Upload .md file
        </Button>
        <SearchSelect
          options={docs.map((d) => ({ value: d.file, label: d.file, hint: `${d.bytes}b` }))}
          value={sel}
          onSelect={(f) => {
            const d = docs.find((x) => x.file === f);
            if (d) edit(d);
          }}
          onDelete={(f) => void remove(f)}
          placeholder={docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} — choose one` : "No documents yet"}
          searchPlaceholder="Search documents…"
          emptyText="No documents match"
        />
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-medium">Suggest an article from a resolved ticket</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={suggestTicket}
              onChange={(e) => setSuggestTicket(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40"
            >
              <option value="">Choose a ticket…</option>
              {resolved.map((t) => (
                <option key={t.ticket_id} value={t.ticket_id}>
                  {t.display_id} — {t.title?.slice(0, 60) || "(no title)"}
                </option>
              ))}
            </select>
            <Button size="sm" className="gap-2" onClick={() => void generate()} disabled={generating || !suggestTicket}>
              {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Generate draft
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Drafts the article from the ticket&apos;s resolution and findings. Nothing is saved until you review and click Save.
          </p>
          {draftNote && <p className="mt-1.5 text-xs font-medium text-primary">{draftNote}</p>}
        </div>

        <input
          value={file}
          onChange={(e) => setFile(e.target.value)}
          placeholder="filename.md"
          disabled={!!sel}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="# Heading&#10;Markdown content the agents can retrieve…"
          rows={18}
          className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-foreground/40"
        />
        <ErrorNote msg={err} />
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2" onClick={() => void save()} disabled={busy || !file}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
          </Button>
          <span className="text-xs text-muted-foreground">Edits are live on the next ticket.</span>
        </div>
      </div>
    </div>
  );
}
