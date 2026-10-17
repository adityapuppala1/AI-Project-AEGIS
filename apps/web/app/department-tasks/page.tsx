"use client";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
interface TaskRow { proposal_id: string; incident_id: string; task: {
  id: string; assignment_version?: number; summary: string; state: string; due_at?: string; sla_status?: string;
  events: { kind: string; occurred_at: string; actor_subject?: string }[];
} }
export default function DepartmentTasks() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [department, setDepartment] = useState("");
  const [message, setMessage] = useState("Loading verified department inbox…");
  const [busy, setBusy] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function refresh() {
    setBusy(true);
    setRows([]);
    setDepartment("");
    setNotes({});
    try {
      const response = await fetch("/api/department-tasks", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Department inbox unavailable");
      setRows(data.tasks); setDepartment(data.department_id);
      setMessage(data.tasks.length ? "Approved rehearsal tasks loaded." : "No approved staged tasks for your department.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Department inbox unavailable"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function advance(row: TaskRow) {
    setBusy(true);
    try {
      const response = await fetch(`/api/department-tasks/${row.proposal_id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: row.task.state === "prepared" ? "acknowledge_task" : "close_task", rationale: notes[`${row.proposal_id}:${row.task.id}`], task_id: row.task.id, expected_assignment_version: row.task.assignment_version ?? 0 }),
      });
      if (!response.ok) throw new Error("Action could not be confirmed. Refresh before retrying; it may have completed.");
      await refresh();
    } catch (error) { setRows([]); setNotes({}); setMessage(error instanceof Error ? error.message : "Task update unavailable"); }
    finally { setBusy(false); }
  }
  return <AppShell title="Department inbox" description="Your department’s approved synthetic rehearsal tasks. Acknowledgements never contact real responders.">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-muted">{message}</p>
      <button className="control" disabled={busy} onClick={() => void refresh()}>Refresh inbox</button>
    </div>
    {department && <p className="mb-4 text-sm font-semibold">Verified department: {department.replaceAll("_", " ")}</p>}
    <div className="grid gap-4 xl:grid-cols-2">{rows.map(row => <article key={`${row.proposal_id}:${row.task.id}`} className="rounded-xl border border-stroke bg-surface p-5">
      <h2 className="font-semibold">{row.task.summary}</h2>
      <p className="mt-2 break-all text-xs text-muted">Proposal {row.proposal_id}</p>
      <p className="mt-3 text-sm">State: {row.task.state}</p>
      {row.task.due_at && <p className="mt-1 text-sm text-muted">Synthetic target: {new Date(row.task.due_at).toLocaleString()} · {row.task.sla_status?.replaceAll("_", " ")}</p>}
      <ol className="my-4 space-y-2 text-xs text-muted">{row.task.events.map((event, index) => <li key={index}>{event.kind} · {new Date(event.occurred_at).toLocaleString()}{event.actor_subject ? ` · ${event.actor_subject}` : ""}</li>)}</ol>
      {["prepared", "acknowledged"].includes(row.task.state) && <form onSubmit={event => { event.preventDefault(); void advance(row); }}>
        <label className="block text-sm" htmlFor={`note-${row.proposal_id}-${row.task.id}`}>Rehearsal rationale</label>
        <textarea id={`note-${row.proposal_id}-${row.task.id}`} className="mt-2 w-full rounded-lg border border-stroke bg-elevated p-3 text-sm" minLength={10} maxLength={2000} required disabled={busy}
          value={notes[`${row.proposal_id}:${row.task.id}`] || ""} onChange={event => setNotes(previous => ({ ...previous, [`${row.proposal_id}:${row.task.id}`]: event.target.value }))}/>
        <button className="control mt-3" disabled={busy || (notes[`${row.proposal_id}:${row.task.id}`] || "").trim().length < 10}>{row.task.state === "prepared" ? "Acknowledge rehearsal task" : "Close rehearsal task"}</button>
      </form>}
    </article>)}</div>
  </AppShell>;
}
