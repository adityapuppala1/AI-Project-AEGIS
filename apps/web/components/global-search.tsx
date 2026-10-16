"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, ClipboardCheck, Command, LayoutDashboard, LifeBuoy, Search, Settings2, X, Activity } from "lucide-react";
import type { Incident } from "../lib/types";

type CommandItem = { label: string; description: string; href: string; kind: "page" | "incident" };
const pages: CommandItem[] = [
  { label: "Command Center", description: "System overview and geospatial map", href: "/", kind: "page" },
  { label: "Incident Registry", description: "Search, sort and filter exercise incidents", href: "/incidents", kind: "page" },
  { label: "Approval Workbench", description: "Authenticated maker-checker workflow", href: "/approvals", kind: "page" },
  { label: "Response Playbooks", description: "Emergency exercise procedures", href: "/playbooks", kind: "page" },
  { label: "Administration", description: "Policy and integration previews", href: "/admin", kind: "page" },
  { label: "Self Help & FAQ", description: "Guides, shortcuts, troubleshooting and AI explanations", href: "/help", kind: "page" },
];
const icons = [LayoutDashboard, Activity, ClipboardCheck, BookOpenCheck, Settings2, LifeBuoy];
const searchUrl = (term: string) => "/incidents?q=" + encodeURIComponent(term);

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [issue, setIssue] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setIncidents([]);
    setActive(0);
    // Restore keyboard focus to the previous search control.
    requestAnimationFrame(() => trigger.current?.focus());
  }, []);
  useEffect(() => {
    const keyListener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(state => !state);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", keyListener);
    return () => window.removeEventListener("keydown", keyListener);
  }, []);
  useEffect(() => {
    if (open) {
      input.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setWaiting(true);
      const params = new URLSearchParams({ search: query.trim(), page_size: "8", sort: "created_at", direction: "desc" });
      fetch("/api/incidents/query?" + params.toString(), { cache: "no-store", signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error("Incident search unavailable");
          const data: { items?: Incident[] } = await response.json();
          if (!controller.signal.aborted) {
            setIncidents(Array.isArray(data.items) ? data.items : []);
            setIssue(false);
          }
        })
        .catch(() => { if (!controller.signal.aborted) { setIncidents([]);setIssue(true); } })
        .finally(() => { if (!controller.signal.aborted) setWaiting(false); });
    }, 250);
    return () => { window.clearTimeout(timer);controller.abort(); };
  }, [open, query]);
  const options = useMemo<CommandItem[]>(() => {
    const term = query.trim().toLowerCase();
    const matched = pages.filter(page => !term || (page.label + " " + page.description).toLowerCase().includes(term));
    const matches: CommandItem[] = incidents.map(item => ({
      label: item.hazard_type,
      description: "Synthetic case " + item.id.slice(0,8) + " · " + item.status,
      href: searchUrl(item.hazard_type), kind: "incident",
    }));
    return [...matched, ...matches, ...(term ? [{
      label: 'Open full incident search: "' + query.trim().slice(0,70) + '"',
      description: "Search additional paginated results",
      href: searchUrl(query.trim()),
      kind: "page" as const,
    }] : [])];
  }, [query, incidents]);
  useEffect(() => setActive(0), [query, incidents]);
  function navigate(href: string) {
    setOpen(false);setQuery("");setIncidents([]);setActive(0);
    router.push(href);
  }
  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {event.preventDefault();setActive(index => Math.min(options.length - 1, index + 1));}
    if (event.key === "ArrowUp") {event.preventDefault();setActive(index => Math.max(0,index - 1));}
    if (event.key === "Enter" && options[active]) { event.preventDefault();navigate(options[active].href); }
  }
  return <>
    <button type="button" ref={trigger} className="control h-10 gap-2 px-3 text-muted"
      aria-label="Open global search. Shortcut Control K" onClick={() => setOpen(true)}>
      <Search size={17} aria-hidden="true"/><span className="hidden text-xs sm:inline">Search anything</span><kbd className="hidden rounded border border-stroke px-1.5 py-0.5 text-[10px] lg:inline">Ctrl K</kbd>
    </button>
    {open && <div className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[8vh] sm:pt-[14vh]">
      <button type="button" className="absolute inset-0 bg-[#07101c]/75 backdrop-blur-sm" aria-label="Close global search" onClick={close}/>
      <section role="dialog" aria-modal="true" aria-label="AEGIS global search" className="relative z-10 w-full max-w-[650px] overflow-hidden rounded-2xl border border-stroke bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-stroke px-4 py-3">
          <Command size={19} className="shrink-0 text-accent"/>
          <input ref={input} className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-muted"
            role="combobox" aria-autocomplete="list" aria-controls="aegis-global-results" aria-expanded={true}
            aria-activedescendant={options[active] ? "aegis-command-" + active : undefined}
            placeholder="Search navigation, incidents, documentation..." aria-label="Universal search term"
            value={query} maxLength={120} onChange={event => setQuery(event.target.value)} onKeyDown={handleInputKey}/>
          <button type="button" className="control h-8 w-8 !min-h-8 !p-0" aria-label="Close global search" onClick={close}><X size={15}/></button>
        </div>
        <div id="aegis-global-results" role="listbox" aria-label="Matching pages and synthetic incidents" className="max-h-[min(65vh,420px)] overflow-y-auto p-2">
          {options.length === 0 && !waiting && <p className="p-6 text-center text-sm text-muted">No matches. Try another term.</p>}
          {options.map((option,index) => {
            const Icon = option.kind === "incident" ? Activity : icons[pages.findIndex(page => page.href === option.href)] || Search;
            return <button type="button" role="option" aria-selected={index === active} id={"aegis-command-" + index}
              key={option.kind + option.href + index} onMouseEnter={() => setActive(index)}
              onClick={() => navigate(option.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${index === active ? "bg-accent/10" : "hover:bg-elevated"}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-accent"><Icon size={17}/></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{option.label}</span><span className="mt-1 block truncate text-xs text-muted">{option.description}</span></span>
              <span className="text-[11px] text-muted">{option.kind === "incident" ? "CASE" : "PAGE"}</span>
            </button>;
          })}
          {issue && <p role="status" className="px-4 py-2 text-xs text-amber-600 dark:text-amber-300">Incident search is unavailable; page navigation still works.</p>}
          {waiting && <p className="px-4 py-2 text-xs text-muted" role="status">Searching exercise incidents...</p>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-stroke px-4 py-3 text-[11px] text-muted">
          <span>↑↓ Move · Enter Open · Esc Close</span><span>Exercise data only · No private records indexed</span>
        </div>
      </section>
    </div>}
  </>;
}
