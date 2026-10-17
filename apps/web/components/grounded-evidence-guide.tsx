"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { BrainCircuit, CircleStop } from "lucide-react";

type Result = {
  answer_kind: string; status: "answered" | "abstained"; note: string;
  claims: { text: string; evidence_ids: string[]; source_ids: string[] }[];
  review_options: { playbook_step: string; text: string }[];
  unknowns: string[]; limitations: string[]; next_review_step: string;
};

export function GroundedEvidenceGuide({ incidentId }: { incidentId: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { controller.current?.abort(); setResult(null); setQuestion(""); setMessage(""); setBusy(false); }, [incidentId]);
  useEffect(() => () => controller.current?.abort(), []);
  async function ask(event: FormEvent) {
    event.preventDefault();
    if (busy || question.trim().length < 3) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setBusy(true); setResult(null); setMessage("Checking the validated exercise context…");
    try {
      const response = await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/grounded-guide`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }), signal: current.signal, cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Guide unavailable");
      setResult(data); setMessage(data.status === "abstained" ? "The guide abstained." : "Grounded answer ready.");
    } catch (error) {
      if (!current.signal.aborted) setMessage(error instanceof Error ? error.message : "Guide unavailable");
    } finally { if (controller.current === current) setBusy(false); }
  }
  function cancel() { controller.current?.abort(); setBusy(false); setMessage("Request cancelled. No proposal was changed."); }
  return <section className="mt-6 rounded-xl border border-stroke bg-surface p-5" aria-label="Grounded evidence guide">
    <div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 text-accent" size={20}/><div>
      <h2 className="font-bold">Grounded evidence guide</h2>
      <p className="mt-1 text-xs leading-5 text-muted">Ask about evidence, unknowns, or playbook review options. Answers use the validated synthetic checklist only and cannot write, approve, notify, or dispatch.</p>
    </div></div>
    <form className="mt-4" onSubmit={ask}>
      <label className="text-sm font-semibold" htmlFor={`guide-${incidentId}`}>Question about this case</label>
      <textarea id={`guide-${incidentId}`} className="field mt-2 !h-24 resize-y py-2" minLength={3} maxLength={300} disabled={busy}
        value={question} onChange={event => setQuestion(event.target.value)} placeholder="What evidence is current, and what remains unknown?"/>
      <div className="mt-2 flex gap-2"><button className="control" disabled={busy || question.trim().length < 3}>Ask grounded guide</button>
        {busy && <button type="button" className="control" onClick={cancel}><CircleStop size={15}/>Cancel</button>}</div>
    </form>
    {message && <p role="status" className="mt-3 text-xs text-muted">{message}</p>}
    {result && <div className="mt-4 space-y-4 text-sm">
      {result.claims.map((claim, index) => <article key={index} className="rounded-lg border border-stroke p-3"><p>{claim.text}</p>
        <p className="mt-2 break-all text-xs text-muted">Evidence: {claim.evidence_ids.join(" · ") || "none"}</p>
        <p className="break-all text-xs text-muted">Sources: {claim.source_ids.join(" · ") || "none"}</p></article>)}
      {result.review_options.length > 0 && <div><h3 className="font-semibold">Human review options</h3><ul className="mt-2 list-disc pl-5">{result.review_options.map(item => <li key={item.playbook_step}><strong>{item.playbook_step}</strong> · {item.text}</li>)}</ul></div>}
      <div><h3 className="font-semibold">Unknowns retained</h3><ul className="mt-2 list-disc pl-5 text-muted">{result.unknowns.map(item => <li key={item}>{item}</li>)}</ul></div>
      <p className="rounded-lg bg-amber-400/10 p-3 text-xs text-amber-800 dark:text-amber-300">{result.note} Next: {result.next_review_step}</p>
    </div>}
  </section>;
}
