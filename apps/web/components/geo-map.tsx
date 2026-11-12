"use client";

import { relayTileRequest } from "../lib/tile-relay";
import { Button } from "./ui";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker, GeoJSONSource } from "maplibre-gl";
import type { Incident } from "../lib/types";
import { Box, CheckCircle2, Eye, Info, MapPinned, ShieldAlert } from "lucide-react";
import { useT } from "./language-provider";

const BASE_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

export function GeoMap({ incidents, selectedId, onSelect }: {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const retryingTiles = useRef(false);
  const [spatial, setSpatial] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;
    void (async () => {
      try {
        if (!containerRef.current) return;
        const maplibregl = await import("maplibre-gl");
        if (disposed || !containerRef.current) return;
        maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs?v=6.14.0");
        map = new maplibregl.Map({
          // Tiles go through the AEGIS relay: tile servers never see the operator, and the page CSP stays "this site only".
          transformRequest: relayTileRequest,
          container: containerRef.current,
          center: [78.4772, 17.385],
          zoom: 10.7,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: { locators: { type: "geojson", data: { type: "FeatureCollection", features: [] } }, osm: { type: "raster", tiles: BASE_TILES, tileSize: 256, attribution: "© OpenStreetMap contributors" } },
            layers: [{ id: "osm", type: "raster", source: "osm" }, {
              id: "incident-locators", type: "fill-extrusion", source: "locators",
              paint: { "fill-extrusion-color": ["case", ["get", "selected"], "#2dd4bf", "#3978ea"],
                "fill-extrusion-height": 650, "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.65 },
              layout: { visibility: "none" },
            }],
          },
        });
        map.on("load", () => { if (!disposed) setSceneReady(true); });
        map.on("error", event => {
          if (!disposed && "sourceId" in event && event.sourceId === "osm") {
            retryingTiles.current = false;
            setTilesUnavailable(true);
          }
        });
        map.on("sourcedata", event => {
          if (!disposed && retryingTiles.current && event.sourceId === "osm" &&
              "tile" in event && map?.isSourceLoaded("osm")) {
            retryingTiles.current = false;
            setTilesUnavailable(false);
          }
        });
        map.on("webglcontextlost", () => { if (!disposed) setMapError(true); });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
        setMapReady(true);
      } catch {
        if (!disposed) setMapError(true);
      }
    })();
    return () => {
      disposed = true;
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    let active = true;
    import("maplibre-gl").then(maplibregl => {
      const currentMap = mapRef.current;
      if (!active || !currentMap) return;
      for (const incident of incidents) {
        if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lon)) continue;
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "aegis-marker";
        marker.dataset.status = incident.status;
        marker.dataset.selected = String(incident.id === selectedId);
        marker.setAttribute("aria-label", `Select ${incident.hazard_type} exercise incident`);
        marker.textContent = "!";
        marker.addEventListener("click", () => onSelectRef.current(incident.id));
        markersRef.current.push(new maplibregl.Marker({ element: marker })
          .setLngLat([incident.lon, incident.lat])
          .addTo(currentMap));
      }
    }).catch(() => setMapError(true));
    return () => { active = false; markersRef.current.forEach(marker => marker.remove()); markersRef.current = []; };
  }, [incidents, selectedId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!sceneReady || !map || mapError) return;
    const features = incidents.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon) &&
      Math.abs(item.lat) < 85 && Math.abs(item.lon) < 180).map(item => {
      // Equal-size locator symbols only: no hazard footprint or building geometry.
      const x = 0.0015, y = 0.0015;
      return { type: "Feature" as const, properties: { selected: item.id === selectedId },
        geometry: { type: "Polygon" as const, coordinates: [[[item.lon-x,item.lat-y],
          [item.lon+x,item.lat-y],[item.lon+x,item.lat+y],[item.lon-x,item.lat+y],
          [item.lon-x,item.lat-y]]] } };
    });
    void (map.getSource("locators") as GeoJSONSource)?.setData({ type: "FeatureCollection", features });
    map.setLayoutProperty("incident-locators", "visibility", spatial ? "visible" : "none");
  }, [incidents, selectedId, spatial, sceneReady, mapError]);

  function changeView() {
    const next = !spatial;
    setSpatial(next);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.easeTo({ pitch: next ? 50 : 0, bearing: next ? -15 : 0,
      duration: reduced ? 0 : 450 });
  }

  function retryTiles() {
    const map = mapRef.current;
    if (map?.getSource("osm")) {
      retryingTiles.current = true;
      // Refresh failed tiles explicitly; setTiles with identical URLs retains failures.
      map.refreshTiles("osm");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke bg-elevated/50 px-4 py-3">
        <p className="max-w-md text-xs text-muted">{spatial ? "Equal-height locator symbols only · not buildings, flood extent or severity." : "2D overview · select a case in the map or incident queue."}</p>
        <Button size="sm" type="button"  aria-pressed={spatial}
          disabled={!sceneReady || mapError} onClick={changeView}><Box size={15}/>{spatial ? "Return to 2D" : "Explore in 3D"}</Button>
      </div>
    <div className="relative h-[320px] w-full sm:h-[390px]">
      <div ref={containerRef} className="aegis-map" role="region" aria-label="Hyderabad map with synthetic incident markers" />
      {tilesUnavailable && !mapError && <div className="absolute left-3 right-3 top-3 rounded-lg border border-amber-500/30 bg-surface p-3 text-sm text-ink shadow-lg">
        <p role="status" className="font-semibold">Base map tiles unavailable</p>
        <p className="mt-1 text-xs text-muted">Geographic context may be incomplete. Synthetic markers and the incident list remain available.</p>
        <Button size="sm" className="mt-2" type="button" onClick={retryTiles} >Retry map tiles</Button>
      </div>}
      {mapError && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated p-6 text-center">
        <MapPinned size={30} className="text-accent" />
        <strong role="status">Map rendering unavailable</strong>
        <p className="max-w-sm text-sm text-muted">Check WebGL and internet access. Incidents remain accessible in the list.</p>
      </div>}
      <div className="pointer-events-none absolute bottom-8 left-3 rounded-lg border border-white/10 bg-[#0d1220]/92 px-3 py-2 text-[11px] font-medium text-white shadow-lg">
        Hyderabad · synthetic incident locations
      </div>
    </div>
      <div className="border-t border-stroke px-4 py-3" aria-label={t("Map legend")} role="group">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <li className="inline-flex items-center gap-1"><Info size={12} aria-hidden="true"/>{t("New")}</li>
          <li className="inline-flex items-center gap-1"><Eye size={12} aria-hidden="true"/>{t("In review")}</li>
          <li className="inline-flex items-center gap-1"><ShieldAlert size={12} aria-hidden="true"/>{t("Active exercise")}</li>
          <li className="inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true"/>{t("Resolved")}</li>
        </ul>
        <p className="mt-1 text-[11px] text-muted">{t("Locators are equal-height schematic symbols, not building geometry, flood extent or severity.")} {t("The incident queue lists every case if the map is unavailable.")}</p>
      </div>
    </div>
  );
}
