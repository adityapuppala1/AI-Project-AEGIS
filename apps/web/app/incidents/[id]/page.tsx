import { notFound } from "next/navigation";
import { IncidentUnavailable } from "../../../components/incident-unavailable";
import { IncidentIntelligence } from "../../../components/incident-intelligence";
import type { IncidentWorkspace } from "../../../lib/incident-intelligence";
import { apiAuthHeaders } from "../../../lib/api-auth";

export const metadata = { title: "Incident" };

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Server-side only: the session token is attached here and never reaches the browser.
  const auth = await apiAuthHeaders();
  if (!auth) return <IncidentUnavailable issue="unreachable"/>;
  let response: Response | null;
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    response = await fetch(base + "/v1/exercise/incidents/" + id, {
      headers: auth, cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    response = null;
  }
  if (response?.status === 404) notFound();
  if (!response?.ok) return <IncidentUnavailable issue="unreachable"/>;
  let payload: IncidentWorkspace;
  try { payload = await response.json() as IncidentWorkspace; }
  catch { return <IncidentUnavailable issue="unparseable"/>; }
  if (payload.source !== "synthetic_exercise" || payload.operational_actions_enabled !== false) {
    return <IncidentUnavailable issue="unexpected"/>;
  }
  return <IncidentIntelligence workspace={payload}/>;
}
