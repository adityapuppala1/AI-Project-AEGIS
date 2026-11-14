"use client";
// The visible part of a tour: a dimmed backdrop with a cut-out around the target, and a card with the step. On a phone the
// card is a bottom sheet and the target is scrolled above it. The page behind is not clickable through the backdrop, focus
// moves into the card and stays there (Tab), the arrow keys step, Escape closes, and a polite status line announces each
// step. Motion is a short fade only and is switched off by prefers-reduced-motion (see .tour-card in app/globals.css).
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { useT } from "../language-provider";
import { Button } from "../ui";
import { findTourTarget } from "./tour-target";
import type { TourMenuControl, TourRun } from "./tour-provider";

interface Rect { top: number; left: number; width: number; height: number }
const PAD = 6, GAP = 12, EDGE = 12, SHEET_QUERY = "(max-width: 639px)";
const FOCUSABLE = "button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
// Chrome that is always on screen: scrolling it into view would only move the page.
const isChrome = (element: Element) => Boolean(element.closest(".command-topbar, .desk-strip, #primary-rail"));

export function TourOverlay({ run, menu, menuOpenedByTour, onBack, onNext, onFinish, onStop }: Readonly<{
  run: TourRun; menu: TourMenuControl; menuOpenedByTour: MutableRefObject<boolean>;
  onBack: () => void; onNext: () => void; onFinish: () => void; onStop: () => void;
}>) {
  const t = useT();
  const step = run.steps[run.index];
  const first = run.index === 0, last = run.index === run.steps.length - 1;
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId(), bodyId = useId();
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sheet, setSheet] = useState(false);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  /** Measures the target and the card and decides where each goes. Safe to call at any time. */
  const place = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const asSheet = window.matchMedia(SHEET_QUERY).matches;
    setSheet(current => current === asSheet ? current : asSheet);
    const cardW = card.offsetWidth, cardH = card.offsetHeight;
    const target = step.target ? findTourTarget(step.target) : null;
    const limit = asSheet ? vh - cardH : vh;
    const box = target?.getBoundingClientRect();
    // The part of the target that can be seen, so a tall target never spills under the sheet or off the screen.
    const top = box ? Math.max(box.top, 0) : 0, bottom = box ? Math.min(box.bottom, limit) : 0;
    const left = box ? Math.max(box.left, 0) : 0, right = box ? Math.min(box.right, vw) : 0;
    if (!box || bottom <= top || right <= left) {
      setRect(null);
      setPos(asSheet ? null : { left: Math.max(EDGE, (vw - cardW) / 2), top: Math.max(EDGE, (vh - cardH) / 3) });
      return;
    }
    const next = { top: top - PAD, left: left - PAD, width: right - left + PAD * 2, height: bottom - top + PAD * 2 };
    setRect(current => current && current.top === next.top && current.left === next.left && current.width === next.width && current.height === next.height ? current : next);
    if (asSheet) { setPos(null); return; }
    const x = clamp(next.left, EDGE, vw - cardW - EDGE), y = clamp(next.top, EDGE, vh - cardH - EDGE);
    const below = next.top + next.height + GAP, above = next.top - GAP - cardH, rightSide = next.left + next.width + GAP, leftSide = next.left - GAP - cardW;
    if (below + cardH <= vh - EDGE) setPos({ left: x, top: below });
    else if (above >= EDGE) setPos({ left: x, top: above });
    else if (rightSide + cardW <= vw - EDGE) setPos({ left: rightSide, top: y });
    else if (leftSide >= EDGE) setPos({ left: leftSide, top: y });
    else setPos({ left: vw - cardW - EDGE, top: vh - cardH - EDGE });
  }, [step.target]);

  // On a new step: open or close the phone menu when the target needs it, bring the target into view above the sheet, and
  // measure a few times while the page and the drawer settle.
  useEffect(() => {
    const target = step.target ? findTourTarget(step.target) : null;
    const control = menuRef.current;
    const inRail = Boolean(target?.closest("#primary-rail"));
    const timers: number[] = [];
    if (!control.persistent) {
      if (inRail && !control.isOpen) {
        menuOpenedByTour.current = true; control.open();
        // Opening the drawer moves focus to its close button; the card takes it back.
        timers.push(window.setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 90));
      } else if (!inRail && menuOpenedByTour.current) {
        menuOpenedByTour.current = false; control.close();
        // The shell returns focus to the menu button once the drawer has closed; the card takes it back.
        timers.push(window.setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 90));
      }
    }
    if (target) {
      try {
        if (inRail) target.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
        else if (!isChrome(target)) target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" as ScrollBehavior });
      } catch { /* an element that cannot scroll is still pointed at */ }
      if (window.matchMedia(SHEET_QUERY).matches && !inRail && !isChrome(target) && cardRef.current) {
        const box = target.getBoundingClientRect(), limit = window.innerHeight - cardRef.current.offsetHeight - 8;
        const delta = Math.min(box.bottom - limit, box.top - 72);
        if (delta > 0) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
      }
    }
    place();
    for (const ms of [60, 160, 320, 520]) timers.push(window.setTimeout(place, ms));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [step, place, menuOpenedByTour]);

  // Keep the cut-out on the target when the window or any scroll area moves.
  useEffect(() => {
    const target = step.target ? findTourTarget(step.target) : null;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    if (target) observer?.observe(target);
    if (cardRef.current) observer?.observe(cardRef.current);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); observer?.disconnect(); };
  }, [step, place]);

  // Focus enters the card and stays in it. The capture phase runs before the phone drawer's own Tab handling.
  useLayoutEffect(() => { cardRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) card.focus({ preventScroll: true });
  }, [run.index]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onStop(); return; }
      const inside = card.contains(document.activeElement), neutral = document.activeElement === document.body;
      if (event.key === "Tab") {
        const stops = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
        event.preventDefault(); event.stopImmediatePropagation();
        if (stops.length === 0) { card.focus(); return; }
        const at = inside ? stops.indexOf(document.activeElement as HTMLElement) : -1;
        const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at < 0 || at === stops.length - 1 ? 0 : at + 1);
        stops[next].focus();
        return;
      }
      if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && (inside || neutral) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === "ArrowRight") { if (last) onFinish(); else onNext(); } else if (!first) onBack();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [first, last, onBack, onNext, onFinish, onStop]);

  const walking = run.mode === "all" && run.page;
  const eyebrow = walking ? `${t("Page")} ${run.page!.at} / ${run.page!.total} · ${t(run.title)}` : t(run.title);
  const progress = `${t("Step")} ${run.index + 1} / ${run.steps.length}`;
  const nextLabel = !last ? t("Next") : walking && run.page!.next ? `${t("Next page")}: ${t(run.page!.next.label)}` : t("Finish");
  const placed = sheet ? undefined : pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 };
  // Rendered where the provider sits, outside the shell's own wrapper, so the phone drawer making the page inert does not reach it.
  return <>
    <div className="tour-blocker no-print" aria-hidden="true" />
    {rect ? <div className="tour-spot no-print" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} /> : <div className="tour-scrim no-print" aria-hidden="true" />}
    <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1} data-sheet={sheet || undefined}
      className="tour-card float no-print" style={placed}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow min-w-0 truncate">{eyebrow}</p>
        <span className="tnum shrink-0 text-xs font-semibold text-muted">{progress}</span>
      </div>
      <h2 id={titleId} className="t-title mt-2 text-base">{t(step.title)}</h2>
      <p id={bodyId} className="mt-1.5 text-sm leading-6">{t(step.body)}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="quiet" size="sm" onClick={onStop}>{walking ? t("Stop tour") : t("Skip tour")}</Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!first && <Button size="sm" onClick={onBack}>{t("Back")}</Button>}
          <Button variant="primary" size="sm" onClick={last ? onFinish : onNext}>{nextLabel}</Button>
        </div>
      </div>
    </div>
    <div className="sr-only" role="status" aria-live="polite">{`${progress}: ${t(step.title)}`}</div>
  </>;
}
