export interface ReviewBrief {
  version: "aegis.exercise.review-brief.v1";
  generated_by: "deterministic_template_no_model";
  synthetic: true;
  operational_actions_enabled: false;
  findings: { text: string; evidence_ids: string[]; source_ids: string[] }[];
  review_options: { playbook_step: string; text: string }[];
  limitations: string[];
  playbook_version: "AEGIS-URBAN-FLOOD-EXERCISE-v0.1";
}

export function ExerciseReviewBrief({ brief }: { brief: ReviewBrief }) {
  if (brief?.version !== "aegis.exercise.review-brief.v1" ||
      brief.generated_by !== "deterministic_template_no_model" ||
      brief.synthetic !== true || brief.operational_actions_enabled !== false ||
      brief.playbook_version !== "AEGIS-URBAN-FLOOD-EXERCISE-v0.1") {
    return <p role="alert">Review brief classification not verified.</p>;
  }
  return <details className="mt-4 rounded-xl border border-stroke p-4">
    <summary className="cursor-pointer text-sm font-bold">Cited exercise review brief</summary>
    <p className="mt-3 text-xs leading-6 text-muted">Deterministic template; no AI model was used. These are review notes, not an assessment of real flood risk or an authorization.</p>
    <ul className="mt-3 space-y-3">
      {brief.findings.map((finding, index) => <li className="text-xs leading-6" key={index}>
        <p>{finding.text}</p>
        <details className="mt-1 text-muted"><summary className="cursor-pointer">References for finding {index + 1}</summary>
          <p className="mt-1 break-all">Evidence IDs: {finding.evidence_ids.join(" · ") || "None in the checked case evidence set"}</p>
          <p className="mt-1 break-all">Source candidate IDs: {finding.source_ids.join(" · ") || "None cited for this finding"}</p>
        </details>
      </li>)}
    </ul>
    <h5 className="mt-4 text-xs font-bold">Options for human review</h5>
    <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs leading-6 text-muted">
      {brief.review_options.map(option => <li key={option.playbook_step}><strong>{option.playbook_step}:</strong> {option.text}</li>)}
    </ol>
    <p className="mt-3 break-words text-xs text-muted">Illustrative playbook: {brief.playbook_version}</p>
    <h5 className="mt-4 text-xs font-bold">Limitations retained with this brief</h5>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-6 text-muted">
      {brief.limitations.map((text,index) => <li key={index}>{text}</li>)}
    </ul>
  </details>;
}
