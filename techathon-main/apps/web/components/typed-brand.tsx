"use client";
import { useEffect, useState } from "react";

/**
 * A looping typewriter wordmark — types the text out, holds, erases, and repeats,
 * with a blinking caret. Respects prefers-reduced-motion (shows the full text).
 */
export function TypedBrand({
  text = "Support Engine",
  className = "",
}: {
  text?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setDisplay(text);
      return;
    }

    let i = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!deleting) {
        i += 1;
        setDisplay(text.slice(0, i));
        if (i >= text.length) {
          deleting = true;
          timer = setTimeout(tick, 1800); // hold the full word
          return;
        }
        timer = setTimeout(tick, 95); // typing speed
      } else {
        i -= 1;
        setDisplay(text.slice(0, i));
        if (i <= 0) {
          deleting = false;
          timer = setTimeout(tick, 550); // pause before retyping
          return;
        }
        timer = setTimeout(tick, 45); // erasing speed
      }
    };

    timer = setTimeout(tick, 350); // small delay on mount
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <span className={"inline-flex items-center " + className} aria-label={text}>
      <span aria-hidden>{display}</span>
      <span
        aria-hidden
        className="ml-[0.08em] inline-block h-[1.05em] w-[0.07em] min-w-[2px] translate-y-[0.04em] animate-caret-blink rounded-full bg-primary"
      />
    </span>
  );
}
