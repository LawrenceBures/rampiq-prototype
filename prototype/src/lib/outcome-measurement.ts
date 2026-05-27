// SOI — Operational Outcome Measurement
// Phase 10.1: Deterministic outcome derivation from operational memory.
//
// RULES:
//   1. Pure functions only — no hooks, no side effects, no fetches
//   2. Deterministic — same events always produce same outcomes
//   3. Replay-safe — accepts asOf
//   4. Measures CONDITIONS, not PEOPLE
//   5. No AI, no prediction, no optimization
//
// Derives:
//   - Pressure delta after operational actions
//   - Recovery effectiveness (time-to-stabilization)
//   - Escalation impact windows
//   - Zone stabilization velocity

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';

// ============================================================
// TYPES
// ============================================================

export interface PressureDelta {
  /** Action that triggered the measurement */
  actionType: 'escalation' | 'reassignment' | 'recovery_completion' | 'recommendation_accepted';
  /** Entity that the action applied to */
  entityId: string;
  /** Timestamp of the action */
  actionTimestamp: string;
  /** Open incident count at action time */
  incidentsAtAction: number;
  /** Open incident count at T+15m */
  incidentsAt15m: number | null;
  /** Open incident count at T+30m */
  incidentsAt30m: number | null;
  /** Open incident count at T+60m */
  incidentsAt60m: number | null;
  /** Did conditions improve? */
  outcome: 'improved' | 'stable' | 'worsened' | 'pending';
}

export interface RecoveryEffectiveness {
  /** Incident ID */
  incidentId: string;
  /** Time from DETECTED to CONFIRMED (minutes) */
  timeToConfirmation: number | null;
  /** Time from CONFIRMED to RECOVERING (minutes) */
  timeToRecovery: number | null;
  /** Time from RECOVERING to STABILIZED/RESOLVED (minutes) */
  timeToStabilization: number | null;
  /** Time from DETECTED to RESOLVED (total, minutes) */
  totalResolutionTime: number | null;
  /** Number of recovery actions attempted */
  recoveryActionsTotal: number;
  /** Number of recovery actions completed successfully */
  recoveryActionsCompleted: number;
  /** Number of recovery actions withdrawn/blocked */
  recoveryActionsFailed: number;
  /** Was escalation used? */
  escalated: boolean;
  /** Was reassignment used? */
  reassigned: boolean;
}

export interface OperationalOutcomes {
  /** Pressure deltas for recent actions */
  pressureDeltas: PressureDelta[];
  /** Recovery effectiveness per incident */
  recoveryEffectiveness: RecoveryEffectiveness[];
  /** Aggregate metrics */
  aggregate: {
    avgTimeToConfirmation: number | null;
    avgTimeToStabilization: number | null;
    avgTotalResolution: number | null;
    recoverySuccessRate: number | null;
    escalationRate: number | null;
    reassignmentRate: number | null;
  };
}

// ============================================================
// OUTCOME COMPUTATION
// ============================================================

/**
 * Derive operational outcomes from incident lifecycle data.
 * Pure function — deterministic, replay-safe.
 */
export function deriveOperationalOutcomes(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  asOf?: Date,
): OperationalOutcomes {
  const now = asOf ?? new Date();

  const recoveryEffectiveness = incidents.map(inc =>
    computeRecoveryEffectiveness(inc, recoveryActions, events)
  );

  const pressureDeltas = computePressureDeltas(incidents, events, now);

  // Aggregate metrics
  const resolved = recoveryEffectiveness.filter(r => r.totalResolutionTime !== null);
  const withConfirmation = recoveryEffectiveness.filter(r => r.timeToConfirmation !== null);
  const withStabilization = recoveryEffectiveness.filter(r => r.timeToStabilization !== null);

  const totalActions = recoveryEffectiveness.reduce((s, r) => s + r.recoveryActionsTotal, 0);
  const completedActions = recoveryEffectiveness.reduce((s, r) => s + r.recoveryActionsCompleted, 0);
  const escalatedCount = recoveryEffectiveness.filter(r => r.escalated).length;
  const reassignedCount = recoveryEffectiveness.filter(r => r.reassigned).length;

  return {
    pressureDeltas,
    recoveryEffectiveness,
    aggregate: {
      avgTimeToConfirmation: withConfirmation.length > 0
        ? Math.round(withConfirmation.reduce((s, r) => s + r.timeToConfirmation!, 0) / withConfirmation.length)
        : null,
      avgTimeToStabilization: withStabilization.length > 0
        ? Math.round(withStabilization.reduce((s, r) => s + r.timeToStabilization!, 0) / withStabilization.length)
        : null,
      avgTotalResolution: resolved.length > 0
        ? Math.round(resolved.reduce((s, r) => s + r.totalResolutionTime!, 0) / resolved.length)
        : null,
      recoverySuccessRate: totalActions > 0 ? completedActions / totalActions : null,
      escalationRate: incidents.length > 0 ? escalatedCount / incidents.length : null,
      reassignmentRate: incidents.length > 0 ? reassignedCount / incidents.length : null,
    },
  };
}

function computeRecoveryEffectiveness(
  inc: Incident,
  allActions: readonly RecoveryAction[],
  allEvents: readonly SoiEvent[],
): RecoveryEffectiveness {
  const actions = allActions.filter(a => a.incident_id === inc.id);
  const incEvents = allEvents.filter(e => e.entity_id === inc.id || e.correlation_id === inc.correlation_id);

  const opened = new Date(inc.opened_at).getTime();
  const confirmed = inc.acknowledged_at ? new Date(inc.acknowledged_at).getTime() : null;
  const recovering = inc.recovering_at ? new Date(inc.recovering_at).getTime() : null;
  const stabilized = inc.stabilized_at ? new Date(inc.stabilized_at).getTime() : null;
  const resolved = inc.resolved_at ? new Date(inc.resolved_at).getTime() : null;

  const escalated = incEvents.some(e =>
    e.event_type.includes('escalation') || e.event_type.includes('escalated')
  );
  const reassigned = incEvents.some(e =>
    e.event_type.includes('reassigned') || e.event_type.includes('handoff')
  );

  return {
    incidentId: inc.id,
    timeToConfirmation: confirmed ? Math.round((confirmed - opened) / 60_000) : null,
    timeToRecovery: recovering && confirmed ? Math.round((recovering - confirmed) / 60_000) : null,
    timeToStabilization: (stabilized || resolved) && recovering
      ? Math.round(((stabilized ?? resolved)! - recovering) / 60_000) : null,
    totalResolutionTime: resolved ? Math.round((resolved - opened) / 60_000) : null,
    recoveryActionsTotal: actions.length,
    recoveryActionsCompleted: actions.filter(a => a.status === 'COMPLETE').length,
    recoveryActionsFailed: actions.filter(a => a.status === 'WITHDRAWN' || a.status === 'BLOCKED' || a.status === 'ESCALATED').length,
    escalated,
    reassigned,
  };
}

function computePressureDeltas(
  incidents: readonly Incident[],
  events: readonly SoiEvent[],
  now: Date,
): PressureDelta[] {
  const deltas: PressureDelta[] = [];

  // Find escalation/reassignment events and measure pressure around them
  const actionEvents = events.filter(e =>
    e.event_type.includes('escalation.requested') ||
    e.event_type.includes('reassigned') ||
    e.event_type.includes('handoff')
  );

  for (const ev of actionEvents.slice(-10)) { // last 10 actions
    const actionTime = new Date(ev.created_at).getTime();
    const actionType: PressureDelta['actionType'] =
      ev.event_type.includes('escalation') ? 'escalation' :
      ev.event_type.includes('reassigned') || ev.event_type.includes('handoff') ? 'reassignment' :
      'recovery_completion';

    const countAt = (offsetMs: number) => {
      const t = actionTime + offsetMs;
      if (t > now.getTime()) return null;
      return incidents.filter(i => {
        const opened = new Date(i.opened_at).getTime();
        const resolved = i.resolved_at ? new Date(i.resolved_at).getTime() : Infinity;
        return opened <= t && resolved > t;
      }).length;
    };

    const atAction = countAt(0) ?? 0;
    const at15 = countAt(15 * 60_000);
    const at30 = countAt(30 * 60_000);
    const at60 = countAt(60 * 60_000);

    const latestMeasurement = at60 ?? at30 ?? at15;
    const outcome: PressureDelta['outcome'] =
      latestMeasurement === null ? 'pending' :
      latestMeasurement < atAction ? 'improved' :
      latestMeasurement > atAction ? 'worsened' : 'stable';

    deltas.push({
      actionType, entityId: ev.entity_id ?? '', actionTimestamp: ev.created_at,
      incidentsAtAction: atAction,
      incidentsAt15m: at15, incidentsAt30m: at30, incidentsAt60m: at60,
      outcome,
    });
  }

  return deltas;
}
