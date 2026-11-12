"use client";

import { LogIn, ShieldAlert } from "lucide-react";
import { useT } from "./language-provider";
import { EmptyState, buttonClass } from "./ui";
import type { SessionInfo } from "../lib/use-operator-session";

/**
 * What operator-only pages show when nobody is signed in. It tells the viewer what to do next, and it
 * distinguishes "sign-in works, you just aren't signed in" from "sign-in has not been set up here".
 */
export function SignInRequired({ session }: Readonly<{ session: SessionInfo }>) {
  const t = useT();
  if (!session.configured) {
    return <EmptyState icon={ShieldAlert} title={t("Operator sign-in is not set up")}
      body={t("Ask a platform administrator to set up the identity provider. Until then this page cannot show records.")}/>;
  }
  return <EmptyState icon={LogIn} title={t("Sign in to continue")}
    body={t("This page shows records for your agency. Sign in with your operator account to see them.")}
    actions={<a className={buttonClass()} href="/api/auth/login"><LogIn size={16} aria-hidden="true"/>{t("Operator sign in")}</a>}/>;
}
