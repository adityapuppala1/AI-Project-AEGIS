"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Hospital, Landmark, Loader2, MapPin, Route, Trees } from "lucide-react";
import { Button, DataOrigin, Panel } from "./ui";
import { useT } from "./language-provider";
import { ANDHRA, BHUVAN_ATTRIBUTION, BHUVAN_CODE_TEXT, bhuvanCode, inBox, type BhuvanCode, type BhuvanLive, type BhuvanRow } from "../lib/bhuvan";

type Kind = "place" | "landuse" | "route" | "hospitals";
type Slot = { state: "idle" } | { state: "loading" } | { state: "ok"; data: BhuvanLive } | { state: "error"; code: BhuvanCode };
// Synthetic team base for the reference route (a made-up point in the Hyderabad training area). Nothing is dispatched.
export const SYNTHETIC_TEAM_BASE = { lat: 17.4065, lon: 78.4772, label: "Synthetic team base (training area)" } as const;

async function fetchKind(kind: Kind, lat: number, lon: number): Promise<Slot> {
  const query = kind === "route"
    ? `lat1=${SYNTHETIC_TEAM_BASE.lat}&lon1=${SYNTHETIC_TEAM_BASE.lon}&lat2=${lat.toFixed(5)}&lon2=${lon.toFixed(5)}`
    : `lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  try {
    const response = await fetch(`/api/reference/bhuvan/${kind}?${query}`, { cache: "no-store", credentials: "same-origin" });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) return { state: "error", code: bhuvanCode(body.code) };
    return { state: "ok", data: body as unknown as BhuvanLive };
  } catch { return { state: "error", code: "bhuvan_unavailable" }; }
}

function Rows({ rows }: Readonly<{ rows: BhuvanRow[] }>) {
  return <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">{rows.slice(0, 12).map(row =>
    <div key={row.key} className="flex min-w-0 gap-2"><dt className="shrink-0 font-semibold text-muted">{row.key.replace(/_/g, " ")}</dt><dd className="min-w-0 break-words">{String(row.value)}</dd></div>)}</dl>;
}

function Result({ slot, empty }: Readonly<{ slot: Slot; empty: string }>) {
  const t = useT();
  if (slot.state === "idle") return null;
  if (slot.state === "loading") return <p className="flex items-center gap-2 text-xs text-muted" role="status"><Loader2 size={14} className="animate-spin" aria-hidden="true"/>{t("Asking Bhuvan…")}</p>;
  if (slot.state === "error") return <p className="text-xs leading-5 text-rose-700 dark:text-rose-300" role="status">{t(BHUVAN_CODE_TEXT[slot.code])}</p>;
  const data = slot.data;
  return <div className="space-y-2">
    <DataOrigin kind="live" source="Bhuvan" asOf={data.fetched_at}/>
    {data.no_data ? <p className="text-xs text-muted">{t(empty)}</p> : <>
      {data.kind === "route" && <p className="text-sm"><strong className="tabular-nums">{data.distance_km !== null ? `${data.distance_km} km` : t("Distance not supplied")}</strong> <span className="text-xs text-muted">{t("road path length computed from Bhuvan's route geometry")}</span></p>}
      {data.fields.length > 0 && <Rows rows={data.fields}/>}
      {data.records.length > 0 && <ul className="space-y-2">{data.records.slice(0, 8).map((record, i) => <li key={i} className="rounded-lg border border-stroke p-2"><Rows rows={record}/></li>)}</ul>}
    </>}
    {data.coverage && <p className="text-[11px] text-muted">{t("Coverage")}: {data.coverage}</p>}
  </div>;
}

/**
 * Live, display-only reference from ISRO Bhuvan for the selected case location. Nothing here is stored, and nothing
 * creates or changes a case, proposal, task, warning or CAP draft. The route is a reference road path; nothing is dispatched.
 */
export function BhuvanReference({ lat, lon }: Readonly<{ lat: number | null | undefined; lon: number | null | undefined }>) {
  const t = useT();
  const valid = typeof lat === "number" && typeof lon === "number" && inBox(lat, lon);
  const [slots, setSlots] = useState<Record<Kind, Slot>>({ place: { state: "idle" }, landuse: { state: "idle" }, route: { state: "idle" }, hospitals: { state: "idle" } });
  const run = useCallback(async (kind: Kind) => {
    if (!valid) return;
    setSlots(s => ({ ...s, [kind]: { state: "loading" } }));
    const result = await fetchKind(kind, lat as number, lon as number);
    setSlots(s => ({ ...s, [kind]: result }));
  }, [valid, lat, lon]);
  useEffect(() => { if (valid) { void run("place"); void run("landuse"); } }, [valid, run]);
  const inAndhra = valid && inBox(lat as number, lon as number, ANDHRA);

  return <Panel data-tour="bhuvan-reference" className="mb-5" icon={Landmark} title={t("Bhuvan reference (live)")}
    description={t("Real reference data from ISRO's Bhuvan geoportal for this case location. The case itself stays synthetic.")}
    actions={Object.values(slots).some(s => s.state === "ok") ? <DataOrigin kind="live" source="Bhuvan"/> : <span className="text-[11px] font-semibold text-muted">{t("No live data loaded")}</span>}>
    {!valid ? <p className="text-xs text-muted">{t("This case has no point inside India, so nothing is sent to Bhuvan.")}</p> : <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="bhuvan-place"><h3 id="bhuvan-place" className="mb-2 flex items-center gap-2 text-sm font-bold"><MapPin size={15} aria-hidden="true"/>{t("Village and administrative area")}</h3>
        <Result slot={slots.place} empty="Bhuvan has no village record at this point (villages: Andhra Pradesh and Karnataka, Census 2001)."/></section>
      <section aria-labelledby="bhuvan-landuse"><h3 id="bhuvan-landuse" className="mb-2 flex items-center gap-2 text-sm font-bold"><Trees size={15} aria-hidden="true"/>{t("Land use around the case (about 2 km square)")}</h3>
        <Result slot={slots.landuse} empty="Bhuvan has no land-use statistics for this square."/></section>
      <section aria-labelledby="bhuvan-route"><h3 id="bhuvan-route" className="mb-2 flex items-center gap-2 text-sm font-bold"><Route size={15} aria-hidden="true"/>{t("Reference road route from a synthetic team base")}</h3>
        <p className="mb-2 text-[11px] text-muted">{t("Reference route, nothing is dispatched. Not for navigation.")} {t(SYNTHETIC_TEAM_BASE.label)}.</p>
        {slots.route.state === "idle" ? <Button size="sm" type="button" onClick={() => void run("route")}><Route size={14} aria-hidden="true"/>{t("Show reference route")}</Button>
          : <Result slot={slots.route} empty="Bhuvan found no road path between these points (routing works within one state)."/>}</section>
      <section aria-labelledby="bhuvan-hospitals"><h3 id="bhuvan-hospitals" className="mb-2 flex items-center gap-2 text-sm font-bold"><Hospital size={15} aria-hidden="true"/>{t("Hospitals within 3 km (Andhra Pradesh only)")}</h3>
        {!inAndhra ? <p className="text-xs text-muted">{t("Bhuvan's hospital and post office data covers Andhra Pradesh only. This point is outside it.")}</p>
          : slots.hospitals.state === "idle" ? <Button size="sm" type="button" onClick={() => void run("hospitals")}><Building2 size={14} aria-hidden="true"/>{t("Look up hospitals")}</Button>
          : <Result slot={slots.hospitals} empty="Bhuvan lists no hospitals within 3 km of this point."/>}</section>
    </div>}
    <p className="mt-4 border-t border-stroke pt-3 text-[11px] leading-5 text-muted">{BHUVAN_ATTRIBUTION} · {t("Live reference, not an IndTrana assessment, warning or dispatch input. Viewing only under the")} <a className="font-semibold text-accent underline underline-offset-2" href="https://bhuvan.nrsc.gov.in/home/terms.php" target="_blank" rel="noopener noreferrer">{t("Bhuvan terms of service")}<span className="sr-only"> ({t("opens in a new tab")})</span></a>.</p>
  </Panel>;
}
