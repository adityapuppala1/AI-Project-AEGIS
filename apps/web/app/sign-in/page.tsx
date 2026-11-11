import type { Metadata } from "next";

import { SignInExperience } from "../../components/sign-in-experience";
import { safeReturnPath } from "../../lib/session-gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operator sign-in",
  description: "Sign in to AEGIS through your organisation's identity provider. AEGIS never sees your password.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; next?: string | string[]; expired?: string | string[] }> }) {
  const { error, next, expired } = await searchParams;
  // The return path is validated here and again by the sign-in endpoints; anything unexpected is dropped.
  return <SignInExperience failed={error === "verify"} expired={expired === "1"} next={safeReturnPath(typeof next === "string" ? next : null)} />;
}
