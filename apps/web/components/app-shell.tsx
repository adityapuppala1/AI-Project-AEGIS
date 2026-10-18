"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity, BookOpenCheck, ChevronRight, Command, LayoutDashboard,
  Menu, Moon, Settings2, ShieldCheck, Sun, X, ClipboardCheck, LifeBuoy, RadioTower, Workflow, BrainCircuit, Route, UsersRound, Archive,
} from "lucide-react";

import { OperatorAuth } from "./operator-auth";
import { GlobalSearch } from "./global-search";

const navigation = [
  { label: "Overview", items: [
    { href: "/", label: "Command Center", icon: LayoutDashboard },
    { href: "/demo", label: "Exercise Walkthrough", icon: Route },
  ]},
  { label: "Observe", items: [
    { href: "/incidents", label: "Incident Registry", icon: Activity },
    { href: "/sources", label: "Source Freshness", icon: RadioTower },
    { href: "/ingestion", label: "DataFusion Replay", icon: Workflow },
    { href: "/model-lab", label: "Model Evaluation Lab", icon: BrainCircuit },
  ]},
  { label: "Coordinate", items: [
    { href: "/approvals", label: "Approval Workbench", icon: ClipboardCheck },
    { href: "/department-tasks", label: "Department Inbox", icon: ClipboardCheck },
    { href: "/agency-sync", label: "AgencySync Tasks", icon: UsersRound },
  ]},
  { label: "Govern", items: [
    { href: "/audit", label: "Audit360 Export", icon: Archive },
    { href: "/playbooks", label: "Response Playbooks", icon: BookOpenCheck },
    { href: "/help", label: "Help & Learning", icon: LifeBuoy },
    { href: "/admin", label: "Administration", icon: Settings2 },
  ]},
];

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

export function AppShell({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  return (
    <div className="min-h-screen lg:flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">Skip to content</a>
      {menuOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`command-rail fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col overflow-y-auto border-r border-stroke transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-stroke px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="AEGIS home">
            <span className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl"><Command size={22}/></span>
            <span><strong className="block text-lg font-black tracking-[.14em]">AEGIS</strong><span className="text-[9px] font-bold uppercase tracking-[.13em] text-muted">Emergency intelligence</span></span>
          </Link>
          <button className="control h-9 w-9 !px-0 lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18}/></button>
        </div>
        <div className="px-3 pt-5">
          <nav className="space-y-5" aria-label="Primary navigation">
            {navigation.map(group => <div key={group.label}>
              <p className="px-3 text-[9px] font-bold uppercase tracking-[.18em] text-muted/75">{group.label}</p>
              <div className="mt-2 space-y-0.5">{group.items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
                return <Link key={href} href={href} aria-current={active ? "page" : undefined}
                  className={`flex min-h-9 items-center gap-3 rounded-r-lg px-3 text-xs font-semibold transition-colors ${active ? "nav-active text-accent" : "text-muted hover:bg-elevated hover:text-ink"}`}>
                  <Icon size={16} aria-hidden="true" /><span className="flex-1">{label}</span>{active && <ChevronRight size={14} aria-hidden="true"/>}
                </Link>;
              })}</div>
            </div>)}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300"><ShieldCheck size={15}/> Exercise environment</div>
            <p className="mt-2 text-xs leading-5 text-muted">Synthetic data only. No real emergency alerts or responder dispatch.</p>
          </div>
          <p className="mt-4 px-2 text-[11px] text-muted">AEGIS v0.2 · CipherCop 2026</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="command-topbar sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stroke bg-surface/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button className="control h-10 w-10 !px-0 lg:hidden" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={19}/></button>
            <span className="hidden text-xs font-semibold uppercase tracking-[.16em] text-muted sm:inline">Public safety / Hyderabad</span>
            <span className="text-xs font-semibold text-muted sm:hidden">AEGIS / Exercise</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 sm:inline-flex">
              <span className="status-dot bg-amber-400"/> Simulation mode
            </span>
            <GlobalSearch />
            <ThemeToggle />
            <OperatorAuth />
          </div>
        </div>
        <main id="main-content" className="mx-auto max-w-[1800px] px-4 pb-12 pt-6 sm:px-7">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-stroke pb-5">
            <div>
            <p className="eyebrow mb-2">Adaptive Emergency Geospatial Intelligence System</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-muted">{description}</p>
            </div>
            <span className="rounded-md border border-stroke bg-surface px-3 py-2 text-[10px] font-bold uppercase tracking-[.17em] text-muted">Local exercise node · HYD-01</span>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
