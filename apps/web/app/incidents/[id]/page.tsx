import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { IncidentIntelligence } from "../../../components/incident-intelligence";
import type { IncidentWorkspace } from "../../../lib/incident-intelligence";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  let response: Response | null;
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    response = await fetch(base + "/v1/exercise/incidents/" + id, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    response = null;
  }
  if (response?.status === 404) notFound();
  if (!response?.ok) {
    return <AppShell title="Incident Intelligence" description="Exercise source and chronology investigation">
      <section className="panel p-7">
        <h2 className="text-lg font-bold">Incident workspace temporarily unavailable</h2>
        <p role="alert" className="mt-3 text-sm leading-6 text-muted">
          The incident service could not be reached. No stale or invented evidence is shown.
          Check the local API and PostgreSQL containers.
        </p>
        <Link className="control mt-5" href="/incidents">Return to incident registry</Link>
      </section>
    </AppShell>;
  }
  let payload: IncidentWorkspace;
  try { payload = await response.json() as IncidentWorkspace; }
  catch {
    return <AppShell title="Incident Intelligence" description="Exercise case">
      <p role="alert" className="panel p-5 text-sm">Incident data could not be parsed. Please retry from the registry.</p>
    </AppShell>;
  }
  if (payload.source !== "synthetic_exercise" || payload.operational_actions_enabled !== false) {
    return <AppShell title="Incident Intelligence" description="Exercise case">
      <p role="alert" className="panel p-5 text-sm">Refusing to display an unexpected incident classification.</p>
    </AppShell>;
  }
  return <IncidentIntelligence workspace={payload}/>;
}
