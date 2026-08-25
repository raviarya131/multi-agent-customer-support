/**
 * Aurora waves: wide, heavily-blurred bands of theme color that slide sideways
 * inside a rotated frame, so they read as gentle diagonal curtains of light.
 * Softened in light mode; motion respects prefers-reduced-motion via the
 * .animate-aurora rule in globals.css.
 */
export function AuthAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-[-25%] rotate-[-18deg] opacity-70 blur-[70px] dark:opacity-100">
        <span
          className="animate-aurora absolute left-0 top-[8%] h-[26%] w-[140%]"
          style={{
            background: "linear-gradient(90deg, transparent, oklch(var(--primary) / 0.6), transparent)",
            ["--dur" as string]: "28s",
          }}
        />
        <span
          className="animate-aurora absolute left-0 top-[36%] h-[24%] w-[140%]"
          style={{
            background: "linear-gradient(90deg, transparent, oklch(var(--chart-2) / 0.5), transparent)",
            ["--dur" as string]: "36s",
            animationDirection: "reverse",
          }}
        />
        <span
          className="animate-aurora absolute left-0 top-[60%] h-[28%] w-[140%]"
          style={{
            background: "linear-gradient(90deg, transparent, oklch(var(--chart-4) / 0.5), transparent)",
            ["--dur" as string]: "44s",
          }}
        />
        <span
          className="animate-aurora absolute left-0 top-[80%] h-[22%] w-[140%]"
          style={{
            background: "linear-gradient(90deg, transparent, oklch(var(--chart-1) / 0.45), transparent)",
            ["--dur" as string]: "32s",
            animationDirection: "reverse",
          }}
        />
      </div>
    </div>
  );
}
