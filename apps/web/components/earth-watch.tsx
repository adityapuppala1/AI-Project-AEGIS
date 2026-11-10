"use client";

import { relayTileRequest } from "../lib/tile-relay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Popup } from "maplibre-gl";
import { AlertTriangle, Globe2, Layers, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import {
  ageLabel, categoryStyle, CATEGORY_STYLE, countdownLabel, dateAvailable, feedFreshness, formatIst,
  fetchEarthFeed, gibsTileUrl, imageryLabel, inRegion, INDIA_BOUNDS, markerRadius,
  type EarthFeedName, type Freshness, type ImageryFeed, type PublicRecord, type RecordFeed, type Region,
} from "../lib/earth-watch";

const REFRESH_MS = 300_000;
const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const FRESH_STYLE: Record<Freshness, string> = {
  fresh: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
  aging: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
  stale: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
};
type Gate = "checking" | "disabled" | "enabled" | "error";

const getFeed = fetchEarthFeed;

export function EarthWatch() {
  const t = useT();
  const [gate, setGate] = useState<Gate>("checking");
  const [quakes, setQuakes] = useState<RecordFeed | null>(null);
  const [events, setEvents] = useState<RecordFeed | null>(null);
  const [imagery, setImagery] = useState<ImageryFeed | null>(null);
  const [errors, setErrors] = useState<Partial<Record<EarthFeedName, string>>>({});
  const [region, setRegion] = useState<Region>("india");
  const [category, setCategory] = useState("all");
  const [showQuakes, setShowQuakes] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [baseId, setBaseId] = useState("MODIS_Terra_CorrectedReflectance_TrueColor");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mapState, setMapState] = useState<"loading" | "ready" | "failed">("loading");
  const [imageryNote, setImageryNote] = useState("Loading NASA imagery metadata…");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const nextRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const fallbackRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  nextRef.current = nextAt;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/earth-watch/status", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("status unavailable");
        const payload = await response.json() as { classification?: string; enabled?: boolean; display_only?: boolean };
        if (payload.classification !== "public_reference" || payload.display_only !== true) throw new Error("unexpected");
        if (!controller.signal.aborted) setGate(payload.enabled ? "enabled" : "disabled");
      })
      .catch(() => { if (!controller.signal.aborted) setGate("error"); });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async (signal: AbortSignal) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    const [q, e] = await Promise.allSettled([getFeed<RecordFeed>("earthquakes", signal), getFeed<RecordFeed>("events", signal)]);
    busyRef.current = false;
    if (signal.aborted) return;
    const incoming: PublicRecord[] = [];
    if (q.status === "fulfilled") { setQuakes(q.value); incoming.push(...q.value.records); }
    if (e.status === "fulfilled") { setEvents(e.value); incoming.push(...e.value.records); }
    setErrors(current => ({
      ...current,
      earthquakes: q.status === "fulfilled" ? undefined : "Refresh failed",
      events: e.status === "fulfilled" ? undefined : "Refresh failed",
    }));
    const seen = seenRef.current;
    setFreshIds(new Set(seen ? incoming.filter(record => !seen.has(record.id)).map(record => record.id) : []));
    seenRef.current = new Set([...(seen ?? []), ...incoming.map(record => record.id)]);
    setNextAt(Date.now() + REFRESH_MS);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (gate !== "enabled") return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void refresh(controller.signal);
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const loadImagery = (attempt: number) => {
      getFeed<ImageryFeed>("imagery", controller.signal)
        .then(feed => {
          if (controller.signal.aborted) return;
          setImagery(feed);
          setErrors(current => ({ ...current, imagery: undefined }));
          // Restore satellite imagery if we had fallen back only because metadata was unavailable.
          if (fallbackRef.current) { fallbackRef.current = false; setBaseId("MODIS_Terra_CorrectedReflectance_TrueColor"); }
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setErrors(current => ({ ...current, imagery: "Imagery metadata unavailable" }));
          setImageryNote("NASA imagery metadata unavailable; retrying. The reference map is shown meanwhile and no substitute imagery is displayed.");
          if (!fallbackRef.current) { fallbackRef.current = true; setBaseId("streets"); }
          if (attempt < 4) retryTimer = setTimeout(() => loadImagery(attempt + 1), 15_000);
        });
    };
    loadImagery(1);
    const tick = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (document.visibilityState === "visible" && nextRef.current !== null && time >= nextRef.current) void refresh(controller.signal);
    }, 1000);
    return () => { controller.abort(); clearInterval(tick); clearTimeout(retryTimer); };
  }, [gate, refresh]);

  const meta = imagery?.layers.find(layer => layer.id === baseId);
  const effectiveDate = meta ? (pickedDate && dateAvailable(pickedDate, meta.ranges) ? pickedDate : meta.latest) : null;

  const records = useMemo(() => [
    ...(showQuakes ? quakes?.records ?? [] : []),
    ...(showEvents ? (events?.records ?? []).filter(record => category === "all" || record.category === category) : []),
  ].filter(record => inRegion(record, region))
    .sort((a, b) => (Date.parse(b.observed_at ?? "") || 0) - (Date.parse(a.observed_at ?? "") || 0) || a.id.localeCompare(b.id)),
  [quakes, events, showQuakes, showEvents, category, region]);

  useEffect(() => {
    if (gate !== "enabled") return;
    let disposed = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        if (!containerRef.current) return;
        const maplibregl = await import("maplibre-gl");
        if (disposed || !containerRef.current) return;
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs?v=6.14.0");
        map = new maplibregl.Map({
          // Tiles go through the AEGIS relay: tile servers never see the operator, and the page CSP stays "this site only".
          transformRequest: relayTileRequest,
          container: containerRef.current, center: [80, 22], zoom: 3.2, minZoom: 1.5, maxZoom: 12,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: {
              osm: { type: "raster", tiles: OSM_TILES, tileSize: 256, attribution: "© OpenStreetMap contributors" },
              hazards: { type: "geojson", data: EMPTY },
            },
            layers: [
              { id: "osm", type: "raster", source: "osm" },
              { id: "hazard-halo", type: "circle", source: "hazards",
                paint: { "circle-radius": ["+", ["get", "radius"], 7], "circle-color": ["get", "color"], "circle-opacity": 0.22 } },
              { id: "hazard-points", type: "circle", source: "hazards",
                paint: { "circle-radius": ["get", "radius"], "circle-color": ["get", "color"], "circle-opacity": 0.92,
                  "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } },
              { id: "hazard-selected", type: "circle", source: "hazards", filter: ["==", ["get", "id"], ""],
                paint: { "circle-radius": ["+", ["get", "radius"], 5], "circle-color": "rgba(0,0,0,0)",
                  "circle-stroke-color": "#22d3ee", "circle-stroke-width": 3 } },
            ],
          },
        });
        map.on("load", () => { if (!disposed) setMapState("ready"); });
        map.on("error", event => {
          const id = (event as { sourceId?: string }).sourceId;
          if (disposed) return;
          if (id === "gibs") setImageryNote("Some NASA imagery tiles failed to load. Coverage may be partial; try another day or the reference map.");
          else if (id === "osm") setImageryNote("Reference map tiles are unavailable. Hazard locations remain listed beside the map.");
        });
        map.on("webglcontextlost", () => { if (!disposed) setMapState("failed"); });
        map.on("click", "hazard-points", event => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") setSelectedId(id);
        });
        map.on("mouseenter", "hazard-points", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "hazard-points", () => { if (map) map.getCanvas().style.cursor = ""; });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
      } catch { if (!disposed) setMapState("failed"); }
    })();
    return () => {
      disposed = true;
      popupRef.current?.remove();
      popupRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [gate]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    const source = map.getSource("hazards") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: records.map(record => ({
        type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [record.lon, record.lat] },
        properties: { id: record.id, color: categoryStyle(record.category).color, radius: markerRadius(record) },
      })),
    });
  }, [records, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600;
    if (region === "india") map.fitBounds([[INDIA_BOUNDS.west, INDIA_BOUNDS.south], [INDIA_BOUNDS.east, INDIA_BOUNDS.north]], { padding: 24, duration });
    else map.easeTo({ center: [15, 15], zoom: 1.8, duration });
  }, [region, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    if (map.getLayer("gibs")) map.removeLayer("gibs");
    if (map.getSource("gibs")) map.removeSource("gibs");
    if (baseId === "streets") { setImageryNote("Reference map: OpenStreetMap. No satellite imagery selected."); return; }
    if (!meta || !effectiveDate) return;
    const tiles = gibsTileUrl(baseId, effectiveDate, meta.matrix);
    if (!tiles) { setImageryNote("Imagery request rejected as unsafe."); return; }
    map.addSource("gibs", { type: "raster", tiles: [tiles], tileSize: 256, maxzoom: 9, attribution: "Imagery: NASA EOSDIS GIBS" });
    map.addLayer({ id: "gibs", type: "raster", source: "gibs" }, "hazard-halo");
    setImageryNote(`${effectiveDate} UTC · latest catalogue day ${meta.latest} · clouds and gaps are possible`);
  }, [baseId, meta, effectiveDate, mapState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapState !== "ready") return;
    map.setFilter("hazard-selected", ["==", ["get", "id"], selectedId ?? ""]);
    popupRef.current?.remove();
    popupRef.current = null;
    const record = records.find(item => item.id === selectedId);
    if (!record) return;
    let active = true;
    import("maplibre-gl").then(maplibregl => {
      const current = mapRef.current;
      if (!active || !current) return;
      const node = document.createElement("div");
      node.style.cssText = "max-width:260px;color:#0f172a;font-size:12px;line-height:1.5";
      const title = document.createElement("strong"); title.textContent = record.title;
      const detail = document.createElement("p"); detail.textContent = `${record.source} · ${record.kind} · observed ${formatIst(record.observed_at)}`;
      const caveat = document.createElement("p"); caveat.textContent = "Reported location; marker size does not show affected area.";
      node.append(title, detail, caveat);
      if (record.url) {
        const link = document.createElement("a");
        link.href = record.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "View source report";
        link.style.color = "#1d4ed8";
        node.append(link);
      }
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      current.easeTo({ center: [record.lon, record.lat], zoom: Math.max(current.getZoom(), 5), duration: reduce ? 0 : 500 });
      popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: "280px" })
        .setLngLat([record.lon, record.lat]).setDOMContent(node).addTo(current);
    }).catch(() => undefined);
    return () => { active = false; };
    // Re-run only when the selection or map readiness changes, not on every feed refresh.
  }, [selectedId, mapState]); // eslint-disable-line react-hooks/exhaustive-deps

  const manualRefresh = () => { if (controllerRef.current) void refresh(controllerRef.current.signal); };
  const feedChip = (label: string, feed: RecordFeed | null, error?: string) => {
    if (!feed) return <span className="rounded-full bg-elevated px-3 py-1 text-[11px] font-semibold text-muted ring-1 ring-stroke">{label}: {error ?? "waiting"}</span>;
    const freshness = feedFreshness(feed, now);
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${FRESH_STYLE[freshness]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-current ${freshness === "fresh" ? "motion-safe:animate-pulse" : ""}`}/>
      {label}: {freshness === "stale" ? "stale · " : ""}fetched {ageLabel((now - Date.parse(feed.fetched_at)) / 1000)}{error ? " · " + error.toLowerCase() : ""}
    </span>;
  };
  const visibleList = records.slice(0, 120);

  return <AppShell title="Earth Watch" description="A read-only view of public satellite imagery and hazard reports, kept separate from every AEGIS case, approval and task.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert className="mt-1 shrink-0" size={19}/>
      <p><strong>{t("Public reference data, not an AEGIS assessment.")}</strong>{t(" NASA and USGS reports are delayed, incomplete and sometimes preliminary. Nothing here creates a case, evidence, approval, task or warning. No markers does not mean an area is safe.")}</p>
    </div>

    {gate === "checking" && <p className="panel p-6 text-sm text-muted" role="status">Checking whether public Earth feeds are enabled…</p>}
    {gate === "error" && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
      <AlertTriangle size={18}/>Earth Watch status is unavailable. The rest of AEGIS is unaffected.</div>}
    {gate === "disabled" && <section className="panel p-6">
      <h2 className="flex items-center gap-2 text-base font-bold"><Globe2 size={18} className="text-accent"/> Public feeds are switched off</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">The base AEGIS stack stays fully synthetic. To view USGS earthquakes, NASA EONET events and NASA satellite imagery,
        restart the API with the optional display-only profile. Data is fetched on demand, held in memory only and never written to the database.</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-elevated p-4 text-xs" tabIndex={0} aria-label="Start command"><code>powershell -ExecutionPolicy Bypass -File scripts/start-windows.ps1 -NoBuild -PublicEarth</code></pre>
    </section>}

    {gate === "enabled" && <>
      <section aria-label="Feed heartbeat" className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"/> {t("Public feeds")}
        </span>
        {feedChip("USGS", quakes, errors.earthquakes)}
        {feedChip("NASA EONET", events, errors.events)}
        {freshIds.size > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/20">
          <Sparkles size={13}/> {freshIds.size} new since last refresh</span>}
        <span className="ml-auto text-xs text-muted">
          {nextAt ? `Next refresh in ${countdownLabel(nextAt - now)}` : "Loading feeds…"}
        </span>
        <button type="button" className="control" onClick={manualRefresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""}/> {t("Refresh feeds")}
        </button>
      </section>
      {(errors.earthquakes || errors.events) && <p role="alert" className="mb-4 text-xs text-rose-700 dark:text-rose-300">
        A feed refresh failed. Previously fetched data is shown and labelled with its fetch time; nothing is invented.</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="panel min-w-0 overflow-hidden" aria-label="Earth Watch map">
          <div className="flex flex-wrap items-end gap-3 border-b border-stroke p-4">
            <label className="text-xs font-semibold text-muted">{t("Imagery source")}
              <select className="field mt-1 min-w-[190px]" value={baseId} onChange={event => { setBaseId(event.target.value); setPickedDate(null); }}>
                {(imagery?.layers ?? []).map(layer => <option key={layer.id} value={layer.id}>NASA · {imageryLabel(layer.id)}</option>)}
                <option value="streets">OpenStreetMap reference</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">{t("Imagery day (UTC)")}
              <input type="date" className="field mt-1" disabled={!meta || baseId === "streets"} value={effectiveDate ?? ""}
                min={meta?.start} max={meta?.latest}
                onChange={event => { if (meta && dateAvailable(event.target.value, meta.ranges)) setPickedDate(event.target.value); }}/>
            </label>
            <button type="button" className="control" disabled={!meta || baseId === "streets"} onClick={() => setPickedDate(null)}>{t("Latest available")}</button>
            <div className="ml-auto flex gap-2" role="group" aria-label="Region">
              {(["india", "global"] as Region[]).map(value => <button key={value} type="button" aria-pressed={region === value}
                className={`control ${region === value ? "!border-accent !text-accent" : ""}`} onClick={() => setRegion(value)}>
                {value === "india" ? t("India & neighbours") : t("Global")}</button>)}
            </div>
          </div>
          <div className="relative">
            <div ref={containerRef} className="h-[430px] w-full sm:h-[520px]" role="region" aria-label="Interactive map of public hazard reports"/>
            {mapState === "failed" && <p className="absolute inset-0 flex items-center justify-center bg-elevated/90 p-6 text-center text-sm text-muted" role="alert">
              The map could not start (WebGL or tiles unavailable). Every report is still listed beside the map.</p>}
          </div>
          <p className="border-t border-stroke px-4 py-3 text-xs text-muted" role="status">{imageryNote}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-stroke px-4 py-3 text-xs" aria-label="Map legend">
            {Object.entries(CATEGORY_STYLE).map(([key, style]) => <li key={key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: style.color }}/>{style.label}</li>)}
          </ul>
        </section>

        <aside className="panel min-w-0 overflow-hidden" aria-label="Public hazard reports">
          <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><Layers size={18} className="text-accent"/> {t("Hazard layers")}</h2>
            <span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">{t("Read-only")}</span></div>
          <div className="space-y-3 border-b border-stroke p-4 text-sm">
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-teal-600" checked={showQuakes} onChange={event => setShowQuakes(event.target.checked)}/> USGS earthquakes <small className="text-muted">M2.5+ · 7 days</small></label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-teal-600" checked={showEvents} onChange={event => setShowEvents(event.target.checked)}/> NASA EONET events <small className="text-muted">open · 30 days</small></label>
            <label className="block text-xs font-semibold text-muted">{t("Event category")}
              <select className="field mt-1 w-full" value={category} onChange={event => setCategory(event.target.value)}>
                <option value="all">{t("All natural events")}</option>
                {Object.entries(CATEGORY_STYLE).filter(([key]) => key !== "earthquakes").map(([key, style]) => <option key={key} value={key}>{style.label}</option>)}
              </select>
            </label>
          </div>
          <p className="px-4 pt-3 text-xs text-muted" role="status">
            {records.length} locations in {region === "india" ? "the India & neighbours bounding box (not a political boundary)" : "the global view"}
          </p>
          <div className="max-h-[430px] divide-y divide-stroke overflow-y-auto">
            {visibleList.map(record => <button key={record.id} type="button" aria-pressed={selectedId === record.id}
              onClick={() => setSelectedId(record.id)}
              className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-elevated/60 ${selectedId === record.id ? "bg-accent/5" : ""}`}>
              <span aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: categoryStyle(record.category).color }}/>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">{record.title}{freshIds.has(record.id) && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">NEW</span>}</strong>
                <span className="mt-1 block text-xs text-muted">{record.source} · {record.kind} · {formatIst(record.observed_at)}</span>
              </span>
            </button>)}
            {records.length === 0 && <p className="p-6 text-center text-xs text-muted">
              No matching reports are loaded. Check feed status, region or layer filters. This does not indicate an absence of hazards.</p>}
          </div>
          {records.length > visibleList.length && <p className="border-t border-stroke px-4 py-3 text-xs text-muted">Showing the {visibleList.length} most recent of {records.length}.</p>}
        </aside>
      </div>

      <section className="mt-5 grid gap-4 md:grid-cols-3" aria-label="Sources and limitations">
        {[quakes, events, imagery].map(feed => feed && <article key={feed.feed} className="panel p-4 text-xs leading-6 text-muted">
          <h3 className="text-sm font-bold text-foreground">{feed.attribution}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4">{feed.limitations.map(item => <li key={item}>{item}</li>)}</ul>
          {feed.warning && <p className="mt-2 text-amber-700 dark:text-amber-300">{feed.warning}</p>}
        </article>)}
      </section>
    </>}
  </AppShell>;
}
