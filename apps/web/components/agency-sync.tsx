"use client";

import { codeLabel, recordIdTitle } from "../lib/labels";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList,
  Clock3, FileClock, GitBranch, RefreshCw, ShieldAlert,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { DataFreshness, EmptyState, ErrorState, SearchField, SegmentedControl, SkeletonRows, StatStrip, StatTile, StatusPill, type Tone, Button, buttonClass, Panel } from "./ui";
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

const STATE_TONE: Record<ExerciseTaskState, Tone> = { prepared: "neutral", acknowledged: "warning", closed: "success" };

export function AgencySync() {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const [dept, setDept] = useState("all");
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

  const departments = useMemo(() => Array.from(new Set((board?.tasks ?? []).map(task => task.agency_label))).sort(), [board]);
  const shown = visible.filter(task => dept === "all" || task.agency_label === dept);
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-task-row]") ?? []);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)));
    rows[next]?.focus();
  };

  return <AppShell title="AgencySync — Exercise Tasks"
    description="Reproducible fictional department follow-up and acknowledgement history. No messages or field tasks are sent.">
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert size={19} className="mt-0.5 shrink-0"/>
      <p><strong>Fully scripted simulation.</strong> Department names, task assignments, acknowledgements and closures are local database fixtures.
        This interface cannot send operational requests, notify responders or change task state.</p>
    </div>
    {error && <ErrorState className="mb-4" message={error + ". " + t("No past result is treated as current.")} onRetry={() => setRevision(value => value+1)}/>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">Version: IndTrana urban flood exercise v0.1 · {board ? when(board.as_of) : "Awaiting local database"}{board && <DataFreshness observedAt={board.as_of} staleAfterHours={1}/>}</p>
      <Button type="button" onClick={() => setRevision(value => value+1)} disabled={loading}>
        <RefreshCw size={16} className={loading ? "animate-spin" : ""}/> Refresh scripted tasks
      </Button>
    </div>
    <StatStrip label={t("Scripted task summary")} className="sm:grid-cols-3 xl:grid-cols-3">
      {([
        { state: "prepared", title: "Prepared, not sent", icon: FileClock },
        { state: "acknowledged", title: "Scripted acknowledgements", icon: Clock3 },
        { state: "closed", title: "Scripted closures", icon: CheckCircle2 },
      ] as const).map((item, index) => <StatTile key={item.state} index={index} label={t(item.title)} icon={item.icon} tone={STATE_TONE[item.state]}
        value={board ? board.status_counts[item.state] : "—"} hint={t("Fictional department tasks")}/>)}
    </StatStrip>
    <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)]">
      <Panel className="min-w-0 overflow-hidden" bodyClassName="p-0" icon={ClipboardList} title="Task registry" description="Select a task for its immutable scripted chronology.">
        <div className="flex flex-wrap items-center gap-3 border-b border-stroke p-4">
          <SearchField label={t("Filter fictional task records")} value={search} onChange={setSearch} placeholder={t("Search desk, kind or case...")} className="min-w-[190px] flex-1"/>
          <label><span className="sr-only">Filter task state</span>
            <select className="field min-w-[170px]" value={filter} onChange={event => setFilter(event.target.value as Filter)}>
              {STATES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select></label>
          {departments.length > 1 && <SegmentedControl label={t("Filter by department")} value={dept} onChange={setDept}
            options={[{ value: "all", label: t("All departments") }, ...departments.map(name => ({ value: name, label: name }))]}/>}
        </div>
        {loading && <div className="p-4"><SkeletonRows rows={4} label={t("Loading scripted task history…")}/></div>}
        {!loading && shown.length === 0 && <EmptyState icon={ClipboardList} title={t("No fictional tasks match this filter.")}
          body={t("Clear the filters to see every scripted task. An empty list does not mean no work is pending.")}/>}
        <div className="divide-y divide-stroke" ref={listRef} onKeyDown={onListKey}>
          {shown.map(task => <button type="button" key={task.id} data-task-row onClick={() => setSelectedId(task.id)}
            aria-pressed={selectedId === task.id}
            className={`w-full p-4 text-left transition-colors hover:bg-elevated/60 sm:p-5 ${selectedId === task.id ? "bg-accent/5" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">{task.agency_label}</strong>
              <StatusPill tone={STATE_TONE[task.state]}>{t(stateLabel(task.state))}</StatusPill>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{task.summary}</p>
            <p className="mt-2 text-[11px] text-muted">
              Case {task.incident_id.slice(0,8)} · Drafted {when(task.prepared_at)}
              {task.demo_due_window_elapsed ? " · Demo review window elapsed" : ""}
            </p>
            <DataFreshness className="mt-1" observedAt={task.prepared_at} staleAfterHours={24 * 365}/>
          </button>)}
        </div>
        <p className="border-t border-stroke px-5 py-3 text-xs text-muted">{shown.length} matching of {board?.total_in_scope ?? "—"} local fictional records.</p>
      </Panel>
      <Panel className="min-w-0 overflow-hidden" aria-label="Scripted acknowledgement timeline" bodyClassName="p-0" icon={GitBranch} title="Scripted audit trail">
        {historyError && <ErrorState className="m-4" message={historyError} onRetry={() => setRevision(value => value+1)}/>}
        {historyLoading && <div className="p-4"><SkeletonRows rows={3} label={t("Loading chronology…")}/></div>}
        {!selectedId && <EmptyState icon={GitBranch} title={t("Select a fictional task")} body={t("Select a fictional task to inspect its scripted acknowledgement chain.")}/>}
        {detail && <div className="p-5">
          <p className="text-sm font-bold">{detail.task.agency_label}</p>
          <p className="mt-2 text-xs leading-6 text-muted">Playbook: <span title={detail.task.playbook_ref}>{recordIdTitle(detail.task.playbook_ref)}</span></p>
          <p className="mt-1 text-xs leading-6 text-muted">All acknowledgements are generated exercise entries, not evidence of real response.</p>
          <ol className="mt-5 space-y-4 border-l-2 border-stroke pl-4">
            {detail.events.map(event => <li key={event.id} className="relative">
              <span aria-hidden="true" className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-accent"/>
              <p className="text-xs font-bold capitalize">{codeLabel(event.kind)}</p>
              <p className="mt-1 text-xs leading-6 text-muted">{event.summary}</p>
              <p className="mt-1 text-[11px] text-muted">{when(event.occurred_at)}</p>
            </li>)}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className={buttonClass({ size: "sm" })} href={"/incidents/" + detail.task.incident_id}>
              Incident evidence <ArrowRight size={14}/></Link>
            <Link className={buttonClass({ size: "sm" })} href="/playbooks">
              Source playbook <ArrowRight size={14}/></Link>
          </div>
        </div>}
      </Panel>
    </div>
  </AppShell>;
}
