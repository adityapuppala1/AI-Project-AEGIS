"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, BrainCircuit, Calculator, ShieldAlert } from "lucide-react";

interface ExerciseResult {
  kind: "synthetic_rule_demo";
  hazard_index: number;
  classification: "high" | "monitor";
  requires_human_verification: true;
  real_world_probability: null;
  calibrated_prediction: false;
  operational_actions_enabled: false;
}
export function RiskExercisePanel() {
  const [rainfall, setRainfall] = useState(35);
  const [water, setWater] = useState(45);
  const [drainage, setDrainage] = useState("moderate");
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/exercise/risk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: "AEGIS-EXERCISE-ONLY",
          rainfall_mm_hour: rainfall, water_index: water,
          drainage_condition: drainage, observed_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error("Illustrative index service unavailable");
      const data = await response.json() as ExerciseResult;
      if (data.kind !== "synthetic_rule_demo" || data.requires_human_verification !== true ||
          data.real_world_probability !== null || data.calibrated_prediction !== false ||
          data.operational_actions_enabled !== false || !Number.isFinite(data.hazard_index)) {
        throw new Error("Unexpected demonstration result");
      }
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unavailable");
    } finally { setBusy(false); }
  }
  return <section id="synthetic-risk" className="panel mt-5 overflow-hidden" aria-label="Illustrative hazard-index calculator">
    <div className="panel-heading"><div>
      <h2 className="flex items-center gap-2 text-base font-bold"><BrainCircuit size={18} className="text-accent"/> Rule-based Hazard Index · Training</h2>
      <p className="mt-1 text-xs text-muted">Explore the original deterministic teaching formula with synthetic inputs only.</p>
    </div><span className="rounded-full bg-elevated px-3 py-1 text-xs font-semibold text-muted">Not trained AI</span></div>
    <div role="note" className="flex items-start gap-3 border-b border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
      <ShieldAlert size={18} className="mt-1 shrink-0"/>
      <p><strong>Not a disaster prediction.</strong> The calculated 0–100 index is an illustrative rule output, not a flood probability, forecast, public warning or severity assessment. No observation is saved.</p>
    </div>
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(230px,.8fr)]">
      <form onSubmit={calculate} className="space-y-5">
        <label className="block text-xs font-semibold">Fictional rainfall intensity · {rainfall} mm/hour
          <input type="range" min={0} max={200} step={1} value={rainfall} className="mt-3 block w-full accent-teal-500"
            onChange={event => {setRainfall(Number(event.target.value));setResult(null);}}/>
        </label>
        <label className="block text-xs font-semibold">Synthetic water index · {water} / 100
          <input type="range" min={0} max={100} step={1} value={water} className="mt-3 block w-full accent-teal-500"
            onChange={event => {setWater(Number(event.target.value));setResult(null);}}/>
        </label>
        <label className="block text-xs font-semibold" htmlFor="synthetic-drainage">Fictional drainage condition
          <select id="synthetic-drainage" className="field mt-2" value={drainage} onChange={event => {setDrainage(event.target.value);setResult(null);}}>
            <option value="good">Good (exercise)</option>
            <option value="moderate">Moderate (exercise)</option>
            <option value="limited">Limited (exercise)</option>
          </select>
        </label>
        <button type="submit" className="control control-primary text-xs" disabled={busy}>
          <Calculator size={15}/> {busy ? "Calculating demo index…" : "Calculate synthetic index"}
        </button>
      </form>
      <div className="rounded-xl border border-stroke bg-elevated/40 p-5">
        <p className="eyebrow">Demonstration-only result</p>
        {result ? <>
          <p className="mt-4 text-4xl font-bold tabular-nums">{result.hazard_index}<span className="ml-1 text-base text-muted">/ 100</span></p>
          <p className="mt-2 text-sm font-semibold">{result.classification === "high" ? "Illustrative high rule index" : "Illustrative monitoring rule index"}</p>
          <p className="mt-3 text-xs leading-6 text-muted">Human verification remains required. Real probability: unavailable. All live actions: disabled.</p>
        </> : <p className="mt-4 text-sm text-muted">Enter exercise inputs and calculate. No result is shown until the API confirms the synthetic-only classification.</p>}
        {error && <p role="alert" className="mt-3 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-300"><AlertTriangle size={16}/>{error}</p>}
      </div>
    </div>
  </section>;
}
