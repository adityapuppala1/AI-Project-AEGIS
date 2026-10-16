"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Compass, Database, MapPinned, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import type { SpatialResponse, NearbySource } from "../lib/spatial";

const RADII = [1000, 3000, 5000] as const;
const FRESHNESS_TEXT: Record<NearbySource["freshness"], string> = {
  fresh: "Within demo window",
  delayed: "Delayed reading",
  stale: "Stale reading",
  no_data: "No observation",
  clock_anomaly: "Clock anomaly",
};
function timeLabel(value: string | null): string {
  if (!value) return "No recorded observation";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

export function SpatialAnalysis({ incidentId }: { incidentId: string }) {
  const [radius, setRadius] = useState<(typeof RADII)[number]>(3000);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<SpatialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null); // Radius changes never retain old candidates as current results.
    fetch("/api/incidents/" + encodeURIComponent(incidentId) + "/correlation?radius_m=" + radius, {
      cache: "no-store", signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error("Spatial correlation service unavailable");
        const result = await response.json() as SpatialResponse;
        if (result.source !== "synthetic_exercise" ||
            result.analysis_kind !== "geographic_proximity_only" ||
            result.validated_risk_model !== false ||
            result.actual_asset_impact_known !== false ||
            result.operational_actions_enabled !== false ||
            !Array.isArray(result.nearby_sources) || !Array.isArray(result.nearby_assets)) {
          throw new Error("Unexpected correlation classification");
        }
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch(reason => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(reason instanceof Error ? reason.message : "Spatial service unavailable");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [incidentId, radius, version]);
  const staleCandidates = data?.nearby_sources.filter(item => item.freshness !== "fresh").length ?? 0;

  return <section className="panel mt-5 overflow-hidden" aria-label="Fictional geospatial proximity analysis">
    <div className="panel-heading">
      <div>
        <h3 className="flex items-center gap-2 text-base font-bold">
          <Compass size={18} className="text-accent"/> Spatial Correlation Explorer
        </h3>
        <p className="mt-1 text-xs text-muted">PostGIS geodesic distances · fictional sources/assets · no actual impact determination</p>
      </div>
      <button type="button" className="control !text-xs" onClick={() => setVersion(v=>v+1)} disabled={loading}>
        <RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-stroke px-4 py-3 sm:px-5">
      <label htmlFor={"radius-"+incidentId} className="text-xs font-semibold text-muted">Analysis radius</label>
      <select id={"radius-"+incidentId} className="field !w-[150px]" value={radius}
        onChange={event => setRadius(Number(event.target.value) as typeof radius)}>
        {RADII.map(value => <option key={value} value={value}>{value/1000} km search</option>)}
      </select>
      <span className="text-xs text-muted" role="status">
        {loading ? "Finding nearby fictional records…" :
         data ? `${data.nearby_sources.length} simulated sources · ${data.nearby_assets.length} fictional assets` : "No results loaded"}
      </span>
    </div>
    {error && <p role="alert" className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm text-rose-700 dark:text-rose-300">{error}. No proximity conclusions can be drawn.</p>}
    <div className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/5 px-5 py-4">
      <ShieldAlert className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" size={18}/>
      <p className="text-xs leading-6 text-amber-800 dark:text-amber-200">
        <strong>Not an impact forecast.</strong> A location within {radius/1000} km is a geographic
        candidate only. No source corroboration, flooding, affected facilities, public alerts or
        authorized deployments are inferred.
      </p>
    </div>
    {data && <>
      <div className="grid gap-5 p-4 xl:grid-cols-2 sm:p-5">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-bold"><Database className="text-accent" size={17}/> Nearby synthetic sources</h4>
          <p className="mt-1 text-xs text-muted">{staleCandidates} candidates have absent, outdated or anomalous readings.</p>
          <div className="mt-3 space-y-3">
            {data.nearby_sources.length === 0 && <p className="rounded-xl border border-dashed border-stroke p-5 text-sm text-muted">No positioned synthetic source is within the selected search radius.</p>}
            {data.nearby_sources.map(item => <article className="rounded-xl border border-stroke bg-elevated/35 p-4" key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{item.name}</strong>
                <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{Math.round(item.distance_m)} m</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-muted">{FRESHNESS_TEXT[item.freshness]} · {item.quality_status === "synthetic_curated" ? "Curated fixture" : item.quality_status === "synthetic_unverified" ? "Unverified fixture" : "No quality data"}</p>
              <p className="mt-2 text-xs text-muted">Observed: {timeLabel(item.observed_at)}</p>
              <p className="mt-3 text-sm leading-6 text-muted">{item.reason}</p>
              {item.metric_value !== null && <p className="mt-2 text-xs text-muted">Historical simulated value: {item.metric_value} {item.metric_unit}</p>}
            </article>)}
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-bold"><MapPinned className="text-accent" size={17}/> Fictional infrastructure points</h4>
          <p className="mt-1 text-xs text-muted">All exposure and operational impacts are unassessed.</p>
          <div className="mt-3 space-y-3">
            {data.nearby_assets.length === 0 && <p className="rounded-xl border border-dashed border-stroke p-5 text-sm text-muted">No fictional assets are within this search radius. This is not a safety determination.</p>}
            {data.nearby_assets.map(item => <article className="rounded-xl border border-stroke bg-elevated/35 p-4" key={item.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="text-sm">{item.name}</strong>
                <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{Math.round(item.distance_m)} m</span>
              </div>
              <p className="mt-2 text-xs text-muted">{item.asset_kind.replace("exercise_","").replace("_"," ")} · Synthetic location</p>
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Impact not assessed · Not an official facility record</p>
            </article>)}
          </div>
        </div>
      </div>
      <div className="border-t border-stroke px-5 py-4">
        <h4 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-accent"/> Human verification checklist</h4>
        <ol className="mt-3 space-y-2 text-xs leading-6 text-muted">
          {data.guidance.map((step,index) => <li key={index} className="flex gap-3">
            <span className="font-semibold text-accent">{index+1}.</span>{step}
          </li>)}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>Computed {timeLabel(data.as_of)} · No validated risk model</span>
          <Link href="/sources" className="inline-flex items-center gap-1 font-semibold text-accent">Review source freshness <ArrowRight size={14}/></Link>
        </div>
      </div>
    </>}
    {loading && <p className="p-6 text-sm text-muted">Evaluating bounded geospatial candidates from the synthetic database...</p>}
  </section>;
}
