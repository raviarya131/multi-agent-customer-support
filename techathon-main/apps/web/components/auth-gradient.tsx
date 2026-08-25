/**
 * Animated gradient shift: a large multi-stop gradient built from the theme
 * palette that slowly pans across the canvas, so the whole background cycles
 * through the theme hues. Softened in light mode; motion respects
 * prefers-reduced-motion via the .animate-gradient rule in globals.css.
 */
export function AuthGradient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="animate-gradient absolute inset-0 opacity-60 blur-[60px] dark:opacity-95"
        style={{
          background:
            "linear-gradient(120deg, oklch(var(--primary) / 0.5), oklch(var(--chart-2) / 0.45), oklch(var(--chart-4) / 0.45), oklch(var(--chart-1) / 0.5), oklch(var(--primary) / 0.5))",
        }}
      />
    </div>
  );
}
