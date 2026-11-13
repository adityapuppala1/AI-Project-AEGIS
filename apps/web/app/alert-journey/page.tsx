import type { Metadata } from "next";

import { AlertJourney } from "../../components/alert-journey/alert-journey";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Alert Journey",
  description: "Interactive 3D walk-through of how a hazard is sensed, predicted, human-approved and handed to official alert channels. Synthetic exercise plus opt-in read-only public data. IndTrana sends nothing.",
};

export default async function AlertJourneyPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const { mode } = await searchParams;
  return <AlertJourney initialMode={mode === "live" ? "live" : "exercise"} />;
}
