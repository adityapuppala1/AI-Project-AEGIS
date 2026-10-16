"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList,
  Clock3, FileClock, GitBranch, RefreshCw, ShieldAlert,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { isSyntheticTaskPayload,
  type ExerciseAgencyTask, type ExerciseAgencyTaskBoard,
  type ExerciseAgencyTaskDetail, type ExerciseTaskState,
} from "../lib/agency-sync";

type Filter = "all" | ExerciseTaskState;
const STATES: { code: Filter; label: string }[] = [
  { code: "all", label: "All scripted tasks" },
  { code: "prepared", label: "Prepared (not sent)" },
  { code: "acknowledged", label: "Scripted acknowledgement" },
  { code: "closed", label: "Scripted closure" },
];
const STATUS: Record<ExerciseTaskState, string> = {
  prepared: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  acknowledged: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  closed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};
function when(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid timestamp";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  }) + " IST";
}
function stateLabel(state: ExerciseTaskState): string {
  return state === "prepared" ? "Prepared, never sent" :
    state === "acknowledged" ? "Acknowledged in simulation" : "Closed in simulation";
}

export function AgencySync() {
  const [board, setBoard] = useState<ExerciseAgencyTaskBoard | null>(null);
  const [detail, setDetail] = useState<ExerciseAgencyTaskDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setBoard(null); setError(""); setSelectedId(null);
    const query = new URLSearchParams({ limit: "50" });
    if (filter !== "all") query.set("state", filter);
    fetch("/api/agency-tasks?" + query, {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Exercise task registry unavailable");
      const data = await response.json() as ExerciseAgencyTaskBoard;
      if (!isSyntheticTaskPayload(data) ||
          !Array.isArray(data.tasks) || data.tasks.some(task => task.synthetic !== true)) {
        throw new Error("Unexpected task classification");
      }
      if (!controller.signal.aborted) {
        setBoard(data);
        setSelectedId(data.tasks[0]?.id ?? null);
      }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unavailable");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null); setHistoryError("");
    if (!selectedId) return;
    setHistoryLoading(true);
    fetch("/api/agency-tasks/" + encodeURIComponent(selectedId), {
      cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("Scripted task chronology unavailable");
      const data = await response.json() as ExerciseAgencyTaskDetail;
      if (!isSyntheticTaskPayload(data) || data.task.id !== selectedId ||
          !Array.isArray(data.events) || data.events.some(event => event.synthetic !== true)) {
        throw new Error("Unexpected task history provenance");
      }
      if (!controller.signal.aborted) setDetail(data);
    }).catch(reason => {
      if (!controller.signal.aborted) setHistoryError(reason instanceof Error ? reason.message : "Unavailable");
    }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [selectedId, revision]);

  const visible = useMemo(() => (board?.tasks ?? []).filter(task =>
    [task.summary, task.agency_label, task.incident_id, task.task_kind]
      .join(" ").toLowerCase().includes(search.trim().toLowerCase())
  ), [board, search]);

  return <AppShell title="AgencySync — Exercise Tasks"
    description="Reproducible fictional department follow-up and acknowledgement history. No messages or field tasks are sent.">
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert size={19} className="mt-0.5 shrink-0"/>
      <p><strong>Fully scripted simulation.</strong> Department names, task assignments, acknowledgements and closures are local database fixtures.
        This interface cannot send operational requests, notify responders or change task state.</p>
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}. No past result is treated as current.</p>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">Version: AEGIS urban flood exercise v0.1 · {board ? when(board.as_of) : "Awaiting local database"}</p>
      <button type="button" className="control" onClick={() => setRevision(value => value+1)} disabled={loading}>
        <RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh scripted tasks
      </button>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      {([
        { state: "prepared", title: "Prepared, not sent", icon: FileClock },
        { state: "acknowledged", title: "Scripted acknowledgements", icon: Clock3 },
        { state: "closed", title: "Scripted closures", icon: CheckCircle2 },
      ] as const).map(item => <article key={item.state} className="panel flex items-start justify-between gap-3 p-5">
        <div><p className="text-xs font-semibold text-muted">{item.title}</p>
          <p className="mt-3 text-3xl font-bold tabular-nums">{board ? board.status_counts[item.state] : "—"}</p>
          <p className="mt-1 text-[11px] text-muted">Fictional department tasks</p>
        </div><item.icon size={20} className="text-accent"/>
      </article>)}
    </div>
    <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)]">
      <section className="panel min-w-0 overflow-hidden">
        <div className="panel-heading"><div>
          <h2 className="flex items-center gap-2 text-base font-bold"><ClipboardList size={18} className="text-accent"/> Task registry</h2>
          <p className="mt-1 text-xs text-muted">Select a task for its immutable scripted chronology.</p>
        </div></div>
        <div className="flex flex-wrap gap-3 border-b border-stroke p-4">
          <label className="flex-1"><span className="sr-only">Filter fictional task records</span>
            <input type="search" className="field" value={search} maxLength={100}
              placeholder="Search desk, kind or case..." onChange={event => setSearch(event.target.value)}/></label>
          <label><span className="sr-only">Filter task state</span>
            <select className="field min-w-[170px]" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
              {STATES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select></label>
        </div>
        {loading && <p className="p-5 text-sm text-muted">Loading scripted task history…</p>}
        {!loading && visible.length === 0 && <p className="p-6 text-sm text-muted">No fictional tasks match this filter.</p>}
        <div className="divide-y divide-stroke">
          {visible.map(task => <button type="button" key={task.id} onClick={() => setSelectedId(task.id)}
            aria-pressed={selectedId === task.id}
            className={`w-full p-4 text-left transition-colors hover:bg-elevated/60 sm:p-5 ${selectedId === task.id ? "bg-accent/5" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{task.agency_label}</strong>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS[task.state]}`}>
                {stateLabel(task.state)}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{task.summary}</p>
            <p className="mt-2 text-[11px] text-muted">
              Case {task.incident_id.slice(0,8)} · Drafted {when(task.prepared_at)}
              {task.demo_due_window_elapsed ? " · Demo review window elapsed" : ""}
            </p>
          </button>)}
        </div>
        <p className="border-t border-stroke px-5 py-3 text-xs text-muted">{visible.length} matching of {board?.total_in_scope ?? "—"} local fictional records.</p>
      </section>
      <section className="panel min-w-0 overflow-hidden" aria-label="Scripted acknowledgement timeline">
        <div className="panel-heading"><h2 className="flex items-center gap-2 text-base font-bold"><GitBranch size={18} className="text-accent"/> Scripted audit trail</h2></div>
        {historyError && <p role="alert" className="p-4 text-sm text-rose-700 dark:text-rose-300">{historyError}</p>}
        {historyLoading && <p className="p-4 text-sm text-muted">Loading chronology…</p>}
        {!selectedId && <p className="p-5 text-sm text-muted">Select a fictional task to inspect its scripted acknowledgement chain.</p>}
        {detail && <div className="p-5">
          <p className="text-sm font-bold">{detail.task.agency_label}</p>
          <p className="mt-2 text-xs leading-6 text-muted">Playbook: {detail.task.playbook_ref}</p>
          <p className="mt-1 text-xs leading-6 text-muted">All acknowledgements are generated exercise entries, not evidence of real response.</p>
          <ol className="mt-5 space-y-4 border-l-2 border-stroke pl-4">
            {detail.events.map(event => <li key={event.id} className="relative">
              <span aria-hidden="true" className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-accent"/>
              <p className="text-xs font-bold capitalize">{event.kind.replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs leading-6 text-muted">{event.summary}</p>
              <p className="mt-1 text-[11px] text-muted">{when(event.occurred_at)}</p>
            </li>)}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="control text-xs" href={"/incidents/" + detail.task.incident_id}>
              Incident evidence <ArrowRight size={14}/></Link>
            <Link className="control text-xs" href="/playbooks">
              Source playbook <ArrowRight size={14}/></Link>
          </div>
        </div>}
      </section>
    </div>
  </AppShell>;
}
