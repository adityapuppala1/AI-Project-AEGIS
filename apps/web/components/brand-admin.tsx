"use client";

// Brand settings (docs/BRANDING.md): the product name and logo shown in the browser. platform_admin only; the API
// repeats every check. The name never reaches staff email, CAP blocks, exports or audit text.
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { History, ImageUp, RotateCcw, Save, Type } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { useBrand } from "./brand-provider";
import { Button, ErrorState, Panel, PermissionState, SkeletonRows, SortableTable, type TableColumn } from "./ui";
import { useOperatorSession } from "../lib/use-operator-session";
import { codeLabel } from "../lib/labels";
import { BRAND_LOGO_MAX_BYTES, BRAND_NAME_MAX, DEFAULT_BRAND_NAME, checkBrandName, sniffLogoType } from "../lib/brand";

type Settings = { name: string; custom_name: string | null; logo_version: number | null; version: number;
  logo_media_type: string | null; updated_at: string | null; updated_by: string | null };
type AuditRow = { id: string; action: string; to_version: number; name_after: string | null; logo_media_type: string | null;
  logo_size: number | null; actor: string; at: string };

const failureCode = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  return typeof data?.code === "string" ? data.code : "brand_unavailable";
};

export function BrandAdmin() {
  const t = useT();
  const session = useOperatorSession();
  const { refresh } = useBrand();
  const isAdmin = Boolean(session?.roles?.includes("platform_admin"));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<{ bytes: Uint8Array; preview: string; label: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const nameId = useId(), nameHelp = useId(), fileId = useId(), fileHelp = useId();

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([fetch("/api/brand/admin/settings", { cache: "no-store" }), fetch("/api/brand/admin/audit", { cache: "no-store" })]);
      if (!s.ok) { setError(codeLabel(await failureCode(s))); return; }
      const data = await s.json() as Settings;
      setSettings(data); setName(data.custom_name ?? data.name); setError("");
      setAudit(a.ok ? ((await a.json()).rows as AuditRow[]) : []);
    } catch { setError(codeLabel("brand_unavailable")); }
  }, []);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  useEffect(() => () => { if (file) URL.revokeObjectURL(file.preview); }, [file]);

  const after = async (response: Response, done: string) => {
    if (response.ok) {
      const data = await response.json() as Settings;
      setSettings(data); setName(data.custom_name ?? data.name); setMessage(t(done));
      await refresh();
      const a = await fetch("/api/brand/admin/audit", { cache: "no-store" });
      if (a.ok) setAudit((await a.json()).rows);
      return true;
    }
    const code = await failureCode(response);
    setMessage(t(codeLabel(code)));
    if (code === "brand_version_conflict") await load();
    return false;
  };

  const checkedName = checkBrandName(name);
  const saveName = async () => {
    if (!settings || !checkedName.ok) return;
    setBusy(true); setMessage("");
    try {
      await after(await fetch("/api/brand/admin/name", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: checkedName.name, expected_version: settings.version }) }), "Name saved.");
    } catch { setMessage(t(codeLabel("brand_unavailable"))); } finally { setBusy(false); }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setFileError(""); setFile(null);
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > BRAND_LOGO_MAX_BYTES) { setFileError(t(codeLabel("brand_logo_too_large"))); return; }
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    const type = sniffLogoType(bytes);
    if (!type) { setFileError(t(codeLabel("brand_logo_unsupported_type"))); return; }
    setFile({ bytes, preview: URL.createObjectURL(new Blob([bytes], { type })), label: `${Math.ceil(bytes.byteLength / 1024)} KB` });
  };
  const saveLogo = async () => {
    if (!settings || !file) return;
    setBusy(true); setMessage("");
    try {
      const ok = await after(await fetch(`/api/brand/admin/logo?expected_version=${settings.version}`, { method: "PUT",
        headers: { "Content-Type": "application/octet-stream" }, body: new Blob([file.bytes.slice().buffer as ArrayBuffer]) }), "Logo saved.");
      if (ok) { setFile(null); if (fileInput.current) fileInput.current.value = ""; }
    } catch { setMessage(t(codeLabel("brand_unavailable"))); } finally { setBusy(false); }
  };
  const restore = async () => {
    if (!settings) return;
    setBusy(true); setMessage("");
    try {
      await after(await fetch("/api/brand/admin/reset", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: settings.version }) }), "Defaults restored.");
    } catch { setMessage(t(codeLabel("brand_unavailable"))); } finally { setBusy(false); }
  };

  const columns: TableColumn<AuditRow>[] = [
    { key: "at", label: t("When"), sortValue: row => row.at, cell: row => <span className="tnum">{new Date(row.at).toLocaleString()}</span> },
    { key: "action", label: t("Change"), cell: row => t(codeLabel(row.action)) },
    { key: "detail", label: t("Detail"), cell: row => row.action === "name_set" ? <span data-brand-literal="">{row.name_after}</span>
      : row.action === "logo_set" ? `${row.logo_media_type ?? ""} · ${Math.ceil((row.logo_size ?? 0) / 1024)} KB` : t("Defaults restored.") },
    { key: "actor", label: t("By"), cell: row => <span className="break-all text-xs" data-brand-literal="">{row.actor}</span> },
  ];
  const currentLogo = settings?.logo_version != null ? `/api/brand/logo?v=${settings.logo_version}` : null;
  const logoBox = "flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stroke bg-elevated p-2";

  return <AppShell title="Brand" description="The product name and logo people see in the browser. Staff email, alert drafts, exports and audit text keep the built-in name.">
    {!session ? <SkeletonRows rows={3} /> : !isAdmin ? <PermissionState needs={["platform_admin"]} roles={session.roles} what={t("Only an administrator can change the product name and logo.")} where={{ href: "/admin", label: t("Administration") }} /> :
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {error && <ErrorState message={error} className="xl:col-span-2" />}
      <p role="status" aria-live="polite" className="text-sm xl:col-span-2">{message}</p>
      <Panel title={t("Product name")} icon={Type}>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void saveName(); }}>
          <p className="text-sm text-muted">{t("Current name")}: <strong className="text-ink" data-brand-literal="">{settings?.name ?? "…"}</strong></p>
          <label htmlFor={nameId} className="block text-sm font-semibold">{t("New name")}</label>
          <input id={nameId} aria-describedby={nameHelp} value={name} maxLength={BRAND_NAME_MAX + 10} autoComplete="off" spellCheck={false}
            onChange={event => setName(event.target.value)} aria-invalid={!checkedName.ok}
            className="control w-full min-h-[44px]" disabled={!settings || busy} />
          <p id={nameHelp} className="text-xs text-muted">{t("2 to 40 characters: letters, digits, spaces and . - & ' only. Shown as plain text.")}
            {!checkedName.ok && name.trim() !== "" && <span className="mt-1 block font-semibold text-red-700 dark:text-red-300">{t(codeLabel(checkedName.code))}</span>}</p>
          <Button type="submit" variant="primary" icon={Save} className="min-h-[44px]" disabled={!settings || busy || !checkedName.ok} loading={busy}>{t("Save name")}</Button>
        </form>
      </Panel>
      <Panel title={t("Logo")} icon={ImageUp}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-4">
            <figure className="space-y-1"><div className={logoBox}>{currentLogo
              ? <img src={currentLogo} alt={t("Current logo")} className="block h-full w-full object-contain" />
              : <span className="text-center text-xs text-muted">{t("Built-in mark")}</span>}</div>
              <figcaption className="text-xs text-muted">{t("Current")}</figcaption></figure>
            {file && <figure className="space-y-1"><div className={logoBox}><img src={file.preview} alt={t("Chosen logo preview")} className="block h-full w-full object-contain" /></div>
              <figcaption className="text-xs text-muted">{t("Preview")} · {file.label}</figcaption></figure>}
          </div>
          <label htmlFor={fileId} className="block text-sm font-semibold">{t("Choose a logo file")}</label>
          <input id={fileId} ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" aria-describedby={fileHelp}
            onChange={event => void chooseFile(event)} disabled={!settings || busy} className="block w-full min-h-[44px] text-sm" />
          <p id={fileHelp} className="text-xs text-muted">{t("PNG, JPEG or WebP only, at most 256 KB and 4096 × 4096 pixels. SVG, GIF and icon files are refused. A square image looks best; any shape is fitted inside the box.")}</p>
          {fileError && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{fileError}</p>}
          <Button variant="primary" icon={ImageUp} className="min-h-[44px]" disabled={!file || busy} loading={busy} onClick={() => void saveLogo()}>{t("Save logo")}</Button>
        </div>
      </Panel>
      <Panel title={t("Restore defaults")} icon={RotateCcw}>
        <p className="mb-3 text-sm text-muted">{t("Puts back the built-in name and mark. The change is recorded below.")} <span data-brand-literal="">({DEFAULT_BRAND_NAME})</span></p>
        <Button variant="danger" icon={RotateCcw} className="min-h-[44px]" disabled={!settings || busy || (!settings.custom_name && settings.logo_version == null)} onClick={() => void restore()}>{t("Restore defaults")}</Button>
      </Panel>
      <Panel title={t("Brand changes")} icon={History}>
        {audit === null ? <SkeletonRows rows={2} /> : <SortableTable label={t("Brand changes")} rows={audit} columns={columns} rowKey={row => row.id} empty={t("No changes yet.")} minWidth="30rem" />}
      </Panel>
    </div>}
  </AppShell>;
}
