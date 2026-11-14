"use client";
// The "Take the tour" button at the end of the "How this page works" row. The first time a page is opened (and only if
// tour hints are on and the Welcome tour has been seen or skipped) it reads "New here? Take the page tour" and can be
// dismissed. Page tours never start by themselves.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Compass, X } from "lucide-react";
import { useT } from "../language-provider";
import { Button, IconButton } from "../ui";
import { markHintSeen } from "../../lib/tour-storage";
import { WELCOME_TOUR_ID, tourForPath } from "../../lib/tours";
import { useTour, useTourState } from "./tour-provider";

export function PageTourAction() {
  const t = useT();
  const tour = useTour();
  const state = useTourState();
  const pathname = usePathname();
  const key = tourForPath(pathname)?.id ?? pathname;
  const [hinted, setHinted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const introduced = state.done.includes(WELCOME_TOUR_ID) || state.dismissed.includes(WELCOME_TOUR_ID);
  const eligible = tour.canTourPage && !tour.run && introduced && state.hints && !state.hintSeen.includes(key);
  // Latched: once the hint has been shown it stays for this visit, and the page is remembered as hinted.
  useEffect(() => { if (eligible && !hinted) { setHinted(true); markHintSeen(key); } }, [eligible, hinted, key]);
  if (!tour.canTourPage) return null;
  const hint = hinted && !dismissed && !tour.run;
  return <span className="tour-action no-print">
    <Button variant="quiet" size="sm" icon={Compass} onClick={() => { setDismissed(true); tour.startPage(); }}>{hint ? t("New here? Take the page tour") : t("Take the tour")}</Button>
    {hint && <IconButton label={t("Dismiss")} icon={X} size="sm" variant="quiet" onClick={() => setDismissed(true)} />}
  </span>;
}
