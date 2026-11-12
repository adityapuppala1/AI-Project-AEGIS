"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Bus, ClipboardList, Clock3, HeartPulse, LifeBuoy, Megaphone, RefreshCw, ShieldAlert, ShieldCheck, UsersRound, Waves,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { FieldTeams } from "./field-teams";
import { DataFreshness, EmptyState, ErrorState, SegmentedControl, SkeletonCards, StatStrip, StatTile, StatusPill, type Tone } from "./ui";
import { isSyntheticTaskPayload, type ExerciseAgencyTaskBoard } from "../lib/agency-sync";
import { DEMO_CAPACITY, summarizeTeams, type TeamKind, type TeamStatus, type TeamSummary } from "../lib/team-availability";

const ICONS: Record<TeamKind, LucideIcon> = {
  police: ShieldCheck, transport: Bus, municipal: Waves, rescue: LifeBuoy, health: HeartPulse, comms: Megaphone, general: UsersRound,
};
const STATUS: Record<TeamStatus, { label: string; chip: string; ring: string }> = {
  available: { label: "Available", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20", ring: "#34b4a6" },
  engaged: { label: "Engaged", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20", ring: "#ed9955" },
  at_capacity: { label: "At planning capacity", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20", ring: "#d77b74" },
};
const RADIUS = 30, CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const when = (value: string | null) => {
  if (!value) return "None scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Invalid time" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) + " IST";
};

function Gauge({ team, animate }: { team: TeamSummary; animate: boolean }) {
  const offset = CIRCUMFERENCE * (1 - (animate ? team.load : 0));
  return <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" role="img" aria-label={`${team.open} of ${DEMO_CAPACITY} planning slots in use`}>
    <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="rgb(var(--chart-grid) / .3)" strokeWidth="7"/>
    <circle cx="40" cy="40" r={RADIUS} fill="none" stroke={STATUS[team.status].ring} strokeWidth="7" strokeLinecap="round"
      className="ring-fill" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} transform="rotate(-90 40 40)"/>
    <text x="40" y="44" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">{team.open}/{DEMO_CAPACITY}</text>
  </svg>;
}

const STATUS_TONE: Record<TeamStatus, Tone> = { available: "success", engaged: "warning", at_capacity: "danger" };

export function TeamAvailability() {
  const t = useT();
  const [statusFilter, setStatusFilter] = useState<"all" | TeamStatus>("all");
  const [board, setBoard] = useState<ExerciseAgencyTaskBoard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRevision(value => value + 1); }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/agency-tasks?limit=50", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Exercise task registry unavailable");
        const data: unknown = await response.json();
        if (!isSyntheticTaskPayload(data) || !Array.isArray((data as { tasks?: unknown }).tasks)) throw new Error("Unexpected task classification");
        if (!controller.signal.aborted) { setBoard(data as ExerciseAgencyTaskBoard); setError(""); }
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Team board unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => { const frame = requestAnimationFrame(() => setAnimate(true)); return () => cancelAnimationFrame(frame); }, []);

  const teams = useMemo(() => summarizeTeams(board?.tasks ?? []), [board]);
  const totals = useMemo(() => ({ open: teams.reduce((sum, team) => sum + team.open, 0), overdue: teams.reduce((sum, team) => sum + team.overdue, 0) }), [teams]);

  const atCapacity = teams.filter(team => team.status === "at_capacity").length;
  const shown = teams.filter(team => statusFilter === "all" || team.status === statusFilter);

  return <AppShell title="Team Availability" description="A read-only synthetic view of which fictional desks are loaded with scripted exercise tasks.">
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200" role="note">
      <ShieldAlert className="mt-1 shrink-0" size={19}/>
      <p><strong>Exercise board, not real staffing.</strong> Teams and tasks are fictional scripted fixtures. The {DEMO_CAPACITY}-slot capacity is a planning
        parameter for this rehearsal only. Nothing here assigns, notifies or dispatches anyone.</p>
    </div>
    {error && <ErrorState className="mb-5" message={error + ". " + t("Any values shown may be out of date.")} onRetry={() => setRevision(value => value + 1)}/>}
    <StatStrip label={t("Fictional team load summary")}>
      <StatTile index={0} label={t("Fictional teams")} icon={UsersRound} tone="info" value={board ? teams.length : "—"}/>
      <StatTile index={1} label={t("Open scripted tasks")} icon={ClipboardList} tone="info" value={board ? totals.open : "—"}/>
      <StatTile index={2} label={t("Past demo due")} icon={AlertTriangle} tone={totals.overdue > 0 ? "warning" : "neutral"} value={board ? totals.overdue : "—"}/>
      <StatTile index={3} label={t("At planning capacity")} icon={ShieldAlert} tone={atCapacity > 0 ? "danger" : "neutral"} value={board ? atCapacity : "—"}/>
    </StatStrip>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted" role="status">{board && <DataFreshness observedAt={board.as_of} staleAfterHours={1}/>}{board ? `${teams.length} fictional teams · ${totals.open} open scripted tasks · ${totals.overdue} past their demo due window` : "Awaiting the exercise task registry"}</p>
      <div className="flex gap-2">
        <Link href="/agency-sync" className="control control-sm">Task details <ArrowRight size={14}/></Link>
        <button type="button" className="control control-sm" onClick={() => setRevision(value => value + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Refresh</button>
      </div>
    </div>
    {loading && !board && <SkeletonCards count={3} label={t("Loading fictional team load")}/>}
    {board && teams.length > 0 && <SegmentedControl className="mb-4" label={t("Filter teams by status")} value={statusFilter} onChange={setStatusFilter}
      options={[{ value: "all", label: t("All teams") }, { value: "available", label: t("Available") }, { value: "engaged", label: t("Engaged") }, { value: "at_capacity", label: t("At planning capacity") }]}/>}
    {board && teams.length === 0 && <div className="panel"><EmptyState icon={UsersRound} title={t("No scripted exercise tasks yet")}
      body={t("No team load can be shown. An empty board does not mean any team is free or staffed.")}/></div>}
    {board && teams.length > 0 && shown.length === 0 && <div className="panel"><EmptyState icon={UsersRound} title={t("No teams match this status")}
      body={t("Choose another status to see the other fictional teams.")}/></div>}
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Fictional team load">
      {shown.map((team, index) => {
        const Icon = ICONS[team.kind];
        const total = Math.max(1, team.prepared + team.acknowledged + team.closed);
        return <article key={team.label} className="panel p-4 reveal-in min-w-0" style={{ "--i": index } as React.CSSProperties}>
          <div className="flex items-start gap-4">
            <Gauge team={team} animate={animate}/>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="rounded-lg bg-accent/10 p-1.5 text-accent"><Icon size={16} aria-hidden="true"/></span>
                <h2 className="min-w-0 break-words text-sm font-bold leading-snug">{team.label}</h2></div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusPill tone={STATUS_TONE[team.status]}>{t(STATUS[team.status].label)}</StatusPill>
                {team.overdue > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle size={12}/>{team.overdue} past demo due</span>}
              </div>
            </div>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-elevated" role="img"
            aria-label={`${team.prepared} prepared, ${team.acknowledged} acknowledged, ${team.closed} closed in simulation`}>
            <span style={{ width: `${team.prepared / total * 100}%`, background: "#94a3b8" }}/>
            <span style={{ width: `${team.acknowledged / total * 100}%`, background: "#ed9955" }}/>
            <span style={{ width: `${team.closed / total * 100}%`, background: "#34b4a6" }}/>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div><dt className="text-muted">Prepared</dt><dd className="font-bold tabular-nums">{team.prepared}</dd></div>
            <div><dt className="text-muted">Acknowledged</dt><dd className="font-bold tabular-nums">{team.acknowledged}</dd></div>
            <div><dt className="text-muted">Closed</dt><dd className="font-bold tabular-nums">{team.closed}</dd></div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 border-t border-stroke pt-3 text-[11px] text-muted"><Clock3 size={13} aria-hidden="true"/>Next demo due: {when(team.nextDueAt)}</p>
        </article>;
      })}
    </section>
    <FieldTeams/>
    <p className="mt-5 text-xs leading-6 text-muted">Counts come from the seeded exercise task table. “Acknowledged” and “closed” are scripted states, not responder activity.</p>
  </AppShell>;
}
