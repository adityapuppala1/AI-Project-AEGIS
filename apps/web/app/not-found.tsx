import type { Metadata } from "next";
import { SystemPage } from "../components/system-page";

export const metadata: Metadata = { title: "Page not found" };
export default function NotFound() {
  return <SystemPage code="404" title="Page not found" body="There is no page at this address. It may have moved, or the link may be mistyped. Nothing was changed." />;
}
