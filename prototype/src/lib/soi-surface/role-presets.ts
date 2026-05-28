/**
 * SOI Surface — Role Presets
 *
 * Per soi-spec-new.md Section 6.
 * Each role ships with an opinionated default layout.
 */

import type { LayoutState, RoleId, ModuleInstance, SlotId } from './layout-state';

// ============================================================
// PRESET DEFINITIONS
// ============================================================

function m(moduleId: string, size: 'compact' | 'normal' | 'expanded' = 'normal', emphasized = false): ModuleInstance {
  return { moduleId, size, emphasized };
}

const CREW_CHIEF_SLOTS: Partial<Record<SlotId, ModuleInstance>> = {
  L1: m('op-snapshot', 'normal', true),
  L2: m('zone-health'),
  L3: m('staffing', 'compact'),
  L4: m('recovery-status', 'normal', true),
  R1: m('op-intelligence'),
  R2: m('equipment-roster'),
  R3: m('crew-assignments', 'compact'),
  R4: m('recommended-next', 'compact'),
  U1: m('incident-timeline', 'compact'),
};

const RAMP_MANAGER_SLOTS: Partial<Record<SlotId, ModuleInstance>> = {
  L1: m('all-zones', 'normal', true),
  L2: m('workforce-dist', 'normal', true),
  L3: m('recovery-coord'),
  L4: m('resource-utilization', 'compact'),
  R1: m('op-intelligence'),
  R2: m('cross-zone-forecast'),
  R3: m('equipment-roster'),
  R4: m('inbound-surge', 'compact'),
  U1: m('incident-timeline', 'compact'),
  U2: m('audit-trail', 'compact'),
};

const DISPATCHER_SLOTS: Partial<Record<SlotId, ModuleInstance>> = {
  L1: m('assignment-queue', 'normal', true),
  L2: m('flight-schedule', 'normal', true),
  L3: m('resource-movement'),
  L4: m('equipment-availability', 'compact'),
  R1: m('pending-dispatches', 'normal', true),
  R2: m('inbound-coord'),
  R3: m('coordination-msgs'),
  R4: m('gate-conflicts', 'compact'),
  U1: m('quick-kpi-ribbon', 'compact'),
  U2: m('notification-stream', 'compact'),
};

const EXECUTIVE_SLOTS: Partial<Record<SlotId, ModuleInstance>> = {
  L1: m('kpi-strip', 'normal', true),
  L2: m('throughput'),
  L3: m('stabilization-forecast', 'normal', true),
  L4: m('historical-trend', 'compact'),
  R1: m('predictive-summary', 'normal', true),
  R2: m('cross-station'),
  R3: m('cost-impact'),
  R4: m('governance-audit', 'compact'),
  U1: m('quick-kpi-ribbon', 'compact'),
};

const PRESETS: Record<RoleId, Partial<Record<SlotId, ModuleInstance>>> = {
  crew_chief: CREW_CHIEF_SLOTS,
  ramp_manager: RAMP_MANAGER_SLOTS,
  dispatcher: DISPATCHER_SLOTS,
  executive: EXECUTIVE_SLOTS,
};

// ============================================================
// PUBLIC API
// ============================================================

export function getRolePreset(role: RoleId): Partial<Record<SlotId, ModuleInstance>> {
  return PRESETS[role] ?? CREW_CHIEF_SLOTS;
}

export function createDefaultLayout(userId: string, role: RoleId, stationId: string): LayoutState {
  return {
    userId,
    role,
    stationId,
    layoutName: 'Default',
    slots: { ...getRolePreset(role) },
    lastModified: Date.now(),
  };
}

export const ROLE_LABELS: Record<RoleId, string> = {
  crew_chief: 'Crew Chief',
  ramp_manager: 'Ramp Manager',
  dispatcher: 'Dispatcher',
  executive: 'Executive',
};
