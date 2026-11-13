"use client";

import { Fragment } from "react";
import { Check, KeyRound, Minus, UserRound, UsersRound } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { Avatar, DataTable, KeyValueList, Panel, RecordRef, RoleChip, SkeletonRows, TwoKey } from "./ui";
import { CAPABILITIES, CAPABILITY_GROUPS, ROLE_IDS, ROLE_INFO, knownRoles, primaryRole } from "../lib/roles";
import { codeLabel } from "../lib/labels";
import { responseTeamLabel } from "../lib/response-teams";
import { useOperatorSession } from "../lib/use-operator-session";
import { personName, useSessionTimeLeft } from "./operator-auth";

/** Read-only: the roles, what each can do (from lib/roles.ts, which mirrors the server rules) and who is signed in. */
export function UsersAccess() {
  const t = useT();
  const session = useOperatorSession();
  const left = useSessionTimeLeft(session?.expiresAt);
  const held = knownRoles(session?.roles);
  const rules = [...new Set(CAPABILITIES.map(item => item.rule))];

  return <AppShell title="Users and access" description="The six roles, what each one can do, and the account you are signed in with. Read-only: accounts are managed in your agency's identity provider.">
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel title={t("Signed in now")} icon={UserRound}>
          {!session ? <SkeletonRows rows={2} /> : !session.authenticated ? <p className="text-sm text-muted">{t("Nobody is signed in.")}</p> : <>
            <div className="mb-3 flex items-center gap-3">
              <Avatar name={personName(session)} role={primaryRole(session.roles)} className="!h-11 !w-11 !text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t(personName(session))}</p>
                {session.username && <p className="truncate text-xs text-muted">{session.username}</p>}
              </div>
            </div>
            <KeyValueList items={[
              { label: t("Role"), value: <span className="flex flex-wrap gap-1.5">{held.length > 0 ? held.map(role => <RoleChip key={role} role={role} />) : t("No role that IndTrana recognises")}</span> },
              ...(session.agencyId ? [{ label: t("Agency"), value: <RecordRef id={session.agencyId} /> }] : []),
              ...(session.departmentId ? [{ label: t("Department"), value: <span title={session.departmentId}>{t(codeLabel(session.departmentId))}</span> }] : []),
              ...(session.teamId ? [{ label: t("Response team"), value: <span title={session.teamId}>{responseTeamLabel(session.teamId) ?? t("Unknown team")}</span> }] : []),
              ...(left ? [{ label: t("Session ends in"), value: <span className="tnum">{left}</span> }] : []),
            ]} />
          </>}
        </Panel>
        <Panel title={t("Where accounts are managed")} icon={KeyRound}>
          <div className="space-y-2 text-sm leading-6">
            <p>{t("IndTrana does not create, change or remove accounts. People, passwords, sign-in rules and roles live in your agency's identity provider, and IndTrana reads the role from the signed sign-in it receives.")}</p>
            <p className="text-muted">{t("On a local exercise node the demonstration accounts are created by the script below. It is run by the node's owner, never from this page.")}</p>
            <p><code className="rounded bg-elevated px-1.5 py-0.5">scripts/new-demo-accounts.ps1</code></p>
          </div>
        </Panel>
        <Panel title={t("Two people for every decision")} icon={UsersRound}>
          <div className="space-y-3 text-sm leading-6">
            <p>{t("A proposal needs two keys: the maker's and a different person's. The server refuses an approval from the person who submitted, whatever roles they hold.")}</p>
            <ul className="space-y-2 text-xs text-muted">
              <li className="flex flex-wrap items-center gap-2"><TwoKey maker="empty" checker="empty" />{t("Draft: no key turned")}</li>
              <li className="flex flex-wrap items-center gap-2"><TwoKey maker="turned" checker="empty" />{t("Submitted: waiting for the checker")}</li>
              <li className="flex flex-wrap items-center gap-2"><TwoKey maker="turned" checker="turned" />{t("Approved: both keys turned")}</li>
              <li className="flex flex-wrap items-center gap-2"><TwoKey maker="turned" checker="refused" />{t("Rejected: the checker refused, with a reason")}</li>
            </ul>
          </div>
        </Panel>
      </div>
      <div className="min-w-0 space-y-4">
        <Panel title={t("The roles")} icon={UsersRound} bodyClassName="p-0">
          <ul className="divide-y divide-stroke">{ROLE_IDS.map(role => <li key={role} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="w-40 shrink-0"><RoleChip role={role} /></span>
            <span className="min-w-0 flex-1 basis-64 text-sm">{t(ROLE_INFO[role].summary)}</span>
            {held.includes(role) && <span className="text-xs font-semibold text-brand">{t("Your role")}</span>}
          </li>)}</ul>
        </Panel>
        <Panel title={t("What each role can do")} icon={KeyRound} description={t("Taken from the rules the server enforces. This table explains them; it does not grant anything.")} bodyClassName="p-0">
          <DataTable label={t("What each role can do")} minWidth="46rem" columns={ROLE_IDS.length + 1}>
            <thead><tr>
              <th scope="col">{t("Action")}</th>
              {ROLE_IDS.map(role => <th key={role} scope="col" className="!text-center"><RoleChip role={role} /></th>)}
            </tr></thead>
            <tbody>{CAPABILITY_GROUPS.map(group => <Fragment key={group}>
              <tr><th scope="colgroup" colSpan={ROLE_IDS.length + 1} className="!static !bg-elevated !text-ink">{t(group)}</th></tr>
              {CAPABILITIES.filter(item => item.group === group).map(item => <tr key={item.id}>
                <th scope="row" className="!static !whitespace-normal !border-stroke/60 !font-medium !text-ink" title={item.rule}>{t(item.label)}</th>
                {ROLE_IDS.map(role => {
                  const yes = item.roles.includes(role);
                  return <td key={role} className="text-center" data-mine={held.includes(role) || undefined}>
                    {yes ? <Check size={16} aria-hidden="true" className="mx-auto text-emerald-700 dark:text-emerald-300" /> : <Minus size={14} aria-hidden="true" className="mx-auto text-muted/60" />}
                    <span className="sr-only">{yes ? t("Yes") : t("No")}</span>
                  </td>;
                })}
              </tr>)}
            </Fragment>)}</tbody>
          </DataTable>
          <details className="border-t border-stroke px-4 py-3 text-xs text-muted">
            <summary className="cursor-pointer font-semibold">{t("Technical details: where each rule is enforced")}</summary>
            <ul className="mt-2 space-y-1">{rules.map(rule => <li key={rule}><code>{rule}</code></li>)}</ul>
            <p className="mt-2">{t("Role ids in the identity provider")}: {ROLE_IDS.map(role => <code key={role} className="mr-2">{role}</code>)}</p>
          </details>
        </Panel>
      </div>
    </div>
  </AppShell>;
}
