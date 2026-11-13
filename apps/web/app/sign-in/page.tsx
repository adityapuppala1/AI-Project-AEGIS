import type { Metadata } from "next";

import { SignInExperience } from "../../components/sign-in-experience";
import { safeReturnPath } from "../../lib/session-gate";
import { fetchBrand } from "../../lib/brand-proxy";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { name } = await fetchBrand();
  return {
    title: "Operator sign-in",
    description: `Sign in to ${name} through your organisation's identity provider. ${name} never sees your password.`,
  };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; next?: string | string[]; expired?: string | string[] }> }) {
  const { error, next, expired } = await searchParams;
  // The return path is validated here and again by the sign-in endpoints; anything unexpected is dropped.
  return <SignInExperience failed={error === "verify"} expired={expired === "1"} next={safeReturnPath(typeof next === "string" ? next : null)} />;
}
