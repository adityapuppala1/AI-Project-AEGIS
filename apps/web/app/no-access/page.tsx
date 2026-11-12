import type { Metadata } from "next";
import { SystemPage } from "../../components/system-page";

// Shown for exercise records that belong to another agency. middleware.ts rewrites to this page with status 403; it stays
// behind the sign-in gate (it is not in lib/session-gate.ts public paths) and carries no record data at all.
export const metadata: Metadata = { title: "No access to these records" };
export default function NoAccess() {
  return <SystemPage code="403" title="These exercise records belong to another agency" body="Your account is signed in, but the seeded exercise records on this page are only shown to the agency that owns them. Nothing was changed. If you expect access, ask your administrator to check the agency on your account." />;
}
