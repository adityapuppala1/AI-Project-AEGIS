"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity, BookOpenCheck, ChevronRight, Command, LayoutDashboard,
  ChevronDown, Menu, Moon, Settings2, ShieldCheck, Sun, X, ClipboardCheck, LifeBuoy, RadioTower, Workflow, BrainCircuit, Route, UsersRound, Archive, Globe2, Gauge, Inbox, Radar, Plug, ClipboardList, MessagesSquare, GraduationCap, BarChart3,
} from "lucide-react";

import { OperatorAuth } from "./operator-auth";
import { GlobalSearch } from "./global-search";
import { LanguageSwitcher } from "./language-switcher";
import { useT } from "./language-provider";
import { PageHeader, ToastProvider, type Crumb } from "./ui";

const navigation = [
  { label: "Overview", items: [
    { href: "/", label: "Command Center", icon: LayoutDashboard },
    { href: "/demo", label: "Exercise Walkthrough", icon: Route },
  ]},
  { label: "Observe", items: [
    { href: "/incidents", label: "Incident Registry", icon: Activity },
    { href: "/sources", label: "Source Freshness", icon: RadioTower },
    { href: "/earth-watch", label: "Earth Watch", icon: Globe2 },
    { href: "/watch", label: "Hazard Watch", icon: Radar },
    { href: "/public-intake", label: "Public Intake", icon: Inbox },
    { href: "/ingestion", label: "DataFusion Replay", icon: Workflow },
    { href: "/model-lab", label: "Model Evaluation Lab", icon: BrainCircuit },
  ]},
  { label: "Coordinate", items: [
    { href: "/approvals", label: "Approval Workbench", icon: ClipboardCheck },
    { href: "/department-tasks", label: "Department Inbox", icon: ClipboardCheck },
    { href: "/response-teams", label: "Team Availability", icon: Gauge },
    { href: "/agency-sync", label: "AgencySync Tasks", icon: UsersRound },
    { href: "/handover", label: "Shift Handover", icon: ClipboardList },
    { href: "/copilot", label: "Operator Copilot", icon: MessagesSquare },
    { href: "/drills", label: "Exercise Drills", icon: GraduationCap },
  ]},
  { label: "Govern", items: [
    { href: "/audit", label: "Audit360 Export", icon: Archive },
    { href: "/playbooks", label: "Response Playbooks", icon: BookOpenCheck },
    { href: "/learning", label: "Post-event Learning", icon: BarChart3 },
    { href: "/help", label: "Help & Learning", icon: LifeBuoy },
    { href: "/admin", label: "Administration", icon: Settings2 },
    { href: "/admin/connectors", label: "Connectors", icon: Plug },
  ]},
];

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
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch { /* fall through to memory */ }
  return memoryCollapsed;
}
function writeCollapsed(next: string[]) {
  memoryCollapsed = next;
  try { sessionStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)); } catch { /* memory copy only */ }
}
const isActive = (pathname: string, href: string) => href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
/** The most specific nav entry for a path (so /admin/connectors wins over /admin). */
function currentSection(pathname: string) {
  let best: { group: string; label: string; href: string } | null = null;
  for (const group of navigation) for (const item of group.items) {
    if (isActive(pathname, item.href) && (!best || item.href.length > best.href.length)) best = { group: group.label, label: item.label, href: item.href };
  }
  return best;
}

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
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLButtonElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);
  const persistentRail = useSyncExternalStore(subscribeToRailQuery, () => matchMedia(RAIL_QUERY).matches, () => true);
  const section = currentSection(pathname);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => setCollapsed(readCollapsed()), []);
  const toggleGroup = (label: string) => setCollapsed(current => {
    const next = current.includes(label) ? current.filter(item => item !== label) : [...current, label];
    writeCollapsed(next); return next;
  });
  useEffect(() => {
    setMenuOpen(false);
    // Navigating into a collapsed group must never hide the page the operator is on.
    const active = currentSection(pathname)?.group;
    if (active) setCollapsed(current => { if (!current.includes(active)) return current; const next = current.filter(item => item !== active); writeCollapsed(next); return next; });
  }, [pathname]);
  // Below lg the rail is an overlay drawer: it is inert while closed, focus enters it on
  // open, and an explicit dismissal (Escape, close control or backdrop) returns focus.
  const dismissMenu = () => { setMenuOpen(false); openMenuRef.current?.focus(); };
  useEffect(() => {
    if (!menuOpen) return;
    closeMenuRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); openMenuRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:border focus:border-accent focus:bg-surface focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-ink focus:shadow-panel">{t("Skip to content")}</a>
      {menuOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-label="Close navigation" onClick={dismissMenu} />}
      <aside className={`command-rail fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col overflow-y-auto border-r border-stroke transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        inert={!menuOpen && !persistentRail}>
        <div className="flex h-20 items-center justify-between border-b border-stroke px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="AEGIS home">
            <span className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl"><Command size={22}/></span>
            <span><strong className="block text-lg font-black tracking-[.14em]">AEGIS</strong><span className="text-[9px] font-bold uppercase tracking-[.13em] text-muted">{t("Emergency intelligence")}</span></span>
          </Link>
          <button ref={closeMenuRef} className="control h-9 w-9 !px-0 lg:hidden" aria-label="Close menu" onClick={dismissMenu}><X size={18}/></button>
        </div>
        <div className="px-3 pt-5">
          <nav className="space-y-5" aria-label="Primary navigation">
            {navigation.map(group => {
              const open = !collapsed.includes(group.label);
              const hasActive = section?.group === group.label;
              const listId = "nav-group-" + group.label.toLowerCase();
              return <div key={group.label}>
                <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => toggleGroup(group.label)}
                  className={`flex min-h-8 w-full items-center justify-between rounded-md px-3 text-[9px] font-bold uppercase tracking-[.18em] hover:bg-elevated ${hasActive ? "text-accent" : "text-muted"}`}>
                  <span>{t(group.label)}</span><ChevronDown size={12} aria-hidden="true" className={`transition-transform ${open ? "" : "-rotate-90"}`} />
                </button>
                <div id={listId} hidden={!open} className="mt-1 space-y-0.5">{group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href) && section?.href === href;
                  return <Link key={href} href={href} aria-current={active ? "page" : undefined}
                    className={`flex min-h-9 items-center gap-3 rounded-r-lg px-3 text-xs ${active ? "nav-active font-bold text-accent" : "font-semibold text-muted hover:bg-elevated hover:text-ink"} transition-colors`}>
                    <Icon size={16} aria-hidden="true" /><span className="flex-1">{t(label)}</span>{active && <ChevronRight size={14} aria-hidden="true"/>}
                  </Link>;
                })}</div>
              </div>;
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300"><ShieldCheck size={15}/> {t("Exercise environment")}</div>
            <p className="mt-2 text-xs leading-5 text-muted">{t("Synthetic exercise data. Optional NASA/USGS context is labelled separately. No real emergency alerts or responder dispatch.")}</p>
          </div>
          <p className="mt-4 px-2 text-[11px] text-muted">AEGIS v0.2</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="command-topbar sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stroke bg-surface/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={openMenuRef} className="control h-10 w-10 shrink-0 !px-0 lg:hidden" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={19}/></button>
            <p className="hidden text-xs font-semibold uppercase tracking-[.16em] text-muted sm:block">{section ? <><span>{t(section.group)}</span> <span aria-hidden="true">/</span> <span className="text-ink">{t(section.label)}</span></> : t("Public safety / Hyderabad")}</p>
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
              {children}
            </div>
          </ToastProvider>
        </main>
      </div>
    </div>
  );
}
