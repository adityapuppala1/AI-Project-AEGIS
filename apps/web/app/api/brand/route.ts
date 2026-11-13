import { publicBrand } from "../../../lib/brand-proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Public by design (lib/session-gate.ts): the brand name and logo version only.
export async function GET() { return publicBrand(); }
