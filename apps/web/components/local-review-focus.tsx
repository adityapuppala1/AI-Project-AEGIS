"use client";
import { ErrorState } from "./ui";
import {useEffect,useRef,useState} from "react";
export type Focus={status:"template_fallback"|"model_assisted_selection";reason:string;model:string|null;reference_time:string;finding:{text:string;evidence_ids:string[];source_ids:string[]};review_option:{playbook_step:string;text:string};limitations:string[]};
const reasons:Record<string,string>={disabled:"Local model is disabled",unsupported_configuration:"Local model configuration is unsupported",missing_evidence:"Case evidence is missing",busy:"Local model is busy",invalid_output:"Model output did not pass validation",unavailable:"Local model is unavailable"};
export function LocalReviewFocus({incidentId}:{incidentId:string}) {
 const [focus,setFocus]=useState<Focus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>{setFocus(null);setError("");setBusy(false);return()=>{pending.current?.abort();pending.current=null;};},[incidentId]);
 async function preview(){
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;setBusy(true);setFocus(null);setError("");
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetch(`/api/incidents/${encodeURIComponent(incidentId)}/review-focus`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store",signal:controller.signal});
   if(!response.ok)throw Error("Preview unavailable; use the ordinary checklist or retry");
   const data=await response.json();
   const ids=(value:unknown)=>Array.isArray(value)&&value.length<=50&&value.every(id=>typeof id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
   if(data?.incident_id!==incidentId||data.source!=="synthetic_exercise"||data.version!=="aegis.exercise.review-focus.v1"||data.operational_actions_enabled!==false||data.needs_accountable_human_review!==true||!["template_fallback","model_assisted_selection"].includes(data.status)||typeof data.reference_time!=="string"||!Number.isFinite(Date.parse(data.reference_time))||(data.status==="model_assisted_selection"?!["tinyllama:1.1b","phi3:mini"].includes(data.model):data.model!==null)||typeof data.finding?.text!=="string"||!ids(data.finding.evidence_ids)||!ids(data.finding.source_ids)||typeof data.review_option?.text!=="string"||!["URB-01","URB-03","URB-04"].includes(data.review_option.playbook_step)||!Array.isArray(data.limitations)||data.limitations.length>20||!data.limitations.every((text:unknown)=>typeof text==="string"))throw Error("Preview classification not verified");
   if(pending.current===controller&&!controller.signal.aborted)setFocus(data);
  }catch(cause){if(pending.current===controller)setError(controller.signal.aborted?"Preview timed out; the ordinary checklist remains available":cause instanceof Error?cause.message:"Unavailable");}
  finally{clearTimeout(timer);if(pending.current===controller){setBusy(false);pending.current=null;}}
 }
 return <section className="mt-4 rounded-lg border border-stroke p-4" aria-label="Local review focus">
  <h5 className="text-sm font-bold">Review focus preview</h5>
  <p className="mt-2 text-xs leading-6 text-muted">Optional local AI selects existing review items only. It adds no facts, forecast, saved proposal or approval. A template is used when AI is unavailable.</p>
  <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="control control-sm" disabled={busy} onClick={()=>void preview()}>Get review focus</button>
  {busy&&<button type="button" className="control control-sm" onClick={()=>{pending.current?.abort();pending.current=null;setBusy(false);setError("Preview cancelled; no proposal was saved");}}>Cancel preview</button>}</div>
  {busy&&<p role="status" className="mt-2 text-xs">Checking local review focus…</p>}
  {error&&<ErrorState message={error} className="mt-2" />}
  {focus&&<ReviewFocusDetails focus={focus}/>}
 </section>;
}

export function ReviewFocusDetails({focus}:{focus:Focus}) {
 return <div className="mt-3 space-y-2 text-xs leading-6">
   <p role="status" className="font-bold">{focus.status==="model_assisted_selection"?`Local model selected review items (${focus.model})`:`Template fallback — ${reasons[focus.reason]||"local model not used"}`}</p>
   <p>{focus.finding.text}</p><p className="break-all text-muted">Evidence IDs: {focus.finding.evidence_ids.join(" · ")||"None"}</p><p className="break-all text-muted">Source candidate IDs: {focus.finding.source_ids.join(" · ")||"None"}</p>
   <p><strong>{focus.review_option.playbook_step}:</strong> {focus.review_option.text}</p>
   <p className="text-muted">Freshness evaluated at {focus.reference_time}; model selection does not validate these observations.</p>
   <ul className="list-disc pl-5 text-muted">{focus.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul>
  </div>;
}
