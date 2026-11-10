import type { Metadata } from "next";

import { SignInExperience } from "../../components/sign-in-experience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operator sign-in",
  description: "Sign in to AEGIS through your organisation's identity provider. AEGIS never sees your password.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams;
  return <SignInExperience failed={error === "verify"} />;
}
