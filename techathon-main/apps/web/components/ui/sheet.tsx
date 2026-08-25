"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free slide-over panel (drawer). Built on a portal +
 * tailwindcss-animate instead of Radix so the back-office gains a real "open the
 * full record" surface without adding a new package.
 */
export function Sheet({
  open,
  onOpenChange,
  side = "right",
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "right" | "bottom";
  className?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Close on Escape + lock body scroll while open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const panelPos =
    side === "right"
      ? "inset-y-0 right-0 h-full w-full max-w-2xl border-l slide-in-from-right"
      : "inset-x-0 bottom-0 max-h-[88vh] w-full rounded-t-2xl border-t slide-in-from-bottom";

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm duration-200 animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute flex flex-col border-border bg-background shadow-2xl duration-300 animate-in",
          panelPos,
          className
        )}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function SheetHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("shrink-0 border-b border-border px-6 py-4 pr-12", className)}>{children}</div>
  );
}

export function SheetBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}
