"use client";
import { useCallback, useEffect, useState } from "react";
import type { Incident, TelemetryResponse } from "./types";

export function useExerciseData() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/incidents", { cache: "no-store" }),
        fetch("/api/telemetry", { cache: "no-store" }),
      ]);
      if (!a.ok || !b.ok) throw new Error("Exercise API unavailable");
      const items: unknown = await a.json();
      const series: unknown = await b.json();
      if (!Array.isArray(items) || !series || typeof series !== "object" || !("points" in series) || !Array.isArray(series.points))
        throw new Error("Unexpected API response");
      setIncidents(items as Incident[]);
      setTelemetry(series as TelemetryResponse);
      setError(null);
      setLastSynced(new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load exercise data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, [refresh]);
  return { incidents, telemetry, loading, refreshing, error, lastSynced, refresh };
}
