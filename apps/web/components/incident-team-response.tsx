"use client";
// Read-only "Team response" panel on the incident page: the team requests for this incident and their latest report.
// Shown only to roles that may read requests; for every other role it renders nothing at all (no error panel). A desk or
// a team sees only what the API returns to it. Exercise only. See docs/RESPONSE_LOOP.md.
import { Users } from "lucide-react";
import { useT } from "./language-provider";
import { AttentionFlag, ReportLine, StateBadge } from "./response-parts";
import { ErrorState, Panel, SkeletonRows } from "./ui";
import { codeLabel } from "../lib/labels";
import { canReadRequests, istText, lastReport } from "../lib/response-ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { useResponseRequests } from "../lib/use-response-requests";

export function IncidentTeamResponse({ incidentId }: Readonly<{ incidentId: string }>) {
  const t = useT();
  const session = useOperatorSession();
  const allowed = session?.authenticated === true && canReadRequests(session.roles);
  const { requests, status, message, refresh } = useResponseRequests({ enabled: allowed, incidentId, poll: false });
  if (!allowed || status === "refused") return null;
  return <Panel title={t("Team response")} icon={Users} className="mt-5" description={t("Read-only. Requests that a department desk made to exercise teams for this incident, and what the teams answered. Nobody was called, texted or radioed.")}>
    {(status === "idle" || status === "loading") && <SkeletonRows rows={2} label={t("Loading team requests…")} />}
    {status === "error" && <ErrorState message={t(message)} onRetry={() => void refresh()} />}
    {status === "ready" && requests.length === 0 && <p className="text-sm text-muted">{t("No team has been requested for this incident yet. An empty list does not mean no response is under way outside AEGIS.")}</p>}
    {status === "ready" && requests.length > 0 && <ul className="divide-y divide-stroke">
      {requests.map(item => {
        const last = lastReport(item);
        return <li key={item.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-semibold">{item.team.label} <span className="font-normal text-muted" title={item.team.kind}>· {t(codeLabel(item.team.kind))}</span></p>
            <span className="flex flex-wrap items-center gap-2"><StateBadge state={item.state} />{item.needs_attention && <AttentionFlag viewer="desk" />}</span>
          </div>
          <p className="text-xs text-muted">{item.task.summary} · {t(codeLabel(item.task.department))} {t("desk")} · <span className="tnum">{istText(item.requested_at)}</span></p>
          {last && <ReportLine report={last} kind="summary" />}
        </li>;
      })}
    </ul>}
  </Panel>;
}
