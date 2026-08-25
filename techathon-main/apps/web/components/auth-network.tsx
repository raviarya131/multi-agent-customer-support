"use client";
import { useEffect, useRef } from "react";

/**
 * "Constellation" / moving-chains animation rendered on a canvas: a field of
 * slowly drifting nodes that draw links to nearby neighbours, so the connections
 * form and break as points move. Colored in terracotta (the brand primary) — a
 * lighter, warmer shade on dark backgrounds and a deeper, lower-alpha shade on
 * light ones so it stays rich rather than washed-out in both modes. Motion is
 * disabled under prefers-reduced-motion.
 */
export function AuthNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const LINK_DIST = 140;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let nodes: { x: number; y: number; vx: number; vy: number }[] = [];
    let raf = 0;

    // Terracotta, tuned per theme: a warm light shade on dark, a deeper shade
    // with lower alpha on light (keeps it rich instead of muddy on white).
    function style() {
      const dark = document.documentElement.classList.contains("dark");
      return dark
        ? { base: "205, 116, 76", lineMax: 0.34, dotMax: 0.7 }
        : { base: "158, 74, 40", lineMax: 0.42, dotMax: 0.8 };
    }

    function seed() {
      const target = Math.max(26, Math.min(90, Math.round(width / 16)));
      nodes = Array.from({ length: target }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
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
      const { base, lineMax, dotMax } = style();
      ctx!.clearRect(0, 0, width, height);

      if (animate) {
        for (const n of nodes) {
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK_DIST) {
            ctx!.strokeStyle = `rgba(${base}, ${(1 - dist / LINK_DIST) * lineMax})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx!.fillStyle = `rgba(${base}, ${dotMax})`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }

      if (animate) raf = requestAnimationFrame(() => paint(true));
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Repaint a static frame on theme toggle when motion is reduced.
    const mo = new MutationObserver(() => {
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
