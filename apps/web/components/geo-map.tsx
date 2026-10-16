"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import type { Incident } from "../lib/types";
import { MapPinned } from "lucide-react";

export function GeoMap({ incidents, selectedId, onSelect }: {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const [mapError, setMapError] = useState(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        if (!containerRef.current) return;
        const maplibregl = (await import("maplibre-gl")).default;
        if (disposed || !containerRef.current) return;
        map = new maplibregl.Map({
          container: containerRef.current,
          center: [78.4772, 17.385],
          zoom: 10.7,
          attributionControl: true,
          style: {
            version: 8,
            sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
        });
        map.on("error", () => { /* Individual tile failures do not disable the exercise interface. */ });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
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
    if (!mapRef.current) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    let active = true;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!active || !mapRef.current) return;
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
          .addTo(mapRef.current));
      }
    }).catch(() => setMapError(true));
    return () => { active = false; markersRef.current.forEach(marker => marker.remove()); markersRef.current = []; };
  }, [incidents, selectedId]);

  return (
    <div className="relative h-[320px] w-full sm:h-[390px]">
      <div ref={containerRef} className="aegis-map" role="region" aria-label="Hyderabad map with synthetic incident markers" />
      {mapError && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated p-6 text-center">
        <MapPinned size={30} className="text-accent" />
        <strong>Map rendering unavailable</strong>
        <p className="max-w-sm text-sm text-muted">Check WebGL and internet access. Incidents remain accessible in the list.</p>
      </div>}
      <div className="pointer-events-none absolute bottom-8 left-3 rounded-lg border border-white/10 bg-[#10263a]/90 px-3 py-2 text-[11px] font-medium text-white shadow-lg">
        Hyderabad · synthetic incident locations
      </div>
    </div>
  );
}
