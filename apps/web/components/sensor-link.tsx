"use client";

import { useMemo, useState } from "react";
import { Antenna, Building2, Check, Globe, Minus, Pause, Satellite, Target, WifiOff, Radio, type LucideIcon } from "lucide-react";
import { AppShell } from "./app-shell";
import { useT } from "./language-provider";
import { PatentCredit } from "./patent-credit";
import { Button, EmptyState, Panel, SegmentedControl, SortableTable, StatusPill, type TableColumn, type Tone } from "./ui";
import {
  COMM_PARTIES, LINK_LABELS, PRIORITY_LABELS, SCENARIOS, allocate, commLink, scenarioById, summarise,
  type AllocationResult, type CommLink, type LinkId, type NodeAllocation, type NodeState, type ScenarioId,
} from "../lib/patent";

const STATE_LABEL: Record<NodeState, string> = { delivered: "Delivered", reduced: "Reduced", held: "Held", offline: "Offline" };
const STATE_TONE: Record<NodeState, Tone> = { delivered: "success", reduced: "warning", held: "neutral", offline: "danger" };
const STATE_ICON: Record<NodeState, LucideIcon> = { delivered: Check, reduced: Minus, held: Pause, offline: WifiOff };
const LANE_ICON: Record<LinkId, LucideIcon> = { ground: Globe, satellite: Satellite };
const COMM_LABEL: Record<CommLink, string> = { ground: "Ground internet", satellite: "Satellite", none: "No link" };

const LIMITS = [
  "Nothing is transmitted. No satellite or radio link is used.",
  "Link states, bandwidth numbers and sensors are synthetic rehearsal values, not measurements.",
  "A field deployment would need dedicated hardware and licensed satellite capacity.",
  "IndTrana's team response loop stays an in-app rehearsal. Nothing is sent to any team or desk.",
];

function SensorChip({ item }: Readonly<{ item: NodeAllocation }>) {
  const t = useT();
  const Icon = STATE_ICON[item.state];
  return <li className="flex items-center gap-2 text-xs leading-5">
    <Icon size={13} aria-hidden="true" className="shrink-0 text-muted" />
    <span className="min-w-0 flex-1 truncate" title={t(item.node.name)}>{t(item.node.name)}</span>
    <span className="tnum shrink-0 text-muted">{item.allocated} kbps</span>
    <span className="sr-only">{t(STATE_LABEL[item.state])}</span>
  </li>;
}

function Lane({ id, result }: Readonly<{ id: LinkId; result: AllocationResult }>) {
  const t = useT();
  const lane = result.lanes[id]; const Icon = LANE_ICON[id];
  const members = result.nodes.filter(item => item.link === id && item.allocated > 0);
  const pct = lane.capacity > 0 ? Math.min(100, Math.round((lane.used / lane.capacity) * 100)) : 0;
  return <div className={`rounded-lg border p-3 ${lane.up ? "border-stroke bg-surface" : "border-dashed border-stroke bg-elevated"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} aria-hidden="true" />{t(LINK_LABELS[id])}</h3>
      {lane.up ? <StatusPill tone="success">{t("Link up")}</StatusPill> : <StatusPill tone="danger" icon={WifiOff}>{t("Link down")}</StatusPill>}
    </div>
    <div className="mt-2" role="img" aria-label={`${t(LINK_LABELS[id])}: ${lane.used} of ${lane.capacity} kbps in use`}>
      <div className="h-2.5 overflow-hidden rounded-full border border-stroke bg-canvas">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%`, backgroundImage: "repeating-linear-gradient(135deg, rgb(var(--surface) / .45) 0 4px, transparent 4px 8px)" }} />
      </div>
      <p className="tnum mt-1 text-xs text-muted">{lane.up ? `${lane.used} / ${lane.capacity} kbps` : t("No capacity")}</p>
    </div>
    {members.length > 0 ? <ul className="mt-2 space-y-1">{members.map(item => <SensorChip key={item.node.id} item={item} />)}</ul>
      : <p className="mt-2 text-xs text-muted">{lane.up ? t("No sensor traffic on this lane.") : t("Nothing can travel on this lane.")}</p>}
  </div>;
}

function Schematic({ result }: Readonly<{ result: AllocationResult }>) {
  const t = useT();
  const waiting = result.nodes.filter(item => item.allocated === 0);
  const total = result.nodes.length;
  const arrived = result.nodes.filter(item => item.allocated > 0).length;
  return <div className="grid gap-3 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,13rem)] lg:items-stretch">
    <div className="rounded-lg border border-stroke bg-elevated p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Antenna size={16} aria-hidden="true" />{t("12 sensors around Hyderabad")}</h3>
      <p className="mt-1 text-xs leading-5 text-muted">{t("Four priority classes, from life-safety gauges to housekeeping.")}</p>
      <p className="tnum mt-2 text-xs">{t("Asking for")} {result.totals.demand} kbps</p>
      {waiting.length > 0 && <p className="mt-2 text-xs leading-5"><span className="font-semibold">{waiting.length} {t("waiting at the sensor")}</span><span className="text-muted"> · {t("Buffered in this simulation until capacity returns.")}</span></p>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Lane id="ground" result={result} />
      <Lane id="satellite" result={result} />
    </div>
    <div className="rounded-lg border-2 border-accent/50 bg-surface p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 size={16} aria-hidden="true" />{t("IndTrana control room")}</h3>
      <p className="tnum mt-2 text-2xl font-semibold leading-none">{arrived}<span className="text-sm font-normal text-muted"> / {total}</span></p>
      <p className="mt-1 text-xs leading-5 text-muted">{t("sensors reporting")}</p>
      <p className="tnum mt-2 text-xs">{result.totals.allocated} kbps {t("arriving")}</p>
    </div>
  </div>;
}

export function SensorLink() {
  const t = useT();
  const [scenarioId, setScenarioId] = useState<ScenarioId>("normal");
  const [near, setNear] = useState(false);
  const result = useMemo(() => allocate(scenarioById(scenarioId), { triggerNear: near }), [scenarioId, near]);
  const gauge = result.nodes.find(item => item.node.near);
  const options = SCENARIOS.map(item => ({ value: item.id, label: t(item.label) }));

  const columns: TableColumn<NodeAllocation>[] = [
    { key: "name", label: t("Sensor"), sortValue: row => row.node.name, cell: row => <span className="inline-flex flex-wrap items-center gap-1.5"><span className="font-semibold">{t(row.node.name)}</span><StatusPill tone="sample">{t("Synthetic")}</StatusPill></span> },
    { key: "type", label: t("Type"), sortValue: row => row.node.type, cell: row => t(row.node.type) },
    { key: "priority", label: t("Priority"), sortValue: row => row.node.priority, cell: row => t(PRIORITY_LABELS[row.node.priority]) },
    { key: "link", label: t("Link now"), sortValue: row => row.link ?? "", cell: row => row.link ? t(LINK_LABELS[row.link]) + (row.moved ? " · " + t("moved") : "") : t("None") },
    { key: "demand", label: t("Demand (kbps)"), numeric: true, sortValue: row => row.demand, cell: row => <>{row.demand}{row.boosted && <span className="ml-1 text-xs text-muted">{t("raised")}</span>}</> },
    { key: "allocated", label: t("Allocated (kbps)"), numeric: true, sortValue: row => row.allocated, cell: row => row.allocated },
    { key: "state", label: t("State"), sortValue: row => row.state, cell: row => <StatusPill tone={STATE_TONE[row.state]} icon={STATE_ICON[row.state]}>{t(STATE_LABEL[row.state])}</StatusPill> },
  ];

  return <AppShell title="Resilient Sensor Link" description="A rehearsal of moving sensor traffic between internet and satellite, giving scarce bandwidth to the most important readings first.">
    <div className="space-y-4">
      <Panel icon={Radio} title={t("Sensor traffic across two links")} description={t("Choose what happens to the links. The picture, the table and the sentence below follow.")}>
        <p className="mb-3 text-xs leading-5"><a href="#patented-technology" className="font-semibold text-accent hover:underline">{t("Applies the idea of Indian Patent No. 598835 (see Patented technology below).")}</a></p>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl label={t("Link scenario")} options={options} value={scenarioId} onChange={setScenarioId} />
          <Button variant={near ? "primary" : "secondary"} icon={Target} aria-pressed={near} onClick={() => setNear(value => !value)}>{t("Trigger near: raise gauge reporting")}</Button>
        </div>
        <p role="status" className="mt-3 text-sm font-semibold leading-6">{summarise(result, t)}</p>
        {near && <p className="text-xs leading-5 text-muted">{gauge && gauge.allocated > gauge.node.demand
          ? t("A hazard is near, so the Musi river gauge at Nayapul asks for more bandwidth. It takes the extra from capacity left after the other life-safety gauges, before lower-priority feeds.")
          : t("A hazard is near, so the Musi river gauge at Nayapul asks for more bandwidth, but no capacity is left after the other life-safety gauges.")}</p>}
        <div className="mt-3">
          {!result.scenario.ground.up && !result.scenario.satellite.up && <p className="mb-3 rounded-lg border border-dashed border-stroke bg-elevated p-3 text-sm leading-6"><WifiOff size={15} aria-hidden="true" className="mr-1.5 inline" />{t("Both links are down. Nothing reaches the control room in this simulation.")}</p>}
          <Schematic result={result} />
        </div>
      </Panel>

      <Panel title={t("Sensors")} description={t("Synthetic sensors, in the same families as the Source Freshness page.")} bodyClassName="p-0">
        <SortableTable label={t("Sensors and their links")} rows={result.nodes} columns={columns} rowKey={row => row.node.id} minWidth="52rem"
          empty={<EmptyState title={t("No sensors")} />} />
      </Panel>

      <Panel title={t("Communication application")} description={t("The same link management would keep the control room, departments and field teams able to reach each other.")}>
        <SortableTable label={t("Parties and the link each would use")} rows={COMM_PARTIES} rowKey={row => row.id}
          columns={[
            { key: "name", label: t("Party"), sortValue: row => row.name, cell: row => <span className="font-semibold">{t(row.name)}</span> },
            { key: "kind", label: t("Role"), sortValue: row => row.kind, cell: row => t(row.kind) },
            { key: "link", label: t("Link in this scenario"), sortValue: row => commLink(row.id, result.scenario), cell: row => {
              const link = commLink(row.id, result.scenario);
              return <StatusPill tone={link === "none" ? "danger" : link === "satellite" ? "warning" : "success"} icon={link === "none" ? WifiOff : link === "satellite" ? Satellite : Globe}>{t(COMM_LABEL[link])}</StatusPill>;
            } },
          ]} />
        <p className="mt-3 max-w-3xl text-xs leading-5 text-muted">{t("In this rehearsal every party uses the ground link while it is up, then satellite, then none.")} {t("Which link each party would use is illustrative. IndTrana's team response loop remains an in-app rehearsal and nothing is sent.")}</p>
      </Panel>

      <PatentCredit showLink={false} pageNote />

      <Panel title={t("Limits of this rehearsal")}>
        <ul className="list-disc space-y-1.5 pl-4 text-sm leading-6">{LIMITS.map(item => <li key={item}>{t(item)}</li>)}</ul>
        <p className="mt-3 max-w-3xl text-xs leading-5 text-muted">{t("This mapping is based on the patent title only. It will be checked against the full specification before any wider claim is made.")}</p>
      </Panel>
    </div>
  </AppShell>;
}
