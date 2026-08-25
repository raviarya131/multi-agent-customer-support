"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Save, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platform } from "@/lib/api";
import type { HelpArticle } from "@/lib/types";
import { ErrorNote, SearchSelect } from "../ui";

const STARTER = "# Article title\n\n## A question customers ask\nA short, customer-friendly answer.\n";

export function HelpCenterTab() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { articles } = await platform.listHelp();
    setArticles(articles);
  }, []);
  useEffect(() => void load(), [load]);

  function edit(a: HelpArticle) {
    setSel(a.file);
    setFile(a.file);
    setContent(a.content);
    setErr("");
    setNote("");
  }
  function fresh() {
    setSel(null);
    setFile("");
    setContent(STARTER);
    setErr("");
    setNote("");
  }

  // Load a .md/.markdown/.txt from disk into the editor. The admin reviews it
  // and clicks Save to publish — nothing is uploaded automatically.
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
      setNote(`Loaded "${f.name}" — review and click Save to publish.`);
    } catch {
      setErr("Could not read that file.");
    }
  }

  async function save() {
    setErr("");
    setBusy(true);
    try {
      await platform.putHelp(file, content);
      await load();
      setSel(file);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(f: string) {
    await platform.deleteHelp(f);
    if (sel === f) fresh();
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4 text-primary" /> Help Center
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Customer-facing self-service articles. The Help widget answers customers from{" "}
          <span className="font-medium text-foreground">these articles only</span> (separate from the
          internal knowledge base), using semantic search — so it never exposes internal docs. Edits are
          live on the next question.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown"
            className="hidden"
            onChange={onFilePicked}
          />
          <Button size="sm" variant="outline" className="mb-2 w-full gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-3.5" /> Upload file
          </Button>
          <Button size="sm" variant="outline" className="mb-3 w-full gap-2" onClick={fresh}>
            <Plus className="size-3.5" /> New article
          </Button>
          <SearchSelect
            options={articles.map((a) => ({ value: a.file, label: a.title, hint: a.file }))}
            value={sel}
            onSelect={(f) => {
              const a = articles.find((x) => x.file === f);
              if (a) edit(a);
            }}
            onDelete={(f) => void remove(f)}
            placeholder={articles.length ? `${articles.length} article${articles.length === 1 ? "" : "s"} — choose one` : "No articles yet"}
            searchPlaceholder="Search articles…"
            emptyText="No articles match"
          />
        </div>

        <div className="space-y-3">
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
            placeholder={STARTER}
            rows={18}
            className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-foreground/40"
          />
          {note && <p className="text-xs font-medium text-primary">{note}</p>}
          <ErrorNote msg={err} />
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => void save()} disabled={busy || !file}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save
            </Button>
            <span className="text-xs text-muted-foreground">Use clear H2 headings per question for best search results.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
