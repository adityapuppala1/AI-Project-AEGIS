"use client";

import { useEffect, useRef, useState } from "react";

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that eases to its new value when the value CHANGES. The first value is shown as it is: a figure that
 * has not changed does not perform. Jumps straight to the value under prefers-reduced-motion.
 */
export function useCountUp(value: number, durationMs = 450): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || prefersReducedMotion()) { setShown(value); return; }
    let frame = 0; const began = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - began) / durationMs);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);
  return shown;
}

/** Wall clock that refreshes on an interval (default one minute). `fixed` pins it for tests and previews. */
export function useNow(fixed?: number, intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(fixed ?? null);
  useEffect(() => {
    if (fixed !== undefined) { setNow(fixed); return; }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [fixed, intervalMs]);
  return now;
}
