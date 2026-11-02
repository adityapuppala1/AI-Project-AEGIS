"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Box, Droplets, FileSearch, Flame, Layers, Loader2, Mountain, Radar, RefreshCw, ShieldAlert, Table2, Thermometer, Waves, Wind, Satellite,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { HazardWatchMap } from "./hazard-watch-map";
import { ProactiveRunPanel } from "./proactive-run";
import { useT } from "./language-provider";
import { useOperatorSession } from "../lib/use-operator-session";
import { formatIst } from "../lib/earth-watch";
import {
  DISCLAIMER, STATE_COLOR, STATE_RANK, dayBuckets, hazardStyle, isStale,
  type HazardStyle, type HistoryPayload, type ProactiveRun, type RefreshResult, type TriggerEvent, type WatchPayload,
} from "../lib/proactive";

const ICONS: Record<HazardStyle["icon"], LucideIcon> = { waves: Waves, flame: Flame, mountain: Mountain, wind: Wind, thermometer: Thermometer, droplets: Droplets, satellite: Satellite, alert: AlertTriangle };
type Gate = "checking" | "disabled" | "enabled" | "error";
type Sort = "score" | "state" | "recent";
const STATE_CHIP: Record<TriggerEvent["state"], string> = {
  clear: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30",
  watch: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  candidate: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
};
const show = (value: unknown) => typeof value === "number" ? String(Math.round(value * 1000) / 1000) : Array.isArray(value) ? value.join(", ") : String(value);

function Timeline({ history, hazard }: Readonly<{ history: HistoryPayload | null; hazard: string }>) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  const buckets = useMemo(() => dayBuckets((history?.rows ?? []).filter(row => row.hazard === hazard), history?.days ?? 7, Date.now()), [history, hazard]);
  const max = Math.max(1, ...buckets.map(bucket => bucket.watch + bucket.candidate));
  return <section aria-labelledby="timeline-title" className="rounded-lg border border-stroke p-3">
    <div className="flex items-center justify-between gap-2">
      <h4 id="timeline-title" className="text-xs font-bold">{t("7-day trigger timeline")}</h4>
      <button type="button" className="control !min-h-8 text-xs" aria-pressed={asTable} onClick={() => setAsTable(value => !value)}><Table2 size={14} aria-hidden="true"/>{asTable ? t("Show chart") : t("Show table")}</button>
    </div>
    {!history ? <p className="mt-2 text-[11px] text-muted">{t("History unavailable.")}</p>
      : asTable ? <table className="mt-2 w-full text-left text-xs"><caption className="sr-only">{t("7-day trigger timeline")}</caption>
        <thead><tr className="text-muted"><th scope="col">{t("Day")}</th><th scope="col">{t("watch")}</th><th scope="col">{t("candidate")}</th></tr></thead>
        <tbody>{buckets.map(bucket => <tr key={bucket.day} className="border-t border-stroke"><td>{bucket.day}</td><td>{bucket.watch}</td><td>{bucket.candidate}</td></tr>)}</tbody></table>
      : <svg viewBox="0 0 280 90" className="mt-2 w-full" role="img" aria-label={t("Bar chart of watch and candidate events per day for this hazard over seven days")}>
        {buckets.map((bucket, index) => {
          const x = 8 + index * 38, watchH = bucket.watch / max * 60, candH = bucket.candidate / max * 60;
          return <g key={bucket.day}>
            <rect x={x} y={70 - watchH} width="26" height={watchH} fill={STATE_COLOR.watch} className="reveal-in" style={{ "--i": index } as React.CSSProperties}/>
            <rect x={x} y={70 - watchH - candH} width="26" height={candH} fill={STATE_COLOR.candidate} className="reveal-in" style={{ "--i": index } as React.CSSProperties}/>
            <text x={x + 13} y="84" textAnchor="middle" fontSize="8" fill="currentColor" className="text-muted">{bucket.day.slice(5)}</text>
          </g>;
        })}
      </svg>}
  </section>;
}

export function HazardWatch() {
  const t = useT();
  const session = useOperatorSession();
  const roles = session?.roles ?? [];
  const canRefresh = roles.includes("incident_operator") || roles.includes("platform_admin");
  const canRun = roles.includes("incident_operator");
  const [gate, setGate] = useState<Gate>("checking");
  const [watch, setWatch] = useState<WatchPayload | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("score");
  const [pitched, setPitched] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [run, setRun] = useState<ProactiveRun | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/proactive/watch", { cache: "no-store", signal });
      if (response.status === 404) { setGate("disabled"); return; }
      if (!response.ok) throw new Error("unavailable");
      setWatch(await response.json() as WatchPayload); setGate("enabled");
      fetch("/api/proactive/watch/history?days=7", { cache: "no-store", signal })
        .then(r => r.ok ? r.json() as Promise<HistoryPayload> : Promise.reject(new Error("history")))
        .then(setHistory).catch(() => { if (!signal?.aborted) setHistory(null); });
    } catch { if (!signal?.aborted) setGate("error"); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function refresh() {
    setRefreshing(true); setRefreshError(""); setRefreshResult(null);
    try {
      const response = await fetch("/api/proactive/watch/refresh", { method: "POST", cache: "no-store", credentials: "same-origin" });
      const data = await response.json().catch(() => ({})) as RefreshResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("Refresh failed"));
      setRefreshResult(data); await load();
    } catch (reason) { setRefreshError(reason instanceof Error ? reason.message : t("Refresh failed")); }
    setRefreshing(false);
  }

  const triggers = useMemo(() => {
    const list = [...(watch?.triggers ?? [])];
    list.sort((a, b) => sort === "score" ? b.score - a.score : sort === "state" ? STATE_RANK[b.state] - STATE_RANK[a.state] || b.score - a.score
      : (Date.parse(b.fired_at ?? "") || 0) - (Date.parse(a.fired_at ?? "") || 0));
    return list;
  }, [watch, sort]);
  const selected = triggers.find(item => item.id === selectedId) ?? null;
  const evidenceById = useMemo(() => new Map((watch?.evidence ?? []).map(item => [item.id, item])), [watch]);
  const cited = selected ? selected.evidence_ids.map(id => evidenceById.get(id)).filter((item): item is NonNullable<typeof item> => !!item) : [];
  const now = Date.now();
  const select = (id: string) => { setSelectedId(id); setDrawer(false); setRun(null); };

  return <AppShell title="Hazard Watch" description="Multi-hazard evidence and trigger watch with bounded, human-gated decision support. Exercise only; AEGIS never sends warnings.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert className="mt-1 shrink-0" size={19} aria-hidden="true"/>
      <p><strong>{t("Decision support only. Exercise CAP draft; AEGIS never sends warnings. Synthetic thresholds, not calibrated.")}</strong>
        {watch && watch.disclaimer !== DISCLAIMER ? ` ${watch.disclaimer}` : ""}</p>
    </div>

    {gate === "checking" && <p className="panel p-6 text-sm text-muted" role="status">{t("Checking Hazard Watch…")}</p>}
    {gate === "error" && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle size={18}/>{t("Hazard Watch is unavailable. The rest of AEGIS is unaffected.")}</div>}
    {gate === "disabled" && <section className="panel p-6">
      <h2 className="flex items-center gap-2 text-base font-bold"><Radar size={18} className="text-accent" aria-hidden="true"/>{t("Hazard Watch is switched off")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("The base AEGIS stack stays fully synthetic. Start the optional proactive profile to enable the watch.")}</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-elevated p-4 text-xs"><code>powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1 -NoBuild -Proactive</code></pre>
    </section>}

    {gate === "enabled" && watch && <>
      <section aria-label={t("Watch heartbeat")} className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="inline-flex items-center gap-2 text-sm font-bold"><Radar size={16} className="text-accent" aria-hidden="true"/>{t("Hazard Watch")}</span>
        <span className="text-xs text-muted">{t("Updated")} {formatIst(watch.generated_at)} · {t("config")} {watch.config_version}</span>
        <span className="ml-auto flex items-center gap-3">
          <button type="button" className="control" onClick={refresh} disabled={!canRefresh || refreshing} aria-describedby="refresh-reason">
            {refreshing ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <RefreshCw size={16} aria-hidden="true"/>}{t("Refresh evidence")}</button>
        </span>
        {!canRefresh && <p id="refresh-reason" className="basis-full text-[11px] text-muted">{t("Refreshing needs an incident_operator or platform_admin sign-in. You can still read the watch.")}</p>}
        <div className="basis-full text-xs" aria-live="polite" role="status">
          {refreshError && <p className="text-rose-700 dark:text-rose-300">{refreshError}</p>}
          {refreshResult && <p>{t("Refresh result")}: {Object.entries(refreshResult.fetched).map(([id, v]) => `${id}: ${typeof v === "number" ? `${v} ${t("records")}` : v}`).join(" · ")} · {refreshResult.evidence_added} {t("new evidence")} · {t("clear")} {refreshResult.triggers.clear} / {t("watch")} {refreshResult.triggers.watch} / {t("candidate")} {refreshResult.triggers.candidate}</p>}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="panel min-w-0 overflow-hidden" aria-label={t("Hazard Watch map")}>
          <div className="panel-heading">
            <h2 className="flex items-center gap-2 text-base font-bold"><Layers size={18} className="text-accent" aria-hidden="true"/>{t("Trigger map")}</h2>
            <button type="button" className="control" aria-pressed={pitched} onClick={() => setPitched(value => !value)} disabled={mapFailed}><Box size={16} aria-hidden="true"/>{t("3D view")}</button>
          </div>
          {mapFailed ? <p className="p-6 text-sm text-muted" role="status">{t("The map could not load. Every trigger is listed in the queue beside it.")}</p>
            : <HazardWatchMap triggers={triggers} evidence={watch.evidence} selectedId={selectedId} pitched={pitched} onSelect={select} onFail={() => setMapFailed(true)}/>}
          <ul className="flex flex-wrap items-center gap-4 border-t border-stroke px-5 py-3 text-[11px]" aria-label={t("Legend")}>
            {(["clear", "watch", "candidate"] as const).map(state => <li key={state} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: STATE_COLOR[state] }} aria-hidden="true"/>{t(state)}</li>)}
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gradient-to-r from-sky-500 to-rose-600" aria-hidden="true"/>{t("Evidence density")}</li>
            <li className="basis-full text-muted">{t("Columns are equal-height schematic symbols for a trigger location. They are not building geometry, flood extent or severity.")}</li>
          </ul>
        </section>

        <aside className="panel min-w-0" aria-label={t("Trigger queue")}>
          <div className="panel-heading">
            <h2 className="text-base font-bold">{t("Trigger queue")} <span className="text-xs font-normal text-muted">({triggers.length})</span></h2>
            <label className="flex items-center gap-2 text-xs font-semibold" htmlFor="trigger-sort">{t("Sort by")}
              <select id="trigger-sort" className="field !h-8 !w-auto" value={sort} onChange={event => setSort(event.target.value as Sort)}>
                <option value="score">{t("Score")}</option><option value="state">{t("State")}</option><option value="recent">{t("Most recent")}</option>
              </select></label>
          </div>
          {triggers.length === 0 ? <p className="p-5 text-sm text-muted">{t("No triggers yet. An empty queue does not mean an area is safe.")}</p>
            : <ul className="max-h-[34rem] divide-y divide-stroke overflow-y-auto">{triggers.map(item => {
              const style = hazardStyle(item.hazard); const Icon = ICONS[style.icon]; const active = item.id === selectedId;
              return <li key={item.id}>
                <button type="button" onClick={() => select(item.id)} aria-pressed={active}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent ${active ? "bg-accent/10" : ""}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: style.color + "22", color: style.color }}><Icon size={18} aria-hidden="true"/></span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{t(style.label)} · {item.trigger_id}</strong>
                    <span className="block text-[11px] text-muted">{formatIst(item.fired_at)} · {t("score")} {item.score.toFixed(2)}</span></span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ring-1 ${STATE_CHIP[item.state]}`}>{t(item.state)}</span>
                </button>
              </li>;
            })}</ul>}
        </aside>
      </div>

      {selected && <section className="mt-5 space-y-5" aria-labelledby="trigger-detail">
        <h2 id="trigger-detail" className="text-lg font-bold">{t(hazardStyle(selected.hazard).label)} · {selected.trigger_id} <span className={`ml-2 rounded-full px-2.5 py-1 align-middle text-[10px] font-bold uppercase ring-1 ${STATE_CHIP[selected.state]}`}>{t(selected.state)}</span></h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel min-w-0" aria-labelledby="live-title">
            <div className="panel-heading"><h3 id="live-title" className="text-base font-bold">{t("Live")} <span className="text-xs font-normal text-muted">{t("latest observed evidence")}</span></h3></div>
            <div className="p-5">
              {cited.length === 0 ? <p className="text-sm text-muted">{t("No cited evidence records are in the current watch window.")}</p>
                : <ul className="space-y-2">{cited.map(item => <li key={item.id} className="rounded-lg border border-stroke p-3 text-xs">
                  <p className="font-bold">{item.hazard} · {item.value ?? "n/a"} {item.unit}</p>
                  <p className="text-muted">{item.connector_id} · {t("observed")} {formatIst(item.observed_at)} · {t("retrieved")} {formatIst(item.retrieved_at)}</p>
                  <p className="break-all text-muted">{item.id}</p>
                  {isStale(item, now) && <p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">{t("Stale: older than the freshness window")}</p>}
                </li>)}</ul>}
              <button type="button" className="control mt-4" aria-expanded={drawer} aria-controls="evidence-drawer" onClick={() => setDrawer(value => !value)}><FileSearch size={16} aria-hidden="true"/>{t("Evidence drawer")} ({selected.evidence_ids.length})</button>
              {drawer && <div id="evidence-drawer" className="mt-3 rounded-lg border border-stroke p-3 text-xs">
                <p className="font-bold">{t("Cited records")}</p>
                <ul className="mt-2 space-y-1">{selected.evidence_ids.map(id => <li key={id} className="break-all"><code>{id}</code>{evidenceById.has(id) ? "" : ` · ${t("not in current window")}`}</li>)}</ul>
              </div>}
            </div>
          </section>
          <section className="panel min-w-0" aria-labelledby="predicted-title">
            <div className="panel-heading"><h3 id="predicted-title" className="text-base font-bold">{t("Predicted")} <span className="text-xs font-normal text-muted">{t("forecast-derived and synthetic")}</span></h3></div>
            <div className="space-y-4 p-5 text-xs">
              <div><p className="font-bold">{t("Threshold")}</p>
                {selected.threshold === null ? <p className="text-muted">{t("not supplied")}</p>
                  : typeof selected.threshold === "object" && !Array.isArray(selected.threshold)
                    ? <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">{Object.entries(selected.threshold).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="font-semibold text-muted">{k}</dt><dd>{show(v)}</dd></div>)}</dl>
                    : <p>{show(selected.threshold)}</p>}</div>
              <div><p className="font-bold">{t("Forecast-derived values")}</p>
                {Object.keys(selected.rationale).length === 0 ? <p className="text-muted">{t("none supplied")}</p>
                  : <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">{Object.entries(selected.rationale).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="font-semibold text-muted">{k}</dt><dd className="min-w-0 break-words">{show(v)}</dd></div>)}</dl>}</div>
              <div><p className="font-bold">{t("Variant outcomes")}</p>
                {run && run.variants.length > 0
                  ? <ul className="mt-1 space-y-1">{run.variants.map(variant => <li key={variant.id}>{variant.label}: {variant.threshold_delta > 0 ? "+" : ""}{variant.threshold_delta} → <strong>{t(variant.resulting_state)}</strong> ({variant.score.toFixed(2)})</li>)}</ul>
                  : <p className="text-muted">{t("Start a bounded run to simulate threshold variants.")}</p>}</div>
            </div>
          </section>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ProactiveRunPanel triggerEventId={selected.id} canOperate={canRun} onRun={setRun}
            disabledReason={t("Starting a run needs an incident_operator sign-in. Reading the watch does not.")}/>
          <Timeline history={history} hazard={selected.hazard}/>
        </div>
      </section>}
    </>}
  </AppShell>;
}
