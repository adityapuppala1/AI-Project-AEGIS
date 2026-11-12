"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { SystemPage } from "../components/system-page";
import { useT } from "../components/language-provider";
import { Button } from "../components/ui";

export default function PageError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const t = useT();
  useEffect(() => { console.error("AEGIS page error", error.digest ?? ""); }, [error]);
  return <SystemPage code={t("Something went wrong")} title="This page could not be shown" body="The page stopped while loading. No record was changed. Try again; if it keeps happening, tell your administrator what you were doing.">
    <Button variant="primary" icon={RefreshCw} onClick={reset}>{t("Retry")}</Button>
  </SystemPage>;
}
