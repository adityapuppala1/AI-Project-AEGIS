"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Box, FlaskConical, Layers, Loader2, OctagonPause, Radar, RefreshCw, ShieldAlert, Table2 } from "lucide-react";
import { AppShell } from "./app-shell";
import { HazardWatchMap } from "./hazard-watch-map";
import { ProactiveRunPanel } from "./proactive-run";
import { ProactiveSchedulerStatus } from "./proactive-scheduler-status";
import { FallbackMap, FilterBar, QueueList, SampleChip, SetupChecklist, SummaryStrip, TriggerDetail, WatchSkeleton } from "./watch-parts";
import { useT } from "./language-provider";
import { useOperatorSession } from "../lib/use-operator-session";
import { formatIst } from "../lib/earth-watch";
import { buildSampleHistory, buildSampleWatch } from "../lib/proactive-sample";
import {
  DISCLAIMER, STATE_COLOR, STATE_RANK, dayBuckets,
  type HistoryPayload, type ProactiveRun, type RefreshResult, type TriggerState, type WatchPayload,
} from "../lib/proactive";

type Gate = "checking" | "disabled" | "enabled" | "error";
type Sort = "score" | "state" | "recent";

function Timeline({ history, hazard, sample }: Readonly<{ history: HistoryPayload | null; hazard: string; sample: boolean }>) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  const buckets = useMemo(() => dayBuckets((history?.rows ?? []).filter(row => row.hazard === hazard), history?.days ?? 7, Date.now()), [history, hazard]);
  const max = Math.max(1, ...buckets.map(bucket => bucket.watch + bucket.candidate));
  return <section aria-labelledby="timeline-title" className="panel min-w-0 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 id="timeline-title" className="text-xs font-bold">{t("7-day trigger timeline")}</h4>
      {sample && <SampleChip/>}
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
  const [sample, setSample] = useState(false);
  const [gate, setGate] = useState<Gate>("checking");
  const [liveWatch, setLiveWatch] = useState<WatchPayload | null>(null);
  const [liveHistory, setLiveHistory] = useState<HistoryPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("score");
  const [hazardFilter, setHazardFilter] = useState<ReadonlySet<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<TriggerState | "all">("all");
  const [pitched, setPitched] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null);
  const [refreshError, setRefreshError] = useState("");
  const [run, setRun] = useState<ProactiveRun | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const focusPending = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/proactive/watch", { cache: "no-store", signal });
      if (response.status === 404) { setGate("disabled"); return; }
      if (!response.ok) throw new Error("unavailable");
      setLiveWatch(await response.json() as WatchPayload); setGate("enabled");
      fetch("/api/proactive/watch/history?days=7", { cache: "no-store", signal })
        .then(r => r.ok ? r.json() as Promise<HistoryPayload> : Promise.reject(new Error("history")))
        .then(setLiveHistory).catch(() => { if (!signal?.aborted) setLiveHistory(null); });
    } catch { if (!signal?.aborted) setGate("error"); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function refresh() {
    if (sample) return;
    setRefreshing(true); setRefreshError(""); setRefreshResult(null);
    try {
      const response = await fetch("/api/proactive/watch/refresh", { method: "POST", cache: "no-store", credentials: "same-origin" });
      const data = await response.json().catch(() => ({})) as RefreshResult & { error?: string };
      if (!response.ok) throw new Error(data.error ?? t("Refresh failed"));
      setRefreshResult(data); await load();
    } catch (reason) { setRefreshError(reason instanceof Error ? reason.message : t("Refresh failed")); }
    setRefreshing(false);
  }

  // Sample data lives only in memory and is rebuilt on toggle; it is never sent to or read from the API.
  const sampleWatch = useMemo(() => sample ? buildSampleWatch(Date.now()) : null, [sample]);
  const sampleHistory = useMemo(() => sample ? buildSampleHistory(Date.now()) : null, [sample]);
  const watch = sample ? sampleWatch : liveWatch;
  const history = sample ? sampleHistory : liveHistory;
  const effectiveGate: Gate = sample ? "enabled" : gate;
  function toggleSample() {
    setSample(value => !value); setSelectedId(null); setRun(null); setDrawer(false); setMapFailed(false); setMapReady(false); setMapKey(key => key + 1);
    setHazardFilter(new Set()); setStateFilter("all");
  }

  const all = useMemo(() => {
    const list = [...(watch?.triggers ?? [])];
    list.sort((a, b) => sort === "score" ? b.score - a.score : sort === "state" ? STATE_RANK[b.state] - STATE_RANK[a.state] || b.score - a.score
      : (Date.parse(b.fired_at ?? "") || 0) - (Date.parse(a.fired_at ?? "") || 0));
    return list;
  }, [watch, sort]);
  const triggers = useMemo(() => all.filter(item => (hazardFilter.size === 0 || hazardFilter.has(item.hazard)) && (stateFilter === "all" || item.state === stateFilter)), [all, hazardFilter, stateFilter]);
  const hazards = useMemo(() => [...new Set(all.map(item => item.hazard))].sort(), [all]);
  const counts = useMemo(() => { const out: Record<string, number> = {}; for (const item of all) out[item.hazard] = (out[item.hazard] ?? 0) + 1; return out; }, [all]);
  const selected = all.find(item => item.id === selectedId) ?? null;
  const evidenceById = useMemo(() => new Map((watch?.evidence ?? []).map(item => [item.id, item])), [watch]);
  const now = Date.now();
  const filtered = hazardFilter.size > 0 || stateFilter !== "all";

  const select = (id: string, opener: HTMLElement | null = null) => {
    openerRef.current = opener; focusPending.current = true;
    setSelectedId(id); setDrawer(false); setRun(null);
  };
  useEffect(() => {
    if (!selectedId || !focusPending.current) return;
    focusPending.current = false;
    const heading = headingRef.current; if (!heading) return;
    heading.focus({ preventScroll: true });
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [selectedId]);
  function closeDetail() {
    setSelectedId(null); setRun(null); setDrawer(false);
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
    else document.querySelector<HTMLElement>("[data-queue] button")?.focus();
  }
  function onDetailKey(event: KeyboardEvent<HTMLDivElement>) {
    const tag = (event.target as HTMLElement).tagName;
    if (event.key === "Escape" && tag !== "TEXTAREA" && tag !== "INPUT" && tag !== "SELECT") { event.preventDefault(); closeDetail(); }
  }
  const toggleHazard = (hazard: string) => setHazardFilter(current => { const next = new Set(current); if (next.has(hazard)) next.delete(hazard); else next.add(hazard); return next; });
  const clearFilters = () => { setHazardFilter(new Set()); setStateFilter("all"); };

  return <AppShell title="Hazard Watch" description="Multi-hazard evidence and trigger watch with bounded, human-gated decision support. Exercise only; AEGIS never sends warnings.">
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert className="mt-1 shrink-0" size={19} aria-hidden="true"/>
      <p><strong>{t("Decision support only. Exercise CAP draft; AEGIS never sends warnings. Synthetic thresholds, not calibrated.")}</strong>
        {watch && !sample && watch.disclaimer !== DISCLAIMER ? ` ${watch.disclaimer}` : ""}</p>
    </div>

    <div className="panel mb-5 flex flex-wrap items-center gap-3 p-3">
      <button type="button" role="switch" aria-checked={sample} onClick={toggleSample} aria-describedby="sample-help"
        className="inline-flex min-h-10 items-center gap-3 rounded-lg px-1 text-sm font-semibold">
        <span className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${sample ? "border-amber-600 bg-amber-500" : "border-stroke bg-elevated"}`} aria-hidden="true">
          <span className={`absolute top-0.5 rounded-full bg-white shadow transition-all ${sample ? "left-5" : "left-0.5"}`} style={{ height: 18, width: 18 }}/></span>
        <FlaskConical size={16} aria-hidden="true"/>{t("Preview with sample data")}</button>
      <p id="sample-help" className="min-w-0 flex-1 basis-60 text-xs text-muted">{t("Client-side only. Shows invented data so the whole flow can be tried offline. It never calls or writes the API and is not remembered.")}</p>
      {sample && <SampleChip/>}
    </div>

    {effectiveGate === "checking" && <WatchSkeleton/>}
    {effectiveGate === "error" && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"><AlertTriangle size={18}/>{t("Hazard Watch is unavailable. The rest of AEGIS is unaffected.")}</div>}
    {effectiveGate === "disabled" && <section className="panel p-6">
      <h2 className="flex items-center gap-2 text-base font-bold"><Radar size={18} className="text-accent" aria-hidden="true"/>{t("Hazard Watch is switched off")}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t("The base AEGIS stack stays fully synthetic. Start the optional proactive profile to enable the watch.")}</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-elevated p-4 text-xs" tabIndex={0} aria-label="Start command"><code>powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1 -NoBuild -Proactive</code></pre>
    </section>}

    {effectiveGate === "enabled" && watch && <>
      {!sample && watch.paused === true && <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200">
        <OctagonPause className="mt-0.5 shrink-0" size={19} aria-hidden="true"/>
        <p><strong>{t("Proactive automation is paused.")}</strong> {t("A platform administrator engaged the kill switch. New runs, run steps and evidence refresh are blocked; you can still read the watch, open existing drafts and cancel runs.")}</p>
      </div>}
      <SummaryStrip watch={watch} now={now} sample={sample}/>
      <section aria-label={t("Watch heartbeat")} className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="inline-flex items-center gap-2 text-sm font-bold"><Radar size={16} className="text-accent" aria-hidden="true"/>{t("Hazard Watch")}</span>
        <span className="text-xs text-muted">{t("Updated")} {formatIst(watch.generated_at)} · {t("config")} {watch.config_version}</span>
        {sample && <SampleChip/>}
        <span className="ml-auto flex items-center gap-3">
          <button type="button" className="control" onClick={refresh} disabled={sample || !canRefresh || refreshing || watch.paused === true} aria-describedby="refresh-reason">
            {refreshing ? <Loader2 size={16} className="animate-spin" aria-hidden="true"/> : <RefreshCw size={16} aria-hidden="true"/>}{t("Refresh evidence")}</button>
        </span>
        {(sample || !canRefresh) && <p id="refresh-reason" className="basis-full text-[11px] text-muted">{sample ? t("Refresh is switched off while previewing sample data.") : t("Refreshing needs an incident_operator or platform_admin sign-in. You can still read the watch.")}</p>}
        {!sample && <ProactiveSchedulerStatus refreshToken={refreshResult}/>}
        <div className="basis-full text-xs" aria-live="polite" role="status">
          {refreshError && <p className="text-rose-700 dark:text-rose-300">{refreshError}</p>}
          {refreshResult && <p>{t("Refresh result")}: {Object.entries(refreshResult.fetched).map(([id, v]) => `${id}: ${typeof v === "number" ? `${v} ${t("records")}` : v}`).join(" · ")} · {refreshResult.evidence_added} {t("new evidence")} · {t("clear")} {refreshResult.triggers.clear} / {t("watch")} {refreshResult.triggers.watch} / {t("candidate")} {refreshResult.triggers.candidate}</p>}
        </div>
      </section>

      {!sample && watch.triggers.length === 0 && <div className="mb-5"><SetupChecklist evidenceCount={watch.evidence.length} refreshed={refreshResult !== null} triggerCount={watch.triggers.length}
        onPreview={toggleSample} onRefresh={refresh} canRefresh={canRefresh} refreshing={refreshing}/></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="panel min-w-0 overflow-hidden" aria-label={t("Hazard Watch map")}>
          <div className="panel-heading">
            <h2 className="flex items-center gap-2 text-base font-bold"><Layers size={18} className="text-accent" aria-hidden="true"/>{t("Trigger map")}</h2>
            {sample && <SampleChip/>}
            <button type="button" className="control" aria-pressed={pitched} onClick={() => setPitched(value => !value)} disabled={mapFailed}><Box size={16} aria-hidden="true"/>{t("3D view")}</button>
          </div>
          {mapFailed ? <FallbackMap triggers={triggers} selectedId={selectedId} onSelect={id => select(id)} onRetry={() => { setMapFailed(false); setMapReady(false); setMapKey(key => key + 1); }}/>
            : <div className="relative">
              <HazardWatchMap key={mapKey} triggers={triggers} evidence={watch.evidence} selectedId={selectedId} pitched={pitched} onSelect={id => select(id)} onFail={() => setMapFailed(true)} onReady={() => setMapReady(true)}/>
              {!mapReady && <div className="shimmer pointer-events-none absolute inset-0 rounded-none" role="status"><span className="sr-only">{t("Loading map…")}</span></div>}
            </div>}
          <ul className="flex flex-wrap items-center gap-4 border-t border-stroke px-5 py-3 text-[11px]" aria-label={t("Legend")}>
            {(["clear", "watch", "candidate"] as const).map(state => <li key={state} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: STATE_COLOR[state] }} aria-hidden="true"/>{t(state)}</li>)}
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-gradient-to-r from-sky-500 to-rose-600" aria-hidden="true"/>{t("Evidence density")}</li>
            <li className="basis-full text-muted">{t("Columns are equal-height schematic symbols for a trigger location. They are not building geometry, flood extent or severity.")}</li>
          </ul>
        </section>

        <aside className="panel min-w-0 xl:row-span-2 xl:col-start-2 xl:row-start-1 xl:self-start" aria-label={t("Trigger queue")} data-queue>
          <div className="panel-heading">
            <h2 className="text-base font-bold">{t("Trigger queue")} <span className="text-xs font-normal text-muted">({triggers.length}{filtered ? ` / ${all.length}` : ""})</span></h2>
            {sample && <SampleChip/>}
            <label className="flex items-center gap-2 text-xs font-semibold" htmlFor="trigger-sort">{t("Sort by")}
              <select id="trigger-sort" className="field !h-8 !w-auto" value={sort} onChange={event => setSort(event.target.value as Sort)}>
                <option value="score">{t("Score")}</option><option value="state">{t("State")}</option><option value="recent">{t("Most recent")}</option>
              </select></label>
          </div>
          {all.length > 0 && <FilterBar hazards={hazards} hazardFilter={hazardFilter} onToggleHazard={toggleHazard} stateFilter={stateFilter} onState={setStateFilter} onClear={clearFilters} counts={counts}/>}
          <QueueList items={triggers} selectedId={selectedId} onSelect={select} now={now} filtered={filtered}/>
          <p className="border-t border-stroke px-4 py-2 text-[11px] text-muted">{t("Arrow keys move through the queue. Enter opens a trigger; Escape closes it.")}</p>
        </aside>

        {selected && <div className="min-w-0 space-y-5 xl:col-start-1" onKeyDown={onDetailKey}>
          <TriggerDetail trigger={selected} evidenceById={evidenceById} now={now} sample={sample} run={run} headingRef={headingRef} onClose={closeDetail} drawer={drawer} onDrawer={() => setDrawer(value => !value)}/>
          <div className="grid gap-5 lg:grid-cols-2">
            <ProactiveRunPanel triggerEventId={selected.id} triggerKey={selected.trigger_id} canOperate={sample || canRun} onRun={setRun} sample={sample}
              disabledReason={t("Starting a run needs an incident_operator sign-in. Reading the watch does not.")}/>
            <Timeline history={history} hazard={selected.hazard} sample={sample}/>
          </div>
        </div>}
      </div>
    </>}
  </AppShell>;
}
