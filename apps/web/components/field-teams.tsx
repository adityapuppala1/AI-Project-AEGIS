"use client";
// "Field teams (synthetic)" on the Response Teams page: the five invented exercise teams with their current requests
// grouped by state, derived from GET /api/response/requests. Read-only, for the reader roles and department desks;
// a response team sees its own requests on My Team, and other roles see nothing extra. Exercise only: these are not
// real units, rosters or locations. See docs/RESPONSE_LOOP.md.
import Link from "next/link";
import { RefreshCw, Users } from "lucide-react";
import { useT } from "./language-provider";
import { AttentionFlag, StateBadge } from "./response-parts";
import { Button, ErrorState, HazardGlyph, SkeletonCards } from "./ui";
import { codeLabel, responseStateLabel } from "../lib/labels";
import { RESPONSE_TEAMS } from "../lib/response-teams";
import { RESPONSE_STATES, alertView, canReadRequests, istText, type ResponseRequest } from "../lib/response-ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { useResponseRequests } from "../lib/use-response-requests";

export function FieldTeams() {
  const t = useT();
  const session = useOperatorSession();
  const allowed = session?.authenticated === true && canReadRequests(session.roles) && alertView(session.roles) !== "team";
  const { requests, status, message, refresh, refreshing } = useResponseRequests({ enabled: allowed });
  if (!allowed || status === "refused") return null;
  const forTeam = (id: string) => requests.filter(item => item.team.id === id);
  const byState = (list: readonly ResponseRequest[], state: string) => list.filter(item => item.state === state);
  return <section aria-labelledby="field-teams" className="mt-8">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id="field-teams" className="t-title">{t("Field teams (synthetic)")}</h2>
        <p className="helper mt-0.5 max-w-3xl">{t("Five invented exercise teams and the requests a department desk has made to them. These are not real units, rosters or locations, and nobody is called, texted or radioed.")}</p>
      </div>
      <Button size="sm" icon={RefreshCw} loading={refreshing} onClick={() => void refresh()}>{t("Refresh")}</Button>
    </div>
    {(status === "idle" || status === "loading") && <SkeletonCards count={3} label={t("Loading field teams…")} />}
    {status === "error" && <ErrorState message={t(message)} onRetry={() => void refresh()} />}
    {status === "ready" && message && <ErrorState className="mb-3" message={t(message)} onRetry={() => void refresh()} />}
    {status === "ready" && <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {RESPONSE_TEAMS.map(team => {
        const own = forTeam(team.id);
        return <li key={team.id} className="panel min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold"><Users size={15} aria-hidden="true" className="shrink-0 text-muted" />{team.label}</h3>
            <span className="text-xs text-muted" title={team.kind}>{t(codeLabel(team.kind))}</span>
          </div>
          {own.length === 0 ? <p className="helper">{t("No requests for this team.")}</p> : RESPONSE_STATES.map(state => {
            const rows = byState(own, state);
            if (rows.length === 0) return null;
            return <div key={state} className="space-y-1.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-muted"><StateBadge state={state} /><span className="tnum">{rows.length}</span><span className="sr-only">{t(responseStateLabel(state))}</span></p>
              <ul className="space-y-1.5">{rows.map(item => <li key={item.id} className="rounded-md bg-elevated/50 px-2.5 py-2 text-xs">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <HazardGlyph value={item.incident.hazard_label} label={item.incident.hazard_label ? t(item.incident.hazard_label) : undefined} />
                  <Link href={`/incidents/${item.incident.id}`} className="font-semibold text-accent hover:underline">{t("Open incident")}</Link>
                  {item.needs_attention && <AttentionFlag viewer="desk" />}
                </p>
                <p className="mt-1 break-words">{item.task.summary}</p>
                <p className="tnum text-muted">{t(codeLabel(item.task.department))} {t("desk")} · {istText(item.updated_at)}</p>
              </li>)}</ul>
            </div>;
          })}
        </li>;
      })}
    </ul>}
  </section>;
}
