import { AppShell } from "../../components/app-shell";
import { ModelLabDashboard } from "../../components/model-lab-dashboard";
import { ErrorState, Panel, buttonClass } from "../../components/ui";
import type { ModelReport } from "../../lib/model-lab";

export const metadata = { title: "Model Evaluation Lab" };

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
      <Panel>
        <ErrorState title="Evaluation report unavailable"
          message="The signed-off synthetic model report cannot be loaded. No scores, forecast estimates or fallback values will be shown. Check the local FastAPI container and try again."/>
        <a href="/model-lab" className={buttonClass({ size: "sm", className: "mt-4" })}>Retry</a>
      </Panel>}
  </AppShell>;
}
