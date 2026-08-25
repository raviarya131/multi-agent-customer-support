/**
 * Animated mesh gradient: four large, heavily-blurred color fields (drawn from
 * the theme palette) that slowly roam and scale. Their overlap reads as a single
 * morphing gradient. Softened in light mode; motion respects
 * prefers-reduced-motion via the .animate-mesh-* rules in globals.css.
 */
export function AuthMesh() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 opacity-70 blur-[64px] dark:opacity-100">
        <span
          className="animate-mesh-a absolute -left-[10%] -top-[10%] size-[55vw] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(var(--primary) / 0.55), transparent 65%)" }}
        />
        <span
          className="animate-mesh-b absolute -right-[10%] -top-[5%] size-[50vw] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(var(--chart-2) / 0.45), transparent 65%)" }}
        />
        <span
          className="animate-mesh-c absolute -bottom-[15%] left-[5%] size-[52vw] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(var(--chart-4) / 0.5), transparent 65%)" }}
        />
        <span
          className="animate-mesh-d absolute -bottom-[10%] -right-[5%] size-[48vw] rounded-full"
          style={{ background: "radial-gradient(circle, oklch(var(--chart-1) / 0.45), transparent 65%)" }}
        />
      </div>
    </div>
  );
}
