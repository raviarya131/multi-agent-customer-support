import { AuthNetwork } from "@/components/auth-network";

/**
 * Animated backdrop for the auth pages (login / signup): a terracotta
 * moving-chains constellation over a couple of soft terracotta glow orbs.
 * Purely decorative (aria-hidden, no pointer events); motion respects
 * prefers-reduced-motion.
 */
export function AuthBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Soft terracotta glow behind the constellation. */}
      <div
        className="animate-orb absolute -left-24 -top-24 size-[30rem] rounded-full opacity-80 blur-3xl dark:opacity-100"
        style={{
          background: "radial-gradient(circle, oklch(var(--primary) / 0.34), transparent 70%)",
          ["--dx" as string]: "60px",
          ["--dy" as string]: "40px",
          ["--dur" as string]: "26s",
        }}
      />
      <div
        className="animate-orb absolute -bottom-32 -right-24 size-[32rem] rounded-full opacity-80 blur-3xl dark:opacity-100"
        style={{
          background: "radial-gradient(circle, oklch(var(--primary) / 0.22), transparent 70%)",
          ["--dx" as string]: "-50px",
          ["--dy" as string]: "-40px",
          ["--dur" as string]: "34s",
        }}
      />
      {/* Terracotta moving chains. */}
      <AuthNetwork />
    </div>
  );
}
