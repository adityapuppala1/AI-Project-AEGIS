export type ExerciseTaskState = "prepared" | "acknowledged" | "closed";
export interface ExerciseAgencyTask {
  id: string;
  incident_id: string;
  agency_label: string;
  task_kind: string;
  summary: string;
  playbook_ref: "AEGIS-URBAN-FLOOD-EXERCISE-v0.1";
  state: ExerciseTaskState;
  prepared_at: string;
  due_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
  demo_due_window_elapsed: boolean;
  synthetic: true;
}
export interface ExerciseTaskEvent {
  id: string;
  kind: "prepared" | "acknowledged" | "closed" | "exercise_note";
  occurred_at: string;
  actor_label: string;
  summary: string;
  synthetic: true;
}
export interface ExerciseAgencyTaskBoard {
  source: "synthetic_exercise";
  model_predictions_attached: false;
  outbound_messages_sent: false;
  acknowledgements_are_scripted: true;
  operational_actions_enabled: false;
  playbook_version: "AEGIS-URBAN-FLOOD-EXERCISE-v0.1";
  as_of: string;
  total_in_scope: number;
  status_counts: Record<ExerciseTaskState, number>;
  returned: number;
  tasks: ExerciseAgencyTask[];
}
export interface ExerciseAgencyTaskDetail {
  source: "synthetic_exercise";
  outbound_messages_sent: false;
  acknowledgements_are_scripted: true;
  operational_actions_enabled: false;
  task: ExerciseAgencyTask;
  events: ExerciseTaskEvent[];
}
export function isSyntheticTaskPayload(data: unknown): data is {
  source: "synthetic_exercise";
  outbound_messages_sent: false;
  acknowledgements_are_scripted: true;
  operational_actions_enabled: false;
} {
  if (!data || typeof data !== "object") return false;
  const candidate = data as Record<string, unknown>;
  return candidate.source === "synthetic_exercise" &&
    candidate.outbound_messages_sent === false &&
    candidate.acknowledgements_are_scripted === true &&
    candidate.operational_actions_enabled === false;
}
