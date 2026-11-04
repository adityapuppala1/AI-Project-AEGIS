"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrainCircuit, CircleStop, Send, ShieldCheck } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { Panel, StatusPill } from "./ui";
import { COPILOT_MAX, validateQuestion, type CopilotAnswer } from "../lib/operator-assist";

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

/** Read-only operator copilot: answers cite records and it cannot act. */
export function OperatorCopilot() {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = validateQuestion(question);
    if (busy) return;
    if (!text) { setMessage(t("Ask a question of 3-300 characters without control characters")); return; }
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setAnswer(null); setMessage(t("Checking agency records…"));
    try {
      const response = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }), signal: current.signal, cache: "no-store" });
      const data = await response.json().catch(() => null) as (CopilotAnswer & { error?: string }) | null;
      if (!response.ok || !data) throw new Error(data?.error || "Assistant sources unavailable");
      setAnswer(data); setMessage(data.status === "abstained" ? t("The assistant abstained.") : t("Cited answer ready."));
    } catch (error) {
      if (!current.signal.aborted) setMessage(t(error instanceof Error ? error.message : "Assistant sources unavailable"));
    } finally { if (controller.current === current) setBusy(false); }
  }

  return <AppShell title="Operator Copilot" description="A read-only assistant that answers from agency-scoped records and cites them. It cannot act.">
    <div className="mb-4 flex flex-wrap gap-2">
      <StatusPill tone="info" icon={ShieldCheck}>{t("Read-only assistant; answers cite records; cannot act")}</StatusPill>
      <StatusPill tone="sample">{t("Synthetic exercise data")}</StatusPill>
    </div>
    <Panel title={t("Ask about your agency's records")} icon={BrainCircuit}>
      <form onSubmit={ask} className="space-y-3">
        <label className="block text-sm font-semibold" htmlFor="copilot-question">{t("Question")}</label>
        <input id="copilot-question" className="control w-full" maxLength={COPILOT_MAX} value={question} onChange={event => setQuestion(event.target.value)} autoComplete="off"/>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="control" disabled={busy}><Send size={16}/>{t("Ask")}</button>
          {busy && <button type="button" className="control" onClick={() => { controller.current?.abort(); setBusy(false); setMessage(t("Request cancelled.")); }}><CircleStop size={16}/>{t("Cancel")}</button>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">{EXAMPLES.map(example => <button key={example} type="button" className="rounded-full border border-stroke px-2 py-1" onClick={() => setQuestion(example)}>{t(example)}</button>)}</div>
        <p className="text-xs text-muted">{t("Questions are matched to fixed read-only lookups. Instructions inside a question are ignored. No proposal, approval, notification or dispatch can be made here.")}</p>
      </form>
      <p className="mt-3 text-sm" role="status">{message}</p>
      {answer && <div className="mt-3 space-y-3">
        {answer.status === "abstained"
          ? <p className="text-sm">{t(REASONS[answer.reason ?? ""] ?? "This question is not supported. Try one of the examples.")}</p>
          : <>
            {answer.summary && <p className="text-sm">{answer.summary}</p>}
            <ul className="space-y-2 text-sm">{answer.facts.map((fact, index) => <li key={index} className="rounded-lg border border-stroke p-2">
              <span>{fact.text}</span>
              <span className="mt-1 flex flex-wrap gap-1">{fact.refs.map(ref => <code key={ref} className="rounded bg-surface-2 px-1 text-[11px] break-all">{ref}</code>)}</span>
            </li>)}</ul>
            <p className="text-xs text-muted">{answer.generatedBy === "local_model_rephrase_of_cited_facts" ? t("Summary rephrased by a local model from the cited facts only.") : t("Generated from a fixed template; no AI model wrote this answer.")}</p>
          </>}
        <p className="text-xs text-muted">{t("Read-only. Not a forecast and no accuracy claim. A person decides any action.")}</p>
      </div>}
    </Panel>
  </AppShell>;
}
