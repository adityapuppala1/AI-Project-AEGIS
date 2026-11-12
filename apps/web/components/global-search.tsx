"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "./language-provider";
import { useRouter } from "next/navigation";
import { Command, LayoutDashboard, LifeBuoy, Search, X, Activity, SearchX, FileText } from "lucide-react";
import { EmptyState, ErrorState, Skeleton, Button, IconButton } from "./ui";
import type { Incident } from "../lib/types";
import { allPages } from "../lib/navigation";

type CommandItem = { label: string; description: string; href: string; kind: "page" | "incident"; group?: "pages" | "cases" | "help" };
const pages: CommandItem[] = allPages.map(page => ({ label: page.label, description: page.description, href: page.href, kind: "page" }));
const icons = allPages.map(page => page.icon);
const GROUPS = [
  { key: "pages", label: "Pages", icon: LayoutDashboard },
  { key: "cases", label: "Cases", icon: FileText },
  { key: "help", label: "Help", icon: LifeBuoy },
] as const;
function highlight(text: string, query: string) {
  const term = query.trim();
  if (!term) return text;
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark className="rounded-sm bg-accent/20 px-0.5 text-ink">{text.slice(at, at + term.length)}</mark>{text.slice(at + term.length)}</>;
}
const searchUrl = (term: string) => "/incidents?q=" + encodeURIComponent(term);

export function GlobalSearch() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [issue, setIssue] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
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
        if (open) close(); else setOpen(true);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", keyListener);
    return () => window.removeEventListener("keydown", keyListener);
  }, [open, close]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
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
    const matched = pages
      .filter(page => !term || (page.label + " " + page.description + " " + t(page.label) + " " + t(page.description)).toLowerCase().includes(term))
      .map(page => ({ ...page, group: page.href === "/help" ? "help" as const : "pages" as const }));
    const matches: CommandItem[] = incidents.map(item => ({
      label: item.hazard_type,
      description: "Synthetic case " + item.id.slice(0,8) + " · " + item.status,
      href: "/incidents/" + item.id, kind: "incident", group: "cases",
    }));
    const full: CommandItem[] = term ? [{
      label: 'Open full incident search: "' + query.trim().slice(0,70) + '"',
      description: "Search additional paginated results",
      href: searchUrl(query.trim()),
      kind: "page", group: "cases",
    }] : [];
    // Order follows the visible groups so arrow keys move through the list top to bottom.
    return [...matched.filter(item => item.group === "pages"), ...matches, ...full, ...matched.filter(item => item.group === "help")];
  }, [query, incidents, t]);
  useEffect(() => setActive(0), [query, incidents]);
  function navigate(href: string) {
    setOpen(false);setQuery("");setIncidents([]);setActive(0);
    router.push(href);
  }
  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !dialog.current) return;
    const targets = Array.from(dialog.current.querySelectorAll<HTMLElement>(':is(button, input, a[href]):not([disabled])'));
    if (!targets.length) return;
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {event.preventDefault();setActive(index => Math.min(Math.max(0, options.length - 1), index + 1));}
    if (event.key === "ArrowUp") {event.preventDefault();setActive(index => Math.max(0,index - 1));}
    if (event.key === "Enter" && options[active]) { event.preventDefault();navigate(options[active].href); }
  }
  return <>
    <Button className="min-w-11 gap-2 px-3 text-muted" type="button" ref={trigger} aria-label="Open global search. Shortcut Control K" onClick={() => setOpen(true)}>
      <Search size={17} aria-hidden="true"/><span className="hidden text-xs sm:inline">{t("Search anything")}</span><kbd className="hidden rounded border border-stroke px-1.5 py-0.5 text-[10px] lg:inline">Ctrl K</kbd>
    </Button>
    {open && <div className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[8vh] sm:pt-[14vh]">
      <button type="button" className="absolute inset-0 bg-[#17131f]/78 backdrop-blur-sm" aria-label="Close global search" onClick={close}/>
      <section role="dialog" ref={dialog} onKeyDown={trapFocus} aria-modal="true" aria-label="AEGIS global search" className="relative z-10 w-full max-w-[650px] overflow-hidden rounded-lg border border-stroke bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-stroke px-4 py-3">
          <Command size={19} className="shrink-0 text-accent"/>
          <input ref={input} className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-ink outline-hidden placeholder:text-muted"
            role="combobox" aria-autocomplete="list" aria-controls="aegis-global-results" aria-expanded={true}
            aria-activedescendant={options[active] ? "aegis-command-" + active : undefined}
            placeholder="Search navigation, incidents, documentation..." aria-label="Universal search term"
            value={query} maxLength={120} onChange={event => setQuery(event.target.value)} onKeyDown={handleInputKey}/>
          <IconButton size="sm" icon={X} label="Close global search" onClick={close}/>
        </div>
        <div id="aegis-global-results" role="listbox" aria-label="Matching pages and synthetic incidents" className="max-h-[min(65vh,420px)] overflow-y-auto p-2">
          {GROUPS.map(group => {
            const rows = options.map((option, index) => ({ option, index })).filter(row => (row.option.group ?? "pages") === group.key);
            if (rows.length === 0) return null;
            const GroupIcon = group.icon;
            return <div key={group.key} role="group" aria-labelledby={"aegis-group-" + group.key} className="mb-1">
              <p id={"aegis-group-" + group.key} className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-bold text-muted">
                <GroupIcon size={12} aria-hidden="true"/>{t(group.label)}</p>
              {rows.map(({ option, index }) => {
                const Icon = option.kind === "incident" ? Activity : icons[pages.findIndex(page => page.href === option.href)] || Search;
                return <button type="button" role="option" aria-selected={index === active} id={"aegis-command-" + index}
                  key={option.kind + option.href + index} onMouseEnter={() => setActive(index)}
                  onClick={() => navigate(option.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${index === active ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-elevated"}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-accent"><Icon size={17} aria-hidden="true"/></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{highlight(option.kind === "page" && option.group !== "cases" ? t(option.label) : option.label, query)}</span><span className="mt-1 block truncate text-xs text-muted">{option.kind === "page" && option.group !== "cases" ? t(option.description) : option.description}</span></span>
                  <span className="text-[11px] text-muted">{option.kind === "incident" ? t("CASE") : t("PAGE")}</span>
                </button>;
              })}
            </div>;
          })}
          {options.length === 0 && !waiting && <EmptyState icon={SearchX} title={t("No matches")}
            body={t("Try another term. No match does not mean an area is safe; only pages and synthetic exercise cases are searched.")}/>}
          {issue && <ErrorState className="m-2" message={t("Incident search is unavailable; page navigation still works.")}/>}
          {waiting && <div className="px-3 py-2" role="status"><span className="sr-only">{t("Searching exercise incidents...")}</span><div aria-hidden="true" className="space-y-2"><Skeleton className="h-8 w-full"/><Skeleton className="h-8 w-2/3"/></div></div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-stroke px-4 py-3 text-[11px] text-muted">
          <span>↑↓ Move · Enter Open · Esc Close</span><span>Exercise data only · No private records indexed</span>
        </div>
      </section>
    </div>}
  </>;
}
