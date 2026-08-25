"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, Trash2, X } from "lucide-react";

// ── Pagination ────────────────────────────────────────────────────────────────
// Slices a list into pages and exposes the controls. Pair with <Pager/>.
export function usePager<T>(items: T[], initialPageSize = 5) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(0);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Keep the page in range when the list shrinks (filter/delete).
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = useMemo(
    () => items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [items, safePage, pageSize],
  );
  return { pageItems, page: safePage, setPage, pageSize, setPageSize, total, totalPages };
}

export function Pager({
  page,
  totalPages,
  pageSize,
  total,
  setPage,
  setPageSize,
  options = [5, 10, 25, 50, 100],
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
  options?: number[];
}) {
  if (total === 0) return null;
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
      <label className="flex items-center gap-1.5">
        Rows per page:
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(0);
          }}
          className="rounded-md border border-border bg-card px-1.5 py-1 text-xs outline-none focus:border-ring/60"
        >
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {start}–{end} of {total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="rounded p-1 transition-colors hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent"
            title="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="rounded p-1 transition-colors hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Searchable select ───────────────────────────────────────────────────────
// A dropdown with a search bar and a scrollable list. Used to pick from long
// lists (KB docs, tools) without rendering everything inline.
export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

export function SearchSelect({
  options,
  value,
  onSelect,
  onDelete,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
}: {
  options: SearchOption[];
  value: string | null;
  onSelect: (value: string) => void;
  onDelete?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    // Focus the search box when the panel opens.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          (o.hint ?? "").toLowerCase().includes(q),
      )
    : options;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm outline-none transition-colors hover:border-foreground/30 focus:border-ring/60"
      >
        <span className={"min-w-0 truncate " + (selected ? "" : "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={"size-4 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">{filtered.length}</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  className={
                    "group flex items-center gap-2 px-2.5 py-1.5 text-sm " +
                    (o.value === value ? "bg-secondary" : "hover:bg-secondary/50")
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(o.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {o.value === value ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{o.hint}</span>}
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(o.value)}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Multi-select variant of SearchSelect: a dropdown with a search bar and a
// scrollable, checkbox-style list. Selected items render as removable chips
// beneath the trigger. The panel stays open so several items can be toggled.
export function MultiSearchSelect({
  options,
  values,
  onToggle,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
}: {
  options: SearchOption[];
  values: string[];
  onToggle: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  const selectedSet = new Set(values);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.value.toLowerCase().includes(q) ||
          (o.hint ?? "").toLowerCase().includes(q),
      )
    : options;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm outline-none transition-colors hover:border-foreground/30 focus:border-ring/60"
      >
        <span className={"min-w-0 truncate " + (values.length ? "" : "text-muted-foreground")}>
          {values.length ? `${values.length} selected` : placeholder}
        </span>
        <ChevronDown className={"size-4 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">{filtered.length}</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((o) => {
                const on = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onToggle(o.value)}
                    className={
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm " +
                      (on ? "bg-secondary" : "hover:bg-secondary/50")
                    }
                  >
                    <span
                      className={
                        "flex size-4 shrink-0 items-center justify-center rounded border " +
                        (on ? "border-primary bg-primary text-primary-foreground" : "border-border")
                      }
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 truncate">{o.label}</span>
                    {o.hint && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{o.hint}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px]">
              {options.find((o) => o.value === v)?.label ?? v}
              <button
                type="button"
                onClick={() => onToggle(v)}
                className="text-muted-foreground hover:text-destructive"
                title="Remove"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorNote({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {msg}
    </p>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-secondary/30">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
          (checked ? "bg-primary" : "bg-secondary")
        }
      >
        <span
          className={
            "inline-block size-4 transform rounded-full bg-background shadow transition-transform " +
            (checked ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </button>
    </label>
  );
}

export function ThresholdField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="font-mono text-sm tabular-nums text-primary">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
