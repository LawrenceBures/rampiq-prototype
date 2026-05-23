// RampIQ — Gate definitions, equipment roster, and type helpers.
// NO hardcoded timelines. All operational state comes from events.

export type GateStatus = 'on-track' | 'watch' | 'at-risk' | 'delayed' | 'complete';
export type BagStatus = 'active' | 'unload-initiated' | 'transfer-delayed' | 'cart-shortage' | 'load-complete' | 'off-gate';
export type EquipSeverity = 'watch' | 'needs-attention' | 'out-of-service';
export type EquipIssueType = 'wont-start' | 'belt-not-moving' | 'hydraulic' | 'battery' | 'unsafe-damaged' | 'missing' | 'other';

// ——————————————————————————————
// GATE DEFINITIONS (9 gates, no state — state comes from events)
// ——————————————————————————————
export interface GateDefinition {
  id: string;
  flight: string;
  aircraft: string;
  route: string;
}

export const GATE_DEFS: GateDefinition[] = [
  { id: '52A', flight: 'AA1318', aircraft: 'B737', route: 'DFW → ORD' },
  { id: '52B', flight: 'AA1350', aircraft: 'A321', route: 'DFW → LAX' },
  { id: '52C', flight: 'WN1334', aircraft: 'B738', route: 'DFW → DEN' },
  { id: '52D', flight: 'AA2201', aircraft: 'B739', route: 'DFW → SFO' },
  { id: '52E', flight: 'UA0418', aircraft: 'A319', route: 'DFW → EWR' },
  { id: '52F', flight: 'AA0917', aircraft: 'B738', route: 'DFW → MIA' },
  { id: '52G', flight: 'DL1144', aircraft: 'A321', route: 'DFW → ATL' },
  { id: '52H', flight: 'WN2280', aircraft: 'B737', route: 'DFW → PHX' },
  { id: '52I', flight: 'AA1042', aircraft: 'B738', route: 'DFW → SEA' },
];

// ——————————————————————————————
// COMPUTED GATE STATE (derived from events)
// ——————————————————————————————
export interface GateState {
  id: string;
  flight: string;
  aircraft: string;
  route: string;
  status: GateStatus;
  arrivalReady: boolean;
  departureReady: boolean;
  bagSupport: BagStatus | null;
  equipmentIssues: number;
  activeFlags: string[];
  timeline: { time: string; event: string }[];
}

// ——————————————————————————————
// EQUIPMENT ROSTER
// ——————————————————————————————
export interface Equipment {
  id: string;
  type: string;
  location: string;
}

export const EQUIPMENT: Equipment[] = [
  { id: 'BL-201', type: 'Belt Loader', location: 'Depot 1 · Concourse A' },
  { id: 'BL-204', type: 'Belt Loader', location: 'Depot 1 · Concourse D' },
  { id: 'BL-207', type: 'Belt Loader', location: 'Depot 2 · Concourse B' },
  { id: 'TG-118', type: 'Tug',         location: 'Depot 2 · Concourse B' },
  { id: 'TG-122', type: 'Tug',         location: 'Depot 1 · Concourse A' },
  { id: 'GPU-031', type: 'GPU',        location: 'Depot 1 · Concourse A' },
  { id: 'GPU-044', type: 'GPU',        location: 'Depot 2 · Concourse C' },
  { id: 'BC-015', type: 'Bag Cart',    location: 'Depot 1 · Bagroom' },
  { id: 'BC-019', type: 'Bag Cart',    location: 'Depot 2 · Bagroom' },
  { id: 'LC-008', type: 'Lav Cart',    location: 'Depot 1 · Service' },
  { id: 'AS-003', type: 'Air Start Unit', location: 'Depot 2 · Concourse C' },
];

// ——————————————————————————————
// ISSUE TYPES
// ——————————————————————————————
export const ISSUE_TYPE_LABELS: Record<EquipIssueType, string> = {
  'wont-start': "Won't start",
  'belt-not-moving': 'Belt not moving',
  'hydraulic': 'Hydraulic issue',
  'battery': 'Battery issue',
  'unsafe-damaged': 'Unsafe / damaged',
  'missing': 'Missing from staging area',
  'other': 'Other',
};

export const ISSUE_TYPES: EquipIssueType[] = [
  'wont-start', 'belt-not-moving', 'hydraulic', 'battery',
  'unsafe-damaged', 'missing', 'other',
];

// ——————————————————————————————
// BAG STATUS OPTIONS
// ——————————————————————————————
export const BAG_STATUS_OPTIONS: { value: BagStatus; label: string }[] = [
  { value: 'active', label: 'Bag support active' },
  { value: 'unload-initiated', label: 'Unload initiated' },
  { value: 'transfer-delayed', label: 'Transfer bags delayed' },
  { value: 'cart-shortage', label: 'Cart shortage' },
  { value: 'load-complete', label: 'Load complete' },
  { value: 'off-gate', label: 'Off gate' },
];

// ——————————————————————————————
// CHECKLISTS
// ——————————————————————————————
export const ARRIVAL_CHECKLIST = [
  'Safety huddle completed',
  'Walkaround assigned',
  'FOD walk completed',
  'Jet bridge clear',
  'PPE / wands available',
  'Equipment staged',
  'Wing walkers assigned',
];

export const DEPARTURE_CHECKLIST = [
  'Headset operational',
  'Towbar inspected',
  'Departure path clear',
  'Wing walkers assigned',
  'FOD walk complete',
  'Communication established',
  'Pushback ready',
];

// ——————————————————————————————
// ARRIVAL FLAGS
// ——————————————————————————————
export const ARRIVAL_FLAGS = [
  'Equipment unavailable',
  'Staffing shortage',
  'Late support crew',
  'Bag support delayed',
  'Other operational concern',
];

// ——————————————————————————————
// HELPERS
// ——————————————————————————————
export function getGateDef(gateId: string): GateDefinition | undefined {
  return GATE_DEFS.find((g) => g.id.toLowerCase() === gateId.toLowerCase());
}

export function getEquipment(equipId: string): Equipment | undefined {
  return EQUIPMENT.find((e) => e.id.toLowerCase() === equipId.toLowerCase());
}

export function statusLabel(s: GateStatus): string {
  switch (s) {
    case 'on-track': return 'ON TRACK';
    case 'watch': return 'WATCH';
    case 'at-risk': return 'AT RISK';
    case 'delayed': return 'DELAYED';
    case 'complete': return 'COMPLETE';
  }
}

export function statusPillClass(s: GateStatus): string {
  switch (s) {
    case 'on-track': return 'rq-pill-ready';
    case 'watch': return 'rq-pill-watch';
    case 'at-risk': return 'rq-pill-risk';
    case 'delayed': return 'rq-pill-risk';
    case 'complete': return 'rq-pill-ready';
  }
}

export function statusCardClass(s: GateStatus): string {
  switch (s) {
    case 'on-track': return 's-ready';
    case 'watch': return 's-watch';
    case 'at-risk': return 's-risk';
    case 'delayed': return 's-risk';
    case 'complete': return 's-ready';
  }
}

/** Check whether a flag string is equipment-related */
export function isEquipmentFlag(flag: string): boolean {
  return /equipment|GSE|belt loader|tug|GPU/i.test(flag);
}

export function bagStatusLabel(s: BagStatus | null): string {
  if (!s) return '—';
  const opt = BAG_STATUS_OPTIONS.find((o) => o.value === s);
  return opt ? opt.label.toUpperCase() : s.toUpperCase();
}

export function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}
