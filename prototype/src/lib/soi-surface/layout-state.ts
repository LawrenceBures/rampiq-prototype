/**
 * SOI Surface — Layout State Model
 *
 * Defines the slot/anchor/module architecture per soi-spec-new.md.
 * Layouts are keyed by (userId, role, stationId, layoutName).
 */

// ============================================================
// TYPES
// ============================================================

export type SlotId = 'L1' | 'L2' | 'L3' | 'L4' | 'R1' | 'R2' | 'R3' | 'R4' | 'U1' | 'U2';
export type SlotRegion = 'L' | 'R' | 'U';
export type ModuleSize = 'compact' | 'normal' | 'expanded';
export type LayoutName = 'Default' | 'Operational' | 'Focus' | 'Crisis' | 'Personal Custom';
export type RoleId = 'crew_chief' | 'ramp_manager' | 'dispatcher' | 'executive';

export interface ModuleInstance {
  moduleId: string;
  size: ModuleSize;
  emphasized: boolean;
}

export interface LayoutState {
  userId: string;
  role: RoleId;
  stationId: string;
  layoutName: LayoutName;
  slots: Partial<Record<SlotId, ModuleInstance>>;
  lastModified: number;
}

// ============================================================
// SLOT METADATA
// ============================================================

export const SLOT_REGIONS: Record<SlotId, SlotRegion> = {
  L1: 'L', L2: 'L', L3: 'L', L4: 'L',
  R1: 'R', R2: 'R', R3: 'R', R4: 'R',
  U1: 'U', U2: 'U',
};

export const LEFT_SLOTS: SlotId[] = ['L1', 'L2', 'L3', 'L4'];
export const RIGHT_SLOTS: SlotId[] = ['R1', 'R2', 'R3', 'R4'];
export const UTILITY_SLOTS: SlotId[] = ['U1', 'U2'];
export const ALL_SLOTS: SlotId[] = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...UTILITY_SLOTS];

// ============================================================
// MODULE REGISTRY
// ============================================================

export interface ModuleDefinition {
  id: string;
  name: string;
  allowedRegions: SlotRegion[];
  defaultSize: ModuleSize;
  category: 'core' | 'dispatch' | 'executive' | 'utility' | 'optional';
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  // Core Operational
  { id: 'op-snapshot', name: 'Operational Snapshot', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'zone-health', name: 'Zone Health', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'staffing', name: 'Staffing', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'core' },
  { id: 'recovery-status', name: 'Recovery Status', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'op-intelligence', name: 'Operational Intelligence', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'recovery-confidence', name: 'Recovery Confidence', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'recommended-next', name: 'Recommended Next', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'core' },
  { id: 'workforce-dist', name: 'Workforce Distribution', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'all-zones', name: 'All Zones Overview', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'recovery-coord', name: 'Recovery Coordination', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  { id: 'cross-zone-forecast', name: 'Cross-Zone Forecast', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'core' },
  // Dispatch
  { id: 'assignment-queue', name: 'Assignment Queue', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'dispatch' },
  { id: 'flight-schedule', name: 'Flight Schedule', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'dispatch' },
  { id: 'resource-movement', name: 'Resource Movement', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'dispatch' },
  { id: 'pending-dispatches', name: 'Pending Dispatches', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'dispatch' },
  { id: 'inbound-coord', name: 'Inbound Coordination', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'dispatch' },
  { id: 'equipment-availability', name: 'Equipment Availability', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'dispatch' },
  { id: 'coordination-msgs', name: 'Coordination Messages', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'dispatch' },
  { id: 'gate-conflicts', name: 'Gate Conflicts', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'dispatch' },
  // Executive
  { id: 'kpi-strip', name: 'KPI Strip', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  { id: 'throughput', name: 'Throughput', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  { id: 'stabilization-forecast', name: 'Stabilization Forecast', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  { id: 'historical-trend', name: 'Historical Trend', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'executive' },
  { id: 'predictive-summary', name: 'Predictive Summary', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  { id: 'cross-station', name: 'Cross-Station Status', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  { id: 'cost-impact', name: 'Cost Impact', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  { id: 'governance-audit', name: 'Governance & Audit', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'executive' },
  // Utility
  { id: 'incident-timeline', name: 'Incident Timeline', allowedRegions: ['U'], defaultSize: 'compact', category: 'utility' },
  { id: 'audit-trail', name: 'Audit Trail', allowedRegions: ['U'], defaultSize: 'normal', category: 'utility' },
  { id: 'quick-kpi-ribbon', name: 'Quick KPI Ribbon', allowedRegions: ['U'], defaultSize: 'compact', category: 'utility' },
  { id: 'notification-stream', name: 'Notification Stream', allowedRegions: ['U'], defaultSize: 'compact', category: 'utility' },
  // Optional
  { id: 'weather-impact', name: 'Weather Impact', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'optional' },
  { id: 'incident-history', name: 'Incident History', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'optional' },
  { id: 'equipment-roster', name: 'Equipment Roster', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'optional' },
  { id: 'resource-utilization', name: 'Resource Utilization', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'optional' },
  { id: 'inbound-surge', name: 'Inbound Surge', allowedRegions: ['L', 'R'], defaultSize: 'compact', category: 'optional' },
  { id: 'crew-assignments', name: 'Crew Assignments', allowedRegions: ['L', 'R'], defaultSize: 'normal', category: 'optional' },
];

export function getModuleDef(moduleId: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find(m => m.id === moduleId);
}

// ============================================================
// PERSISTENCE
// ============================================================

const LS_KEY = 'soi_layout_state';

export function saveLayout(layout: LayoutState): void {
  if (typeof window === 'undefined') return;
  try {
    const all = loadAllLayouts();
    const key = `${layout.userId}:${layout.role}:${layout.stationId}:${layout.layoutName}`;
    all[key] = layout;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* */ }
}

export function loadLayout(userId: string, role: RoleId, stationId: string, layoutName: LayoutName): LayoutState | null {
  if (typeof window === 'undefined') return null;
  try {
    const all = loadAllLayouts();
    return all[`${userId}:${role}:${stationId}:${layoutName}`] ?? null;
  } catch { return null; }
}

function loadAllLayouts(): Record<string, LayoutState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function getLastUsedLayoutName(userId: string, role: RoleId, stationId: string): LayoutName {
  if (typeof window === 'undefined') return 'Default';
  try {
    return (localStorage.getItem(`soi_last_layout:${userId}:${role}:${stationId}`) as LayoutName) ?? 'Default';
  } catch { return 'Default'; }
}

export function setLastUsedLayoutName(userId: string, role: RoleId, stationId: string, name: LayoutName): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`soi_last_layout:${userId}:${role}:${stationId}`, name);
}
