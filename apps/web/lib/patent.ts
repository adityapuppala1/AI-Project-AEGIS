// Single source of the patent facts (read from the grant certificate title page only; the claims were NOT available)
// and a pure, deterministic rehearsal simulation of the idea in the title: sensor networks carried over both internet
// and satellite links, with bandwidth given on demand. No network, no clock, no randomness. Every number below is a
// synthetic rehearsal value, not a measurement. Callers: components/patent-credit.tsx, components/sensor-link.tsx,
// scripts/tests/sensor-link.test.cjs. Do not state performance figures or that IndTrana itself is patented.

export const PATENT = {
  number: "598835",
  applicationNumber: "201741007139",
  filed: "28 February 2017",
  granted: "12 August 2026",
  termYears: 20,
  termFrom: "28 February 2017",
  title: "Dynamic Bandwidth System for IoT Networks via Satellite and Internet Infrastructure",
  patentee: "Bharath Bejjarapu",
  patenteeRole: "co-owner of IndTrana",
  issuer: "The Patent Office, Government of India",
  act: "Patents Act, 1970",
  /** Served from apps/web/public, behind the sign-in gate (never added to the public path list). */
  /** Wording shared by every place that describes the patent. Only the title is relied on. */
  howItApplies: "The patent's title names a dynamic bandwidth system for sensor (IoT) networks over satellite and internet infrastructure. IndTrana applies that idea to its Sense step and to control-room, desk and team contact, as a rehearsal.",
  titleOnlyNote: "Described here from the patent's title; the full specification has not been reviewed for this page.",
  certificatePath: "/patent/patent-598835-certificate.pdf",
} as const;

export type Priority = 1 | 2 | 3 | 4;
export type LinkId = "ground" | "satellite";
export type NodeState = "delivered" | "reduced" | "held" | "offline";

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: "Life-safety", 2: "Weather and reservoirs", 3: "Routine telemetry", 4: "Housekeeping",
};
export const LINK_LABELS: Record<LinkId, string> = { ground: "Ground internet", satellite: "Satellite" };

export interface SensorNode { id: string; name: string; type: string; priority: Priority; demand: number; primary: LinkId; near?: boolean }

/** Synthetic sensors around Hyderabad. Names are invented rehearsal sites, not real stations. Demand is kbps. */
export const SENSORS: readonly SensorNode[] = [
  { id: "g1", name: "Musi river gauge, Nayapul", type: "River gauge", priority: 1, demand: 64, primary: "ground", near: true },
  { id: "g2", name: "Musi river gauge, Chaderghat", type: "River gauge", priority: 1, demand: 64, primary: "ground" },
  { id: "g3", name: "Rain gauge, Hussain Sagar", type: "Rain gauge", priority: 1, demand: 48, primary: "ground" },
  { id: "g4", name: "Rain gauge, Gachibowli", type: "Rain gauge", priority: 1, demand: 48, primary: "ground" },
  { id: "r1", name: "Reservoir level, Himayat Sagar", type: "Reservoir level", priority: 2, demand: 80, primary: "satellite" },
  { id: "w1", name: "Weather station, Begumpet", type: "Weather station", priority: 2, demand: 96, primary: "ground" },
  { id: "w2", name: "Weather station, Secunderabad", type: "Weather station", priority: 2, demand: 96, primary: "ground" },
  { id: "t1", name: "Soil-moisture probe, Shamshabad", type: "Soil moisture", priority: 3, demand: 120, primary: "satellite" },
  { id: "t2", name: "Underpass water-level sensor, Tarnaka", type: "Water-level sensor", priority: 3, demand: 160, primary: "ground" },
  { id: "t3", name: "Air-quality monitor, Zoo Park", type: "Air quality", priority: 3, demand: 200, primary: "ground" },
  { id: "h1", name: "Battery and enclosure health, all sites", type: "Housekeeping", priority: 4, demand: 150, primary: "ground" },
  { id: "h2", name: "Firmware and log upload, all sites", type: "Housekeeping", priority: 4, demand: 300, primary: "ground" },
];

export type ScenarioId = "normal" | "ground_degraded" | "ground_cut" | "satellite_reduced" | "both_down";
export interface Scenario { id: ScenarioId; label: string; ground: { up: boolean; capacity: number }; satellite: { up: boolean; capacity: number } }

/** Capacities in kbps. Synthetic. */
export const SCENARIOS: readonly Scenario[] = [
  { id: "normal", label: "Normal", ground: { up: true, capacity: 1400 }, satellite: { up: true, capacity: 400 } },
  { id: "ground_degraded", label: "Ground degraded", ground: { up: true, capacity: 500 }, satellite: { up: true, capacity: 400 } },
  { id: "ground_cut", label: "Ground cut", ground: { up: false, capacity: 0 }, satellite: { up: true, capacity: 400 } },
  { id: "satellite_reduced", label: "Satellite reduced", ground: { up: false, capacity: 0 }, satellite: { up: true, capacity: 200 } },
  { id: "both_down", label: "Both down", ground: { up: false, capacity: 0 }, satellite: { up: false, capacity: 0 } },
];
export const scenarioById = (id: ScenarioId): Scenario => SCENARIOS.find(item => item.id === id) ?? SCENARIOS[0];

export const NEAR_DEMAND = 256; // kbps asked by the gauge nearest the hazard when "trigger near" is on

export interface NodeAllocation { node: SensorNode; link: LinkId | null; demand: number; allocated: number; state: NodeState; boosted: boolean; moved: boolean }
export interface AllocationResult {
  scenario: Scenario; nodes: NodeAllocation[];
  lanes: Record<LinkId, { up: boolean; capacity: number; used: number }>;
  totals: { delivered: number; reduced: number; held: number; offline: number; moved: number; movedToSatellite: number; demand: number; allocated: number };
}

/**
 * Give bandwidth in priority order (1 first, then declared order). A node tries its primary link, then the other one,
 * and takes the link that can carry its full demand. Otherwise it takes what is left on the roomier link: priorities
 * 1 to 3 are reduced when at least a quarter of the demand is available, housekeeping is held rather than trimmed.
 */
export function allocate(scenario: Scenario, options: { triggerNear?: boolean } = {}): AllocationResult {
  const remaining: Record<LinkId, number> = { ground: scenario.ground.up ? scenario.ground.capacity : 0, satellite: scenario.satellite.up ? scenario.satellite.capacity : 0 };
  const up: Record<LinkId, boolean> = { ground: scenario.ground.up, satellite: scenario.satellite.up };
  const used: Record<LinkId, number> = { ground: 0, satellite: 0 };
  const order = SENSORS.map((node, index) => ({ node, index })).sort((a, b) => a.node.priority - b.node.priority || a.index - b.index);
  const byId = new Map<string, NodeAllocation>();
  let boostDone = !options.triggerNear;
  // Trigger near: every priority-1 node gets its normal demand first; the near gauge then takes its extra only from
  // the capacity left on its lane, before priority 2 to 4 are served. No other life-safety gauge loses anything.
  const applyBoost = () => {
    boostDone = true;
    const gauge = byId.get(SENSORS.find(item => item.near)?.id ?? "");
    if (!gauge) return;
    gauge.boosted = true; gauge.demand = NEAR_DEMAND;
    if (gauge.link && gauge.state !== "offline") {
      const extra = Math.min(NEAR_DEMAND - gauge.allocated, remaining[gauge.link]);
      if (extra > 0) { gauge.allocated += extra; remaining[gauge.link] -= extra; used[gauge.link] += extra; }
      gauge.state = gauge.allocated >= NEAR_DEMAND ? "delivered" : gauge.allocated > 0 ? "reduced" : "held";
    }
  };
  for (const { node } of order) {
    if (!boostDone && node.priority > 1) applyBoost();
    const demand = node.demand;
    const other: LinkId = node.primary === "ground" ? "satellite" : "ground";
    const candidates = [node.primary, other].filter(link => up[link]);
    let link: LinkId | null = null; let allocated = 0; let state: NodeState;
    if (candidates.length === 0) { state = "offline"; }
    else {
      const full = candidates.find(candidate => remaining[candidate] >= demand);
      if (full) { link = full; allocated = demand; state = "delivered"; }
      else {
        const roomiest = candidates.reduce((best, candidate) => remaining[candidate] > remaining[best] ? candidate : best, candidates[0]);
        const floor = Math.ceil(demand / 4);
        if (node.priority <= 3 && remaining[roomiest] >= floor) { link = roomiest; allocated = remaining[roomiest]; state = "reduced"; }
        else { link = candidates[0]; state = "held"; }
      }
    }
    if (link && allocated > 0) { remaining[link] -= allocated; used[link] += allocated; }
    byId.set(node.id, { node, link, demand, allocated, state, boosted: false, moved: Boolean(link && allocated > 0 && link !== node.primary) });
  }
  if (!boostDone) applyBoost();
  const nodes = SENSORS.map(node => byId.get(node.id) as NodeAllocation);
  const count = (state: NodeState) => nodes.filter(item => item.state === state).length;
  return {
    scenario, nodes,
    lanes: { ground: { up: up.ground, capacity: scenario.ground.capacity, used: used.ground }, satellite: { up: up.satellite, capacity: scenario.satellite.capacity, used: used.satellite } },
    totals: { delivered: count("delivered"), reduced: count("reduced"), held: count("held"), offline: count("offline"), moved: nodes.filter(item => item.moved).length, movedToSatellite: nodes.filter(item => item.moved && item.link === "satellite").length,
      demand: nodes.reduce((sum, item) => sum + item.demand, 0), allocated: nodes.reduce((sum, item) => sum + item.allocated, 0) },
  };
}

/** Fixed sentence parts for the status line, so each can be translated. Numbers are put in front by summarise(). */
export const SUMMARY_TEXTS = {
  normal: "All links up.", ground_degraded: "Ground network degraded.", ground_cut: "Ground network cut.", satellite_reduced: "Satellite only, at reduced capacity.",
  both_down: "No link. Readings are buffered at the sensor until a link returns.",
  movedOne: "sensor moved to satellite.", movedMany: "sensors moved to satellite.",
  reducedOne: "sensor reduced to the capacity left.", reducedMany: "sensors reduced to the capacity left.",
  heldOne: "lower-priority feed held until capacity returns.", heldMany: "lower-priority feeds held until capacity returns.",
  nothingHeld: "Nothing held.",
} as const;

/** One plain, complete sentence group for the status line. `t` translates each fixed part. */
export function summarise(result: AllocationResult, t: (text: string) => string = text => text): string {
  const { scenario, totals } = result;
  if (!scenario.ground.up && !scenario.satellite.up) return t(SUMMARY_TEXTS.both_down);
  const counted = (n: number, one: string, many: string) => n > 0 ? ` ${n} ${t(n === 1 ? one : many)}` : "";
  return t(SUMMARY_TEXTS[scenario.id])
    + counted(totals.movedToSatellite, SUMMARY_TEXTS.movedOne, SUMMARY_TEXTS.movedMany)
    + counted(totals.reduced, SUMMARY_TEXTS.reducedOne, SUMMARY_TEXTS.reducedMany)
    + (totals.held > 0 ? counted(totals.held, SUMMARY_TEXTS.heldOne, SUMMARY_TEXTS.heldMany) : " " + t(SUMMARY_TEXTS.nothingHeld));
}

/** The communication application: which link each in-app party would use. Illustrative only; nothing is sent. */
export const COMM_PARTIES = [
  { id: "cr", name: "Control room", kind: "Control room" },
  { id: "d1", name: "Synthetic health department desk", kind: "Department desk" },
  { id: "d2", name: "Synthetic municipal works desk", kind: "Department desk" },
  { id: "t1", name: "Synthetic rescue team 01", kind: "Field team" },
  { id: "t2", name: "Synthetic medical team 01", kind: "Field team" },
  { id: "t3", name: "Synthetic fire team 01", kind: "Field team" },
  { id: "t4", name: "Synthetic municipal works team 01", kind: "Field team" },
] as const;
export type CommLink = LinkId | "none";
/** Every party follows the lane state the same way: ground while it is up, then satellite, then no link. */
export function commLink(_partyId: string, scenario: Scenario): CommLink {
  if (scenario.ground.up) return "ground";
  return scenario.satellite.up ? "satellite" : "none";
}
