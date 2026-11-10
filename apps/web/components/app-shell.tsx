"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronDown, Command, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, ShieldCheck, Sun, X } from "lucide-react";

import { OperatorAuth } from "./operator-auth";
import { GlobalSearch } from "./global-search";
import { LanguageSwitcher } from "./language-switcher";
import { useT } from "./language-provider";
import { PageHeader, ToastProvider, type Crumb } from "./ui";
import { locate, navigation } from "../lib/navigation";


// Matches Tailwind's lg breakpoint, where the rail stops being an overlay drawer.
const RAIL_QUERY = "(min-width: 64rem)";
function subscribeToRailQuery(onChange: () => void) {
  const query = matchMedia(RAIL_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Collapsed nav groups are remembered for the browser session only. Storage can be blocked, so a module-level
// memory copy keeps the choice alive across page navigations in that case.
const NAV_STATE_KEY = "aegis-nav-collapsed";
let memoryCollapsed: string[] = [];
function readCollapsed(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(NAV_STATE_KEY) ?? "null");
    if (Array.isArray(parsed)) memoryCollapsed = parsed.filter((item): item is string => typeof item === "string");
  } catch { /* fall through to memory */ }
  return memoryCollapsed;
}
function writeCollapsed(next: string[]) {
  memoryCollapsed = next;
  try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)); } catch { /* memory copy only */ }
}
// The icon-only rail is a per-browser preference. Every page mounts its own shell, so the memory copy also stops
// the rail from flashing open on each navigation, and remembers how far the list was scrolled.
const RAIL_STATE_KEY = "aegis-rail-mini";
let memoryMini = false, memoryScroll = 0;
function readMini(): boolean {
  try { const stored = localStorage.getItem(RAIL_STATE_KEY); if (stored === "1" || stored === "0") memoryMini = stored === "1"; } catch { /* fall through to memory */ }
  return memoryMini;
}
function writeMini(next: boolean) {
  memoryMini = next;
  try { localStorage.setItem(RAIL_STATE_KEY, next ? "1" : "0"); } catch { /* memory copy only */ }
}
/** The menu entry for a path (tabbed pages such as /admin/connectors belong to their parent entry). */
function currentSection(pathname: string) {
  const found = locate(pathname);
  return found && { group: found.group, label: found.item.label, href: found.item.href, tabs: found.item.tabs, tab: found.tab };
}
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button type="button" className="control h-10 w-10 !px-0" disabled={!mounted}
      aria-label={mounted ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme` : "Theme loading"}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {mounted && resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function AppShell({ children, title, description, actions, breadcrumbs }: { children: ReactNode; title: string; description: string; actions?: ReactNode; breadcrumbs?: readonly Crumb[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLButtonElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const persistentRail = useSyncExternalStore(subscribeToRailQuery, () => matchMedia(RAIL_QUERY).matches, () => true);
  const section = currentSection(pathname);
  const [collapsed, setCollapsed] = useState<string[]>(memoryCollapsed);
  const [miniChoice, setMiniChoice] = useState(memoryMini);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState("");
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const mini = miniChoice && persistentRail;
  const drawer = !persistentRail;

  // Stored choices are applied before the first paint, and motion is switched on only afterwards, so a remembered
  // rail does not animate shut on every page load.
  useLayoutEffect(() => { setCollapsed(readCollapsed()); setMiniChoice(readMini()); }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = memoryScroll;
    list.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, []);

  const toggleGroup = (label: string) => setCollapsed(current => {
    const next = current.includes(label) ? current.filter(item => item !== label) : [...current, label];
    writeCollapsed(next); return next;
  });
  const setMini = (next: boolean) => { writeMini(next); setMiniChoice(next); setTip(null); };
  useEffect(() => {
    setMenuOpen(false);
    // Navigating into a collapsed group must never hide the page the operator is on.
    const active = currentSection(pathname)?.group;
    if (active) setCollapsed(current => { if (!current.includes(active)) return current; const next = current.filter(item => item !== active); writeCollapsed(next); return next; });
  }, [pathname]);
  useEffect(() => { if (persistentRail) setMenuOpen(false); }, [persistentRail]);

  // Below lg the rail is an overlay drawer: it is inert while closed, focus enters it on open and stays inside it,
  // the page behind neither scrolls nor takes focus, and an explicit dismissal (Escape, close control or backdrop)
  // returns focus to the control that opened it.
  // The page behind is inert until the drawer has closed, so focus goes back once that has been committed.
  const returnFocus = useRef(false);
  const dismissMenu = () => { returnFocus.current = true; setMenuOpen(false); };
  useEffect(() => { if (!menuOpen && returnFocus.current) { returnFocus.current = false; openMenuRef.current?.focus(); } }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    closeMenuRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { returnFocus.current = true; setMenuOpen(false); return; }
      if (event.key !== "Tab" || !railRef.current) return;
      const stops = Array.from(railRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input")).filter(item => item.offsetParent !== null && !item.closest("[inert]"));
      if (!stops.length) return;
      const first = stops[0], last = stops[stops.length - 1], at = document.activeElement;
      if (event.shiftKey && (at === first || !railRef.current.contains(at))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (at === last || !railRef.current.contains(at))) { event.preventDefault(); first.focus(); }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previous; };
  }, [menuOpen]);

  // "/" jumps to the page filter from anywhere, unless the operator is typing in a field.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      if (!matchMedia(RAIL_QUERY).matches) setMenuOpen(true); else if (memoryMini) setMini(false);
      window.setTimeout(() => filterRef.current?.focus(), 60);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const query = mini ? "" : filter.trim().toLowerCase();
  const groups = useMemo(() => navigation.map(group => ({
    ...group,
    // Matches page names only (in English and in the chosen language), so results stay predictable.
    items: query ? group.items.filter(item => [item, ...(item.tabs ?? [])].some(page => page.label.toLowerCase().includes(query) || t(page.label).toLowerCase().includes(query))) : group.items,
  })).filter(group => group.items.length > 0), [query, t]);
  const firstMatch = query ? groups[0]?.items[0] : undefined;

  const stops = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? []).filter(item => !item.closest("[inert]"));
  const onFilterKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); stops()[0]?.focus(); }
    else if (event.key === "Enter" && firstMatch) { event.preventDefault(); setFilter(""); if (firstMatch.href === pathname) setMenuOpen(false); else router.push(firstMatch.href); }
    else if (event.key === "Escape" && filter) { event.preventDefault(); event.nativeEvent.stopImmediatePropagation(); setFilter(""); }
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = stops(), at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && at === 0 && !mini) { filterRef.current?.focus(); return; }
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : Math.min(items.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
    items[next]?.focus();
  };
  // Icon-only rail: the label of the hovered or focused entry is shown beside it.
  const showTip = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!mini) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!target) { setTip(null); return; }
    const box = target.getBoundingClientRect();
    setTip({ text: target.dataset.tip ?? "", top: box.top + box.height / 2, left: box.right + 10 });
  };
  const hideTip = () => setTip(null);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-accent focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-ink focus:shadow-panel">{t("Skip to content")}</a>
      {menuOpen && <button className="rail-backdrop lg:hidden" tabIndex={-1} aria-label="Close navigation" onClick={dismissMenu} />}
      <aside ref={railRef} id="primary-rail" className="command-rail" data-open={menuOpen || undefined} data-mini={mini || undefined} data-ready={ready || undefined}
        role={drawer ? "dialog" : undefined} aria-modal={drawer ? true : undefined} aria-label={drawer ? "Navigation" : undefined}
        inert={!menuOpen && !persistentRail} onMouseOver={showTip} onMouseLeave={hideTip} onFocus={showTip} onBlur={hideTip}>
        <div className="rail-head">
          <Link href="/" className="rail-brand" aria-label="AEGIS home" data-tip="AEGIS">
            <span className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Command size={20} aria-hidden="true"/></span>
            <span className="rail-text"><strong className="block text-base font-black leading-tight tracking-[.14em]">AEGIS</strong><span className="block whitespace-nowrap text-[11px] font-semibold leading-tight text-muted">{t("Emergency intelligence")}</span></span>
          </Link>
          <button ref={closeMenuRef} className="control h-11 w-11 shrink-0 !px-0 lg:hidden" aria-label="Close menu" onClick={dismissMenu}><X size={18} aria-hidden="true"/></button>
        </div>
        {mini
          ? <div className="rail-search"><button type="button" className="rail-link justify-center" data-tip={t("Find a page")} aria-label={t("Find a page")} onClick={() => { setMini(false); window.setTimeout(() => filterRef.current?.focus(), 60); }}><Search size={17} aria-hidden="true" /></button></div>
          : <div className="rail-search">
            <Search size={16} aria-hidden="true" className="rail-search-icon" />
            <input ref={filterRef} type="search" data-nav-filter="" className="rail-filter" value={filter} placeholder={t("Find a page")} aria-label={t("Find a page")} aria-controls="primary-rail-list"
              autoComplete="off" spellCheck={false} enterKeyHint="go" onChange={event => setFilter(event.target.value)} onKeyDown={onFilterKey} />
            {filter
              ? <button type="button" className="rail-search-clear" aria-label={t("Clear")} onClick={() => { setFilter(""); filterRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>
              : <kbd className="rail-search-key" aria-hidden="true">/</kbd>}
          </div>}
        <div ref={listRef} id="primary-rail-list" className="rail-list" onScroll={event => { memoryScroll = event.currentTarget.scrollTop; hideTip(); }} onKeyDown={onListKey}>
          <nav aria-label="Primary navigation">
            {groups.map((group, groupIndex) => {
              const open = mini || Boolean(query) || !collapsed.includes(group.label);
              const hasActive = section?.group === group.label;
              const listId = "nav-group-" + group.label.toLowerCase();
              return <div key={group.label} className="rail-section">
                {mini
                  ? groupIndex > 0 && <div className="rail-divider" role="presentation" />
                  : <button type="button" className="rail-group" data-active={hasActive || undefined} aria-expanded={open} aria-controls={listId} disabled={Boolean(query)} onClick={() => toggleGroup(group.label)}>
                    <span>{t(group.label)}</span>
                    {query ? <span className="rail-count">{group.items.length}</span> : <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />}
                  </button>}
                <div id={listId} className="rail-items" data-closed={!open || undefined} inert={!open}>
                  <div>{group.items.map(({ href, label, icon: Icon }) => {
                    const active = section?.href === href;
                    return <Link key={href} href={href} aria-current={active ? "page" : undefined} data-tip={t(label)} className={`rail-link ${active ? "nav-active" : ""}`}
                      onClick={() => { if (href === pathname) setMenuOpen(false); }}>
                      <Icon size={17} aria-hidden="true" className="shrink-0" /><span className="rail-text">{t(label)}</span>
                    </Link>;
                  })}</div>
                </div>
              </div>;
            })}
            {groups.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted" role="status">{t("No pages match")}</p>}
          </nav>
        </div>
        <div className="rail-foot">
          <div className="rail-note" data-tip={t("Exercise environment")}>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300"><ShieldCheck size={16} aria-hidden="true" className="shrink-0" /><span className="rail-text">{t("Exercise environment")}</span></div>
            <p className="rail-text mt-1.5 text-[11px] leading-[1.45] text-muted">{t("Synthetic exercise data. Optional NASA/USGS context is labelled separately. No real emergency alerts or responder dispatch.")}</p>
          </div>
          <p className="rail-text mt-2 px-1 text-[11px] text-muted">AEGIS v0.2</p>
        </div>
      </aside>
      {tip && <div className="rail-tip" role="presentation" aria-hidden="true" style={{ top: tip.top, left: tip.left }}>{tip.text}</div>}
      <div className="min-w-0 flex-1" inert={menuOpen && drawer}>
        <div className="command-topbar sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-stroke bg-surface/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="@container flex min-w-0 flex-1 items-center gap-3">
            <button ref={openMenuRef} className="control h-11 w-11 shrink-0 !px-0 lg:hidden" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="primary-rail" onClick={() => setMenuOpen(true)}><Menu size={19} aria-hidden="true"/></button>
            <button type="button" data-rail-toggle="" className="control hidden h-10 w-10 shrink-0 !px-0 lg:inline-flex" aria-label={t(miniChoice ? "Expand sidebar" : "Collapse sidebar")} title={t(miniChoice ? "Expand sidebar" : "Collapse sidebar")} aria-expanded={!miniChoice} aria-controls="primary-rail" onClick={() => setMini(!miniChoice)}>
              {miniChoice ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
            <p className="hidden min-w-0 truncate text-[13px] font-semibold text-muted sm:@min-[15rem]:block">{section ? <><span className="hidden 2xl:inline">{t(section.group)} <span aria-hidden="true" className="mx-1 opacity-60">/</span> </span><span className="text-ink">{t(section.label)}</span></> : t("Public safety / Hyderabad")}</p>
            <p className="hidden min-w-0 truncate text-xs font-semibold text-muted min-[400px]:block sm:hidden">{section ? t(section.label) : "AEGIS / Exercise"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 sm:inline-flex">
              <span className="status-dot bg-amber-400"/> {t("Simulation mode")}
            </span>
            <LanguageSwitcher />
            <GlobalSearch />
            <ThemeToggle />
            <OperatorAuth />
          </div>
        </div>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1800px] px-4 pb-12 pt-6 outline-none sm:px-7">
          <ToastProvider>
            <div className="reveal-in">
              <PageHeader eyebrow={t("Adaptive Emergency Geospatial Intelligence System")} title={t(title)} description={t(description)} breadcrumbs={breadcrumbs}
                actions={actions} chip={<span className="rounded-md border border-stroke bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[.17em] text-muted">{t("Local exercise node · HYD-01")}</span>} />
              {section?.tabs && <nav aria-label={t(section.label)} className="section-tabs">
                {section.tabs.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={section.tab?.href === href ? "page" : undefined} className="section-tab"><Icon size={16} aria-hidden="true" /><span>{t(label)}</span></Link>)}
              </nav>}
              {children}
            </div>
          </ToastProvider>
        </main>
      </div>
    </div>
  );
}
