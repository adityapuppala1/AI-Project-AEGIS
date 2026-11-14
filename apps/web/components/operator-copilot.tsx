"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrainCircuit, CircleStop, FileText, Send, ShieldCheck } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { Button, CitedLine, EmptyState, ErrorState, Panel, PermissionState, StatusPill } from "./ui";
import { COPILOT_MAX, validateQuestion, type CopilotAnswer } from "../lib/operator-assist";
import { pageRoles, refusalHome } from "../lib/roles";
import { useOperatorSession } from "../lib/use-operator-session";
import { SignInRequired } from "./sign-in-required";

const EXAMPLES = ["Which incidents are open?", "Show pending approvals", "What is the status of proactive runs?", "What changed since last shift handover?"];
const REASONS: Record<string, string> = {
  action_request_refused: "This assistant cannot act. Use the approval workbench for any decision.",
  forecast_not_supported: "Forecasts and accuracy are not supported.",
  ambiguous_question: "The question matched more than one topic. Please ask about one thing.",
  unsupported_question: "This question is not supported. Try one of the examples.",
  unsupported_input: "The question contained unsupported input.",
  missing_or_multiple_reference: "Include exactly one record id for this question.",
  not_found_in_scope: "No matching record in your agency scope.",
  no_cited_records: "No records to cite for this question.",
};
// Questions about incidents cite incident ids, which link to the case.
const INCIDENT_INTENTS = new Set(["find_incidents", "incident_evidence"]);

/** Read-only operator copilot: answers cite records and it cannot act. */
export function OperatorCopilot() {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const session = useOperatorSession();
  const signedOut = session !== null && !session.authenticated;
  useEffect(() => () => controller.current?.abort(), []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = validateQuestion(question);
    if (busy) return;
    if (!text) { setInvalid(true); setMessage(t("Ask a question of 3-300 characters without control characters")); return; }
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setInvalid(false); setAnswer(null); setProblem(""); setAsked(text); setMessage(t("Checking agency records…"));
    try {
      const response = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }), signal: current.signal, cache: "no-store" });
      const data = await response.json().catch(() => null) as (CopilotAnswer & { error?: string }) | null;
      if (response.status === 403) { setRefused(true); setMessage(""); return; }
      if (!response.ok || !data) throw new Error(data?.error || "Assistant sources unavailable");
      setAnswer(data); setMessage(data.status === "abstained" ? t("The assistant abstained.") : t("Cited answer ready."));
    } catch (error) {
      if (!current.signal.aborted) { setMessage(""); setProblem(t(error instanceof Error ? error.message : "Assistant sources unavailable")); }
    } finally { if (controller.current === current) setBusy(false); }
  }
  const rephrased = answer?.generatedBy === "local_model_rephrase_of_cited_facts";
  const kindOf = () => answer && INCIDENT_INTENTS.has(answer.intent) ? "incident" as const : "record" as const;

  return <AppShell title="Operator Copilot" description="A read-only assistant that answers from agency-scoped records and cites them. It cannot act.">
    {signedOut && session && <SignInRequired session={session}/>}
    {refused && <PermissionState needs={pageRoles("/copilot") ?? []} roles={session?.roles} what={t("The copilot reads incident-desk records, so it is for the incident desk and administrators.")} where={refusalHome(session?.roles, { href: "/department-tasks", label: t("Open the Department Inbox") }, t("Open My Team"))} />}
    {!signedOut && !refused && <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Panel data-tour="copilot-ask" title={t("Ask about your agency's records")} icon={BrainCircuit} className="self-start">
        <form onSubmit={ask} noValidate>
          <label className="field-label" htmlFor="copilot-question">{t("Question")}</label>
          <textarea id="copilot-question" className="field" rows={3} maxLength={COPILOT_MAX} value={question} aria-invalid={invalid || undefined} aria-describedby="copilot-help"
            onChange={event => { setQuestion(event.target.value); setInvalid(false); }}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} autoComplete="off"/>
          <p id="copilot-help" className="helper mt-1.5">{invalid ? <span className="text-rose-700 dark:text-rose-300">{message}</span> : t("One question about one thing. It answers from fixed read-only lookups and ignores instructions typed into a question.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" variant="primary" icon={Send} loading={busy}>{t("Ask")}</Button>
            {busy && <Button icon={CircleStop} onClick={() => { controller.current?.abort(); setBusy(false); setMessage(t("Request cancelled.")); }}>{t("Cancel")}</Button>}
          </div>
          <p className="mb-1.5 mt-4 text-xs font-semibold text-muted">{t("Examples")}</p>
          <div className="flex flex-col items-start gap-1.5">{EXAMPLES.map(example => <Button variant="quiet" size="sm" className="!justify-start text-left" key={example} type="button" onClick={() => { setQuestion(example); setInvalid(false); }}>{t(example)}</Button>)}</div>
        </form>
      </Panel>
      <Panel data-tour="copilot-answer" title={t("Answer")} icon={FileText} actions={<StatusPill tone="info" icon={ShieldCheck}>{t("Read-only assistant; answers cite records; cannot act")}</StatusPill>} bodyClassName="p-0">
        <p className="sr-only" role="status">{invalid ? "" : message}</p>
        {problem && <div className="p-4"><ErrorState message={problem} /></div>}
        {!answer && !problem && (busy
          ? <p className="px-4 py-6 text-sm text-muted">{t("Checking agency records…")}</p>
          : <EmptyState icon={BrainCircuit} title={t("No question asked yet")} body={t("Ask a question or pick an example. The answer appears here with the records it comes from.")} />)}
        {answer && <div>
          <p className="border-b border-stroke/60 px-4 py-3 text-sm"><span className="text-muted">{t("You asked")}: </span><span className="font-semibold">{asked}</span></p>
          {answer.status === "abstained"
            ? <div className="px-4 py-4"><p className="text-sm font-semibold">{t("The assistant abstained.")}</p><p className="mt-1 text-sm" title={answer.reason ?? undefined}>{t(REASONS[answer.reason ?? ""] ?? "This question is not supported. Try one of the examples.")}</p></div>
            : <>
              {/* Shown once: the cited facts. A model-rephrased summary is extra wording, so it is shown only then. */}
              {rephrased && answer.summary && <p className="border-b border-stroke/60 px-4 py-3 text-sm leading-6">{answer.summary}</p>}
              <ul className="px-4 py-1">{answer.facts.map((fact, index) => <CitedLine key={index} refs={fact.refs} kindOf={kindOf}>{fact.text}</CitedLine>)}</ul>
            </>}
          <p className="helper border-t border-stroke/60 px-4 py-3">
            {answer.status !== "abstained" && <>{rephrased ? t("Summary rephrased by a local model from the cited facts only.") : t("Generated from a fixed template; no AI model wrote this answer.")} </>}
            {t("Read-only. Not a forecast and no accuracy claim. A person decides any action.")}
          </p>
        </div>}
      </Panel>
    </div>}
  </AppShell>;
}
