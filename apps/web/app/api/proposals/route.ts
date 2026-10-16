import { proxyProposals } from "../../../lib/proposal-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) { return proxyProposals(request); }
export async function POST(request: Request) { return proxyProposals(request); }
