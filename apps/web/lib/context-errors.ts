const messages = {
  case_context_unavailable: "Case evidence could not be loaded. Check local service availability and retry.",
  geographic_context_unavailable: "Geographic source context could not be loaded. Check local service availability and retry.",
  context_validation_failed: "Context checks rejected inconsistent or unsupported data. Review source timestamps and quality before retrying.",
} as const;

export function contextErrorCode(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(messages, code) ? code : "assessment_unavailable";
}

export function contextErrorMessage(code: unknown): string {
  const safe = contextErrorCode(code);
  return safe in messages ? messages[safe as keyof typeof messages] :
    "Exercise assessment is unavailable. Check the local service and retry.";
}
