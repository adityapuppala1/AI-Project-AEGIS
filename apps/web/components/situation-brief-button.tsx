"use client";

import { useState } from "react";
import { Check, FileDown, Loader2 } from "lucide-react";
import type { IncidentWorkspace } from "../lib/incident-intelligence";
import { useT } from "./language-provider";
import { useToast, Button } from "./ui";
import { briefFileName, buildSituationBrief, type BriefReadiness } from "../lib/situation-brief";

type Phase = "idle" | "working" | "done" | "partial" | "failed";

/** Builds a template-only Markdown brief in the browser. Nothing is sent to a server or any recipient. */
export function SituationBriefButton({ workspace }: { workspace: IncidentWorkspace }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const t = useT();
  const { notify } = useToast();

  async function download() {
    setPhase("working");
    let readiness: BriefReadiness | null = null;
    try {
      const response = await fetch(`/api/incidents/${encodeURIComponent(workspace.incident.id)}/readiness?radius_m=3000`, {
        cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const data = await response.json() as BriefReadiness & { source?: string; incident_id?: string };
        if (data.source === "synthetic_exercise" && data.incident_id === workspace.incident.id) readiness = data;
      }
    } catch { readiness = null; }
    try {
      const text = buildSituationBrief(workspace, readiness, new Date());
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = briefFileName(workspace.incident.id);
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setPhase(readiness ? "done" : "partial");
      notify(t(readiness ? "Situation brief saved." : "Situation brief saved without the context checklist."), readiness ? "success" : "warning");
    } catch { setPhase("failed"); notify(t("The brief could not be created."), "danger"); }
  }

  return <div className="inline-flex flex-wrap items-center gap-3">
    <Button type="button" onClick={() => void download()} disabled={phase === "working"}>
      {phase === "working" ? <Loader2 size={16} className="animate-spin"/> : phase === "done" || phase === "partial" ? <Check size={16}/> : <FileDown size={16}/>}
      Download situation brief
    </Button>
    <span className="text-xs text-muted" role="status">
      {phase === "done" && "Saved as Markdown. Synthetic, template-only."}
      {phase === "partial" && "Saved without the context checklist, which could not be loaded."}
      {phase === "failed" && "The brief could not be created."}
    </span>
  </div>;
}
