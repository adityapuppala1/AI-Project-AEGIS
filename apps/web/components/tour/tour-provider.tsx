"use client";
// The tour engine's state: which tour is running, at which step, and how a tour is started, stopped and continued from
// page to page. The visuals are in tour-overlay.tsx. Every page mounts its own app shell (and so its own provider), so the
// "tour all my pages" position is kept in the flag store (lib/tour-storage.ts) and picked up again when the next page mounts.
// Nothing here throws when a target is missing: such a step is skipped, and a tour with nothing to point at shows its first
// step as a centred card.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_TOUR_STATE, markTourDismissed, markTourDone, readTourState, setAllPagesProgress, subscribeTourState, type TourState,
} from "../../lib/tour-storage";
import { WELCOME_TOUR_ID, shouldAutoStartWelcome, stepsFor, tourById, tourForPath, tourPagesFor, type ResolvedStep } from "../../lib/tours";
import { TourOverlay } from "./tour-overlay";
import { findTourTarget } from "./tour-target";

export function useTourState(): TourState {
  return useSyncExternalStore(subscribeTourState, readTourState, () => DEFAULT_TOUR_STATE);
}

export interface TourMenuControl { persistent: boolean; isOpen: boolean; open: () => void; close: () => void }
export interface TourRun { tourId: string; title: string; steps: ResolvedStep[]; index: number; mode: "single" | "all"; /** Position in the all-pages walk, when walking. */ page?: { at: number; total: number; next: { href: string; label: string } | null } }

export interface TourApi {
  run: TourRun | null;
  /** True when the page the person is on has a tour for their role. */
  canTourPage: boolean;
  /** Where an all-pages tour stopped, as "page n of m", or null. */
  resume: { at: number; total: number } | null;
  startWelcome: () => void;
  startPage: () => void;
  startAll: () => void;
  resumeAll: () => void;
  stop: () => void;
}
const NONE: TourApi = { run: null, canTourPage: false, resume: null, startWelcome: () => undefined, startPage: () => undefined, startAll: () => undefined, resumeAll: () => undefined, stop: () => undefined };
const TourContext = createContext<TourApi>(NONE);
export const useTour = () => useContext(TourContext);

const SETTLE_MS = 800, POLL_MS = 120;
export function TourProvider({ roles, pathname, authenticated, menu, children }: Readonly<{
  roles: readonly string[] | null; pathname: string; authenticated: boolean; menu: TourMenuControl; children: ReactNode;
}>) {
  const router = useRouter();
  const state = useTourState();
  const [run, setRun] = useState<TourRun | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const menuOpenedByTour = useRef(false);
  const autoChecked = useRef(false);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const pages = useMemo(() => tourPagesFor(roles), [roles]);
  const pageTour = useMemo(() => tourForPath(pathname), [pathname]);
  const canTourPage = Boolean(roles && authenticated && pageTour && !pageTour.noShell && stepsFor(pageTour, roles).length > 0);
  const resume = useMemo(() => {
    const all = state.all;
    if (!all || all.active) return null;
    const at = pages.findIndex(page => page.href === all.route);
    return at >= 0 ? { at: at + 1, total: pages.length } : null;
  }, [state.all, pages]);

  const closeMenuIfOpenedByTour = useCallback(() => {
    if (menuOpenedByTour.current) { menuOpenedByTour.current = false; menuRef.current.close(); }
  }, []);
  const end = useCallback(() => {
    generation.current += 1;
    window.clearTimeout(timer.current);
    closeMenuIfOpenedByTour();
    setRun(null);
    const back = opener.current;
    opener.current = null;
    // Focus goes back to where the person was (the account menu button, usually) once the card has gone.
    if (back && back.isConnected) window.setTimeout(() => { try { back.focus(); } catch { /* nothing to restore */ } }, 0);
  }, [closeMenuIfOpenedByTour]);

  /** Starts a tour once its targets have had a moment to render; steps whose target never appears are dropped. */
  const begin = useCallback((tourId: string, mode: "single" | "all", pageInfo?: TourRun["page"], from?: HTMLElement | null) => {
    const tour = tourById(tourId);
    if (!tour || !roles) return;
    const wanted = stepsFor(tour, roles);
    if (wanted.length === 0) return;
    window.clearTimeout(timer.current);
    const mine = ++generation.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trigger = document.querySelector<HTMLElement>("[data-account-menu]");
    opener.current = from ?? (!active || active === document.body || active.closest("[role='menu']") ? trigger : active);
    const started = Date.now();
    const attempt = () => {
      if (generation.current !== mine) return;
      const ready = wanted.filter(item => !item.target || findTourTarget(item.target));
      if (ready.length < wanted.length && Date.now() - started < SETTLE_MS) { timer.current = window.setTimeout(attempt, POLL_MS); return; }
      // Nothing to point at: show the first step as a centred card rather than nothing.
      const steps = ready.length > 0 ? ready : [{ ...wanted[0], target: undefined }];
      setRun({ tourId, title: tour.title, steps, index: 0, mode, page: pageInfo });
    };
    timer.current = window.setTimeout(attempt, 60);
  }, [roles]);

  const startWelcome = useCallback(() => { setAllPagesProgress(null); begin(WELCOME_TOUR_ID, "single"); }, [begin]);
  const startPage = useCallback(() => { if (pageTour) begin(pageTour.id, "single"); }, [begin, pageTour]);
  const pageInfoAt = useCallback((at: number): TourRun["page"] => ({ at: at + 1, total: pages.length, next: pages[at + 1] ? { href: pages[at + 1].href, label: pages[at + 1].label } : null }), [pages]);
  const startAll = useCallback(() => {
    if (pages.length === 0) return;
    const first = pages[0];
    setAllPagesProgress({ route: first.href, index: 0, active: true });
    if (first.href === pathname) { const tour = tourForPath(first.href); if (tour) begin(tour.id, "all", pageInfoAt(0)); }
    else router.push(first.href);
  }, [pages, pathname, begin, router, pageInfoAt]);
  const resumeAll = useCallback(() => {
    const all = state.all;
    const at = all ? pages.findIndex(page => page.href === all.route) : -1;
    if (!all || at < 0) return;
    setAllPagesProgress({ route: all.route, index: at, active: true });
    if (all.route === pathname) { const tour = tourForPath(all.route); if (tour) begin(tour.id, "all", pageInfoAt(at)); }
    else router.push(all.route);
  }, [state.all, pages, pathname, begin, router, pageInfoAt]);

  /** Leaves the tour. A skipped single tour is remembered as dismissed; a stopped all-pages walk keeps its place. */
  const stop = useCallback(() => {
    if (run) {
      if (run.mode === "all" && run.page) setAllPagesProgress({ route: pathname, index: run.page.at - 1, active: false });
      else markTourDismissed(run.tourId);
    }
    end();
  }, [run, pathname, end]);

  const go = useCallback((index: number) => {
    setRun(current => current ? { ...current, index: Math.max(0, Math.min(current.steps.length - 1, index)) } : current);
  }, []);
  const finish = useCallback(() => {
    if (!run) return;
    markTourDone(run.tourId);
    if (run.mode === "all" && run.page) {
      const next = run.page.next;
      if (next) {
        setAllPagesProgress({ route: next.href, index: run.page.at, active: true });
        end();
        if (next.href !== pathname) router.push(next.href);
        return;
      }
      setAllPagesProgress(null);
      markTourDone("all");
    }
    end();
  }, [run, pathname, end, router]);

  // The next page of an all-pages walk (or a resume) picks up when its shell has mounted.
  useEffect(() => {
    const all = readTourState().all;
    if (!all?.active || all.route !== pathname || !roles || !authenticated || run) return;
    const at = pages.findIndex(page => page.href === all.route);
    const tour = tourForPath(pathname);
    if (at < 0 || !tour) { setAllPagesProgress(null); return; }
    begin(tour.id, "all", pageInfoAt(at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.all?.active, state.all?.route, pathname, roles, authenticated, pages]);

  // First visit after sign-in: the Welcome tour starts once, and "Skip tour" is on the card.
  useEffect(() => {
    if (autoChecked.current || !authenticated || !roles || run) return;
    // Read the store directly: the hook's value is still the server default during hydration.
    const stored = readTourState();
    if (stored.all?.active) return;
    autoChecked.current = true;
    if (!shouldAutoStartWelcome(stored, { authenticated, hasRoles: Boolean(roles), pathname })) return;
    // Recorded at the moment it starts, so it can auto-start at most once per browser however it is left (Back, a link, a reload).
    markTourDismissed(WELCOME_TOUR_ID);
    begin(WELCOME_TOUR_ID, "single");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, roles]);

  // A tour belongs to the page it started on.
  useEffect(() => () => { window.clearTimeout(timer.current); }, []);
  const startedOn = useRef(pathname);
  useEffect(() => {
    if (run && startedOn.current !== pathname) { if (run.tourId === WELCOME_TOUR_ID) markTourDismissed(WELCOME_TOUR_ID); end(); }
    startedOn.current = pathname;
  }, [pathname, run, end]);

  const api = useMemo<TourApi>(() => ({ run, canTourPage, resume, startWelcome, startPage, startAll, resumeAll, stop }), [run, canTourPage, resume, startWelcome, startPage, startAll, resumeAll, stop]);
  return <TourContext.Provider value={api}>
    {children}
    {run && <TourOverlay run={run} menu={menu} menuOpenedByTour={menuOpenedByTour} onBack={() => go(run.index - 1)} onNext={() => go(run.index + 1)} onFinish={finish} onStop={stop} />}
  </TourContext.Provider>;
}
