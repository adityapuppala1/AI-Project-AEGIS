"use client";

// Account management (docs/USER_MANAGEMENT.md). platform_admin only; the API and the sign-in provider repeat every
// check made here. Accounts live in the sign-in provider: IndTrana never stores a password. A temporary password is
// shown exactly once, in memory only, and is cleared when its panel closes. Nothing is sent by email or any channel.
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { History, KeyRound, LogOut, Pencil, Plus, Power, RefreshCw, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useT } from "./language-provider";
import {
  Button, CopyButton, DataTable, Dialog, EmptyState, ErrorState, Panel, RoleChip, SearchField, SkeletonRows,
  SortableTable, StatStrip, StatTile, StatusPill, type TableColumn,
} from "./ui";
import { ROLE_IDS, ROLE_INFO, type RoleId } from "../lib/roles";
import { USER_ADMIN_ACTION_LABELS, USER_ADMIN_FIELD_LABELS, apiFailureText, codeLabel } from "../lib/labels";
import { RESPONSE_TEAMS, responseTeamLabel } from "../lib/response-teams";

export type Account = {
  id: string; username: string; first_name: string; last_name: string; email: string; enabled: boolean;
  role: RoleId | null; roles: RoleId[]; department: string | null; team: string | null; created_at: string | null;
  password_change_pending: boolean; protected: boolean; protected_reason: string | null; is_you: boolean;
};
type AuditRow = { id: string; action: string; outcome: string; target_id: string; target_username: string; changed: string[];
  role_after: string | null; actor: string; at: string };
type Draft = { username: string; first_name: string; last_name: string; email: string; role: RoleId; department: string; team: string };
type Confirm = { kind: "disable" | "enable" | "reset-password" | "sign-out"; account: Account };
type Issued = { username: string; password: string; created: boolean };

const DEPARTMENTS = ["control_room", "infrastructure", "communications"];
const EMPTY: Draft = { username: "", first_name: "", last_name: "", email: "", role: "incident_operator", department: "", team: "" };
const USERNAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63}){1,4}$/;
const PERSON = /^[\p{L}][\p{L}\p{M} .'-]{0,63}$/u;

async function failure(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return apiFailureText({ code: typeof data?.code === "string" ? data.code : "user_admin_unavailable" });
}
async function send(url: string, method: string, body?: unknown) {
  return fetch(url, { method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}

/** Client-side copy of the API rules, so mistakes show before sending. The API stays the control. */
export function draftProblem(draft: Draft, creating: boolean): string | null {
  const name = draft.username.trim();
  if (creating && (name.length < 3 || name.length > 32 || !USERNAME.test(name))) return "user_admin_invalid_username";
  if (creating && (name.startsWith("exercise") || name.startsWith("service-account-") || name.startsWith("indtrana-"))) return "user_admin_reserved_username";
  if (!PERSON.test(draft.first_name.trim()) || !PERSON.test(draft.last_name.trim())) return "user_admin_invalid_name";
  if (!EMAIL.test(draft.email.trim())) return "user_admin_invalid_email";
  if (draft.role === "department_operator" && !DEPARTMENTS.includes(draft.department)) return "user_admin_department_required";
  if (draft.role === "response_team" && !RESPONSE_TEAMS.some(team => team.id === draft.team)) return "user_admin_team_required";
  return null;
}

export function fullName(account: Pick<Account, "first_name" | "last_name" | "username">): string {
  return `${account.first_name} ${account.last_name}`.trim() || account.username;
}

export function AccountsPanel({ onAccounts }: Readonly<{ onAccounts?: (accounts: Account[]) => void }>) {
  const t = useT();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ account: Account | null; draft: Draft } | null>(null);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { username: useId(), first: useId(), last: useId(), email: useId(), role: useId(), dept: useId(), team: useId(), hint: useId() };

  const load = useCallback(async () => {
    setError("");
    try {
      const status = await send("/api/user-admin/status", "GET");
      if (!status.ok) { setConfigured(true); setError(await failure(status)); setAccounts([]); return; }
      const state = await status.json();
      setConfigured(state.configured === true);
      if (state.configured !== true) { setAccounts([]); return; }
      const response = await send("/api/user-admin/accounts", "GET");
      if (!response.ok) { setError(await failure(response)); setAccounts([]); return; }
      const data = await response.json();
      setAccounts(data.accounts as Account[]);
      onAccounts?.(data.accounts as Account[]);
    } catch { setError(apiFailureText({ code: "user_admin_unavailable" })); setAccounts([]); }
  }, [onAccounts]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (accounts ?? []).filter(a => !q || [a.username, a.first_name, a.last_name, a.email].some(v => v.toLowerCase().includes(q)));
  }, [accounts, query]);
  const counts = useMemo(() => ({
    enabled: (accounts ?? []).filter(a => a.enabled).length,
    disabled: (accounts ?? []).filter(a => !a.enabled).length,
    pending: (accounts ?? []).filter(a => a.password_change_pending && a.enabled).length,
  }), [accounts]);

  const openCreate = () => { setFormError(""); setEditing({ account: null, draft: { ...EMPTY } }); };
  const openEdit = (account: Account) => {
    setFormError("");
    setEditing({ account, draft: { username: account.username, first_name: account.first_name, last_name: account.last_name, email: account.email,
      role: account.role ?? "incident_operator", department: account.department ?? "", team: account.team ?? "" } });
  };
  const setDraft = (change: Partial<Draft>) => setEditing(current => current && { ...current, draft: { ...current.draft, ...change } });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const { account, draft } = editing;
    const problem = draftProblem(draft, !account);
    if (problem) { setFormError(apiFailureText({ code: problem })); return; }
    const scope = { department: draft.role === "department_operator" ? draft.department : null, team: draft.role === "response_team" ? draft.team : null };
    const fields = { first_name: draft.first_name.trim(), last_name: draft.last_name.trim(), email: draft.email.trim(), role: draft.role, ...scope };
    setBusy(true); setFormError("");
    try {
      const response = account
        ? await send(`/api/user-admin/accounts/${account.id}`, "PATCH", fields)
        : await send("/api/user-admin/accounts", "POST", { username: draft.username.trim(), ...fields });
      if (!response.ok) { setFormError(await failure(response)); return; }
      const data = await response.json();
      setEditing(null);
      if (!account && typeof data.temporary_password === "string") setIssued({ username: data.account?.username ?? draft.username.trim(), password: data.temporary_password, created: true });
      setNotice(account ? t("Account saved.") : t("Account created."));
      await load();
    } catch { setFormError(apiFailureText({ code: "user_admin_unavailable" })); } finally { setBusy(false); }
  };

  const act = async () => {
    if (!confirm) return;
    const { kind, account } = confirm;
    setBusy(true); setNotice("");
    try {
      const response = await send(`/api/user-admin/accounts/${account.id}/${kind}`, "POST");
      if (!response.ok) { setNotice(await failure(response)); setConfirm(null); return; }
      const data = await response.json();
      setConfirm(null);
      if (kind === "reset-password" && typeof data.temporary_password === "string") setIssued({ username: account.username, password: data.temporary_password, created: false });
      setNotice(kind === "disable" ? t("Account disabled and signed out.") : kind === "enable" ? t("Account enabled.")
        : kind === "sign-out" ? t("Signed out everywhere.") : t("New temporary password issued."));
      await load();
    } catch { setNotice(apiFailureText({ code: "user_admin_unavailable" })); setConfirm(null); } finally { setBusy(false); }
  };

  if (configured === false) {
    return <Panel title={t("Accounts")} icon={UsersRound}>
      <EmptyState icon={ShieldCheck} title={t("Account management is not switched on")}
        body={<>{t("Accounts stay in the sign-in provider. To manage them here, the administrator of this computer runs the provider update script once and restarts IndTrana. It creates a limited service account; no password is ever stored by IndTrana.")}
          <code className="mt-2 block rounded bg-elevated px-2 py-1 text-left">scripts\update-local-idp.ps1</code></>} />
    </Panel>;
  }

  const describe = (account: Account) => account.role === "department_operator" && account.department ? t(codeLabel(account.department))
    : account.role === "response_team" && account.team ? responseTeamLabel(account.team) ?? t("Unknown team") : null;
  const roleNote = (role: RoleId) => t(ROLE_INFO[role].summary);
  const draft = editing?.draft;

  return <div className="space-y-4">
    <StatStrip label={t("Accounts at a glance")}>
      <StatTile label={t("Enabled")} value={accounts ? counts.enabled : "…"} icon={UsersRound} tone="success" index={0} />
      <StatTile label={t("Disabled")} value={accounts ? counts.disabled : "…"} icon={Power} tone="neutral" index={1} />
      <StatTile label={t("Must choose a new password")} value={accounts ? counts.pending : "…"} icon={KeyRound} tone="warning" index={2} />
    </StatStrip>
    {notice && <p role="status" aria-live="polite" className="rounded-lg border border-stroke bg-elevated px-3 py-2 text-sm">{notice}</p>}
    <Panel data-tour="users-accounts" title={t("Accounts")} icon={UsersRound}
      description={t("Everyone who can sign in to this node. Disable an account instead of deleting it; its history stays.")}
      actions={<div className="flex flex-wrap gap-2">
        <Button size="sm" icon={RefreshCw} onClick={() => void load()} disabled={busy}>{t("Refresh")}</Button>
        <Button size="sm" variant="primary" icon={UserPlus} onClick={openCreate} data-tour="users-create" disabled={!accounts}>{t("New account")}</Button>
      </div>} bodyClassName="p-0">
      <div className="border-b border-stroke px-4 py-3"><SearchField label={t("Find an account")} value={query} onChange={setQuery} placeholder={t("Name, user name or email")} /></div>
      {error && <ErrorState message={error} onRetry={() => void load()} className="m-4" />}
      {accounts === null ? <div className="p-4"><SkeletonRows rows={4} label={t("Loading accounts")} /></div> :
        shown.length === 0 && !error ? <EmptyState icon={UsersRound} title={query ? t("No account matches") : t("No accounts yet")}
          body={query ? t("Try another name.") : t("Create the first account with New account.")} /> :
        <DataTable label={t("Accounts")} minWidth="64rem" columns={5}>
          <thead><tr><th scope="col">{t("Person")}</th><th scope="col">{t("Role")}</th><th scope="col">{t("Status")}</th><th scope="col">{t("Created")}</th><th scope="col" className="!text-right">{t("Actions")}</th></tr></thead>
          <tbody>{shown.map(account => {
            const scope = describe(account);
            const locked = account.protected;
            return <tr key={account.id} data-account={account.username}>
              <th scope="row" className="!static !whitespace-normal !font-medium !text-ink">
                <span className="block font-semibold">{fullName(account)}{account.is_you && <span className="ml-2 text-xs font-semibold text-brand">{t("You")}</span>}</span>
                <span className="block text-xs text-muted">{account.username}{account.email ? ` · ${account.email}` : ""}</span>
              </th>
              <td>{account.roles.length ? <span className="flex flex-wrap gap-1">{account.roles.map(role => <RoleChip key={role} role={role} />)}</span> : <span className="text-xs text-muted">{t("No IndTrana role")}</span>}
                {scope && <span className="mt-1 block text-xs text-muted">{scope}</span>}</td>
              <td><span className="flex flex-wrap gap-1">
                {account.enabled ? <StatusPill tone="success">{t("Enabled")}</StatusPill> : <StatusPill tone="neutral">{t("Disabled")}</StatusPill>}
                {account.password_change_pending && <StatusPill tone="warning">{t("New password pending")}</StatusPill>}
                {locked && <StatusPill tone="info">{account.protected_reason === "service_account" ? t("Service account") : t("Protected")}</StatusPill>}
              </span></td>
              <td className="tnum text-xs">{account.created_at ? new Date(account.created_at).toLocaleDateString() : "—"}</td>
              <td className="whitespace-nowrap text-right">{locked ? <span className="text-xs text-muted">{t("Cannot be changed here")}</span> :
                <span className="inline-flex justify-end gap-1">
                  <Button size="sm" variant="quiet" icon={Pencil} onClick={() => openEdit(account)} aria-label={`${t("Edit")} ${account.username}`}>{t("Edit")}</Button>
                  {!account.is_you && <Button size="sm" variant="quiet" icon={KeyRound} onClick={() => setConfirm({ kind: "reset-password", account })} aria-label={`${t("New password")} ${account.username}`}>{t("New password")}</Button>}
                  {!account.is_you && account.enabled && <Button size="sm" variant="quiet" icon={LogOut} onClick={() => setConfirm({ kind: "sign-out", account })} aria-label={`${t("Sign out")} ${account.username}`}>{t("Sign out")}</Button>}
                  {!account.is_you && (account.enabled
                    ? <Button size="sm" variant="danger" icon={Power} onClick={() => setConfirm({ kind: "disable", account })} aria-label={`${t("Disable")} ${account.username}`}>{t("Disable")}</Button>
                    : <Button size="sm" icon={Power} onClick={() => setConfirm({ kind: "enable", account })} aria-label={`${t("Enable")} ${account.username}`}>{t("Enable")}</Button>)}
                </span>}</td>
            </tr>;
          })}</tbody>
        </DataTable>}
      <p className="border-t border-stroke px-4 py-3 text-xs leading-5 text-muted">{t("Forgotten password: the person asks an administrator, who issues a new temporary password here and hands it over in person. Nothing is emailed. A sign-in already in progress can last up to 15 minutes after an account is disabled.")}</p>
    </Panel>

    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) setEditing(null); }}
      title={editing?.account ? t("Edit account") : t("New account")}
      description={editing?.account ? t("Change the name, email, role, department or team.") : t("IndTrana creates the account in the sign-in provider and shows a temporary password once. The person chooses their own password at first sign-in.")}>
      {draft && <form onSubmit={event => void save(event)} className="space-y-3" noValidate aria-describedby={ids.hint}>
        {!editing?.account && <div><label htmlFor={ids.username} className="block text-sm font-semibold">{t("User name")}</label>
          <input id={ids.username} value={draft.username} onChange={e => setDraft({ username: e.target.value.toLowerCase() })} autoComplete="off" spellCheck={false}
            maxLength={32} className="control mt-1 w-full min-h-[44px]" required />
          <p className="mt-1 text-xs text-muted">{t("3 to 32 lowercase letters, digits and single hyphens. It cannot be changed later.")}</p></div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label htmlFor={ids.first} className="block text-sm font-semibold">{t("First name")}</label>
            <input id={ids.first} value={draft.first_name} onChange={e => setDraft({ first_name: e.target.value })} maxLength={64} autoComplete="off" className="control mt-1 w-full min-h-[44px]" required /></div>
          <div><label htmlFor={ids.last} className="block text-sm font-semibold">{t("Last name")}</label>
            <input id={ids.last} value={draft.last_name} onChange={e => setDraft({ last_name: e.target.value })} maxLength={64} autoComplete="off" className="control mt-1 w-full min-h-[44px]" required /></div>
        </div>
        <div><label htmlFor={ids.email} className="block text-sm font-semibold">{t("Email")}</label>
          <input id={ids.email} type="email" value={draft.email} onChange={e => setDraft({ email: e.target.value })} maxLength={254} autoComplete="off" className="control mt-1 w-full min-h-[44px]" required />
          <p className="mt-1 text-xs text-muted">{t("Recorded on the account only. IndTrana sends nothing to it from this page.")}</p></div>
        <div><label htmlFor={ids.role} className="block text-sm font-semibold">{t("Role")}</label>
          <select id={ids.role} value={draft.role} onChange={e => setDraft({ role: e.target.value as RoleId })} className="control mt-1 w-full min-h-[44px]"
            disabled={Boolean(editing?.account?.is_you)}>
            {ROLE_IDS.map(role => <option key={role} value={role}>{t(ROLE_INFO[role].label)}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">{editing?.account?.is_you ? t("You cannot change your own role.") : roleNote(draft.role)}</p></div>
        {draft.role === "department_operator" && <div><label htmlFor={ids.dept} className="block text-sm font-semibold">{t("Department")}</label>
          <select id={ids.dept} value={draft.department} onChange={e => setDraft({ department: e.target.value })} className="control mt-1 w-full min-h-[44px]" required>
            <option value="">{t("Choose a department")}</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{t(codeLabel(d))}</option>)}
          </select></div>}
        {draft.role === "response_team" && <div><label htmlFor={ids.team} className="block text-sm font-semibold">{t("Response team")}</label>
          <select id={ids.team} value={draft.team} onChange={e => setDraft({ team: e.target.value })} className="control mt-1 w-full min-h-[44px]" required>
            <option value="">{t("Choose a team")}</option>
            {RESPONSE_TEAMS.map(team => <option key={team.id} value={team.id}>{team.label}</option>)}
          </select></div>}
        <p id={ids.hint} className="sr-only">{t("Every field is required.")}</p>
        {formError && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{formError}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button onClick={() => setEditing(null)} disabled={busy}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" icon={editing?.account ? Pencil : Plus} loading={busy} disabled={busy}>{editing?.account ? t("Save changes") : t("Create account")}</Button>
        </div>
      </form>}
    </Dialog>

    <Dialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}
      title={confirm?.kind === "disable" ? t("Disable this account?") : confirm?.kind === "enable" ? t("Enable this account?")
        : confirm?.kind === "sign-out" ? t("Sign this person out everywhere?") : t("Issue a new temporary password?")}
      description={confirm?.kind === "disable" ? t("The person can no longer sign in, and their sessions end. A page already open can keep working for up to 15 minutes. You can enable the account again later.")
        : confirm?.kind === "enable" ? t("The person can sign in again with their current password.")
        : confirm?.kind === "sign-out" ? t("Every session of this person ends. A page already open can keep working for up to 15 minutes.")
        : t("Their current password stops working and they are signed out. You will see the new temporary password once, to hand over in person.")}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setConfirm(null)} disabled={busy}>{t("Cancel")}</Button>
        <Button variant={confirm?.kind === "enable" ? "primary" : "danger"} loading={busy} disabled={busy} onClick={() => void act()}>
          {confirm?.kind === "disable" ? t("Disable") : confirm?.kind === "enable" ? t("Enable") : confirm?.kind === "sign-out" ? t("Sign out") : t("Issue password")}</Button>
      </div>}>
      {confirm && <p className="text-sm"><strong>{fullName(confirm.account)}</strong> <span className="text-muted">({confirm.account.username})</span></p>}
    </Dialog>

    <Dialog open={issued !== null} dismissible={false} onOpenChange={() => undefined}
      title={issued?.created ? t("Account created: temporary password") : t("New temporary password")}
      description={t("Shown once. It is not stored anywhere and cannot be shown again. Hand it over in person; the person must choose a new password at first sign-in.")}
      footer={<div className="flex justify-end"><Button variant="primary" onClick={() => setIssued(null)}>{t("I have handed it over")}</Button></div>}>
      {issued && <div className="space-y-3" data-tour="users-password">
        <p className="text-sm">{t("User name")}: <strong>{issued.username}</strong></p>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-3 dark:border-amber-300/40 dark:bg-amber-950/40">
          <code data-temporary-password="" className="select-all break-all font-mono text-lg font-semibold tracking-wide">{issued.password}</code>
          <CopyButton value={issued.password} label={t("Copy password")} />
        </div>
        <p className="text-xs text-muted">{t("If it is lost, issue another one. Forgotten passwords are always reset here by an administrator.")}</p>
      </div>}
    </Dialog>
  </div>;
}

export function AccountActivity({ accounts }: Readonly<{ accounts: Account[] | null }>) {
  const t = useT();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await send("/api/user-admin/audit", "GET");
      if (!response.ok) { setError(await failure(response)); setRows([]); return; }
      setRows((await response.json()).rows as AuditRow[]);
    } catch { setError(apiFailureText({ code: "user_admin_unavailable" })); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (id: string) => accounts?.find(a => a.id === id)?.username ?? t("Another administrator");
  const columns: TableColumn<AuditRow>[] = [
    { key: "at", label: t("When"), sortValue: row => row.at, cell: row => <span className="tnum">{new Date(row.at).toLocaleString()}</span> },
    { key: "action", label: t("What"), cell: row => <span>{t(USER_ADMIN_ACTION_LABELS[row.action] ?? codeLabel(row.action))}
      {row.outcome === "incomplete" && <StatusPill tone="warning" className="ml-2">{t("Not finished")}</StatusPill>}</span> },
    { key: "account", label: t("Account"), sortValue: row => row.target_username, cell: row => row.target_username },
    { key: "detail", label: t("Detail"), cell: row => <span className="text-xs">{[
      ...(row.changed ?? []).map(code => t(USER_ADMIN_FIELD_LABELS[code] ?? codeLabel(code))),
      ...(row.role_after ? [`→ ${t(ROLE_INFO[row.role_after as RoleId]?.label ?? codeLabel(row.role_after))}`] : []),
    ].join(", ") || "—"}</span> },
    { key: "by", label: t("By"), cell: row => <span className="text-xs">{nameOf(row.actor)}</span> },
  ];
  return <Panel data-tour="users-activity" title={t("Account activity")} icon={History}
    description={t("Every change made on this page, newest first. Passwords and email addresses are never recorded.")}
    actions={<Button size="sm" icon={RefreshCw} onClick={() => void load()}>{t("Refresh")}</Button>}>
    {error && <ErrorState message={error} onRetry={() => void load()} className="mb-3" />}
    {rows === null ? <SkeletonRows rows={3} /> : <SortableTable label={t("Account activity")} rows={rows} columns={columns} rowKey={row => row.id}
      empty={t("No account changes yet.")} minWidth="40rem" />}
  </Panel>;
}
