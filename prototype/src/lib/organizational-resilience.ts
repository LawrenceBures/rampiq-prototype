// SOI — Organizational Resilience Intelligence
// Phase 17: How the organization absorbs operational pressure over time.
//
// RULES:
//   1. Pure functions — deterministic, replay-safe
//   2. Analyzes ORGANIZATIONAL behavior, not individual performance
//   3. Every insight traceable to operational conditions
//   4. No prediction, no optimization, no scoring
//   5. Derives entirely from existing operational memory
//
// Understands:
//   - Which coordination structures stabilize fastest
//   - How operational debt accumulates across shifts
//   - Whether the organization is becoming more or less resilient
//   - Which recovery structures absorb pressure best

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';
import { deriveOperationalOutcomes } from './outcome-measurement';

// ============================================================
// TYPES
// ============================================================

export interface ResilienceIndicator {
  /** What aspect of resilience this measures */
  dimension: 'stabilization_speed' | 'recovery_effectiveness' | 'escalation_containment' | 'debt_management' | 'propagation_control';
  /** Current state */
  state: 'strengthening' | 'stable' | 'weakening';
  /** Evidence */
  evidence: string;
  /** Historical comparison narrative */
  trend: string;
  /** Supporting data points */
  dataPoints: number;
}

export interface OperationalDebt {
  /** Unresolved incidents carried forward */
  unresolvedIncidents: number;
  /** Unacknowledged escalations */
  pendingEscalations: number;
  /** Blocked recovery actions */
  blockedRecoveries: number;
  /** Total debt score (severity-weighted) */
  debtScore: number;
  /** Trend */
  trend: 'accumulating' | 'stable' | 'reducing';
  /** How long debt has been accumulating (minutes) */
  accumulationDuration: number;
  /** Narrative */
  narrative: string;
}

export interface RecoveryStructureInsight {
  /** Recovery approach pattern */
  pattern: string;
  /** How often this pattern was used */
  occurrences: number;
  /** Success rate of this pattern */
  successRate: number;
  /** Average stabilization time when this pattern was used */
  avgStabilizationMin: number | null;
  /** Whether escalation was involved */
  involvedEscalation: boolean;
}

export interface OrganizationalResilienceOutput {
  /** Overall resilience assessment */
  overallState: 'resilient' | 'stable' | 'strained' | 'degraded';
  /** Individual resilience dimensions */
  indicators: ResilienceIndicator[];
  /** Operational debt analysis */
  debt: OperationalDebt;
  /** Recovery structure effectiveness */
  recoveryStructures: RecoveryStructureInsight[];
  /** Resilience narrative */
  narrative: string;
}

// ============================================================
// MAIN ENGINE
// ============================================================

const SEV_W: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 };

/**
 * Derive organizational resilience intelligence.
 * Pure function — deterministic, replay-safe.
 */
export function deriveOrganizationalResilience(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  asOf?: Date,
): OrganizationalResilienceOutput {
  const now = asOf ?? new Date();
  const outcomes = deriveOperationalOutcomes(incidents, recoveryActions, events, now);

  const indicators = deriveResilienceIndicators(incidents, recoveryActions, events, outcomes, now);
  const debt = deriveOperationalDebt(incidents, recoveryActions, events, now);
  const recoveryStructures = analyzeRecoveryStructures(incidents, recoveryActions, outcomes);

  // Overall assessment
  const weakening = indicators.filter(i => i.state === 'weakening').length;
  const strengthening = indicators.filter(i => i.state === 'strengthening').length;

  const overallState: OrganizationalResilienceOutput['overallState'] =
    weakening >= 3 || debt.debtScore >= 30 ? 'degraded' :
    weakening >= 2 ? 'strained' :
    strengthening >= 2 ? 'resilient' : 'stable';

  // Narrative
  const narrativeParts: string[] = [];
  if (overallState === 'resilient') narrativeParts.push('Organization demonstrating operational resilience.');
  else if (overallState === 'stable') narrativeParts.push('Organizational resilience within expected parameters.');
  else if (overallState === 'strained') narrativeParts.push('Organizational resilience showing strain. Multiple dimensions degrading.');
  else narrativeParts.push('Organizational resilience degraded. Sustained operational pressure exceeding coordination capacity.');

  if (debt.trend === 'accumulating') narrativeParts.push(`Operational debt accumulating for ${debt.accumulationDuration}m.`);
  if (strengthening > 0) narrativeParts.push(`${strengthening} resilience dimension${strengthening > 1 ? 's' : ''} strengthening.`);
  if (weakening > 0) narrativeParts.push(`${weakening} dimension${weakening > 1 ? 's' : ''} weakening.`);

  return {
    overallState,
    indicators,
    debt,
    recoveryStructures,
    narrative: narrativeParts.join(' '),
  };
}

// ============================================================
// RESILIENCE INDICATORS
// ============================================================

function deriveResilienceIndicators(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  outcomes: ReturnType<typeof deriveOperationalOutcomes>,
  now: Date,
): ResilienceIndicator[] {
  const indicators: ResilienceIndicator[] = [];
  const resolved = incidents.filter(i => i.resolved_at);
  const unresolved = incidents.filter(i => !i.resolved_at && !i.closed_at);

  // Stabilization speed
  const resolutionTimes = outcomes.recoveryEffectiveness
    .filter(r => r.totalResolutionTime !== null)
    .map(r => r.totalResolutionTime!);
  if (resolutionTimes.length >= 2) {
    const firstHalf = resolutionTimes.slice(0, Math.floor(resolutionTimes.length / 2));
    const secondHalf = resolutionTimes.slice(Math.floor(resolutionTimes.length / 2));
    const avgFirst = firstHalf.reduce((s, t) => s + t, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, t) => s + t, 0) / secondHalf.length;

    indicators.push({
      dimension: 'stabilization_speed',
      state: avgSecond < avgFirst * 0.8 ? 'strengthening' : avgSecond > avgFirst * 1.2 ? 'weakening' : 'stable',
      evidence: `Resolution time: ${Math.round(avgFirst)}m (earlier) → ${Math.round(avgSecond)}m (recent).`,
      trend: avgSecond < avgFirst ? 'Stabilization getting faster' : avgSecond > avgFirst ? 'Stabilization slowing' : 'Consistent stabilization timing',
      dataPoints: resolutionTimes.length,
    });
  }

  // Recovery effectiveness
  const completed = actions.filter(a => a.status === 'COMPLETE').length;
  const failed = actions.filter(a => a.status === 'WITHDRAWN' || a.status === 'BLOCKED' || a.status === 'ESCALATED').length;
  const total = completed + failed;
  if (total >= 3) {
    const rate = completed / total;
    indicators.push({
      dimension: 'recovery_effectiveness',
      state: rate >= 0.6 ? 'strengthening' : rate >= 0.4 ? 'stable' : 'weakening',
      evidence: `${completed} of ${total} recovery actions completed (${Math.round(rate * 100)}%). ${failed} failed/blocked.`,
      trend: rate >= 0.6 ? 'Recovery approaches largely effective' : 'Recovery approaches struggling — structural constraints possible',
      dataPoints: total,
    });
  }

  // Escalation containment
  const escalationRequests = events.filter(e => e.event_type.includes('escalation.requested'));
  const escalationAcks = events.filter(e => e.event_type.includes('escalation.acknowledged'));
  if (escalationRequests.length >= 2) {
    const ackRate = escalationAcks.length / escalationRequests.length;
    indicators.push({
      dimension: 'escalation_containment',
      state: ackRate >= 0.7 ? 'strengthening' : ackRate >= 0.4 ? 'stable' : 'weakening',
      evidence: `${escalationAcks.length} of ${escalationRequests.length} escalations acknowledged (${Math.round(ackRate * 100)}%).`,
      trend: ackRate >= 0.7 ? 'Escalations being actively managed' : 'Escalation backlog growing — coordination capacity may be exceeded',
      dataPoints: escalationRequests.length,
    });
  }

  // Debt management
  const debtScore = unresolved.reduce((s, i) => s + (SEV_W[i.severity] ?? 1), 0);
  indicators.push({
    dimension: 'debt_management',
    state: debtScore <= 5 ? 'strengthening' : debtScore <= 15 ? 'stable' : 'weakening',
    evidence: `${unresolved.length} unresolved incidents, severity-weighted score: ${debtScore}.`,
    trend: debtScore <= 5 ? 'Operational debt minimal' : debtScore <= 15 ? 'Manageable operational debt' : 'Operational debt accumulating beyond comfortable threshold',
    dataPoints: unresolved.length,
  });

  // Propagation control
  const zones = new Set(unresolved.map(i => i.zone_id).filter(Boolean));
  indicators.push({
    dimension: 'propagation_control',
    state: zones.size <= 1 ? 'strengthening' : zones.size <= 2 ? 'stable' : 'weakening',
    evidence: `Unresolved pressure spans ${zones.size} zone${zones.size !== 1 ? 's' : ''}.`,
    trend: zones.size <= 1 ? 'Pressure contained to single zone' : `Pressure has propagated across ${zones.size} zones`,
    dataPoints: zones.size,
  });

  return indicators;
}

// ============================================================
// OPERATIONAL DEBT
// ============================================================

function deriveOperationalDebt(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  now: Date,
): OperationalDebt {
  const unresolved = incidents.filter(i => !i.resolved_at && !i.closed_at);
  const pendingEscalations = events.filter(e =>
    e.event_type.includes('escalation.requested') &&
    !events.some(a => a.event_type.includes('escalation.acknowledged') && a.entity_id === e.entity_id && new Date(a.created_at).getTime() > new Date(e.created_at).getTime())
  ).length;
  const blocked = actions.filter(a => a.status === 'BLOCKED').length;

  const debtScore = unresolved.reduce((s, i) => s + (SEV_W[i.severity] ?? 1), 0) + pendingEscalations * 3 + blocked * 4;

  const oldestUnresolved = unresolved.length > 0
    ? Math.min(...unresolved.map(i => new Date(i.opened_at).getTime()))
    : now.getTime();
  const accDuration = Math.round((now.getTime() - oldestUnresolved) / 60_000);

  const trend: OperationalDebt['trend'] =
    debtScore >= 20 ? 'accumulating' :
    debtScore <= 5 ? 'reducing' : 'stable';

  const narrativeParts: string[] = [];
  if (unresolved.length > 0) narrativeParts.push(`${unresolved.length} unresolved incidents.`);
  if (pendingEscalations > 0) narrativeParts.push(`${pendingEscalations} pending escalations.`);
  if (blocked > 0) narrativeParts.push(`${blocked} blocked recovery actions.`);
  if (debtScore >= 20) narrativeParts.push('Operational debt exceeding comfortable threshold.');
  else if (debtScore <= 5) narrativeParts.push('Operational debt minimal.');

  return {
    unresolvedIncidents: unresolved.length,
    pendingEscalations,
    blockedRecoveries: blocked,
    debtScore,
    trend,
    accumulationDuration: accDuration,
    narrative: narrativeParts.join(' ') || 'No operational debt.',
  };
}

// ============================================================
// RECOVERY STRUCTURE ANALYSIS
// ============================================================

function analyzeRecoveryStructures(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  outcomes: ReturnType<typeof deriveOperationalOutcomes>,
): RecoveryStructureInsight[] {
  // Group recovery actions by action_type
  const typeGroups = new Map<string, RecoveryAction[]>();
  for (const a of actions) {
    const type = a.action_type ?? 'UNTYPED';
    const existing = typeGroups.get(type) ?? [];
    existing.push(a);
    typeGroups.set(type, existing);
  }

  const insights: RecoveryStructureInsight[] = [];
  for (const [pattern, groupActions] of typeGroups) {
    const completed = groupActions.filter(a => a.status === 'COMPLETE').length;
    const total = groupActions.length;
    const successRate = total > 0 ? completed / total : 0;

    // Find avg stabilization time for incidents that used this pattern
    const incidentIds = new Set(groupActions.filter(a => a.status === 'COMPLETE').map(a => a.incident_id));
    const relatedOutcomes = outcomes.recoveryEffectiveness.filter(r => incidentIds.has(r.incidentId) && r.totalResolutionTime !== null);
    const avgStab = relatedOutcomes.length > 0
      ? Math.round(relatedOutcomes.reduce((s, r) => s + r.totalResolutionTime!, 0) / relatedOutcomes.length)
      : null;

    insights.push({
      pattern,
      occurrences: total,
      successRate,
      avgStabilizationMin: avgStab,
      involvedEscalation: groupActions.some(a => a.status === 'ESCALATED'),
    });
  }

  return insights.sort((a, b) => b.occurrences - a.occurrences);
}
