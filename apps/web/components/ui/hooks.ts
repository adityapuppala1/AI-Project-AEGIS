"use client";

import { useEffect, useState } from "react";

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eased count-up to `value`; jumps straight to the value under prefers-reduced-motion. */
export function useCountUp(value: number, durationMs = 600): number {
  // Start at 0 on both server and client so hydration matches; the effect jumps to the value under reduced motion.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    let frame = 0; const start = performance.now();
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / durationMs);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
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
