import { AppShell } from "../../components/app-shell";
import { ModelLabDashboard } from "../../components/model-lab-dashboard";
import type { ModelReport } from "../../lib/model-lab";

export const dynamic = "force-dynamic";
export default async function ModelLabPage() {
  let report: ModelReport | null = null;
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + "/v1/exercise/model-lab/report", {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (response.ok) {
      const candidate = await response.json() as ModelReport;
      if (candidate.source === "synthetic_generated_fixture" &&
          candidate.mode === "offline_exercise_only" &&
          candidate.calibrated_real_world_probability === false &&
          candidate.live_inference_enabled === false &&
          candidate.operational_actions_enabled === false) report = candidate;
    }
  } catch { /* Never invent or silently substitute evaluation metrics. */ }

  return <AppShell title="Model Evaluation Lab"
    description="Reproducible offline synthetic scenarios, model transparency and held-out diagnostics—not an operational forecast.">
    {report ? <ModelLabDashboard report={report}/> :
      <section className="panel p-6">
        <h2 className="text-base font-bold">Evaluation report unavailable</h2>
        <p role="alert" className="mt-3 text-sm leading-6 text-muted">
          The signed-off synthetic model report cannot be loaded. No scores,
          forecast estimates or fallback values will be shown. Check the local
          FastAPI container and try again.
        </p>
      </section>}
  </AppShell>;
}
