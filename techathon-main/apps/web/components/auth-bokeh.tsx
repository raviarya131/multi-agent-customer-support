"use client";
import { useEffect, useRef } from "react";

/**
 * Floating "bokeh" particles: soft, blurred glowing dots that drift slowly
 * upward with a gentle horizontal sway and a subtle twinkle. Colors are read
 * from the theme's --primary and --chart-2 tokens (warm + violet), so the
 * glows look premium on both light and dark backgrounds. Respects
 * prefers-reduced-motion (renders a single static frame).
 */
export function AuthBokeh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let t = 0;
    let colors = ["193, 101, 60", "150, 120, 220"];

    interface P {
      x: number;
      y: number;
      r: number;
      speed: number;
      swayAmp: number;
      swayFreq: number;
      phase: number;
      alpha: number;
      ci: number;
    }
    let parts: P[] = [];

    function readVar(name: string): string {
      try {
        const probe = document.createElement("span");
        probe.style.cssText = `color:oklch(var(${name}));position:absolute;opacity:0;pointer-events:none;`;
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        const m = c.match(/[\d.]+/g);
        if (m && m.length >= 3) return `${Math.round(+m[0])}, ${Math.round(+m[1])}, ${Math.round(+m[2])}`;
      } catch {
        /* ignore */
      }
      return "193, 101, 60";
    }

    function readColors() {
      colors = [readVar("--primary"), readVar("--chart-2")];
    }

    function seed() {
      const target = Math.max(14, Math.min(46, Math.round((width * height) / 26000)));
      parts = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 6 + Math.random() * 34,
        speed: 0.1 + Math.random() * 0.4,
        swayAmp: 8 + Math.random() * 26,
        swayFreq: 0.0004 + Math.random() * 0.0009,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.05 + Math.random() * 0.16,
        ci: Math.random() < 0.7 ? 0 : 1,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function paint(animate: boolean) {
      ctx!.clearRect(0, 0, width, height);
      t += 16;

      for (const p of parts) {
        if (animate) {
          p.y -= p.speed;
          if (p.y + p.r < 0) {
            p.y = height + p.r;
            p.x = Math.random() * width;
          }
        }
        const sway = Math.sin(t * p.swayFreq + p.phase) * p.swayAmp;
        const twinkle = 0.65 + 0.35 * Math.sin(t * 0.0012 + p.phase);
        const cx = p.x + sway;
        const a = p.alpha * twinkle;
        const grad = ctx!.createRadialGradient(cx, p.y, 0, cx, p.y, p.r);
        grad.addColorStop(0, `rgba(${colors[p.ci]}, ${a})`);
        grad.addColorStop(1, `rgba(${colors[p.ci]}, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(cx, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (animate) raf = requestAnimationFrame(() => paint(true));
    }

    readColors();
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const mo = new MutationObserver(() => {
      readColors();
      if (reduce) paint(false);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    paint(!reduce);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
