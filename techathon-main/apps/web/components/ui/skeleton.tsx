import { cn } from "@/lib/utils";

/** Shimmering placeholder block. Compose several to mirror real content shape. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}
