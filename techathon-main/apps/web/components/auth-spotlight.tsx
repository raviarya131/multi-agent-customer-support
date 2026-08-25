/**
 * Faint grid with a soft spotlight that roams across it. The grid lines use the
 * theme --foreground token (so they're visible in both modes), masked to fade at
 * the edges; a blurred primary-tinted radial light drifts over the top. Motion
 * respects prefers-reduced-motion via the .animate-spotlight rule in globals.css.
 */
export function AuthSpotlight() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Grid lines, faded toward the edges. */}
      <div
        className="absolute inset-0 opacity-70 dark:opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(oklch(var(--foreground) / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(var(--foreground) / 0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 90% 90% at 50% 50%, #000 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 90% at 50% 50%, #000 30%, transparent 100%)",
        }}
      />
      {/* Roaming spotlight. */}
      <div
        className="animate-spotlight absolute left-0 top-0 size-[55vw] rounded-full opacity-60 blur-[80px] dark:opacity-100"
        style={{
          background:
            "radial-gradient(circle, oklch(var(--primary) / 0.35), oklch(var(--chart-2) / 0.12) 45%, transparent 70%)",
        }}
      />
    </div>
  );
}
