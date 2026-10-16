"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, MapPin, RefreshCw, Search } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { StatusBadge } from "../../components/status-badge";
import { useExerciseData } from "../../lib/use-exercise-data";
import type { IncidentStatus } from "../../lib/types";

const statuses = ["all", "new", "review", "active", "resolved"] as const;
export default function IncidentsPage() {
  const { incidents, loading, error, refreshing, refresh, lastSynced } = useExerciseData();
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => incidents.filter(item =>
    (status === "all" || item.status === status) &&
    (item.hazard_type.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase()))
  ), [incidents, query, status]);
  return <AppShell title="Incident Registry" description="Search and inspect synthetic emergency incidents from the PostGIS exercise database.">
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <div><h2 className="text-base font-bold">All exercise incidents</h2><p className="mt-1 text-xs text-muted">{lastSynced ? `Updated ${new Date(lastSynced).toLocaleTimeString()}` : "Awaiting exercise API"}</p></div>
        <button className="control" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""}/>Refresh</button>
      </div>
      {error && <div role="alert" className="flex items-center gap-2 border-b border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm text-rose-600 dark:text-rose-300"><AlertTriangle size={16}/>{error}; cached data may be stale.</div>}
      <div className="flex flex-col gap-3 border-b border-stroke p-5 sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">Search incident type or ID</span><Search className="pointer-events-none absolute left-3 top-3 text-muted" size={17}/><input className="field !pl-10" placeholder="Search incident type or ID..." value={query} onChange={event => setQuery(event.target.value)}/></label>
        <label><span className="sr-only">Filter by incident status</span><select className="field min-w-[190px]" value={status} onChange={event => setStatus(event.target.value as typeof status)}>
          {statuses.map(item => <option value={item} key={item}>{item === "all" ? "All statuses" : item === "review" ? "Awaiting review" : item[0].toUpperCase() + item.slice(1)}</option>)}
        </select></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-elevated/70 text-xs uppercase tracking-wider text-muted"><tr><th className="px-5 py-4">Incident</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Coordinates</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Reference</th></tr></thead>
          <tbody className="divide-y divide-stroke">
            {filtered.map(item => <tr key={item.id} className="hover:bg-elevated/40"><td className="px-5 py-4 font-semibold">{item.hazard_type}</td><td className="px-5 py-4"><StatusBadge status={item.status as IncidentStatus}/></td><td className="px-5 py-4 text-xs text-muted"><span className="inline-flex items-center gap-1"><MapPin size={13}/>{item.lat.toFixed(4)}, {item.lon.toFixed(4)}</span></td><td className="px-5 py-4 text-xs text-muted">{new Date(item.created_at).toLocaleDateString()}</td><td className="px-5 py-4 font-mono text-xs text-muted">{item.id.slice(0,8)}</td></tr>)}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <p className="px-5 py-12 text-center text-sm text-muted">No incidents match your filters.</p>}
        {loading && <p className="px-5 py-12 text-center text-sm text-muted">Loading incidents...</p>}
      </div>
      <div className="border-t border-stroke px-5 py-3 text-xs text-muted">{filtered.length} matching records · Read-only exercise registry</div>
    </div>
  </AppShell>;
}
