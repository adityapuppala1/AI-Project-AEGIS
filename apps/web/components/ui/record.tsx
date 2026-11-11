"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useT } from "../language-provider";
import { codeLabel, isUuid, shortId } from "../../lib/labels";

/**
 * One record id, the same everywhere: shortened, full id in the title, a copy button, and a link when the record is an
 * incident. A non-UUID reference (an allowlisted code) is shown as its plain label with the code in the title.
 */
export function RecordRef({ id, kind, href, className = "" }: Readonly<{ id: string; kind?: "incident" | "proposal" | "run" | "task" | "record"; href?: string; className?: string }>) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!isUuid(id)) {
    // "known_events:2015-12-01" reads as "Known events 2015-12-01"; the raw reference stays in the title.
    const colon = id.indexOf(":");
    const text = colon > 0 ? `${t(codeLabel(id.slice(0, colon)))} ${id.slice(colon + 1)}` : t(codeLabel(id));
    return <span className={`record-ref ${className}`} title={id}><span>{text}</span></span>;
  }
  const target = href ?? (kind === "incident" ? `/incidents/${id}` : undefined);
  const copy = async () => {
    try { await navigator.clipboard.writeText(id); setCopied(true); } catch { setCopied(false); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };
  const text = shortId(id);
  return <span className={`record-ref ${className}`} title={id}>
    {target ? <Link href={target} aria-label={`${t("Open record")} ${id}`}>{text}</Link> : <span><span aria-hidden="true">{text}</span><span className="sr-only">{id}</span></span>}
    <button type="button" onClick={copy} aria-label={`${t("Copy full id")} ${id}`}>{copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}</button>
    <span aria-live="polite" className="sr-only">{copied ? t("Copied") : ""}</span>
  </span>;
}

/** A claim with the records it rests on. Use inside a plain <ul className="cite-list">; every line carries its refs. */
export function CitedLine({ children, refs, kindOf }: Readonly<{ children: ReactNode; refs: readonly string[]; kindOf?: (id: string) => "incident" | "record" }>) {
  const t = useT();
  return <li className="cite-line">
    <p>{children}</p>
    {refs.length > 0 && <span className="cite-refs"><span className="sr-only">{t("Sources")}: </span>{refs.map(ref => <RecordRef key={ref} id={ref} kind={kindOf?.(ref) ?? "record"} />)}</span>}
  </li>;
}
