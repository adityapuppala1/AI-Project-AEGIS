// The one place that reads and writes tour state in the browser. It stores flags only: which tours were finished or
// skipped, whether page hints are on, the tour content version, where an "all my pages" tour stopped and which
// release the person last looked at on the What's new page. Never a subject, a name, a role claim, a token or any
// case data. One key, "aegis-tours" (the same "aegis-" naming as the language and rail keys). Storage can be blocked, so
// every access is wrapped and a module-level memory copy keeps the choices alive for the page session.
// No React or DOM imports: the store is subscribed to from components/tour/tour-provider.tsx.

export const TOUR_STORAGE_KEY = "aegis-tours";
/** Bump when tour copy changes enough that people should be offered the page hints again. */
export const TOUR_CONTENT_VERSION = 1;

export interface AllPagesProgress { route: string; index: number; active: boolean }
export interface TourState {
  v: 1;
  content: number;
  done: string[];
  dismissed: string[];
  hintSeen: string[];
  hints: boolean;
  all: AllPagesProgress | null;
  whatsNewSeen: string | null;
}

const DEFAULT_STATE: TourState = { v: 1, content: TOUR_CONTENT_VERSION, done: [], dismissed: [], hintSeen: [], hints: true, all: null, whatsNewSeen: null };
export const DEFAULT_TOUR_STATE: TourState = Object.freeze({ ...DEFAULT_STATE }) as TourState;

const ID = /^[a-z0-9:/_\-[\]]{1,80}$/i;
const VERSION = /^\d{1,4}\.\d{1,5}\.\d{1,6}$/;
const ids = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && ID.test(item)).slice(0, 120) : [];

/** Re-validates whatever was stored: only the known fields, bounded, anything else is dropped. */
export function cleanTourState(value: unknown): TourState {
  const data = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const all = typeof data.all === "object" && data.all !== null ? data.all as Record<string, unknown> : null;
  const content = typeof data.content === "number" ? data.content : 0;
  return {
    v: 1,
    content: TOUR_CONTENT_VERSION,
    done: ids(data.done),
    dismissed: ids(data.dismissed),
    // A new content version offers the page hints again; everything else is kept.
    hintSeen: content === TOUR_CONTENT_VERSION ? ids(data.hintSeen) : [],
    hints: data.hints !== false,
    all: all && typeof all.route === "string" && ID.test(all.route) && typeof all.index === "number" && Number.isInteger(all.index) && all.index >= 0 && all.index < 200
      ? { route: all.route, index: all.index, active: all.active === true } : null,
    whatsNewSeen: typeof data.whatsNewSeen === "string" && VERSION.test(data.whatsNewSeen) ? data.whatsNewSeen : null,
  };
}

let current: TourState = DEFAULT_TOUR_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function browserStore(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage ?? null; } catch { return null; }
}
function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = browserStore()?.getItem(TOUR_STORAGE_KEY);
    if (raw) current = cleanTourState(JSON.parse(raw));
  } catch { /* fall through to the in-memory defaults */ }
}
function save(next: TourState) {
  current = next;
  try { browserStore()?.setItem(TOUR_STORAGE_KEY, JSON.stringify(next)); } catch { /* memory copy only */ }
  listeners.forEach(listener => { try { listener(); } catch { /* a bad listener must not break the others */ } });
}

/** The current state. The same object is returned until something changes, so it is safe for useSyncExternalStore. */
export function readTourState(): TourState { load(); return current; }
export function updateTourState(change: (state: TourState) => TourState | Partial<TourState>) {
  load();
  save(cleanTourState({ ...current, ...change(current), content: TOUR_CONTENT_VERSION }));
}
export function subscribeTourState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
const add = (list: string[], id: string) => list.includes(id) ? list : [...list, id];
export const markTourDone = (id: string) => updateTourState(state => ({ done: add(state.done, id), dismissed: state.dismissed.filter(item => item !== id) }));
export const markTourDismissed = (id: string) => updateTourState(state => ({ dismissed: add(state.dismissed, id) }));
export const markHintSeen = (route: string) => updateTourState(state => state.hintSeen.includes(route) ? state : { hintSeen: add(state.hintSeen, route) });
export const setTourHints = (hints: boolean) => updateTourState(() => ({ hints }));
export const setAllPagesProgress = (all: AllPagesProgress | null) => updateTourState(() => ({ all }));
export const markWhatsNewSeen = (version: string) => updateTourState(state => state.whatsNewSeen === version ? state : { whatsNewSeen: version });
/** Sign-out: the "all my pages" position belongs to one session. Finished flags are not personal and stay. */
export function clearTourProgress() {
  load();
  if (current.all) save({ ...current, all: null });
}
/** For tests only: forget the memory copy so the next read goes to storage again. */
export function resetTourStateForTests() { current = DEFAULT_TOUR_STATE; loaded = false; listeners.clear(); }
