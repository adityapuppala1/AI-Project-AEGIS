"use client";

import { relayTileRequest } from "../lib/tile-relay";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { COLUMN_HEIGHT_M, STATE_COLOR, type EvidenceRecord, type TriggerEvent } from "../lib/proactive";

const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const HALF_DEGREES = 0.035;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Schematic square footprint of equal size; never a flood extent. */
function square(lon: number, lat: number) {
  const dx = HALF_DEGREES / Math.max(0.2, Math.cos(lat * Math.PI / 180));
  return [[[lon - dx, lat - HALF_DEGREES], [lon + dx, lat - HALF_DEGREES], [lon + dx, lat + HALF_DEGREES], [lon - dx, lat + HALF_DEGREES], [lon - dx, lat - HALF_DEGREES]]];
}

export function HazardWatchMap({ triggers, evidence, selectedId, pitched, onSelect, onFail, onReady }: Readonly<{
  triggers: TriggerEvent[]; evidence: EvidenceRecord[]; selectedId: string | null; pitched: boolean;
  onSelect: (id: string) => void; onFail: () => void; onReady?: () => void;
}>) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const failRef = useRef(onFail); failRef.current = onFail;
  const readyRef = useRef(onReady); readyRef.current = onReady;

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;
    void (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (disposed || !container.current) return;
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs?v=6.14.0");
        map = new maplibregl.Map({
          // Tiles go through the IndTrana relay: tile servers never see the operator, and the page CSP stays "this site only".
          transformRequest: relayTileRequest,
          container: container.current, center: [78.48, 17.4], zoom: 7.4, minZoom: 3, maxZoom: 13, maxPitch: 70,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: {
              osm: { type: "raster", tiles: OSM_TILES, tileSize: 256, attribution: "© OpenStreetMap contributors" },
              columns: { type: "geojson", data: EMPTY },
              evidence: { type: "geojson", data: EMPTY },
              points: { type: "geojson", data: EMPTY },
            },
            layers: [
              { id: "osm", type: "raster", source: "osm" },
              { id: "evidence-heat", type: "heatmap", source: "evidence",
                paint: { "heatmap-weight": ["get", "weight"], "heatmap-radius": 28, "heatmap-intensity": 1, "heatmap-opacity": 0.65,
                  "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(14,165,233,0)", 0.3, "rgba(14,165,233,0.5)", 0.6, "rgba(245,158,11,0.7)", 1, "rgba(225,29,72,0.85)"] } },
              { id: "trigger-columns", type: "fill-extrusion", source: "columns",
                paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": COLUMN_HEIGHT_M, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.82 } },
              { id: "trigger-points", type: "circle", source: "points",
                paint: { "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } },
              { id: "trigger-selected", type: "circle", source: "points", filter: ["==", ["get", "id"], ""],
                paint: { "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#22d3ee", "circle-stroke-width": 3 } },
            ],
          },
        });
        map.on("load", () => { if (!disposed) { setReady(true); readyRef.current?.(); } });
        map.on("webglcontextlost", () => { if (!disposed) failRef.current(); });
        map.on("error", event => { if ((event as { sourceId?: string }).sourceId === "osm" && !disposed) failRef.current(); });
        for (const layer of ["trigger-columns", "trigger-points"]) {
          map.on("click", layer, event => {
            const id = event.features?.[0]?.properties?.id;
            if (typeof id === "string") selectRef.current(id);
          });
        }
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
        mapRef.current = map;
      } catch { if (!disposed) failRef.current(); }
    })();
    return () => { disposed = true; map?.remove(); mapRef.current = null; setReady(false); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void (map.getSource("columns") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection", features: triggers.map(item => ({ type: "Feature" as const, properties: { id: item.id, color: STATE_COLOR[item.state] },
        geometry: { type: "Polygon" as const, coordinates: square(item.lon, item.lat) } })) });
    void (map.getSource("points") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection", features: triggers.map(item => ({ type: "Feature" as const, properties: { id: item.id, color: STATE_COLOR[item.state] },
        geometry: { type: "Point" as const, coordinates: [item.lon, item.lat] } })) });
    void (map.getSource("evidence") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection", features: evidence.map(item => ({ type: "Feature" as const, properties: { weight: item.stale ? 0.25 : 1 },
        geometry: { type: "Point" as const, coordinates: [item.lon, item.lat] } })) });
  }, [triggers, evidence, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("trigger-selected", ["==", ["get", "id"], selectedId ?? ""]);
    const picked = triggers.find(item => item.id === selectedId);
    if (picked) {
      if (reducedMotion()) map.jumpTo({ center: [picked.lon, picked.lat] });
      else map.easeTo({ center: [picked.lon, picked.lat], duration: 500 });
    }
    // Pan only when the selection changes, not on every data refresh.
  }, [selectedId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // Default 2D. Under reduced motion the camera jumps instantly with no easing.
    if (reducedMotion()) map.jumpTo({ pitch: pitched ? 55 : 0, bearing: pitched ? -20 : 0 });
    else map.easeTo({ pitch: pitched ? 55 : 0, bearing: pitched ? -20 : 0, duration: 700 });
  }, [pitched, ready]);

  return <div ref={container} className="aegis-map" role="img" style={{ minHeight: 420 }}
    aria-label="Map of hazard trigger markers and evidence heat. The same triggers are listed in the queue beside the map." />;
}
