// SOI — Institutional Operational Memory
// Phase 12: Cross-shift pattern detection + recurring conditions.
//
// RULES:
//   1. Pure functions — deterministic, replay-safe
//   2. Derives from existing operational memory only
//   3. No separate storage — patterns derived from rampiq_events
//   4. Identifies recurring operational conditions
//   5. Supports shift handoff awareness
//
// The system begins understanding: "this keeps happening."

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { RampiqEvent } from './rampiq-types';

// ============================================================
// TYPES
// ============================================================

export interface RecurringCondition {
  /** What keeps happening */
  condition: string;
  /** Where it happens */
  location: { gate?: string; zone?: string; equipment?: string };
  /** How many times in the analysis window */
  occurrences: number;
  /** Time span of occurrences */
  firstSeen: string;
  lastSeen: string;
  /** Severity distribution */
  severityProfile: Record<string, number>;
  /** Contributing incident IDs */
  incidentIds: string[];
  /** Operational significance */
  significance: 'pattern' | 'persistent' | 'systemic';
}

export interface ShiftHandoff {
  /** Incidents crossing the shift boundary */
  unresolvedIncidents: Incident[];
  /** Active recovery actions crossing boundary */
  activeRecoveryActions: RecoveryAction[];
  /** Escalations not yet resolved */
  openEscalations: number;
  /** Pressure level at handoff */
  pressureAtHandoff: number;
  /** Key context for incoming coordinator */
  handoffNotes: string[];
}

export interface InstitutionalMemoryOutput {
  /** Recurring operational conditions detected */
  recurringConditions: RecurringCondition[];
  /** Shift handoff context */
  shiftHandoff: ShiftHandoff | null;
  /** Operational history depth (how far back data goes) */
  historyDepthHours: number;
}

// ============================================================
// MAIN ENGINE
// ============================================================

/**
 * Derive institutional operational memory from event history.
 * Pure function — deterministic, replay-safe.
 */
export function deriveInstitutionalMemory(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  asOf?: Date,
): InstitutionalMemoryOutput {
  const now = asOf ?? new Date();

  const recurringConditions = detectRecurringConditions(incidents, events, now);
  const shiftHandoff = deriveShiftHandoff(incidents, recoveryActions, events, now);

  // History depth
  const eventTimes = events.map(e => new Date(e.created_at).getTime()).filter(t => t > 0);
  const oldestEvent = eventTimes.length > 0 ? Math.min(...eventTimes) : now.getTime();
  const historyDepthHours = Math.round((now.getTime() - oldestEvent) / 3600_000);

  return { recurringConditions, shiftHandoff, historyDepthHours };
}

// ============================================================
// RECURRING CONDITIONS
// ============================================================

function detectRecurringConditions(
  incidents: readonly Incident[],
  events: readonly RampiqEvent[],
  now: Date,
): RecurringCondition[] {
  const conditions: RecurringCondition[] = [];

  // Gate fragility: gates with 2+ incidents
  const gateIncidents = new Map<string, Incident[]>();
  for (const inc of incidents) {
    if (inc.gate_id) {
      const existing = gateIncidents.get(inc.gate_id) ?? [];
      existing.push(inc);
      gateIncidents.set(inc.gate_id, existing);
    }
  }

  for (const [gate, incs] of gateIncidents) {
    if (incs.length >= 2) {
      const sevProfile: Record<string, number> = {};
      for (const i of incs) sevProfile[i.severity] = (sevProfile[i.severity] ?? 0) + 1;

      conditions.push({
        condition: `Gate ${gate}: ${incs.length} incidents`,
        location: { gate },
        occurrences: incs.length,
        firstSeen: incs.reduce((a, b) => a.opened_at < b.opened_at ? a : b).opened_at,
        lastSeen: incs.reduce((a, b) => a.opened_at > b.opened_at ? a : b).opened_at,
        severityProfile: sevProfile,
        incidentIds: incs.map(i => i.id),
        significance: incs.length >= 4 ? 'systemic' : incs.length >= 3 ? 'persistent' : 'pattern',
      });
    }
  }

  // Equipment bottlenecks: equipment in 2+ events
  const equipEvents = new Map<string, RampiqEvent[]>();
  for (const e of events) {
    if (e.equipment_id) {
      const existing = equipEvents.get(e.equipment_id) ?? [];
      existing.push(e);
      equipEvents.set(e.equipment_id, existing);
    }
  }

  for (const [equip, evts] of equipEvents) {
    if (evts.length >= 2) {
      conditions.push({
        condition: `Equipment ${equip}: ${evts.length} operational events`,
        location: { equipment: equip },
        occurrences: evts.length,
        firstSeen: evts.reduce((a, b) => a.created_at < b.created_at ? a : b).created_at,
        lastSeen: evts.reduce((a, b) => a.created_at > b.created_at ? a : b).created_at,
        severityProfile: {},
        incidentIds: [],
        significance: evts.length >= 4 ? 'systemic' : 'pattern',
      });
    }
  }

  // Zone recurring pressure
  const zonePressure = new Map<string, { incidents: Incident[]; totalSev: number }>();
  for (const inc of incidents) {
    if (inc.zone_id) {
      const entry = zonePressure.get(inc.zone_id) ?? { incidents: [], totalSev: 0 };
      const sevW: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 };
      entry.incidents.push(inc);
      entry.totalSev += sevW[inc.severity] ?? 1;
      zonePressure.set(inc.zone_id, entry);
    }
  }

  for (const [zone, data] of zonePressure) {
    if (data.incidents.length >= 3) {
      conditions.push({
        condition: `Zone ${zone}: repeated pressure (${data.incidents.length} incidents, severity score ${data.totalSev})`,
        location: { zone },
        occurrences: data.incidents.length,
        firstSeen: data.incidents.reduce((a, b) => a.opened_at < b.opened_at ? a : b).opened_at,
        lastSeen: data.incidents.reduce((a, b) => a.opened_at > b.opened_at ? a : b).opened_at,
        severityProfile: {},
        incidentIds: data.incidents.map(i => i.id),
        significance: data.totalSev >= 15 ? 'systemic' : 'persistent',
      });
    }
  }

  return conditions.sort((a, b) => {
    const sigOrder = { systemic: 0, persistent: 1, pattern: 2 };
    return (sigOrder[a.significance] ?? 2) - (sigOrder[b.significance] ?? 2);
  });
}

// ============================================================
// SHIFT HANDOFF
// ============================================================

function deriveShiftHandoff(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  now: Date,
): ShiftHandoff | null {
  const unresolvedIncidents = incidents.filter(i => !i.resolved_at && !i.closed_at);
  if (unresolvedIncidents.length === 0) return null;

  const activeActions = actions.filter(a =>
    !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status)
  );

  const openEscalations = events.filter(e =>
    e.event_type.includes('escalation.requested') &&
    !events.some(ack =>
      ack.event_type.includes('escalation.acknowledged') &&
      ack.entity_id === e.entity_id &&
      new Date(ack.created_at).getTime() > new Date(e.created_at).getTime()
    )
  ).length;

  const sevW: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 };
  const pressure = unresolvedIncidents.reduce((s, i) => s + (sevW[i.severity] ?? 1), 0);

  // Generate handoff notes
  const notes: string[] = [];
  const critical = unresolvedIncidents.filter(i => i.severity === 'CRITICAL');
  if (critical.length > 0) {
    notes.push(`${critical.length} CRITICAL incident${critical.length > 1 ? 's' : ''} active — priority attention needed.`);
  }
  if (activeActions.filter(a => a.status === 'BLOCKED').length > 0) {
    notes.push(`${activeActions.filter(a => a.status === 'BLOCKED').length} recovery action${activeActions.filter(a => a.status === 'BLOCKED').length > 1 ? 's' : ''} currently BLOCKED.`);
  }
  if (openEscalations > 0) {
    notes.push(`${openEscalations} unresolved escalation${openEscalations > 1 ? 's' : ''} pending.`);
  }
  const zones = new Set(unresolvedIncidents.map(i => i.zone_id).filter(Boolean));
  if (zones.size > 1) {
    notes.push(`Pressure spans ${zones.size} zones: ${[...zones].join(', ')}.`);
  }

  return {
    unresolvedIncidents,
    activeRecoveryActions: activeActions,
    openEscalations,
    pressureAtHandoff: pressure,
    handoffNotes: notes,
  };
}
