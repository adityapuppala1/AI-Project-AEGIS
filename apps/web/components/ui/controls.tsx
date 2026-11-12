"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search, X, type LucideIcon } from "lucide-react";
import { useT } from "../language-provider";
import { nextIndex } from "./helpers";

export interface Option<V extends string = string> { value: V; label: string; icon?: LucideIcon; count?: number }

function useRoving(count: number, onMove: (index: number) => void, orientation: "horizontal" | "both") {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent, current: number) => {
    const target = nextIndex(event.key, current, count, orientation);
    if (target === null) return;
    event.preventDefault();
    refs.current[target]?.focus();
    onMove(target);
  };
  return { refs, onKeyDown };
}

/** Single-select radiogroup (arrow keys move and select, Home/End jump). Labels must already be translated. */
export function SegmentedControl<V extends string>({ options, value, onChange, label, className = "" }: Readonly<{
  options: readonly Option<V>[]; value: V; onChange: (value: V) => void; label: string; className?: string;
}>) {
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const { refs, onKeyDown } = useRoving(options.length, index => onChange(options[index].value), "both");
  return <div role="radiogroup" aria-label={label} className={`inline-flex flex-wrap gap-1 rounded-lg border border-stroke bg-elevated p-1 ${className}`}>
    {options.map((option, index) => {
      const on = index === selected; const Icon = option.icon;
      return <button key={option.value} ref={node => { refs.current[index] = node; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
        onClick={() => onChange(option.value)} onKeyDown={event => onKeyDown(event, index)}
        className={`inline-flex min-h-9 min-w-9 max-sm:min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${on ? "bg-surface text-accent shadow-sm ring-1 ring-accent/40" : "text-muted hover:text-ink"}`}>
        {Icon && <Icon size={14} aria-hidden="true" />}{option.label}</button>;
    })}
  </div>;
}

/** Multi-select toggle chips (aria-pressed). `selected` holds the chosen values. Labels are already translated. */
export function FilterChips<V extends string>({ options, selected, onToggle, label, className = "" }: Readonly<{
  options: readonly Option<V>[]; selected: ReadonlySet<V>; onToggle: (value: V) => void; label: string; className?: string;
}>) {
  return <div role="group" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
    {options.map(option => {
      const on = selected.has(option.value); const Icon = option.icon;
      return <button key={option.value} type="button" aria-pressed={on} onClick={() => onToggle(option.value)}
        className={`inline-flex min-h-9 min-w-9 max-sm:min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-elevated ${on ? "border-accent bg-accent/10" : "border-stroke bg-surface"}`}>
        {Icon && <Icon size={14} aria-hidden="true" />}{option.label}{option.count !== undefined && <span className="text-muted">{option.count}</span>}</button>;
    })}
  </div>;
}

/** Labelled search input with a clear button; `onChange` is debounced (default 250 ms), clear fires immediately. */
export function SearchField({ label, value, onChange, placeholder, debounceMs = 250, className = "" }: Readonly<{
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; debounceMs?: number; className?: string;
}>) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const input = useRef<HTMLInputElement>(null);
  const commit = (next: string) => { setDraft(next); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onChange(next), debounceMs); };
  const clear = () => { if (timer.current) clearTimeout(timer.current); setDraft(""); onChange(""); input.current?.focus(); };
  return <div role="search" className={`relative ${className}`}>
    <label htmlFor={id} className="sr-only">{label}</label>
    <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
    <input ref={input} id={id} type="search" value={draft} placeholder={placeholder} autoComplete="off" onChange={event => commit(event.target.value)}
      onKeyDown={event => { if (event.key === "Escape" && draft) { event.preventDefault(); clear(); } }} className="field pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden" />
    {draft && <button type="button" aria-label={t("Clear search")} onClick={clear} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink"><X size={14} aria-hidden="true" /></button>}
  </div>;
}

/** DOM ids may not contain whitespace; labels such as "All topics" are valid tab values. */
const idSlug = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, "-");

/**
 * Tabs with roving tabindex (arrows, Home, End) and automatic activation. Pair each tab with a TabPanel using the same
 * `idPrefix` (stable id string). Labels must already be translated.
 */
export function Tabs<V extends string>({ tabs, value, onChange, label, idPrefix, className = "" }: Readonly<{
  tabs: readonly Option<V>[]; value: V; onChange: (value: V) => void; label: string; idPrefix: string; className?: string;
}>) {
  const selected = Math.max(0, tabs.findIndex(tab => tab.value === value));
  const { refs, onKeyDown } = useRoving(tabs.length, index => onChange(tabs[index].value), "horizontal");
  return <div role="tablist" aria-label={label} className={`flex flex-wrap gap-1 border-b border-stroke ${className}`}>
    {tabs.map((tab, index) => {
      const on = index === selected; const Icon = tab.icon;
      return <button key={tab.value} ref={node => { refs.current[index] = node; }} type="button" role="tab" id={`${idPrefix}-tab-${idSlug(tab.value)}`}
        aria-selected={on} aria-controls={`${idPrefix}-panel-${idSlug(tab.value)}`} tabIndex={on ? 0 : -1}
        onClick={() => onChange(tab.value)} onKeyDown={event => onKeyDown(event, index)}
        className={`-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold ${on ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}>
        {Icon && <Icon size={14} aria-hidden="true" />}{tab.label}{tab.count !== undefined && <span className="text-xs text-muted">{tab.count}</span>}</button>;
    })}
  </div>;
}

export function TabPanel({ idPrefix, value, active, children, className = "" }: Readonly<{ idPrefix: string; value: string; active: boolean; children: ReactNode; className?: string }>) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${idSlug(value)}`} aria-labelledby={`${idPrefix}-tab-${idSlug(value)}`} hidden={!active} tabIndex={0} className={className}>{active ? children : null}</div>;
}
