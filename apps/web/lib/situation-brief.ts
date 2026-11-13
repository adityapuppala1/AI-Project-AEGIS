import type { IncidentWorkspace } from "./incident-intelligence";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max = 400) => (typeof value === "string" ? value : "")
  .replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const cell = (value: unknown, max = 120) => clean(value, max).replace(/\|/g, "\\|");
const refs = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && UUID.test(item)).slice(0, 20) : [];
const ist = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown time" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date) + " IST";
};

/** Loosely typed subset of the synthetic readiness payload; every field is validated before use. */
export interface BriefReadiness {
  context_state?: unknown; unknowns?: unknown; next_review_step?: unknown; source_freshness_counts?: unknown;
  reasons?: unknown; playbook?: { version?: unknown; step_refs?: unknown };
  review_brief?: { findings?: unknown; review_options?: unknown; limitations?: unknown };
}

/** Deterministic, template-only Markdown. No model text, no public Earth Watch data, never a warning. */
export function buildSituationBrief(workspace: IncidentWorkspace, readiness: BriefReadiness | null, generatedAt: Date): string {
  const incident = workspace.incident;
  const lines: string[] = [
    "# IndTrana situation brief — EXERCISE ONLY",
    "",
    "> **SYNTHETIC.** This is a fictional training case. It is not a warning, a forecast, a dispatch instruction or an official record.",
    "> Generated from a fixed template; no AI model wrote any text below.",
    "",
    `Generated: ${ist(generatedAt)} · Case: \`${cell(incident.id, 40)}\``,
    "",
    "## Case",
    `- Hazard: ${cell(incident.hazard_type)}`,
    `- Status: ${cell(incident.status)}`,
    `- Opened: ${ist(incident.created_at)}`,
    `- Location: ${Number(incident.lat).toFixed(4)}, ${Number(incident.lon).toFixed(4)} (synthetic training area)`,
    "",
    `## Evidence records (${workspace.evidence.length})`,
  ];
  if (workspace.evidence.length === 0) lines.push("_No synthetic evidence is attached to this case._");
  else {
    lines.push("| Reference | Source | Kind | Observed | Quality |", "|---|---|---|---|---|");
    for (const item of workspace.evidence.slice(0, 40)) {
      lines.push(`| \`${cell(item.id, 40)}\` | ${cell(item.source_label)} | ${cell(item.source_kind)} | ${ist(item.observed_at)} | ${cell(item.quality_status)} |`);
    }
  }
  lines.push("", `## Timeline (${workspace.timeline.length})`);
  if (workspace.timeline.length === 0) lines.push("_No synthetic events are recorded._");
  for (const event of workspace.timeline.slice(0, 40)) lines.push(`- ${ist(event.occurred_at)} — ${cell(event.event_type, 30)}: ${clean(event.summary, 240)}`);

  lines.push("", "## Context checklist (not a prediction)");
  if (!readiness) lines.push("_The context checklist could not be loaded, so this brief covers the case record only._");
  else {
    lines.push(`- State: ${cell(readiness.context_state, 60)}`);
    const counts = readiness.source_freshness_counts;
    if (counts && typeof counts === "object") {
      const entries = Object.entries(counts as Record<string, unknown>).filter(([, value]) => typeof value === "number").slice(0, 6);
      if (entries.length) lines.push(`- Source freshness: ${entries.map(([name, value]) => `${cell(name, 20)} ${value}`).join(", ")}`);
    }
    const unknowns = Array.isArray(readiness.unknowns) ? readiness.unknowns.map(item => clean(item, 240)).filter(Boolean).slice(0, 12) : [];
    if (unknowns.length) { lines.push("- Unknowns:"); for (const item of unknowns) lines.push(`  - ${item}`); }
    const step = clean(readiness.next_review_step, 300);
    if (step) lines.push(`- Next human review step: ${step}`);

    const findings = Array.isArray(readiness.review_brief?.findings) ? readiness.review_brief.findings as { text?: unknown; evidence_ids?: unknown; source_ids?: unknown }[] : [];
    if (findings.length) {
      lines.push("", "## Cited findings");
      findings.slice(0, 6).forEach((finding, index) => {
        const evidence = refs(finding?.evidence_ids), sources = refs(finding?.source_ids);
        lines.push(`${index + 1}. ${clean(finding?.text, 400)}`);
        if (evidence.length) lines.push(`   - Evidence: ${evidence.map(item => `\`${item}\``).join(", ")}`);
        if (sources.length) lines.push(`   - Sources: ${sources.map(item => `\`${item}\``).join(", ")}`);
      });
    }
    const options = Array.isArray(readiness.review_brief?.review_options) ? readiness.review_brief.review_options as { playbook_step?: unknown; text?: unknown }[] : [];
    if (options.length) {
      lines.push("", "## Human review options (playbook, illustrative)");
      for (const option of options.slice(0, 6)) lines.push(`- ${cell(option?.playbook_step, 20)}: ${clean(option?.text, 300)}`);
    }
    const limits = Array.isArray(readiness.review_brief?.limitations) ? readiness.review_brief.limitations.map(item => clean(item, 300)).filter(Boolean).slice(0, 8) : [];
    if (limits.length) { lines.push("", "## Stated limitations"); for (const item of limits) lines.push(`- ${item}`); }
  }
  lines.push(
    "", "## Scope and limits",
    "- All records above are synthetic exercise fixtures. No real risk probability, asset impact or responder status is claimed.",
    "- A human reviewer must decide any action; independent maker-checker approval is still required in IndTrana.",
    "- Public NASA/USGS reference data from Earth Watch is intentionally **not** included in this brief.",
    "",
  );
  return lines.join("\n");
}

export const briefFileName = (caseId: string) => `indtrana-situation-brief-${caseId.replace(/[^0-9a-f]/gi, "").slice(0, 8) || "case"}.md`;
