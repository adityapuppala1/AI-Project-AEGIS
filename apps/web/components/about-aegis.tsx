"use client";

import Link from "next/link";
import { Ban, Bot, Building2, FlaskConical, RadioTower, Smartphone, UserCheck } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { Panel, TwoKey, buttonClass } from "./ui";
import { CHAIN, allPages, type ChainStep } from "../lib/navigation";

const STEPS: Record<ChainStep, { title: string; text: string; ai: string; people: string }> = {
  Sense: { title: "Sense the hazard", text: "Readings from satellites, gauges and public feeds arrive with their time. Sources that are late, missing or in disagreement are flagged.", ai: "Reads many sources at once and flags the ones that are late or disagree.", people: "Decide which sources the agency trusts." },
  Predict: { title: "Estimate the risk", text: "The evidence is lined up and the risk is given as a range, with every source cited. When the evidence is thin, the desk says so.", ai: "Gives a range, cites every source, and says “not enough evidence” when that is the truth.", people: "Read the evidence and question it." },
  Decide: { title: "Two people decide", text: "One officer drafts the alert. A different officer checks it and approves or sends it back with a reason. Software cannot approve at all.", ai: "Points the checker to the evidence that matters most.", people: "Draft, check, approve. Their names and reasons are recorded." },
  "Hand over": { title: "Hand over to the authority", text: "The approved draft goes to the alerting authority in the Common Alerting Protocol. IndTrana stops here. It has no way to send a public warning.", ai: "Fills a fixed template. It does not write free text into an alert.", people: "The authority decides whether, where and when to warn." },
  Reach: { title: "Reach people", text: "The authority's own system passes the warning to telecom operators. Response teams receive their tasks from their departments.", ai: "Suggests where teams could wait, as a recommendation only.", people: "Departments task their teams. Operators deliver the broadcast." },
  Learn: { title: "Learn from what happened", text: "After the event, what was estimated is compared with what happened. Any change to a threshold goes through the same two-person approval.", ai: "Reports how its estimates compared, without calling it accuracy.", people: "Approve or reject each proposed change." },
};
const OUTSIDE = [
  { icon: Building2, title: "Alerting authority", text: "NDMA or the state authority receives the approved draft and alone decides whether to warn." },
  { icon: RadioTower, title: "Telecom operators", text: "They broadcast the authority's warning. IndTrana has no connection to them." },
  { icon: Smartphone, title: "People", text: "They hear from the official channel and local officials, never from IndTrana." },
];
const LIMITS = [
  "Every record is synthetic exercise data. Optional public NASA and USGS feeds are labelled separately and never become cases.",
  "Figures in the Model Evaluation Lab and Post-event Learning are rehearsal statistics, never forecasting accuracy.",
  "Time targets for departments are rehearsal targets, not contractual service levels.",
  "Telugu and Hindi text is machine-drafted and still waiting for review by native speakers.",
];

/** The signed-in About page: the same story as the public landing page, inside the app, with links to each step's pages. */
export function AboutAegis() {
  const t = useT();
  return <AppShell title="About IndTrana" description="What IndTrana is for, the six steps an alert takes, and where this exercise build stops.">
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0 space-y-4">
        <Panel title={t("What IndTrana is")}>
          <div className="max-w-3xl space-y-2 text-sm leading-6">
            <p>{t("IndTrana is a decision-support desk for disaster agencies. It gathers evidence about a hazard, estimates the risk with its sources shown, and helps two officers agree on a draft alert.")}</p>
            <p className="font-semibold">{t("IndTrana does not send warnings. The approved draft is handed to the alerting authority, which alone decides whether, where and when to warn.")}</p>
          </div>
        </Panel>
        <Panel title={t("The six steps of an alert")} description={t("Each page in the menu serves one of these steps and shows its place in the chain under its title.")} bodyClassName="p-0">
          <ol className="divide-y divide-stroke">{CHAIN.map((step, index) => {
            const pages = allPages.filter((page, at, all) => page.chain === step && all.findIndex(other => other.href === page.href) === at);
            const info = STEPS[step];
            return <li key={step} className="grid gap-x-5 gap-y-2 px-4 py-4 md:grid-cols-[2.5rem_minmax(0,1fr)]">
              <span aria-hidden="true" className="tnum text-2xl font-semibold leading-none text-brand">{index + 1}</span>
              <div className="min-w-0">
                <h3 className="t-title">{t(step)}<span className="font-normal text-muted"> · {t(info.title)}</span></h3>
                <p className="mt-1 max-w-3xl text-sm leading-6">{t(info.text)}</p>
                {step === "Decide" && <p className="mt-2"><TwoKey maker="turned" checker="turned" /></p>}
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs leading-5 sm:grid-cols-2">
                  <div className="flex gap-2"><dt className="inline-flex shrink-0 items-center gap-1 font-semibold text-muted"><Bot size={13} aria-hidden="true" />{t("Software")}</dt><dd>{t(info.ai)}</dd></div>
                  <div className="flex gap-2"><dt className="inline-flex shrink-0 items-center gap-1 font-semibold text-muted"><UserCheck size={13} aria-hidden="true" />{t("People")}</dt><dd>{t(info.people)}</dd></div>
                </dl>
                {pages.length > 0 && <p className="mt-2.5 flex flex-wrap gap-1.5">{pages.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={buttonClass({ size: "sm" })}><Icon size={14} aria-hidden="true" />{t(label)}</Link>)}</p>}
              </div>
            </li>;
          })}</ol>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel title={t("Where IndTrana stops")} icon={Ban} description={t("Everything below happens outside IndTrana.")} bodyClassName="p-0">
          <ul className="divide-y divide-stroke">{OUTSIDE.map(({ icon: Icon, title, text }) => <li key={title} className="flex gap-3 px-4 py-3">
            <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
            <div><p className="text-sm font-semibold">{t(title)}</p><p className="mt-0.5 text-xs leading-5 text-muted">{t(text)}</p></div>
          </li>)}</ul>
        </Panel>
        <Panel title={t("Limits of this exercise build")} icon={FlaskConical}>
          <ul className="list-disc space-y-2 pl-4 text-sm leading-6">{LIMITS.map(item => <li key={item}>{t(item)}</li>)}</ul>
        </Panel>
      </div>
    </div>
  </AppShell>;
}
