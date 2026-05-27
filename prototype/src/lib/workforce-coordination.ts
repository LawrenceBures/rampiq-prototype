// SOI — Workforce Coordination Engine
// Phase 8: Ownership, workload, and escalation semantics.
//
// RULES:
//   1. Pure functions only — no hooks, no side effects, no fetches
//   2. Deterministic — same inputs always produce same outputs
//   3. Replay-safe — accepts asOf for historical reconstruction
//   4. No AI, no optimization algorithms
//   5. Derives entirely from existing operational data
//
// THREE LAYERS:
//   1. Ownership Model — who owns what operational pressure
//   2. Workload Awareness — who is overloaded
//   3. Escalation Semantics — when intervention is required

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { RampiqEvent } from './rampiq-types';

// ============================================================
// TYPES
// ============================================================

export interface OperatorLoad {
  /** Operator identifier (user_id or role) */
  operatorId: string;
  /** Display name if available */
  displayName?: string;
  /** Role type */
  role?: string;
  /** Incidents this operator owns (created or assigned) */
  ownedIncidents: number;
  /** Active recovery actions assigned to this operator */
  activeRecoveryActions: number;
  /** Blocked recovery actions assigned to this operator */
  blockedActions: number;
  /** Total operational weight (severity-adjusted) */
  loadScore: number;
  /** Saturation state */
  saturation: 'nominal' | 'elevated' | 'saturated' | 'needs_support';
  /** Oldest unresolved item age in minutes */
  oldestUnresolvedMin: number;
}

export interface OwnershipGap {
  /** What's unowned */
  type: 'unassigned_incident' | 'unassigned_recovery' | 'stalled_coordination' | 'unacknowledged';
  /** Severity of the gap */
  severity: 'watch' | 'alert';
  /** Description */
  title: string;
  /** Explanation */
  explanation: string;
  /** Related entity ID */
  entityId: string;
  /** Age in minutes */
  ageMin: number;
}

export type EscalationReason =
  | 'stalled_incident'
  | 'recovery_failure_cascade'
  | 'coordination_support_needed'
  | 'sustained_unresolved'
  | 'unacknowledged_critical'
  | 'coordination_breakdown';

export interface EscalationSignal {
  reason: EscalationReason;
  severity: 'watch' | 'alert' | 'critical';
  title: string;
  explanation: string;
  /** Contributing entity IDs */
  incidentIds: string[];
  /** Score for ranking */
  score: number;
  /** When this condition was first detectable */
  onsetMin: number;
}

export interface WorkforceCoordinationState {
  /** Per-operator workload */
  operatorLoads: OperatorLoad[];
  /** Ownership gaps — things that need attention */
  ownershipGaps: OwnershipGap[];
  /** Escalation signals — intervention needed */
  escalations: EscalationSignal[];
  /** Summary stats */
  summary: {
    totalOperators: number;
    saturatedCount: number;
    needsSupportCount: number;
    unassignedIncidents: number;
    unacknowledgedActions: number;
    stalledCoordinations: number;
    activeEscalations: number;
  };
}

// ============================================================
// THRESHOLDS
// ============================================================

const LOAD_THRESHOLDS = {
  /** Incidents before elevated */
  ELEVATED_INCIDENTS: 2,
  /** Incidents before saturated */
  SATURATED_INCIDENTS: 3,
  /** Total load score for overloaded */
  OVERLOADED_SCORE: 20,
  /** Minutes before unacknowledged is flagged */
  UNACKNOWLEDGED_MIN: 10,
  /** Minutes before stalled coordination is flagged */
  STALLED_MIN: 20,
  /** Minutes before critical escalation */
  CRITICAL_STALL_MIN: 45,
  /** Blocked actions before cascade flag */
  BLOCKED_CASCADE: 2,
  /** Severity weights */
  SEV_WEIGHT: { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 } as Record<string, number>,
} as const;

// ============================================================
// MAIN ENGINE
// ============================================================

/**
 * Derive workforce coordination state from operational data.
 * Pure function — no side effects, replay-safe via asOf.
 */
export function deriveWorkforceCoordination(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  asOf?: Date,
): WorkforceCoordinationState {
  const now = asOf ?? new Date();

  const operatorLoads = deriveOperatorLoads(incidents, recoveryActions, now);
  const ownershipGaps = detectOwnershipGaps(incidents, recoveryActions, now);
  const escalations = detectEscalations(incidents, recoveryActions, operatorLoads, now);

  const saturatedCount = operatorLoads.filter(o => o.saturation === 'saturated').length;
  const needsSupportCount = operatorLoads.filter(o => o.saturation === 'needs_support').length;

  return {
    operatorLoads,
    ownershipGaps,
    escalations: escalations.sort((a, b) => b.score - a.score),
    summary: {
      totalOperators: operatorLoads.length,
      saturatedCount,
      needsSupportCount,
      unassignedIncidents: ownershipGaps.filter(g => g.type === 'unassigned_incident').length,
      unacknowledgedActions: ownershipGaps.filter(g => g.type === 'unacknowledged').length,
      stalledCoordinations: ownershipGaps.filter(g => g.type === 'stalled_coordination').length,
      activeEscalations: escalations.filter(e => e.severity === 'critical').length,
    },
  };
}

// ============================================================
// LAYER 1: OPERATOR LOADS
// ============================================================

function deriveOperatorLoads(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  now: Date,
): OperatorLoad[] {
  const loads = new Map<string, {
    incidents: Incident[];
    actions: RecoveryAction[];
    blockedActions: RecoveryAction[];
  }>();

  // Index incidents by owner (created_by or assigned_to)
  for (const inc of incidents) {
    if (inc.resolved_at || inc.closed_at) continue;
    const owner = inc.assigned_to || inc.created_by;
    const entry = loads.get(owner) ?? { incidents: [], actions: [], blockedActions: [] };
    entry.incidents.push(inc);
    loads.set(owner, entry);
  }

  // Index recovery actions by assigned_to
  const activeStatuses = ['PROPOSED', 'ACKNOWLEDGED', 'ACTIVE', 'BLOCKED'];
  for (const ra of recoveryActions) {
    if (!activeStatuses.includes(ra.status)) continue;
    const owner = ra.assigned_to || ra.proposed_by;
    const entry = loads.get(owner) ?? { incidents: [], actions: [], blockedActions: [] };
    entry.actions.push(ra);
    if (ra.status === 'BLOCKED') entry.blockedActions.push(ra);
    loads.set(owner, entry);
  }

  const result: OperatorLoad[] = [];

  for (const [operatorId, data] of loads) {
    const incidentScore = data.incidents.reduce(
      (sum, i) => sum + (LOAD_THRESHOLDS.SEV_WEIGHT[i.severity] ?? 1), 0
    );
    const actionScore = data.actions.reduce(
      (sum, a) => sum + (LOAD_THRESHOLDS.SEV_WEIGHT[a.severity] ?? 1), 0
    );
    const loadScore = incidentScore + actionScore + data.blockedActions.length * 3;

    // Find oldest unresolved
    let oldestMs = 0;
    for (const i of data.incidents) {
      const age = now.getTime() - new Date(i.opened_at).getTime();
      if (age > oldestMs) oldestMs = age;
    }
    for (const a of data.actions) {
      const age = now.getTime() - new Date(a.created_at).getTime();
      if (age > oldestMs) oldestMs = age;
    }

    const saturation: OperatorLoad['saturation'] =
      loadScore >= LOAD_THRESHOLDS.OVERLOADED_SCORE ? 'needs_support' :
      data.incidents.length >= LOAD_THRESHOLDS.SATURATED_INCIDENTS ? 'saturated' :
      data.incidents.length >= LOAD_THRESHOLDS.ELEVATED_INCIDENTS ? 'elevated' :
      'nominal';

    result.push({
      operatorId,
      ownedIncidents: data.incidents.length,
      activeRecoveryActions: data.actions.length,
      blockedActions: data.blockedActions.length,
      loadScore,
      saturation,
      oldestUnresolvedMin: Math.round(oldestMs / 60_000),
    });
  }

  return result.sort((a, b) => b.loadScore - a.loadScore);
}

// ============================================================
// LAYER 2: OWNERSHIP GAPS
// ============================================================

function detectOwnershipGaps(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  now: Date,
): OwnershipGap[] {
  const gaps: OwnershipGap[] = [];

  for (const inc of incidents) {
    if (inc.resolved_at || inc.closed_at) continue;
    const ageMin = Math.round((now.getTime() - new Date(inc.opened_at).getTime()) / 60_000);

    // Unassigned incident
    if (!inc.assigned_to && ageMin >= 5) {
      gaps.push({
        type: 'unassigned_incident',
        severity: ageMin >= 15 ? 'alert' : 'watch',
        title: `${inc.title.slice(0, 35)}: no owner`,
        explanation: `Incident open for ${ageMin}m with no assigned coordinator.`,
        entityId: inc.id,
        ageMin,
      });
    }

    // Stalled coordination: confirmed but not recovering for too long
    if (inc.status === 'CONFIRMED' && !inc.recovering_at) {
      const confirmedAge = inc.acknowledged_at
        ? Math.round((now.getTime() - new Date(inc.acknowledged_at).getTime()) / 60_000)
        : ageMin;
      if (confirmedAge >= LOAD_THRESHOLDS.STALLED_MIN) {
        gaps.push({
          type: 'stalled_coordination',
          severity: confirmedAge >= LOAD_THRESHOLDS.CRITICAL_STALL_MIN ? 'alert' : 'watch',
          title: `${inc.title.slice(0, 35)}: stalled ${confirmedAge}m`,
          explanation: `Incident confirmed but no recovery initiated for ${confirmedAge} minutes.`,
          entityId: inc.id,
          ageMin: confirmedAge,
        });
      }
    }
  }

  // Unacknowledged recovery actions
  for (const ra of recoveryActions) {
    if (ra.status !== 'PROPOSED') continue;
    const ageMin = Math.round((now.getTime() - new Date(ra.created_at).getTime()) / 60_000);
    if (ageMin >= LOAD_THRESHOLDS.UNACKNOWLEDGED_MIN) {
      gaps.push({
        type: 'unacknowledged',
        severity: ageMin >= 20 ? 'alert' : 'watch',
        title: `${ra.title.slice(0, 35)}: unacknowledged ${ageMin}m`,
        explanation: `Recovery action proposed ${ageMin}m ago, not yet acknowledged by assigned ${ra.assigned_to || 'unknown'}.`,
        entityId: ra.id,
        ageMin,
      });
    }
  }

  return gaps.sort((a, b) => b.ageMin - a.ageMin);
}

// ============================================================
// LAYER 3: ESCALATION SIGNALS
// ============================================================

function detectEscalations(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  operatorLoads: readonly OperatorLoad[],
  now: Date,
): EscalationSignal[] {
  const signals: EscalationSignal[] = [];

  // ── Stalled incidents (DETECTED or CONFIRMED too long) ──
  for (const inc of incidents) {
    if (inc.resolved_at || inc.closed_at) continue;
    const ageMin = Math.round((now.getTime() - new Date(inc.opened_at).getTime()) / 60_000);

    if ((inc.status === 'DETECTED' || inc.status === 'CONFIRMED') && ageMin >= LOAD_THRESHOLDS.CRITICAL_STALL_MIN) {
      signals.push({
        reason: 'stalled_incident',
        severity: inc.severity === 'CRITICAL' ? 'critical' : ageMin >= 60 ? 'critical' : 'alert',
        title: `${inc.title.slice(0, 30)}: stalled at ${inc.status} for ${ageMin}m`,
        explanation: `Incident has not progressed past ${inc.status} in ${ageMin} minutes. May require supervisor intervention or different coordination approach.`,
        incidentIds: [inc.id],
        score: ageMin + (LOAD_THRESHOLDS.SEV_WEIGHT[inc.severity] ?? 1) * 10,
        onsetMin: ageMin,
      });
    }

    // Unacknowledged critical
    if (inc.severity === 'CRITICAL' && inc.status === 'DETECTED' && ageMin >= 5) {
      signals.push({
        reason: 'unacknowledged_critical',
        severity: ageMin >= 15 ? 'critical' : 'alert',
        title: `CRITICAL incident unacknowledged: ${ageMin}m`,
        explanation: `Critical-severity incident "${inc.title.slice(0, 30)}" has not been confirmed or acknowledged.`,
        incidentIds: [inc.id],
        score: 100 + ageMin,
        onsetMin: ageMin,
      });
    }
  }

  // ── Recovery failure cascade ──
  // Group blocked/withdrawn actions by incident
  const incidentFailures = new Map<string, { blocked: number; withdrawn: number; inc: Incident | null }>();
  for (const ra of recoveryActions) {
    if (ra.status === 'BLOCKED' || ra.status === 'WITHDRAWN') {
      const entry = incidentFailures.get(ra.incident_id) ?? { blocked: 0, withdrawn: 0, inc: null };
      if (ra.status === 'BLOCKED') entry.blocked++;
      if (ra.status === 'WITHDRAWN') entry.withdrawn++;
      incidentFailures.set(ra.incident_id, entry);
    }
  }
  for (const inc of incidents) {
    const entry = incidentFailures.get(inc.id);
    if (entry) entry.inc = inc;
  }
  for (const [incId, data] of incidentFailures) {
    const total = data.blocked + data.withdrawn;
    if (total >= LOAD_THRESHOLDS.BLOCKED_CASCADE) {
      signals.push({
        reason: 'recovery_failure_cascade',
        severity: total >= 3 ? 'critical' : 'alert',
        title: `${data.inc?.title.slice(0, 25) ?? incId}: ${total} failed recovery attempts`,
        explanation: `${data.blocked} blocked, ${data.withdrawn} withdrawn. Recovery coordination for this incident is unstable. Consider escalation to supervisor or alternative approach.`,
        incidentIds: [incId],
        score: total * 20 + (LOAD_THRESHOLDS.SEV_WEIGHT[data.inc?.severity ?? 'MEDIUM'] ?? 2) * 5,
        onsetMin: 0,
      });
    }
  }

  // ── Operator overload ──
  for (const op of operatorLoads) {
    if (op.saturation === 'needs_support') {
      signals.push({
        reason: 'coordination_support_needed',
        severity: op.loadScore >= 30 ? 'critical' : 'alert',
        title: `${op.operatorId}: coordination support needed`,
        explanation: `Coordinator has ${op.ownedIncidents} active incidents and ${op.activeRecoveryActions} recovery actions. ${op.blockedActions} blocked. Oldest unresolved: ${op.oldestUnresolvedMin}m. Workload may benefit from redistribution or additional support.`,
        incidentIds: [],
        score: op.loadScore + op.oldestUnresolvedMin,
        onsetMin: op.oldestUnresolvedMin,
      });
    }
  }

  // ── Coordination breakdown: multiple stalled + multiple blocked ──
  const stalledCount = incidents.filter(i =>
    !i.resolved_at && !i.closed_at &&
    (i.status === 'DETECTED' || i.status === 'CONFIRMED') &&
    Math.round((now.getTime() - new Date(i.opened_at).getTime()) / 60_000) >= LOAD_THRESHOLDS.STALLED_MIN
  ).length;
  const blockedTotal = recoveryActions.filter(a => a.status === 'BLOCKED').length;

  if (stalledCount >= 2 && blockedTotal >= 1) {
    signals.push({
      reason: 'coordination_breakdown',
      severity: 'critical',
      title: `Coordination breakdown: ${stalledCount} stalled, ${blockedTotal} blocked`,
      explanation: `Multiple incidents are not progressing and recovery actions are blocked. Systemic coordination failure may require operational command intervention.`,
      incidentIds: incidents.filter(i => !i.resolved_at && (i.status === 'DETECTED' || i.status === 'CONFIRMED')).map(i => i.id),
      score: stalledCount * 30 + blockedTotal * 20,
      onsetMin: 0,
    });
  }

  return signals;
}
