"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LifeBuoy, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askHelp, listHelpFaqs } from "@/lib/api";
import type { HelpAnswer, PublicFaq } from "@/lib/types";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  sources?: { title: string; file: string }[];
  suggestEscalation?: boolean;
}

const GREETING: ChatTurn = {
  role: "assistant",
  text: "Hi! Ask me about returns, refunds, billing, your account, or support hours — I'll answer instantly. If I can't help, I'll connect you to our team.",
};

/**
 * Floating self-service Help widget. Answers from the customer-facing Help
 * Center (no ticket created). When it can't answer, it offers a hand-off to the
 * real support flow via `onTalkToSupport`.
 */
export function HelpWidget({ onTalkToSupport }: { onTalkToSupport?: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [faqs, setFaqs] = useState<PublicFaq[]>([]);
  const [faqsOpen, setFaqsOpen] = useState(true);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const faqsLoaded = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastQuestion = useRef("");

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, open, loading]);

  // Fetch the browsable FAQ list once, the first time the widget is opened.
  useEffect(() => {
    if (!open || faqsLoaded.current) return;
    faqsLoaded.current = true;
    listHelpFaqs()
      .then(({ faqs }) => setFaqs(faqs))
      .catch(() => setFaqs([]));
  }, [open]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    lastQuestion.current = q;
    setTurns((t) => [...t, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const res: HelpAnswer = await askHelp(q);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: res.answer,
          sources: res.source === "kb" ? res.sources : undefined,
          suggestEscalation: res.suggestEscalation || !res.answered,
        },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: "Something went wrong reaching the help service. You can still talk to our support team.",
          suggestEscalation: true,
        },
      ]);
    }
    setLoading(false);
  }

  function talkToSupport() {
    onTalkToSupport?.(lastQuestion.current || "");
    setOpen(false);
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Get instant help"
          className="animate-rise fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <Sparkles className="size-4" />
          Help
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="animate-rise fixed bottom-6 right-6 z-40 flex h-[34rem] max-h-[80vh] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <div>
                <p className="text-sm font-semibold leading-tight">Help Center</p>
                <p className="text-[11px] text-muted-foreground">Instant answers · no ticket needed</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {/* Browsable FAQ list — scan answers before asking or raising a ticket. */}
            {faqs.length > 0 && (
              <div className="rounded-xl border border-border bg-background">
                <button
                  onClick={() => setFaqsOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <LifeBuoy className="size-3.5 text-primary" />
                    Browse FAQs ({faqs.length})
                  </span>
                  <ChevronDown className={"size-4 text-muted-foreground transition-transform " + (faqsOpen ? "rotate-180" : "")} />
                </button>
                {faqsOpen && (
                  <div className="border-t border-border px-2 pb-2 pt-1">
                    {faqs.map((f) => {
                      const expanded = expandedFaq === f.id;
                      return (
                        <div key={f.id} className="border-b border-border/60 last:border-0">
                          <button
                            onClick={() => setExpandedFaq(expanded ? null : f.id)}
                            className="flex w-full items-center justify-between gap-2 px-1.5 py-2 text-left text-xs font-medium hover:text-primary"
                          >
                            <span>{f.label}</span>
                            <ChevronDown className={"size-3.5 shrink-0 text-muted-foreground transition-transform " + (expanded ? "rotate-180" : "")} />
                          </button>
                          {expanded && (
                            <p className="whitespace-pre-wrap px-1.5 pb-2.5 text-xs text-muted-foreground">{f.answer}</p>
                          )}
                        </div>
                      );
                    })}
                    <p className="px-1.5 pt-2 text-[11px] text-muted-foreground">
                      Didn&apos;t find your answer? Ask below or talk to support.
                    </p>
                  </div>
                )}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm " +
                    (t.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background")
                  }
                >
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.sources && t.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.sources.map((s) => (
                        <span
                          key={s.file}
                          className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.suggestEscalation && (
                    <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-xs" onClick={talkToSupport}>
                      <LifeBuoy className="size-3.5" /> Talk to support
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Searching help articles…
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-1.5 focus-within:border-ring/60">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Ask a question…"
                className="max-h-24 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button size="icon" className="size-8 shrink-0 rounded-lg" onClick={() => void send()} disabled={loading || !input.trim()}>
                <Send className="size-3.5" />
              </Button>
            </div>
            <button
              onClick={talkToSupport}
              className="mt-2 w-full text-center text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Prefer a person? Talk to support →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
