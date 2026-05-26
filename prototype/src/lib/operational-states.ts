// RampIQ — Canonical Operational Language
// Phase 1 Step 1: Single source of truth for all operational semantics.
//
// RULES:
//   1. Every operational surface imports state definitions from HERE.
//   2. No string literals for states, severities, or lifecycles elsewhere.
//   3. Transition validators are pure functions — no side effects.
//   4. Color mappings live here — not in page components.
//   5. All functions accept optional `asOf` timestamp for replay.
//
// This module defines WHAT states exist and WHICH transitions are valid.
// It does NOT define HOW states are rendered (that's component work).
// It does NOT fetch data or call APIs (that's store.ts work).

// ============================================================
// SEVERITY
// ============================================================

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Numeric rank: lower = more severe. Used for sorting and comparison. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/** CSS custom property name for each severity. */
export const SEVERITY_CSS_VAR: Record<Severity, string> = {
  CRITICAL: '--rq-red',
  HIGH: '--rq-red',
  MEDIUM: '--rq-amber',
  LOW: '--rq-ink-3',
};

/** Resolve severity to a hex color value (for inline styles / charts). */
export const SEVERITY_HEX: Record<Severity, string> = {
  CRITICAL: '#e5484d',
  HIGH: '#e5484d',
  MEDIUM: '#e8a13a',
  LOW: '#6b7280',
};

export function isMoreSevere(a: Severity, b: Severity): boolean {
  return SEVERITY_RANK[a] < SEVERITY_RANK[b];
}

export function maxSeverity(severities: Severity[]): Severity | null {
  if (severities.length === 0) return null;
  return severities.reduce((max, s) => (isMoreSevere(s, max) ? s : max));
}

// ============================================================
// OPERATIONAL STATUS (Event lifecycle)
// ============================================================

export type OperationalStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CANCELLED';

export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CANCELLED: 'Cancelled',
};

const OPERATIONAL_STATUS_TRANSITIONS: Record<OperationalStatus, OperationalStatus[]> = {
  OPEN:          ['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  ACKNOWLEDGED:  ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS:   ['RESOLVED', 'CANCELLED'],
  RESOLVED:      [], // terminal
  CANCELLED:     [], // terminal
};

// ============================================================
// ASSIGNMENT LIFECYCLE
// ============================================================

export type AssignmentStatus =
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'EN_ROUTE'
  | 'ACTIVE'
  | 'DELAYED'
  | 'COMPLETE'
  | 'OVERRIDDEN'
  | 'CANCELLED';

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  ASSIGNED: 'Assigned',
  ACKNOWLEDGED: 'Acknowledged',
  EN_ROUTE: 'En Route',
  ACTIVE: 'Active',
  DELAYED: 'Delayed',
  COMPLETE: 'Complete',
  OVERRIDDEN: 'Overridden',
  CANCELLED: 'Cancelled',
};

const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  ASSIGNED:     ['ACKNOWLEDGED', 'CANCELLED', 'OVERRIDDEN'],
  ACKNOWLEDGED: ['EN_ROUTE', 'ACTIVE', 'CANCELLED', 'OVERRIDDEN'],
  EN_ROUTE:     ['ACTIVE', 'DELAYED', 'CANCELLED', 'OVERRIDDEN'],
  ACTIVE:       ['DELAYED', 'COMPLETE', 'CANCELLED', 'OVERRIDDEN'],
  DELAYED:      ['ACTIVE', 'COMPLETE', 'CANCELLED', 'OVERRIDDEN'],
  COMPLETE:     [], // terminal
  OVERRIDDEN:   [], // terminal — new assignment created separately
  CANCELLED:    [], // terminal
};

// ============================================================
// SUPPORT REQUEST LIFECYCLE
// ============================================================

export type SupportRequestStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'DISPATCHED'
  | 'EN_ROUTE'
  | 'RESOLVED'
  | 'VERIFIED'
  | 'CANCELLED';

export const SUPPORT_REQUEST_STATUS_LABELS: Record<SupportRequestStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  DISPATCHED: 'Dispatched',
  EN_ROUTE: 'En Route',
  RESOLVED: 'Resolved',
  VERIFIED: 'Verified',
  CANCELLED: 'Cancelled',
};

const SUPPORT_REQUEST_TRANSITIONS: Record<SupportRequestStatus, SupportRequestStatus[]> = {
  OPEN:         ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['DISPATCHED', 'RESOLVED', 'CANCELLED'],
  DISPATCHED:   ['EN_ROUTE', 'RESOLVED', 'CANCELLED'],
  EN_ROUTE:     ['RESOLVED', 'CANCELLED'],
  RESOLVED:     ['VERIFIED'],
  VERIFIED:     [], // terminal
  CANCELLED:    [], // terminal
};

// ============================================================
// INCIDENT LIFECYCLE
// ============================================================

export type IncidentStatus =
  | 'DETECTED'
  | 'CONFIRMED'
  | 'RECOVERING'
  | 'STABILIZED'
  | 'RESOLVED'
  | 'CLOSED';

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  DETECTED: 'Detected',
  CONFIRMED: 'Confirmed',
  RECOVERING: 'Recovering',
  STABILIZED: 'Stabilized',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  DETECTED:   ['CONFIRMED', 'RESOLVED'], // false alarm → straight to resolved
  CONFIRMED:  ['RECOVERING'],
  RECOVERING: ['STABILIZED', 'RESOLVED'],
  STABILIZED: ['RESOLVED'],
  RESOLVED:   ['CLOSED'],
  CLOSED:     [], // terminal
};

// ============================================================
// RECOVERY ACTION LIFECYCLE
// ============================================================

export type RecoveryActionStatus =
  | 'PROPOSED'
  | 'ACKNOWLEDGED'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'COMPLETE'
  | 'ESCALATED'
  | 'WITHDRAWN';

export const RECOVERY_ACTION_STATUS_LABELS: Record<RecoveryActionStatus, string> = {
  PROPOSED: 'Proposed',
  ACKNOWLEDGED: 'Acknowledged',
  ACTIVE: 'Active',
  BLOCKED: 'Blocked',
  COMPLETE: 'Complete',
  ESCALATED: 'Escalated',
  WITHDRAWN: 'Withdrawn',
};

const RECOVERY_ACTION_TRANSITIONS: Record<RecoveryActionStatus, RecoveryActionStatus[]> = {
  PROPOSED:     ['ACKNOWLEDGED', 'WITHDRAWN'],
  ACKNOWLEDGED: ['ACTIVE', 'WITHDRAWN'],
  ACTIVE:       ['BLOCKED', 'COMPLETE', 'ESCALATED'],
  BLOCKED:      ['ACTIVE', 'ESCALATED', 'WITHDRAWN'],
  COMPLETE:     [], // terminal
  ESCALATED:    [], // terminal — handled at higher level
  WITHDRAWN:    [], // terminal
};

// ============================================================
// EQUIPMENT OPERATIONAL STATE
// ============================================================

export type EquipmentStatus =
  | 'AVAILABLE'
  | 'ASSIGNED'
  | 'IN_USE'
  | 'DEGRADED'
  | 'FAILED'
  | 'MAINTENANCE';

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  AVAILABLE: 'Available',
  ASSIGNED: 'Assigned',
  IN_USE: 'In Use',
  DEGRADED: 'Degraded',
  FAILED: 'Failed',
  MAINTENANCE: 'Maintenance',
};

const EQUIPMENT_TRANSITIONS: Record<EquipmentStatus, EquipmentStatus[]> = {
  AVAILABLE:   ['ASSIGNED', 'DEGRADED', 'FAILED', 'MAINTENANCE'],
  ASSIGNED:    ['IN_USE', 'AVAILABLE', 'FAILED'],
  IN_USE:      ['AVAILABLE', 'DEGRADED', 'FAILED'],
  DEGRADED:    ['AVAILABLE', 'FAILED', 'MAINTENANCE'],
  FAILED:      ['MAINTENANCE'],
  MAINTENANCE: ['AVAILABLE', 'DEGRADED'],
};

// ============================================================
// GATE STATE (derived, never stored)
// ============================================================
// Gate state is ALWAYS computed from events + flight status.
// This enum defines the vocabulary, not a stored value.

export type GateState =
  | 'EMPTY'
  | 'OCCUPIED'
  | 'WATCH'
  | 'AT_RISK'
  | 'BLOCKED'
  | 'RECOVERING'
  | 'STABILIZED';

export const GATE_STATE_LABELS: Record<GateState, string> = {
  EMPTY: 'Empty',
  OCCUPIED: 'Occupied',
  WATCH: 'Watch',
  AT_RISK: 'At Risk',
  BLOCKED: 'Blocked',
  RECOVERING: 'Recovering',
  STABILIZED: 'Stabilized',
};

// ============================================================
// ENTITY TYPES (what operational events can target)
// ============================================================

export type EntityType =
  | 'gate'
  | 'equipment'
  | 'flight'
  | 'support_request'
  | 'incident'
  | 'recovery_action'
  | 'assignment'
  | 'zone'
  | 'station'
  | 'user';

// ============================================================
// EVENT TYPE TAXONOMY
// ============================================================
// Canonical event type strings using domain.verb convention.
// Organized by operational domain for clarity.

export const EVENT_TYPES = {
  // Service operations
  SERVICE_STARTED:     'service.started',
  SERVICE_CONFIRMED:   'service.confirmed',

  // Support requests
  SUPPORT_CREATED:     'support.created',
  SUPPORT_ACKNOWLEDGED:'support.acknowledged',
  SUPPORT_DISPATCHED:  'support.dispatched',
  SUPPORT_RESOLVED:    'support.resolved',
  SUPPORT_VERIFIED:    'support.verified',

  // Incidents
  INCIDENT_DETECTED:   'incident.detected',
  INCIDENT_CONFIRMED:  'incident.confirmed',
  INCIDENT_RECOVERING: 'incident.recovering',
  INCIDENT_STABILIZED: 'incident.stabilized',
  INCIDENT_RESOLVED:   'incident.resolved',
  INCIDENT_CLOSED:     'incident.closed',

  // Recovery actions
  RECOVERY_PROPOSED:     'recovery_action.proposed',
  RECOVERY_ACKNOWLEDGED: 'recovery_action.acknowledged',
  RECOVERY_ACTIVE:       'recovery_action.active',
  RECOVERY_BLOCKED:      'recovery_action.blocked',
  RECOVERY_COMPLETE:     'recovery_action.complete',
  RECOVERY_ESCALATED:    'recovery_action.escalated',
  RECOVERY_WITHDRAWN:    'recovery_action.withdrawn',

  // Assignments
  ASSIGNMENT_CREATED:      'assignment.created',
  ASSIGNMENT_ACKNOWLEDGED: 'assignment.acknowledged',
  ASSIGNMENT_EN_ROUTE:     'assignment.en_route',
  ASSIGNMENT_ACTIVE:       'assignment.active',
  ASSIGNMENT_DELAYED:      'assignment.delayed',
  ASSIGNMENT_COMPLETE:     'assignment.complete',
  ASSIGNMENT_OVERRIDDEN:   'assignment.overridden',
  ASSIGNMENT_CANCELLED:    'assignment.cancelled',

  // Equipment
  EQUIPMENT_ASSIGNED:  'equipment.assigned',
  EQUIPMENT_DEGRADED:  'equipment.degraded',
  EQUIPMENT_FAILED:    'equipment.failed',
  EQUIPMENT_REPAIRED:  'equipment.repaired',

  // Ownership / coordination
  INCIDENT_REASSIGNED:         'incident.reassigned',
  INCIDENT_ESCALATED_UP:       'incident.escalated_up',
  INCIDENT_OWNERSHIP_ASSIGNED: 'incident.ownership_assigned',
  INCIDENT_HANDOFF_REQUESTED:  'incident.handoff_requested',
  INCIDENT_HANDOFF_ACCEPTED:   'incident.handoff_accepted',
  RECOVERY_REASSIGNED:         'recovery_action.reassigned',
  OWNERSHIP_TRANSFERRED:       'ownership.transferred',
  ACKNOWLEDGMENT_TRANSFER:     'acknowledgment.transfer',

  // Escalation actions
  ESCALATION_REQUESTED:        'escalation.requested',
  ESCALATION_ACKNOWLEDGED:     'escalation.acknowledged',
  ESCALATION_DISMISSED:        'escalation.dismissed',

  // Position / scanning
  GATE_SCANNED:    'gate.scanned',
  POSITION_CHECKIN:'position.checkin',

  // Configuration
  CONFIG_UPDATED:  'config.updated',
} as const;

export type EventTypeCode = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ============================================================
// OPERATIONAL ROLES
// ============================================================

export type OperationalRole =
  | 'RAMP_AGENT'
  | 'CREW_CHIEF'
  | 'REGIONAL_CABIN'
  | 'LT_RUNNER'
  | 'LAV_TECH'
  | 'BAG_ROOM';

export const ROLE_LABELS: Record<OperationalRole, string> = {
  RAMP_AGENT: 'Ramp Agent',
  CREW_CHIEF: 'Crew Chief',
  REGIONAL_CABIN: 'Regional Cabin',
  LT_RUNNER: 'LT / Runner',
  LAV_TECH: 'LAV Tech',
  BAG_ROOM: 'Bag Room',
};

// ============================================================
// SHIFT WINDOWS
// ============================================================

export type ShiftWindow = 'AM' | 'PM' | 'OVERNIGHT';

export const SHIFT_LABELS: Record<ShiftWindow, string> = {
  AM: 'AM Shift',
  PM: 'PM Shift',
  OVERNIGHT: 'Overnight',
};

// ============================================================
// UNIFIED TRANSITION VALIDATOR
// ============================================================

type LifecycleType =
  | 'operational_status'
  | 'assignment'
  | 'support_request'
  | 'incident'
  | 'recovery_action'
  | 'equipment';

const TRANSITION_MAPS: Record<LifecycleType, Record<string, string[]>> = {
  operational_status: OPERATIONAL_STATUS_TRANSITIONS,
  assignment:         ASSIGNMENT_TRANSITIONS,
  support_request:    SUPPORT_REQUEST_TRANSITIONS,
  incident:           INCIDENT_TRANSITIONS,
  recovery_action:    RECOVERY_ACTION_TRANSITIONS,
  equipment:          EQUIPMENT_TRANSITIONS,
};

/**
 * Validate whether a state transition is allowed.
 *
 * @returns true if the transition from → to is valid for the given lifecycle.
 *
 * Usage:
 *   isValidTransition('assignment', 'ASSIGNED', 'ACKNOWLEDGED') // true
 *   isValidTransition('assignment', 'COMPLETE', 'ACTIVE')       // false
 */
export function isValidTransition(
  lifecycle: LifecycleType,
  from: string,
  to: string,
): boolean {
  const map = TRANSITION_MAPS[lifecycle];
  if (!map) return false;
  const allowed = map[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Get all valid next states for a given current state.
 *
 * @returns Array of valid target states. Empty array = terminal state.
 */
export function validTransitions(
  lifecycle: LifecycleType,
  from: string,
): string[] {
  const map = TRANSITION_MAPS[lifecycle];
  if (!map) return [];
  return map[from] ?? [];
}

/**
 * Check if a state is terminal (no further transitions possible).
 */
export function isTerminalState(
  lifecycle: LifecycleType,
  state: string,
): boolean {
  return validTransitions(lifecycle, state).length === 0;
}

// ============================================================
// STATUS COLOR MAPPING
// ============================================================
// Canonical color semantics for every lifecycle status.
// Returns a CSS custom property name.

const STATUS_COLOR_MAP: Record<string, string> = {
  // Operational status
  OPEN:           '--rq-red',
  ACKNOWLEDGED:   '--rq-amber',
  IN_PROGRESS:    '--rq-blue',
  RESOLVED:       '--rq-green',
  CANCELLED:      '--rq-ink-4',

  // Assignment
  ASSIGNED:       '--rq-amber',
  // ACKNOWLEDGED shared above
  EN_ROUTE:       '--rq-blue',
  ACTIVE:         '--rq-green',
  DELAYED:        '--rq-red',
  COMPLETE:       '--rq-green',
  OVERRIDDEN:     '--rq-ink-3',
  // CANCELLED shared above

  // Support request (shares most with operational)
  DISPATCHED:     '--rq-blue',
  // EN_ROUTE shared above
  VERIFIED:       '--rq-green',

  // Incident
  DETECTED:       '--rq-red',
  CONFIRMED:      '--rq-red',
  RECOVERING:     '--rq-blue',
  STABILIZED:     '--rq-amber',
  // RESOLVED shared above
  CLOSED:         '--rq-ink-4',

  // Recovery action
  PROPOSED:       '--rq-ink-3',
  // ACKNOWLEDGED shared above
  // ACTIVE shared above
  BLOCKED:        '--rq-red',
  // COMPLETE shared above
  ESCALATED:      '--rq-red',
  WITHDRAWN:      '--rq-ink-4',

  // Equipment
  AVAILABLE:      '--rq-green',
  // ASSIGNED shared above
  IN_USE:         '--rq-blue',
  DEGRADED:       '--rq-amber',
  FAILED:         '--rq-red',
  MAINTENANCE:    '--rq-amber',

  // Gate (derived)
  EMPTY:          '--rq-ink-4',
  OCCUPIED:       '--rq-blue',
  WATCH:          '--rq-amber',
  AT_RISK:        '--rq-red',
  // BLOCKED shared above
  // RECOVERING shared above
  // STABILIZED shared above
};

/**
 * Get the CSS custom property name for a status value.
 * Works across all lifecycle types — status names are intentionally
 * unique enough to avoid ambiguity.
 *
 * @returns CSS custom property name (e.g., '--rq-red') or '--rq-ink-3' as fallback.
 */
export function statusCssVar(status: string): string {
  return STATUS_COLOR_MAP[status] ?? '--rq-ink-3';
}

/** Resolve a status to its hex color value directly. */
const CSS_VAR_TO_HEX: Record<string, string> = {
  '--rq-red':   '#e5484d',
  '--rq-amber': '#e8a13a',
  '--rq-green': '#46c87e',
  '--rq-blue':  '#4a9aef',
  '--rq-ink-3': '#5a6371',
  '--rq-ink-4': '#3d4654',
};

export function statusHex(status: string): string {
  const cssVar = statusCssVar(status);
  return CSS_VAR_TO_HEX[cssVar] ?? '#5a6371';
}

// ============================================================
// PRESSURE DERIVATION
// ============================================================
// Pressure thresholds — used by gate state derivation and zone displays.

export const PRESSURE_THRESHOLDS = {
  /** Below this: green / nominal */
  NOMINAL: 40,
  /** Below this: amber / elevated */
  ELEVATED: 65,
  /** Below this: red / high */
  HIGH: 80,
  /** At or above: critical */
  CRITICAL: 80,
} as const;

export function pressureSeverity(pressure: number): Severity {
  if (pressure >= PRESSURE_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (pressure >= PRESSURE_THRESHOLDS.ELEVATED) return 'MEDIUM';
  if (pressure >= PRESSURE_THRESHOLDS.NOMINAL) return 'LOW';
  return 'LOW';
}

export function pressureCssVar(pressure: number): string {
  if (pressure >= PRESSURE_THRESHOLDS.CRITICAL) return '--rq-red';
  if (pressure >= PRESSURE_THRESHOLDS.ELEVATED) return '--rq-amber';
  return '--rq-green';
}

// ============================================================
// EVENT AGE CLASSIFICATION
// ============================================================
// How old an unresolved event is determines its visual urgency.

export type AgeClass = 'fresh' | 'warm' | 'hot' | 'stale';

export function classifyAge(createdAt: string, asOf?: Date): AgeClass {
  const now = asOf ?? new Date();
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  const ageMins = ageMs / 60_000;

  if (ageMins < 5) return 'fresh';
  if (ageMins < 15) return 'warm';
  if (ageMins < 30) return 'hot';
  return 'stale';
}

export const AGE_CLASS_CSS_VAR: Record<AgeClass, string> = {
  fresh: '--rq-green',
  warm:  '--rq-amber',
  hot:   '--rq-red',
  stale: '--rq-red',
};

// ============================================================
// ELAPSED TIME FORMATTING
// ============================================================
// Pure functions — accept optional `asOf` for replay compatibility.

export function elapsedLabel(createdAt: string, asOf?: Date): string {
  const now = asOf ?? new Date();
  const ms = now.getTime() - new Date(createdAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function elapsedSeconds(createdAt: string, asOf?: Date): number {
  const now = asOf ?? new Date();
  return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 1000));
}

export function formatElapsedCompact(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// ============================================================
// REPLAY ORDERING
// ============================================================

/**
 * Get the canonical timestamp for replay ordering.
 * Prefers offline_created_at (when the event actually happened)
 * over created_at (when it was synced to the server).
 */
export function replayTimestamp(event: {
  created_at: string;
  offline_created_at?: string | null;
}): string {
  return event.offline_created_at ?? event.created_at;
}

/**
 * Sort events in replay order (chronological by actual occurrence).
 * Stable sort: events with the same timestamp preserve insertion order.
 */
export function sortForReplay<T extends { created_at: string; offline_created_at?: string | null }>(
  events: T[],
): T[] {
  return [...events].sort((a, b) => {
    const ta = new Date(replayTimestamp(a)).getTime();
    const tb = new Date(replayTimestamp(b)).getTime();
    return ta - tb;
  });
}

// ============================================================
// BACKWARD COMPATIBILITY ALIASES
// ============================================================
// The existing rampiq-types.ts exports these names.
// Pages that haven't migrated yet can continue importing from there.
// New code should import from this module.

// Legacy assignment statuses still used in store.ts
export type LegacyAssignmentStatus =
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'EN_ROUTE'
  | 'IN_PROGRESS'  // → maps to ACTIVE
  | 'COMPLETE'
  | 'ISSUE_REPORTED' // → maps to DELAYED
  | 'CANCELLED';

/** Map legacy assignment status to canonical status. */
export function canonicalAssignmentStatus(legacy: string): AssignmentStatus {
  const map: Record<string, AssignmentStatus> = {
    IN_PROGRESS: 'ACTIVE',
    ISSUE_REPORTED: 'DELAYED',
  };
  return (map[legacy] ?? legacy) as AssignmentStatus;
}

/** Map canonical assignment status back to legacy for database compat. */
export function legacyAssignmentStatus(canonical: AssignmentStatus): string {
  const map: Record<string, string> = {
    ACTIVE: 'IN_PROGRESS',
    DELAYED: 'ISSUE_REPORTED',
    OVERRIDDEN: 'CANCELLED', // closest legacy equivalent
  };
  return map[canonical] ?? canonical;
}
