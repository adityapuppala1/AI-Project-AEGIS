"use client";

// Network Identifier Master (docs/NETWORK_IDENTIFIER_MASTER.md): the admin registry of satellite, mobile, fixed-line and
// tower providers and synthetic assets. platform_admin only; the API repeats every check. Nothing on this page connects
// to or sends through any provider. Rehearsal link states only name and preselect the Resilient Sensor Link lanes.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity, Building2, Cable, Box, ExternalLink, History, Layers, Pause, Pencil, Play, Plus, RadioTower, RotateCcw, Satellite, Signal,
  Trash2, Power, PowerOff, type LucideIcon,
} from "lucide-react";
import { AppShell } from "../app-shell";
import { useT } from "../language-provider";
import { PatentCredit } from "../patent-credit";
import { Button, Dialog, EmptyState, ErrorState, Panel, PermissionState, SkeletonRows, SortableTable, StatTile, StatusPill, TabPanel, Tabs, prefersReducedMotion, type TableColumn, type Tone } from "../ui";
import { useOperatorSession } from "../../lib/use-operator-session";
import { codeLabel } from "../../lib/labels";
import { LOGO_MARKS, LOGO_SET, OWNERSHIP_NOTE } from "../../lib/network-logos";
import {
  COLOURS, DOC_KIND_LABEL, KIND_LABEL, STATE_LABEL, CODE_PATTERN, MCC_MNC_PATTERN, MONOGRAM_PATTERN, isSatellite, isTerrestrial, monogramFor,
  type Asset, type AuditRow, type Provider, type ProviderKind, type Registry, type RehearsalState,
} from "../../lib/network-registry";
import { ProviderMark } from "./provider-mark";
import { createNetworkScene, type Focus, type NetworkScene } from "./network-scene";

type View = "overview" | "satellite" | "terrestrial" | "assets" | "integrations" | "activity";
const KIND_ICON: Record<ProviderKind, LucideIcon> = { satellite: Satellite, terrestrial_mobile: Signal, terrestrial_fixed: Cable, tower_operator: RadioTower, public_reference: Layers };
const STATE_TONE: Record<RehearsalState, Tone> = { up: "success", degraded: "warning", down: "danger" };
const NO_LIVE = "Registry and rehearsal only. IndTrana has no live connection to any provider, and nothing is sent through any network.";

class ApiError extends Error { constructor(public code: string) { super(code); } }
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/networks" + path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError("network_registry_unavailable"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof data?.code === "string" ? data.code : "network_registry_unavailable");
  return data as T;
}

export { ProviderMark };

function Schematic2D({ focus, state }: Readonly<{ focus: Focus; state: RehearsalState }>) {
  const t = useT();
  const link = { up: "#16a34a", degraded: "#d97706", down: "#dc2626" }[state];
  return <svg viewBox="0 0 400 220" className="h-full w-full" role="img" aria-label={t("Schematic of a satellite on an orbit ring and a lattice tower. Not a real orbit, position or coverage.")}>
    <ellipse cx="200" cy="150" rx="170" ry="48" fill="none" stroke="currentColor" strokeOpacity=".35" strokeDasharray="5 4" />
    <circle cx="200" cy="170" r="70" fill="rgb(var(--accent) / .12)" stroke="currentColor" strokeOpacity=".25" />
    {state !== "down" && <line x1="140" y1="88" x2="300" y2="50" stroke={link} strokeWidth="2" strokeDasharray="6 4" />}
    <g transform="translate(300 50)" className={focus === "satellite" ? "text-accent" : ""}>
      <rect x="-9" y="-9" width="18" height="18" rx="2" fill="currentColor" />
      <rect x="-34" y="-4" width="22" height="8" fill="#1d4ed8" /><rect x="12" y="-4" width="22" height="8" fill="#1d4ed8" />
      {focus === "satellite" && <circle r="26" fill="none" stroke="currentColor" strokeWidth="2" />}
    </g>
    <g transform="translate(140 132)" className={focus === "tower" ? "text-accent" : ""} stroke="currentColor" strokeWidth="2" fill="none">
      <path d="M-14 0 L0 -44 L14 0 M-10 -12 L10 -12 M-6 -26 L6 -26 M-10 -12 L6 -26 M10 -12 L-6 -26" />
      <circle cy="-44" r="4" fill="currentColor" />
      {state !== "down" && <circle cy="-44" r="12" strokeOpacity=".5" className="motion-safe:animate-ping" style={{ transformOrigin: "0 -44px" }} />}
      {focus === "tower" && <circle cy="-22" r="30" />}
    </g>
  </svg>;
}

function Scene({ focus, state, colour }: Readonly<{ focus: Focus; state: RehearsalState; colour: string }>) {
  const t = useT();
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<NetworkScene | null>(null);
  const reduced = typeof window !== "undefined" && prefersReducedMotion();
  useEffect(() => {
    if (mode !== "3d" || !canvas.current) return;
    const dark = document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark";
    const made = createNetworkScene(canvas.current, { reducedMotion: reduced, dark });
    if (!made) { setFailed(true); setMode("2d"); return; }
    scene.current = made;
    return () => { made.dispose(); scene.current = null; };
  }, [mode, reduced]);
  useEffect(() => { scene.current?.setFocus(focus, state, colour); }, [focus, state, colour, mode]);
  useEffect(() => { scene.current?.setPaused(paused); }, [paused, mode]);
  return <div data-tour="nm-scene">
    <div className="relative h-56 overflow-hidden rounded-lg border border-stroke bg-surface-2 sm:h-72">
      {mode === "3d" ? <canvas ref={canvas} className="h-full w-full" aria-label={t("3D schematic of a satellite and a tower. Not a real orbit, position or coverage.")} role="img" />
        : <Schematic2D focus={focus} state={state} />}
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" icon={Box} onClick={() => setMode(mode === "3d" ? "2d" : "3d")} className="hidden sm:inline-flex">{mode === "3d" ? t("Show 2D") : t("Show 3D")}</Button>
      {mode === "3d" && !reduced && <Button size="sm" variant="quiet" icon={paused ? Play : Pause} onClick={() => setPaused(!paused)}>{paused ? t("Play") : t("Pause")}</Button>}
      <p className="text-xs text-muted">{t("Schematic. Not a real orbit, position or coverage.")}{reduced && mode === "3d" ? " " + t("Motion is reduced, so this is a still frame.") : ""}{failed ? " " + t("3D is not available in this browser, so the 2D schematic is shown.") : ""}</p>
    </div>
  </div>;
}

interface Draft { code: string; display_name: string; kind: ProviderKind; orbit_class: string; constellation_group: string; mcc_mnc: string; asn: string; bands: string[]; monogram: string; colour_token: string; logo_key: string; notes: string; doc_link_id: string; rehearsal_capacity_kbps: string }
const emptyDraft = (kind: ProviderKind): Draft => ({ code: "", display_name: "", kind, orbit_class: kind === "satellite" ? "leo" : "", constellation_group: "", mcc_mnc: "", asn: "", bands: [], monogram: "", colour_token: "c1", logo_key: "", notes: "", doc_link_id: "", rehearsal_capacity_kbps: "400" });
const draftOf = (p: Provider): Draft => ({ code: p.code, display_name: p.display_name, kind: p.kind, orbit_class: p.orbit_class ?? "", constellation_group: p.constellation_group ?? "", mcc_mnc: p.mcc_mnc.join(", "), asn: p.asn.join(", "), bands: p.bands, monogram: p.monogram, colour_token: p.colour_token, logo_key: p.logo_key ?? "", notes: p.notes ?? "", doc_link_id: p.doc_link_id ?? "", rehearsal_capacity_kbps: String(p.rehearsal_capacity_kbps) });
const list = (text: string) => text.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);

function draftProblem(d: Draft): string | null {
  if (!CODE_PATTERN.test(d.code)) return "network_code_format";
  if (d.display_name.trim().length < 2) return "network_name_length";
  if (!MONOGRAM_PATTERN.test(d.monogram || monogramFor(d.display_name))) return "network_monogram_format";
  if (list(d.mcc_mnc).some(item => !MCC_MNC_PATTERN.test(item))) return "network_mcc_mnc_format";
  if (list(d.asn).some(item => !/^\d{1,10}$/.test(item))) return "network_asn_format";
  if (!/^\d{1,6}$/.test(d.rehearsal_capacity_kbps) || Number(d.rehearsal_capacity_kbps) > 100000) return "network_capacity_range";
  return null;
}
const bodyOf = (d: Draft) => ({
  code: d.code, display_name: d.display_name.trim(), kind: d.kind, orbit_class: isSatellite(d.kind) && d.orbit_class ? d.orbit_class : null,
  constellation_group: isSatellite(d.kind) && d.constellation_group ? d.constellation_group : null, mcc_mnc: list(d.mcc_mnc), asn: list(d.asn).map(Number),
  bands: d.bands, monogram: d.monogram || monogramFor(d.display_name), colour_token: d.colour_token, logo_key: d.logo_key || null,
  notes: d.notes.trim() || null, doc_link_id: d.doc_link_id || null, rehearsal_capacity_kbps: Number(d.rehearsal_capacity_kbps),
});

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: ReactNode }>) {
  return <label className="block text-sm"><span className="font-semibold">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}<span className="mt-1 block">{children}</span></label>;
}
const inputClass = "control w-full";

function ProviderDialog({ open, onClose, registry, editing, initialKind, onSaved }: Readonly<{ open: boolean; onClose: () => void; registry: Registry; editing: Provider | null; initialKind: ProviderKind; onSaved: (message: string) => void }>) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(emptyDraft(initialKind));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDraft(editing ? draftOf(editing) : emptyDraft(initialKind)); setError(""); } }, [open, editing, initialKind]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(old => ({ ...old, [key]: value }));
  const c = registry.catalogue;
  const save = async () => {
    const problem = draftProblem(draft);
    if (problem) { setError(codeLabel(problem)); return; }
    setBusy(true);
    try {
      if (editing) await call("PUT", `/providers/${editing.id}`, { ...bodyOf(draft), expected_version: editing.version });
      else await call("POST", "/providers", bodyOf(draft));
      onSaved(editing ? t("Provider saved.") : t("Provider added. It starts disabled."));
    } catch (e) { setError(codeLabel(e instanceof ApiError ? e.code : "network_registry_unavailable")); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }} title={editing ? t("Edit provider") : t("Add provider")}
    description={t("Names, identifiers and a rehearsal link state. Documentation links come from a reviewed list; no address can be typed.")}
    footer={<div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{t("Save")}</Button></div>}>
    <div className="mt-3 grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
      <Field label={t("Display name")}><input className={inputClass} value={draft.display_name} maxLength={80} onChange={e => set("display_name", e.target.value)} /></Field>
      <Field label={t("Code")} hint={t("2 to 40 lowercase letters, digits or _")}><input className={inputClass} value={draft.code} maxLength={40} onChange={e => set("code", e.target.value.toLowerCase())} /></Field>
      <Field label={t("Kind")}><select className={inputClass} value={draft.kind} onChange={e => set("kind", e.target.value as ProviderKind)}>{c.kinds.map(k => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}</select></Field>
      <Field label={t("Monogram")} hint={t("1 to 3 capital letters or digits, shown when no logo is available")}><input className={inputClass} value={draft.monogram} maxLength={3} placeholder={monogramFor(draft.display_name || "N")} onChange={e => set("monogram", e.target.value.toUpperCase())} /></Field>
      {isSatellite(draft.kind) && <>
        <Field label={t("Orbit class")}><select className={inputClass} value={draft.orbit_class} onChange={e => set("orbit_class", e.target.value)}><option value="">{t("Not set")}</option>{c.orbit_classes.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}</select></Field>
        <Field label={t("Public orbital data group")} hint={t("CelesTrak group name, for reference")}><select className={inputClass} value={draft.constellation_group} onChange={e => set("constellation_group", e.target.value)}><option value="">{t("Not set")}</option>{c.groups.map(g => <option key={g} value={g}>{g}</option>)}</select></Field>
      </>}
      {isTerrestrial(draft.kind) && <>
        <Field label={t("MCC-MNC codes")} hint={t("For example 404-10, separated by commas")}><input className={inputClass} value={draft.mcc_mnc} onChange={e => set("mcc_mnc", e.target.value)} /></Field>
        <Field label={t("Autonomous system numbers")} hint={t("Digits, separated by commas")}><input className={inputClass} value={draft.asn} onChange={e => set("asn", e.target.value)} /></Field>
      </>}
      <Field label={t("Colour")}><div className="flex flex-wrap gap-1.5">{c.colours.map(token => <button key={token} type="button" aria-label={t("Colour") + " " + token} aria-pressed={draft.colour_token === token} onClick={() => set("colour_token", token)} className={`h-7 w-7 rounded-md border-2 ${draft.colour_token === token ? "border-ink" : "border-transparent"}`} style={{ background: COLOURS[token] }} />)}</div></Field>
      <Field label={t("Logo")} hint={t("Only marks bundled with IndTrana can be chosen")}><select className={inputClass} value={draft.logo_key} onChange={e => set("logo_key", e.target.value)}><option value="">{t("None (monogram)")}</option>{c.logo_keys.map(k => <option key={k} value={k}>{LOGO_MARKS[k].title}</option>)}</select></Field>
      <Field label={t("Documentation link")}><select className={inputClass} value={draft.doc_link_id} onChange={e => set("doc_link_id", e.target.value)}><option value="">{t("No link")}</option>{Object.entries(c.links).map(([id, link]) => <option key={id} value={id}>{new URL(link.url).hostname} · {t(DOC_KIND_LABEL[link.kind])}</option>)}</select></Field>
      <Field label={t("Rehearsal capacity (kbps)")} hint={t("A synthetic rehearsal value, not a measurement")}><input className={inputClass} inputMode="numeric" value={draft.rehearsal_capacity_kbps} onChange={e => set("rehearsal_capacity_kbps", e.target.value.replace(/\D/g, ""))} /></Field>
      <div className="sm:col-span-2"><Field label={t("Bands")}><div className="flex flex-wrap gap-1.5">{c.bands.map(b => { const on = draft.bands.includes(b); return <button key={b} type="button" aria-pressed={on} onClick={() => set("bands", on ? draft.bands.filter(x => x !== b) : [...draft.bands, b])} className={`control control-sm ${on ? "border-accent text-accent" : ""}`}>{b}</button>; })}</div></Field></div>
      <div className="sm:col-span-2"><Field label={t("Notes")} hint={t("Up to 500 characters. Do not enter passwords or keys here.")}><textarea className={inputClass} rows={2} maxLength={500} value={draft.notes} onChange={e => set("notes", e.target.value)} /></Field></div>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </Dialog>;
}

function ConfirmDelete({ target, onClose, onDone }: Readonly<{ target: { kind: "provider" | "asset"; id: string; name: string; version: number } | null; onClose: () => void; onDone: (message: string) => void }>) {
  const t = useT();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => setError(""), [target]);
  const go = async () => {
    if (!target) return;
    setBusy(true);
    try { await call("POST", `/${target.kind === "provider" ? "providers" : "assets"}/${target.id}/delete`, { expected_version: target.version }); onDone(t("Deleted. It can be restored from the list with deleted entries shown.")); }
    catch (e) { setError(codeLabel(e instanceof ApiError ? e.code : "network_registry_unavailable")); } finally { setBusy(false); }
  };
  return <Dialog open={Boolean(target)} onOpenChange={next => { if (!next) onClose(); }} title={t("Delete") + " " + (target?.name ?? "")}
    description={t("The entry is hidden and switched off. Its history stays in the activity record, and it can be restored.")}
    footer={<div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>{t("Cancel")}</Button><Button variant="danger" loading={busy} icon={Trash2} onClick={() => void go()}>{t("Delete")}</Button></div>}>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </Dialog>;
}

function AssetDialog({ open, onClose, registry, editing, onSaved }: Readonly<{ open: boolean; onClose: () => void; registry: Registry; editing: Asset | null; onSaved: (message: string) => void }>) {
  const t = useT();
  const live = registry.providers.filter(p => !p.deleted_at);
  const [d, setD] = useState({ provider_id: "", asset_type: "tower", label: "", norad_id: "", latitude: "", longitude: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    setD(editing ? { provider_id: editing.provider_id, asset_type: editing.asset_type, label: editing.label, norad_id: editing.norad_id ? String(editing.norad_id) : "", latitude: editing.latitude?.toString() ?? "", longitude: editing.longitude?.toString() ?? "" }
      : { provider_id: live[0]?.id ?? "", asset_type: "tower", label: "", norad_id: "", latitude: "", longitude: "" });
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const lat = d.latitude === "" ? null : Number(d.latitude), lon = d.longitude === "" ? null : Number(d.longitude);
    if (d.label.trim().length < 2) { setError(codeLabel("network_name_length")); return; }
    if ((lat === null) !== (lon === null)) { setError(codeLabel("network_location_incomplete")); return; }
    if (lat !== null && (!(lat >= 6 && lat <= 38) || !(lon! >= 68 && lon! <= 98))) { setError(codeLabel("network_location_outside")); return; }
    const body = { provider_id: d.provider_id, asset_type: d.asset_type, label: d.label.trim(), norad_id: d.norad_id ? Number(d.norad_id) : null, latitude: lat, longitude: lon };
    setBusy(true);
    try {
      if (editing) await call("PUT", `/assets/${editing.id}`, { ...body, expected_version: editing.version }); else await call("POST", "/assets", body);
      onSaved(t("Asset saved."));
    } catch (e) { setError(codeLabel(e instanceof ApiError ? e.code : "network_registry_unavailable")); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }} title={editing ? t("Edit asset") : t("Add asset")}
    description={t("Assets are synthetic rehearsal entries. Locations must be inside India and are not real sites.")}
    footer={<div className="flex justify-end gap-2"><Button variant="quiet" onClick={onClose}>{t("Cancel")}</Button><Button variant="primary" loading={busy} onClick={() => void save()}>{t("Save")}</Button></div>}>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label={t("Provider")}><select className={inputClass} value={d.provider_id} onChange={e => setD({ ...d, provider_id: e.target.value })}>{live.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field>
      <Field label={t("Type")}><select className={inputClass} value={d.asset_type} onChange={e => setD({ ...d, asset_type: e.target.value })}>{registry.catalogue.asset_types.map(a => <option key={a} value={a}>{codeLabel("asset_" + a)}</option>)}</select></Field>
      <div className="sm:col-span-2"><Field label={t("Label")}><input className={inputClass} maxLength={80} value={d.label} onChange={e => setD({ ...d, label: e.target.value })} /></Field></div>
      <Field label={t("Latitude")} hint="6 to 38"><input className={inputClass} inputMode="decimal" value={d.latitude} onChange={e => setD({ ...d, latitude: e.target.value })} /></Field>
      <Field label={t("Longitude")} hint="68 to 98"><input className={inputClass} inputMode="decimal" value={d.longitude} onChange={e => setD({ ...d, longitude: e.target.value })} /></Field>
      <Field label={t("NORAD catalogue number")} hint={t("Optional, satellites only")}><input className={inputClass} inputMode="numeric" value={d.norad_id} onChange={e => setD({ ...d, norad_id: e.target.value.replace(/\D/g, "") })} /></Field>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </Dialog>;
}

export function NetworkMaster() {
  const t = useT();
  const session = useOperatorSession();
  const isAdmin = Boolean(session?.roles?.includes("platform_admin"));
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("overview");
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; editing: Provider | null; kind: ProviderKind }>({ open: false, editing: null, kind: "satellite" });
  const [assetDialog, setAssetDialog] = useState<{ open: boolean; editing: Asset | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<{ kind: "provider" | "asset"; id: string; name: string; version: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([call<Registry>("GET", showDeleted ? "?include_deleted=true" : ""), call<{ rows: AuditRow[] }>("GET", "/audit").catch(() => ({ rows: [] }))]);
      setRegistry(r); setAudit(a.rows); setError("");
    } catch (e) { setError(codeLabel(e instanceof ApiError ? e.code : "network_registry_unavailable")); }
  }, [showDeleted]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const done = (text: string) => { setMessage(text); setDialog(d => ({ ...d, open: false })); setAssetDialog({ open: false, editing: null }); setDeleting(null); void load(); };
  const act = async (key: string, method: string, path: string, body: unknown, text: string) => {
    setBusy(key);
    try { await call(method, path, body); done(text); } catch (e) { setMessage(""); setError(codeLabel(e instanceof ApiError ? e.code : "network_registry_unavailable")); void load(); } finally { setBusy(null); }
  };

  const providers = registry?.providers ?? [];
  const chosen = providers.find(p => p.id === selected) ?? providers.find(p => p.enabled && isSatellite(p.kind) && !p.deleted_at) ?? providers.find(p => isSatellite(p.kind) && !p.deleted_at) ?? providers[0];
  const focus: Focus = chosen ? (isSatellite(chosen.kind) ? "satellite" : chosen.kind === "public_reference" ? null : "tower") : null;
  const counts = useMemo(() => ({
    enabled: providers.filter(p => p.enabled && !p.deleted_at).length, satellite: providers.filter(p => isSatellite(p.kind) && !p.deleted_at).length,
    terrestrial: providers.filter(p => (isTerrestrial(p.kind) || p.kind === "tower_operator") && !p.deleted_at).length, assets: (registry?.assets ?? []).filter(a => !a.deleted_at).length,
  }), [providers, registry]);
  const nameOf = (id: string) => providers.find(p => p.id === id)?.display_name ?? t("Unknown provider");

  const providerColumns: TableColumn<Provider>[] = [
    { key: "name", label: t("Provider"), sortValue: p => p.display_name, cell: p => <button type="button" onClick={() => setSelected(p.id)} className="flex min-w-0 items-center gap-2 text-left" aria-pressed={chosen?.id === p.id}>
      <ProviderMark provider={p} size={32} /><span className="min-w-0"><span className="block truncate font-semibold">{p.display_name}</span>
        <span className="block text-xs text-muted">{t(KIND_LABEL[p.kind])}{p.is_reference ? " · " + t("Reference entry, not a partnership") : ""}</span></span></button> },
    { key: "ids", label: t("Identifiers"), cell: p => <span className="text-xs">{[p.orbit_class?.toUpperCase(), p.constellation_group, ...p.mcc_mnc, ...p.asn.map(n => "AS" + n)].filter(Boolean).join(" · ") || "—"}<span className="block text-muted">{p.bands.join(", ")}</span></span> },
    { key: "state", label: t("Rehearsal link"), sortValue: p => p.rehearsal_state, cell: p => p.deleted_at ? <StatusPill tone="neutral">{t("Deleted")}</StatusPill> :
      <select aria-label={t("Rehearsal link state for") + " " + p.display_name} className="control control-sm" value={p.rehearsal_state} disabled={busy !== null}
        onChange={e => void act(p.id + "s", "PUT", `/providers/${p.id}/rehearsal`, { state: e.target.value, capacity_kbps: p.rehearsal_capacity_kbps, expected_version: p.version }, t("Rehearsal link state saved."))}>
        {(["up", "degraded", "down"] as RehearsalState[]).map(s => <option key={s} value={s}>{t(STATE_LABEL[s])}</option>)}</select> },
    { key: "enabled", label: t("Status"), sortValue: p => p.deleted_at ? 2 : p.enabled ? 0 : 1, cell: p => <StatusPill tone={p.deleted_at ? "neutral" : p.enabled ? "success" : "neutral"}>{p.deleted_at ? t("Deleted") : p.enabled ? t("Enabled") : t("Disabled")}</StatusPill> },
    { key: "actions", label: t("Actions"), cell: p => <div className="flex flex-wrap gap-1">{p.deleted_at
      ? <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy === p.id} onClick={() => void act(p.id, "POST", `/providers/${p.id}/restore`, { expected_version: p.version }, t("Restored. It stays disabled until you enable it."))}>{t("Restore")}</Button>
      : <>
        <Button size="sm" variant="secondary" icon={p.enabled ? PowerOff : Power} loading={busy === p.id} onClick={() => void act(p.id, "POST", `/providers/${p.id}/${p.enabled ? "disable" : "enable"}`, { expected_version: p.version }, p.enabled ? t("Disabled.") : t("Enabled."))}>{p.enabled ? t("Disable") : t("Enable")}</Button>
        <Button size="sm" variant="quiet" icon={Pencil} onClick={() => setDialog({ open: true, editing: p, kind: p.kind })}>{t("Edit")}</Button>
        <Button size="sm" variant="quiet" icon={Trash2} onClick={() => setDeleting({ kind: "provider", id: p.id, name: p.display_name, version: p.version })}>{t("Delete")}</Button>
      </>}</div> },
  ];

  const providerTable = (rows: Provider[], kind: ProviderKind) => <div>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button variant="primary" icon={Plus} data-tour="nm-add" onClick={() => setDialog({ open: true, editing: null, kind })}>{t("Add provider")}</Button>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />{t("Show deleted entries")}</label>
    </div>
    <SortableTable label={t("Providers")} rows={rows} columns={providerColumns} rowKey={p => p.id} minWidth="52rem"
      empty={<EmptyState title={t("No providers here yet")} body={t("Add a provider to name it in rehearsals.")} />} />
  </div>;

  const assetColumns: TableColumn<Asset>[] = [
    { key: "label", label: t("Asset"), sortValue: a => a.label, cell: a => <span><span className="block font-semibold">{a.label}</span><span className="text-xs text-muted">{codeLabel("asset_" + a.asset_type)} · {t("Synthetic")}</span></span> },
    { key: "provider", label: t("Provider"), sortValue: a => nameOf(a.provider_id), cell: a => nameOf(a.provider_id) },
    { key: "where", label: t("Synthetic location"), cell: a => a.latitude !== null ? <span className="tnum text-xs">{a.latitude.toFixed(3)}, {a.longitude?.toFixed(3)}</span> : "—" },
    { key: "status", label: t("Status"), cell: a => <StatusPill tone={a.deleted_at ? "neutral" : a.enabled ? "success" : "neutral"}>{a.deleted_at ? t("Deleted") : a.enabled ? t("Enabled") : t("Disabled")}</StatusPill> },
    { key: "actions", label: t("Actions"), cell: a => <div className="flex flex-wrap gap-1">{a.deleted_at
      ? <Button size="sm" variant="secondary" icon={RotateCcw} loading={busy === a.id} onClick={() => void act(a.id, "POST", `/assets/${a.id}/restore`, { expected_version: a.version }, t("Restored."))}>{t("Restore")}</Button>
      : <>
        <Button size="sm" variant="secondary" icon={a.enabled ? PowerOff : Power} loading={busy === a.id} onClick={() => void act(a.id, "POST", `/assets/${a.id}/${a.enabled ? "disable" : "enable"}`, { expected_version: a.version }, a.enabled ? t("Disabled.") : t("Enabled."))}>{a.enabled ? t("Disable") : t("Enable")}</Button>
        <Button size="sm" variant="quiet" icon={Pencil} onClick={() => setAssetDialog({ open: true, editing: a })}>{t("Edit")}</Button>
        <Button size="sm" variant="quiet" icon={Trash2} onClick={() => setDeleting({ kind: "asset", id: a.id, name: a.label, version: a.version })}>{t("Delete")}</Button>
      </>}</div> },
  ];

  const auditColumns: TableColumn<AuditRow>[] = [
    { key: "at", label: t("When"), sortValue: r => r.at, cell: r => <span className="tnum text-xs">{new Date(r.at).toLocaleString()}</span> },
    { key: "what", label: t("Change"), cell: r => <span>{codeLabel("network_action_" + r.action)} · {r.entity === "provider" ? nameOf(r.entity_id) : t("Asset")}</span> },
    { key: "fields", label: t("Fields"), cell: r => <span className="text-xs text-muted">{r.changed_fields.join(", ") || "—"}</span> },
    { key: "who", label: t("By"), sortValue: r => r.actor, cell: r => <span className="text-xs">{r.actor}</span> },
    { key: "version", label: t("Version"), numeric: true, cell: r => <span className="tnum">{r.from_version ?? "—"} → {r.to_version}</span> },
  ];
  const rehearsalStats = useMemo(() => {
    const byProvider = new Map<string, number>();
    for (const row of audit) if (row.action === "rehearsal_state") byProvider.set(row.entity_id, (byProvider.get(row.entity_id) ?? 0) + 1);
    return [...byProvider.entries()].sort((a, b) => b[1] - a[1]);
  }, [audit]);

  const tabs = [
    { value: "overview" as const, label: t("Overview"), icon: Activity },
    { value: "satellite" as const, label: t("Satellite networks"), icon: Satellite, count: counts.satellite },
    { value: "terrestrial" as const, label: t("Terrestrial networks"), icon: Signal, count: counts.terrestrial },
    { value: "assets" as const, label: t("Towers and assets"), icon: RadioTower, count: counts.assets },
    { value: "integrations" as const, label: t("Integrations"), icon: ExternalLink },
    { value: "activity" as const, label: t("Activity"), icon: History },
  ];

  return <AppShell title="Network Identifier Master" description="Satellite, mobile, fixed-line and tower providers, their identifiers and their rehearsal link states. Registry and rehearsal only.">
    {!session ? <SkeletonRows rows={4} /> : !isAdmin ? <PermissionState needs={["platform_admin"]} roles={session.roles} what={t("Only an administrator can configure network providers. The Resilient Sensor Link page shows the configured names to everyone.")} where={{ href: "/sensor-link", label: t("Resilient Sensor Link") }} /> :
      error && !registry ? <ErrorState message={error} onRetry={() => void load()} /> : !registry ? <SkeletonRows rows={6} /> : <>
      <p className="mb-4 rounded-md border border-stroke bg-surface-2 px-3 py-2 text-sm" role="note">{t(NO_LIVE)}</p>
      {message && <p role="status" className="mb-3 text-sm text-success">{message}</p>}
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <Tabs tour="nm-tabs" idPrefix="nm" label={t("Network registry sections")} tabs={tabs} value={view} onChange={setView} className="mb-5" />

      <TabPanel idPrefix="nm" value="overview" active={view === "overview"}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Scene focus={focus} state={chosen?.rehearsal_state ?? "up"} colour={chosen ? COLOURS[chosen.colour_token] : "#1d4ed8"} />
          <div className="space-y-4">
            <div role="group" aria-label={t("Registry counts")} className="grid grid-cols-2 gap-3">
              <StatTile label={t("Enabled providers")} value={counts.enabled} icon={Power} index={0} />
              <StatTile label={t("Satellite networks")} value={counts.satellite} icon={Satellite} index={1} />
              <StatTile label={t("Terrestrial and towers")} value={counts.terrestrial} icon={RadioTower} index={2} />
              <StatTile label={t("Synthetic assets")} value={counts.assets} icon={Building2} index={3} />
            </div>
            {chosen && <Panel title={t("Selected provider")}>
              <div className="flex items-center gap-3"><ProviderMark provider={chosen} size={44} /><div><p className="font-semibold">{chosen.display_name}</p><p className="text-xs text-muted">{t(KIND_LABEL[chosen.kind])}</p></div></div>
              <div className="mt-3 flex flex-wrap gap-2"><StatusPill tone={STATE_TONE[chosen.rehearsal_state]}>{t(STATE_LABEL[chosen.rehearsal_state])}</StatusPill><StatusPill tone={chosen.enabled ? "success" : "neutral"}>{chosen.enabled ? t("Enabled") : t("Disabled")}</StatusPill></div>
              <label className="mt-3 block text-sm"><span className="font-semibold">{t("Show in the scene")}</span>
                <select className="control mt-1 w-full" value={chosen.id} onChange={e => setSelected(e.target.value)}>{providers.filter(p => !p.deleted_at).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
            </Panel>}
          </div>
        </div>
        <Panel title={t("How the registry feeds IndTrana")} className="mt-5">
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            <li><b>{t("Sense")}</b>: {t("The first enabled terrestrial and satellite providers name the two link lanes on the Resilient Sensor Link page, and their rehearsal states choose its starting scenario.")} <Link className="underline" href="/sensor-link">{t("Open Resilient Sensor Link")}</Link></li>
            <li><b>{t("Predict")}</b>: {t("The Storm timeline on that page shows which sensor classes stay served when a lane is degraded or down. It is a rehearsal, not a forecast.")}</li>
            <li><b>{t("Reach")}</b>: {t("The communication table there names the lane each desk and team would use. Nothing is transmitted.")}</li>
            <li><b>{t("Learn")}</b>: {t("The Activity tab counts rehearsal state changes per provider. These are rehearsal statistics, not accuracy.")}</li>
          </ul>
        </Panel>
        <div className="mt-5"><PatentCredit /></div>
        <p className="mt-4 text-xs text-muted">{t(OWNERSHIP_NOTE)} {t("Logo marks:")} {LOGO_SET.name} {LOGO_SET.version}, {LOGO_SET.licence}.</p>
      </TabPanel>

      <TabPanel idPrefix="nm" value="satellite" active={view === "satellite"}><div data-tour="nm-satellite">{providerTable(providers.filter(p => isSatellite(p.kind)), "satellite")}</div></TabPanel>
      <TabPanel idPrefix="nm" value="terrestrial" active={view === "terrestrial"}><div data-tour="nm-terrestrial">{providerTable(providers.filter(p => isTerrestrial(p.kind) || p.kind === "tower_operator"), "terrestrial_mobile")}</div></TabPanel>

      <TabPanel idPrefix="nm" value="assets" active={view === "assets"}>
        <div data-tour="nm-assets">
          <div className="mb-3 flex flex-wrap items-center gap-2"><Button variant="primary" icon={Plus} onClick={() => setAssetDialog({ open: true, editing: null })}>{t("Add asset")}</Button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />{t("Show deleted entries")}</label></div>
          <SortableTable label={t("Towers and assets")} rows={registry.assets} columns={assetColumns} rowKey={a => a.id} minWidth="46rem" empty={<EmptyState title={t("No assets yet")} body={t("Add a synthetic tower, gateway or constellation entry.")} />} />
          <p className="mt-3 text-xs text-muted">{t("Every location here is synthetic. No real tower, gateway or cell is listed.")}</p>
        </div>
      </TabPanel>

      <TabPanel idPrefix="nm" value="integrations" active={view === "integrations"}>
        <div data-tour="nm-integrations">
          <p className="mb-4 text-sm text-muted">{t("Each provider's documented route, checked on")} {registry.catalogue.verified_on}. {t("A link opens the provider's own page in a new tab; you are leaving IndTrana. No provider is called from this server.")}</p>
          <div className="grid gap-3 md:grid-cols-2">{providers.filter(p => !p.deleted_at).map(p => {
            const link = p.doc_link_id ? registry.catalogue.links[p.doc_link_id] : null;
            return <Panel key={p.id} level={3} title={p.display_name} as="article">
              <div className="flex items-start gap-3"><ProviderMark provider={p} size={36} /><div className="min-w-0 text-sm">
                {link ? <>
                  <StatusPill tone={link.kind === "api_docs" ? "info" : "neutral"}>{t(DOC_KIND_LABEL[link.kind])}</StatusPill>
                  <p className="mt-2">{t(link.summary)}</p>
                  <p className="mt-1 text-xs text-muted">{t("Access")}: {t(link.access)}</p>
                  {link.sdk && <p className="mt-1 text-xs text-muted">{t("SDK")}: {link.sdk.name}, {link.sdk.licence} ({t("listed, not included")})</p>}
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-accent underline">{new URL(link.url).hostname}<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">{t("(opens a new tab, outside IndTrana)")}</span></a>
                </> : <p className="text-muted">{t("No public API documentation was found for this provider. Access would need a direct agreement.")}</p>}
                <p className="mt-2 text-xs text-muted">{t("Credential")}: {p.has_credential ? t("stored, fingerprint") + " " + p.credential_fingerprint : t("none")}</p>
              </div></div>
            </Panel>;
          })}</div>
          <p className="mt-4 text-xs text-muted">{t("Public orbital reference (CelesTrak) is not built in this release; it would be opt-in and display-only.")} {t(OWNERSHIP_NOTE)}</p>
        </div>
      </TabPanel>

      <TabPanel idPrefix="nm" value="activity" active={view === "activity"}>
        <div data-tour="nm-activity" className="space-y-5">
          <Panel title={t("Rehearsal statistics")} description={t("Rehearsal statistics from the activity record, not accuracy.")}>
            {rehearsalStats.length ? <ul className="space-y-1 text-sm">{rehearsalStats.map(([id, n]) => <li key={id}>{nameOf(id)}: <span className="tnum">{n}</span> {t("rehearsal state changes")}</li>)}</ul> : <p className="text-sm text-muted">{t("No rehearsal state changes yet.")}</p>}
          </Panel>
          <SortableTable label={t("Registry changes")} rows={audit} columns={auditColumns} rowKey={r => r.id} minWidth="44rem" empty={<EmptyState title={t("No changes yet")} body={t("Every change made here is recorded.")} />} />
        </div>
      </TabPanel>

      <ProviderDialog open={dialog.open} onClose={() => setDialog(d => ({ ...d, open: false }))} registry={registry} editing={dialog.editing} initialKind={dialog.kind} onSaved={done} />
      <AssetDialog open={assetDialog.open} onClose={() => setAssetDialog({ open: false, editing: null })} registry={registry} editing={assetDialog.editing} onSaved={done} />
      <ConfirmDelete target={deleting} onClose={() => setDeleting(null)} onDone={done} />
    </>}
  </AppShell>;
}
