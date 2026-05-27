// SOI — Replay Lifecycle Reconstruction
// Phase 7 Step 2: Reconstruct historical operational state from append-only events.
//
// RULES:
//   1. Pure functions only — no hooks, no side effects, no fetches
//   2. Deterministic — same events + timestamp always produce same output
//   3. No duplicated lifecycle semantics — uses operational-states.ts types
//   4. Operates on existing rampiq_events with state_before/state_after fields
//   5. Returns reconstructed Incident/RecoveryAction objects compatible
//      with the existing derivation pipeline
//
// HOW IT WORKS:
//   1. Take raw incidents/recovery actions (current state from lifecycle tables)
//   2. Take all events up to the replay timestamp
//   3. For each entity, find the LAST lifecycle transition event before the cutoff
//   4. Override the entity's status with the historical state_after
//   5. Override timing fields based on which transitions have occurred
//   6. Return reconstructed entities that look like they did at that moment
//
// The reconstructed entities flow through the same deriveDashboardState
// and analyzeOperationalPatterns pipeline as live data.

import type { SoiEvent } from '@/lib/soi-types';
import type { Incident, RecoveryAction } from './lifecycle-types';
import type { IncidentStatus, RecoveryActionStatus } from './operational-states';

// ============================================================
// INCIDENT RECONSTRUCTION
// ============================================================

/**
 * Reconstruct historical incident states at a given timestamp.
 *
 * For each incident that existed by the cutoff:
 * - Find all lifecycle events for that incident before the cutoff
 * - Apply the last transition's state_after as the historical status
 * - Reconstruct timing fields based on which transitions occurred
 * - Filter out incidents whose detection event hasn't occurred yet
 */
export function reconstructIncidents(
  incidents: readonly Incident[],
  events: readonly SoiEvent[],
  asOf: Date,
): Incident[] {
  const cutoff = asOf.getTime();

  // Index lifecycle events by entity_id
  const incidentEvents = new Map<string, SoiEvent[]>();
  for (const e of events) {
    if (e.entity_type === 'incident' && e.entity_id && new Date(e.created_at).getTime() <= cutoff) {
      const existing = incidentEvents.get(e.entity_id) ?? [];
      existing.push(e);
      incidentEvents.set(e.entity_id, existing);
    }
  }

  const result: Incident[] = [];

  for (const inc of incidents) {
    // Only include incidents that existed by the cutoff
    if (new Date(inc.created_at).getTime() > cutoff) continue;

    const lifecycleEvents = incidentEvents.get(inc.id) ?? [];
    if (lifecycleEvents.length === 0) {
      // No lifecycle events found — use DETECTED as initial status
      result.push({ ...inc, status: 'DETECTED' as IncidentStatus, resolved_at: null, closed_at: null, stabilized_at: null, recovering_at: null, acknowledged_at: null });
      continue;
    }

    // Sort chronologically and find the last transition before cutoff
    const sorted = [...lifecycleEvents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const lastTransition = sorted[sorted.length - 1];
    const historicalStatus = (lastTransition.state_after ?? 'DETECTED') as IncidentStatus;

    // Reconstruct timing fields from transition events
    const transitionTimes: Record<string, string | null> = {
      acknowledged_at: null,
      recovering_at: null,
      stabilized_at: null,
      resolved_at: null,
      closed_at: null,
    };

    const statusToField: Record<string, string> = {
      CONFIRMED: 'acknowledged_at',
      RECOVERING: 'recovering_at',
      STABILIZED: 'stabilized_at',
      RESOLVED: 'resolved_at',
      CLOSED: 'closed_at',
    };

    // Track ownership changes from reassignment events
    let historicalAssignedTo = inc.assigned_to;
    for (const ev of sorted) {
      const field = statusToField[ev.state_after ?? ''];
      if (field) {
        transitionTimes[field] = ev.created_at;
      }
      // Reassignment events use state_after for new owner
      if (ev.event_type === 'incident.reassigned') {
        historicalAssignedTo = ev.state_after ?? inc.assigned_to;
      }
    }

    // For terminal statuses that haven't happened yet at this timestamp, null them out
    const statusOrder = ['DETECTED', 'CONFIRMED', 'RECOVERING', 'STABILIZED', 'RESOLVED', 'CLOSED'];
    const currentIdx = statusOrder.indexOf(historicalStatus);
    for (let i = currentIdx + 1; i < statusOrder.length; i++) {
      const field = statusToField[statusOrder[i]];
      if (field) transitionTimes[field] = null;
    }

    result.push({
      ...inc,
      status: historicalStatus,
      assigned_to: historicalAssignedTo,
      acknowledged_at: transitionTimes.acknowledged_at,
      recovering_at: transitionTimes.recovering_at,
      stabilized_at: transitionTimes.stabilized_at,
      resolved_at: transitionTimes.resolved_at,
      closed_at: transitionTimes.closed_at,
    });
  }

  return result;
}

// ============================================================
// RECOVERY ACTION RECONSTRUCTION
// ============================================================

/**
 * Reconstruct historical recovery action states at a given timestamp.
 * Same approach as incident reconstruction.
 */
export function reconstructRecoveryActions(
  actions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  asOf: Date,
): RecoveryAction[] {
  const cutoff = asOf.getTime();

  // Index lifecycle events by entity_id
  const actionEvents = new Map<string, SoiEvent[]>();
  for (const e of events) {
    if (e.entity_type === 'recovery_action' && e.entity_id && new Date(e.created_at).getTime() <= cutoff) {
      const existing = actionEvents.get(e.entity_id) ?? [];
      existing.push(e);
      actionEvents.set(e.entity_id, existing);
    }
  }

  const result: RecoveryAction[] = [];

  for (const action of actions) {
    if (new Date(action.created_at).getTime() > cutoff) continue;

    const lifecycleEvents = actionEvents.get(action.id) ?? [];
    if (lifecycleEvents.length === 0) {
      result.push({ ...action, status: 'PROPOSED' as RecoveryActionStatus, completed_at: null, blocked_at: null, started_at: null, acknowledged_at: null });
      continue;
    }

    const sorted = [...lifecycleEvents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const lastTransition = sorted[sorted.length - 1];
    const historicalStatus = (lastTransition.state_after ?? 'PROPOSED') as RecoveryActionStatus;

    // Reconstruct timing
    const timings: Record<string, string | null> = {
      acknowledged_at: null,
      started_at: null,
      blocked_at: null,
      completed_at: null,
    };

    const statusToField: Record<string, string> = {
      ACKNOWLEDGED: 'acknowledged_at',
      ACTIVE: 'started_at',
      BLOCKED: 'blocked_at',
      COMPLETE: 'completed_at',
      ESCALATED: 'completed_at',
      WITHDRAWN: 'completed_at',
    };

    let historicalAssignedTo = action.assigned_to;
    for (const ev of sorted) {
      const field = statusToField[ev.state_after ?? ''];
      if (field) timings[field] = ev.created_at;
      if (ev.event_type === 'recovery_action.reassigned') {
        historicalAssignedTo = ev.state_after ?? action.assigned_to;
      }
    }

    // Null out timing fields for states not yet reached
    const terminalStatuses = ['COMPLETE', 'ESCALATED', 'WITHDRAWN'];
    if (!terminalStatuses.includes(historicalStatus)) {
      timings.completed_at = null;
    }
    if (historicalStatus === 'PROPOSED') {
      timings.acknowledged_at = null;
      timings.started_at = null;
      timings.blocked_at = null;
    }
    if (historicalStatus === 'ACKNOWLEDGED') {
      timings.started_at = null;
      timings.blocked_at = null;
    }

    result.push({
      ...action,
      status: historicalStatus,
      assigned_to: historicalAssignedTo,
      acknowledged_at: timings.acknowledged_at,
      started_at: timings.started_at,
      blocked_at: timings.blocked_at,
      completed_at: timings.completed_at,
    });
  }

  return result;
}
