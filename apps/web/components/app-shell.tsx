"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity, BookOpenCheck, ChevronRight, Command, LayoutDashboard,
  Menu, Moon, Settings2, ShieldCheck, Sun, X, ClipboardCheck, LifeBuoy, RadioTower, Workflow,
} from "lucide-react";

import { OperatorAuth } from "./operator-auth";
import { GlobalSearch } from "./global-search";

const navigation = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/incidents", label: "Incident Registry", icon: Activity },
  { href: "/sources", label: "Source Freshness", icon: RadioTower },
  { href: "/ingestion", label: "DataFusion Replay", icon: Workflow },
  { href: "/approvals", label: "Approval Workbench", icon: ClipboardCheck },
  { href: "/playbooks", label: "Response Playbooks", icon: BookOpenCheck },
  { href: "/help", label: "Help & Learning", icon: LifeBuoy },
  { href: "/admin", label: "Administration", icon: Settings2 },
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
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-stroke bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between border-b border-stroke px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="AEGIS home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent"><Command size={22}/></span>
            <span><strong className="block text-xl font-black tracking-[.16em]">AEGIS</strong><span className="text-[10px] font-bold uppercase tracking-[.21em] text-muted">Intelligence System</span></span>
          </Link>
          <button className="control h-9 w-9 !px-0 lg:hidden" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18}/></button>
        </div>
        <div className="px-4 pt-8"><p className="eyebrow px-3">Operations workspace</p>
          <nav className="mt-4 space-y-1" aria-label="Primary navigation">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? "bg-accent/10 text-accent" : "text-muted hover:bg-elevated hover:text-ink"}`}>
                <Icon size={18} aria-hidden="true" /><span className="flex-1">{label}</span>{active && <ChevronRight size={16} aria-hidden="true"/>}
              </Link>;
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300"><ShieldCheck size={15}/> Exercise environment</div>
            <p className="mt-2 text-xs leading-5 text-muted">Synthetic data only. No real emergency alerts or responder dispatch.</p>
          </div>
          <p className="mt-4 px-2 text-[11px] text-muted">AEGIS v0.2 · CipherCop 2026</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stroke bg-surface/95 px-4 backdrop-blur-lg sm:px-8">
          <div className="flex items-center gap-3">
            <button className="control h-10 w-10 !px-0 lg:hidden" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={19}/></button>
            <span className="hidden text-xs font-semibold uppercase tracking-[.16em] text-muted sm:inline">Public safety / Hyderabad</span>
            <span className="text-xs font-semibold text-muted sm:hidden">AEGIS / Exercise</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300 sm:inline-flex">
              <span className="status-dot bg-amber-400"/> Simulation mode
            </span>
            <GlobalSearch />
            <ThemeToggle />
            <OperatorAuth />
          </div>
        </div>
        <main id="main-content" className="mx-auto max-w-[1700px] px-4 pb-12 pt-8 sm:px-8">
          <div className="mb-8">
            <p className="eyebrow mb-2">Adaptive Emergency Geospatial Intelligence System</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-muted">{description}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
