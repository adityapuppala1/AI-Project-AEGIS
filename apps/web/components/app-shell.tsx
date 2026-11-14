"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Building2, ChevronDown, Command, Layers, Lock, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Server, ShieldCheck, Sun, X } from "lucide-react";

import { OperatorAuth } from "./operator-auth";
import { GlobalSearch } from "./global-search";
import { LanguageSwitcher } from "./language-switcher";
import { useT } from "./language-provider";
import { useBrand } from "./brand-provider";
import { BrandMark, BrandName } from "./brand-mark";
import { PageHeader, PageHelp, Tip, ToastProvider, useNow, type Crumb } from "./ui";
import { GROUP_CHAIN, locate, navigation, type NavItem } from "../lib/navigation";
import { ROLE_INFO, canOpenPage, pageRoles } from "../lib/roles";
import { helpFor } from "../lib/page-help";
import { shortId } from "../lib/labels";
import { useOperatorSession } from "../lib/use-operator-session";
import { useResponseAlerts } from "../lib/use-response-alerts";
import { ResponseAlertToast } from "./response-alert-toast";
import { PageTourAction, TourProvider } from "./tour";
import { APP_VERSION_LABEL } from "../lib/version";


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
  return found && { group: found.group, label: found.item.label, href: found.item.href, tabs: found.item.tabs, tab: found.tab, page: found.tab ?? found.item };
}
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

// A menu entry is "for another role" when the signed-in person can use none of its pages. Menus only: the server decides.
const LOCKED_GROUP = "For other roles";
const entryPages = (item: NavItem) => item.tabs ?? [item];
function neededLabel(item: NavItem, t: (text: string) => string): string {
  const roles = [...new Set(entryPages(item).flatMap(page => pageRoles(page.href) ?? []))];
  return roles.map(role => t(ROLE_INFO[role].label)).join(", ");
}
// The rail has room for one role name; the full list is in the tooltip and the accessible name.
const shortNeeds = (needs: string) => { const parts = needs.split(", "); return parts.length > 1 ? `${parts[0]} +${parts.length - 1}` : needs; };

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const t = useT();
  const label = mounted ? t(resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme") : t("Theme loading");
  return (
    <button type="button" className="control control-quiet control-icon" disabled={!mounted} aria-label={label} title={mounted ? label : undefined}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {mounted && resolvedTheme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

/** India Standard Time for the desk strip. A placeholder until the browser clock is known, so server and client match. */
function DeskClock() {
  const now = useNow(undefined, 20_000);
  if (now === null) return <span className="desk-clock" aria-hidden="true">--:--</span>;
  const date = new Date(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(date);
  return <span><time className="desk-clock" dateTime={date.toISOString()}>{time}</time><span> IST</span><span className="hidden sm:inline"> · {day}</span></span>;
}

export function AppShell({ children, title, description, actions, breadcrumbs }: { children: ReactNode; title: string; description: string; actions?: ReactNode; breadcrumbs?: readonly Crumb[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const brand = useBrand();
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
  const [othersOpen, setOthersOpen] = useState(false);
  const session = useOperatorSession();
  const roles = session?.authenticated ? session.roles : null;
  // The menu count for response teams (My Team) and desks (Department Inbox). Polled only for those roles, only while the tab is visible.
  const alerts = useResponseAlerts(roles);
  const alertHref = alerts.view === "team" ? "/my-team" : alerts.view === "desk" ? "/department-tasks" : null;
  const waiting = alerts.count ?? 0;
  const mini = miniChoice && persistentRail;
  const drawer = !persistentRail;
  // What the guided tours may do to the phone menu: open it for a step that points into it, and close it again.
  const tourMenu = useMemo(() => ({ persistent: persistentRail, isOpen: menuOpen, open: () => setMenuOpen(true), close: () => setMenuOpen(false) }), [persistentRail, menuOpen]);

  // Stored choices are applied before the first paint, and motion is switched on only afterwards, so a remembered
  // rail does not animate shut on every page load.
  useLayoutEffect(() => { setCollapsed(readCollapsed()); setMiniChoice(readMini()); }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = memoryScroll;
    list.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [roles]);

  const toggleGroup = (label: string) => setCollapsed(current => {
    const next = current.includes(label) ? current.filter(item => item !== label) : [...current, label];
    writeCollapsed(next); return next;
  });
  const setMini = (next: boolean) => { writeMini(next); setMiniChoice(next); };
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
  const groups = useMemo(() => {
    // Matches page names only (in English and in the chosen language), so results stay predictable.
    const matches = (item: NavItem) => !query || [item, ...(item.tabs ?? [])].some(page => page.label.toLowerCase().includes(query) || t(page.label).toLowerCase().includes(query));
    const usable = (item: NavItem) => entryPages(item).some(page => canOpenPage(page.href, roles));
    const own = navigation.map(group => ({ ...group, items: group.items.filter(item => matches(item) && usable(item)) }));
    // Entries the signed-in role cannot use are kept, in one closed group at the end, each saying which role it needs.
    const others = navigation.flatMap(group => group.items).filter(item => matches(item) && !usable(item));
    return [...own, { label: LOCKED_GROUP, items: others }].filter(group => group.items.length > 0);
  }, [query, t, roles]);
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

  const help = helpFor(pathname);
  // Nested pages get breadcrumbs back to their menu entry unless the page supplies its own.
  const crumbs: readonly Crumb[] | undefined = breadcrumbs ?? (section?.tab && section.tab.href !== section.href
    ? [{ label: t(section.group) }, { label: t(section.label), href: section.href }, { label: t(section.tab.label) }] : undefined);
  const agency = session?.authenticated ? session.agencyId : undefined;
  const exerciseNote = t("Synthetic exercise data. Optional NASA/USGS context is labelled separately. No real emergency alerts or responder dispatch.");

  return (
    <TourProvider roles={roles} pathname={pathname} authenticated={Boolean(session?.authenticated)} menu={tourMenu}>
    <div className="min-h-screen lg:flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-accent focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-ink focus:shadow-panel">{t("Skip to content")}</a>
      {menuOpen && <button className="rail-backdrop lg:hidden" tabIndex={-1} aria-label={t("Close navigation")} onClick={dismissMenu} />}
      <aside ref={railRef} id="primary-rail" className="command-rail" data-open={menuOpen || undefined} data-mini={mini || undefined} data-ready={ready || undefined}
        role={drawer ? "dialog" : undefined} aria-modal={drawer ? true : undefined} aria-label={drawer ? t("Navigation") : undefined}
        inert={!menuOpen && !persistentRail}>
        <div className="rail-head">
          <Link href="/" className="rail-brand" aria-label={brand.text("IndTrana home")}>
            <span className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden"><BrandMark box={28} /></span>
            <span className="rail-text"><strong className="block text-[15px] font-bold leading-tight tracking-[.12em]"><BrandName /></strong><span className="block whitespace-nowrap text-[11px] font-medium leading-tight text-muted">{t("Emergency intelligence")}</span></span>
          </Link>
          <button ref={closeMenuRef} className="control control-quiet control-icon lg:hidden" aria-label={t("Close menu")} onClick={dismissMenu}><X size={18} aria-hidden="true"/></button>
        </div>
        {mini
          ? <div className="rail-search" data-tour="nav-find"><Tip text={t("Find a page")} side="right"><button type="button" className="rail-link justify-center" aria-label={t("Find a page")} onClick={() => { setMini(false); window.setTimeout(() => filterRef.current?.focus(), 60); }}><Search size={17} aria-hidden="true" /></button></Tip></div>
          : <div className="rail-search" data-tour="nav-find">
            <Search size={16} aria-hidden="true" className="rail-search-icon" />
            <input ref={filterRef} type="search" data-nav-filter="" className="rail-filter" value={filter} placeholder={t("Find a page")} aria-label={t("Find a page")} aria-controls="primary-rail-list"
              autoComplete="off" spellCheck={false} enterKeyHint="go" onChange={event => setFilter(event.target.value)} onKeyDown={onFilterKey} />
            {filter
              ? <button type="button" className="rail-search-clear" aria-label={t("Clear")} onClick={() => { setFilter(""); filterRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>
              : <kbd className="rail-search-key" aria-hidden="true">/</kbd>}
          </div>}
        <div ref={listRef} id="primary-rail-list" className="rail-list" onScroll={event => { memoryScroll = event.currentTarget.scrollTop; }} onKeyDown={onListKey}>
          <nav aria-label={t("Primary navigation")} data-tour="nav-groups">
            {groups.map((group, groupIndex) => {
              const locked = group.label === LOCKED_GROUP;
              const hasActive = group.items.some(item => item.href === section?.href);
              const open = mini || Boolean(query) || (locked ? othersOpen || hasActive : !collapsed.includes(group.label));
              const listId = "nav-group-" + group.label.toLowerCase().replace(/[^a-z]+/g, "-");
              const chain = GROUP_CHAIN[group.label];
              return <div key={group.label} className="rail-section">
                {mini
                  ? groupIndex > 0 && <div className="rail-divider" role="presentation" />
                  : <button type="button" className="rail-group" data-active={hasActive || undefined} aria-expanded={open} aria-controls={listId} disabled={Boolean(query)} onClick={() => locked ? setOthersOpen(value => !value) : toggleGroup(group.label)}>
                    <span className="flex min-w-0 items-baseline">{t(group.label)}{chain && <span className="rail-group-chain">{chain.map(step => t(step)).join(" · ")}</span>}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">{(query || locked) && <span className="rail-count">{group.items.length}</span>}{!query && <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />}</span>
                  </button>}
                <div id={listId} className="rail-items" data-closed={!open || undefined} inert={!open}>
                  <div>{group.items.map(item => {
                    const { href, label, icon: Icon } = item;
                    const active = section?.href === href;
                    const needs = locked ? neededLabel(item, t) : "";
                    const tabs = item.tabs?.length ?? 0;
                    const badge = !locked && href === alertHref && waiting > 0 ? waiting : 0;
                    return <Tip key={href} text={t(label) + (needs ? ` (${t("needs")} ${needs})` : badge ? ` (${badge} ${t("waiting")})` : "")} side="right" disabled={!mini}>
                      <Link href={href} aria-current={active ? "page" : undefined} data-locked={locked || undefined} title={needs ? `${t("needs")} ${needs}` : undefined} className={`rail-link ${active ? "nav-active" : ""}`}
                        onClick={() => { if (href === pathname) setMenuOpen(false); }}>
                        <Icon size={17} aria-hidden="true" className="shrink-0" />{badge > 0 && <span className="rail-dot" aria-hidden="true">{badge > 9 ? "9+" : badge}</span>}<span className="rail-text">{t(label)}</span>
                        {locked
                          ? <span className="rail-meta"><Lock size={11} aria-hidden="true" /><span className="sr-only">{t("needs")} {needs}</span><span aria-hidden="true">{shortNeeds(needs)}</span></span>
                          : badge > 0
                            ? <span className="rail-meta"><span className="rail-count" style={{ background: "rgb(var(--role-team) / .16)", color: "rgb(var(--ink))" }}>{badge}</span><span className="sr-only"> {t("waiting")}</span></span>
                            : tabs > 1 && <span className="rail-meta" title={`${tabs} ${t("tabs")}`}><Layers size={11} aria-hidden="true" />{tabs}<span className="sr-only"> {t("tabs")}</span></span>}
                      </Link>
                    </Tip>;
                  })}</div>
                </div>
              </div>;
            })}
            {groups.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted" role="status">{t("No pages match")}</p>}
          </nav>
        </div>
        <Tip side={mini ? "right" : "top"} text={exerciseNote}>
          <div className="rail-foot" tabIndex={0}>
            <ShieldCheck size={15} aria-hidden="true" className="shrink-0 text-brand" />
            <span className="rail-text flex-1 font-semibold">{t("Exercise environment")}</span>
            <Link href="/whats-new" className="rail-text rail-version" aria-label={`${t("What's new")}: ${APP_VERSION_LABEL}`} data-tour="nav-version">{APP_VERSION_LABEL}</Link>
            <span className="sr-only">{exerciseNote}</span>
          </div>
        </Tip>
      </aside>
      <div className="min-w-0 flex-1" inert={menuOpen && drawer}>
        <span className="sr-only" role="status" aria-live="polite">{alerts.rose > 0 && waiting > 0 ? `${waiting} ${t("waiting")}` : ""}</span>
        <div className="sticky top-0 z-20">
          <div className="command-topbar flex items-center justify-between gap-3 border-b border-stroke bg-surface px-3 sm:px-5">
            <div className="@container flex min-w-0 flex-1 items-center gap-2">
              <button ref={openMenuRef} className="control control-quiet control-icon lg:hidden" aria-label={t("Open navigation")} aria-expanded={menuOpen} aria-controls="primary-rail" onClick={() => setMenuOpen(true)}><Menu size={19} aria-hidden="true"/></button>
              <button type="button" data-rail-toggle="" className="control control-quiet control-icon hidden lg:inline-flex" aria-label={t(miniChoice ? "Expand sidebar" : "Collapse sidebar")} title={t(miniChoice ? "Expand sidebar" : "Collapse sidebar")} aria-expanded={!miniChoice} aria-controls="primary-rail" onClick={() => setMini(!miniChoice)}>
                {miniChoice ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
              </button>
              <p className="hidden min-w-0 truncate text-[13px] font-medium text-muted sm:@min-[15rem]:block">{section ? <><span className="hidden 2xl:inline">{t(section.group)} <span aria-hidden="true" className="mx-1 opacity-60">/</span> </span><span className="font-semibold text-ink">{t(section.label)}</span></> : t("Public safety / Hyderabad")}</p>
              <p className="hidden min-w-0 truncate text-xs font-semibold text-muted min-[400px]:block sm:hidden">{section ? t(section.label) : `${brand.name} / Exercise`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              <span className="inline-flex" data-tour="topbar-language"><LanguageSwitcher /></span>
              <span className="inline-flex" data-tour="topbar-search"><GlobalSearch /></span>
              <span className="inline-flex" data-tour="topbar-theme"><ThemeToggle /></span>
              <OperatorAuth />
            </div>
          </div>
          {/* The desk strip: a standing statement of state, place and time. It cannot be mistaken for live operation. */}
          <div className="desk-strip" data-tour="desk-strip" role="note" aria-label={t("Exercise environment")}>
            <span className="exercise-tape">{t("EXERCISE")}<small className="hidden min-[420px]:inline">{t("No live warnings or dispatch")}</small></span>
            <div className="desk-facts">
              <span className="hidden md:inline-flex"><Server size={13} aria-hidden="true" />{t("Local exercise node · HYD-01")}</span>
              {agency && <span className="hidden xl:inline-flex" title={agency}><Building2 size={13} aria-hidden="true" />{t("Agency")} <span className="mono">{shortId(agency)}</span></span>}
              <DeskClock />
            </div>
          </div>
        </div>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1800px] px-4 pb-12 pt-5 outline-none sm:px-6">
          <ToastProvider>
            <ResponseAlertToast view={alerts.view} rose={alerts.rose} />
            <div className="reveal-in" data-tour="page-body">
              <p className="print-only mb-3 text-xs">{brand.name} · {t("Exercise environment")} · {t("No live warnings or dispatch")}</p>
              <PageHeader eyebrow={section ? t(section.group) : undefined} chain={section?.page.chain} title={t(title)} description={t(description)} breadcrumbs={crumbs} actions={actions} />
              {section?.tabs && <nav aria-label={t(section.label)} className="section-tabs" data-tour="page-tabs">
                {section.tabs.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={section.tab?.href === href ? "page" : undefined} className="section-tab"><Icon size={16} aria-hidden="true" /><span>{t(label)}</span></Link>)}
              </nav>}
              {help && <PageHelp help={help} action={<PageTourAction />} />}
              {children}
            </div>
          </ToastProvider>
        </main>
      </div>
    </div>
    </TourProvider>
  );
}
