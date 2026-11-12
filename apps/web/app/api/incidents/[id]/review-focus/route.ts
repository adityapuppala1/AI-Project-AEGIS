import { NextRequest, NextResponse } from "next/server";
import { apiAuthHeaders, signInRequired, upstreamAuthFailure } from "../../../../../lib/api-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: object, status = 200) => NextResponse.json(body, {status, headers:{"Cache-Control":"no-store"}});
export async function POST(request: NextRequest, {params}: {params: Promise<{id:string}>}) {
  if (request.headers.get("origin") !== (process.env.APP_ORIGIN || "http://localhost:3000")) return json({error:"Origin rejected"},403);
  const {id}=await params;
  if (!uuid.test(id)) return json({error:"Invalid exercise case"},400);
  const body=await request.json().catch(()=>null);
  if (!body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).length) return json({error:"Preview takes no instructions or configuration"},400);
  const auth = await apiAuthHeaders();
  if (!auth) return signInRequired();
  try {
    const base=process.env.API_INTERNAL_URL || "http://localhost:8000";
    const response=await fetch(base+"/v1/exercise/incidents/"+id+"/review-focus", {
      method:"POST",headers:{ ...auth,"Content-Type":"application/json"},body:"{}",cache:"no-store",signal:AbortSignal.timeout(25000),
    });
    const refused = upstreamAuthFailure(response);
    if (refused) return refused;
    if (response.status===404) return json({error:"Synthetic context not found"},404);
    if (!response.ok) throw Error("Unavailable");
    const value=await response.json();
    if(value?.version!=="aegis.exercise.review-focus.v1" || value.incident_id!==id || value.source!=="synthetic_exercise" || value.operational_actions_enabled!==false || value.needs_accountable_human_review!==true || !["template_fallback","model_assisted_selection"].includes(value.status) || (value.status==="model_assisted_selection"?!["tinyllama:1.1b","phi3:mini"].includes(value.model):value.model!==null)) throw Error("Unsafe classification");
    return json(value);
  } catch {return json({error:"Local review preview unavailable; the ordinary checklist remains usable"},503);}
}
