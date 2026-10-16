import { AppShell } from "../../components/app-shell";
import { DemoJourney } from "../../components/demo-journey";

export const dynamic = "force-dynamic";
const CASE = "22222222-2222-4222-8222-222222222222";

async function getExerciseData(path: string): Promise<Record<string, unknown> | null> {
  try {
    const base = process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response = await fetch(base + path, {
      cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch { return null; }
}
export default async function ExerciseWalkthroughPage() {
  const [preflight, incident, assessment, agency, sources, model] = await Promise.all([
    getExerciseData("/v1/exercise/system/readiness"),
    getExerciseData("/v1/exercise/incidents/" + CASE),
    getExerciseData("/v1/exercise/incidents/" + CASE + "/readiness?radius_m=3000"),
    getExerciseData("/v1/exercise/agency-tasks?limit=50"),
    getExerciseData("/v1/exercise/sources"),
    getExerciseData("/v1/exercise/model-lab/report"),
  ]);
  const trustedTasks = agency?.source === "synthetic_exercise" &&
    agency.outbound_messages_sent === false &&
    agency.acknowledgements_are_scripted === true &&
    agency.operational_actions_enabled === false && Array.isArray(agency.tasks);
  const tasks = trustedTasks ? agency.tasks as Array<Record<string, unknown>> : [];
  const assessmentState = assessment?.source === "synthetic_exercise" &&
    assessment.assessment_kind === "explainable_context_checklist_only" &&
    assessment.real_world_risk_probability === null &&
    assessment.operational_actions_enabled === false &&
    (assessment.context_state === "simulated_context_for_human_review" ||
     assessment.context_state === "insufficient_simulated_context")
    ? assessment.context_state as "simulated_context_for_human_review" | "insufficient_simulated_context"
    : "unavailable" as const;
  const snapshot = {
    database: preflight?.status === "ready" && preflight.mode === "synthetic_exercise"
      ? "ready" as const : "unavailable" as const,
    caseAvailable: incident?.source === "synthetic_exercise" &&
      incident.operational_actions_enabled === false,
    sourceAvailable: sources?.source === "synthetic_exercise" &&
      sources.real_connectors_enabled === false,
    assessmentState,
    taskCount: trustedTasks ? tasks.length : null,
    scriptedAcknowledgements: trustedTasks
      ? tasks.filter(task => task.synthetic === true && typeof task.acknowledged_at === "string").length
      : null,
    modelLabAvailable: model?.source === "synthetic_generated_fixture" &&
      model.live_inference_enabled === false,
  };
  return <AppShell title="CipherCop Exercise Walkthrough"
    description="Follow one transparent, end-to-end urban-waterlogging scenario through evidence, uncertainty, human governance and fictional agency follow-up.">
    <DemoJourney snapshot={snapshot}/>
  </AppShell>;
}
