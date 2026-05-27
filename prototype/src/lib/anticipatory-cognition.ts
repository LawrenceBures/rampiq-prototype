// SOI — Anticipatory Operational Cognition
// Phase 14: Deterministic destabilization detection + stability modeling.
//
// CORE PRINCIPLE:
//   "What conditions are BEGINNING to destabilize?"
//   NOT "AI predicts the future."
//
// RULES:
//   1. Pure functions — deterministic, replay-safe
//   2. Every signal traceable to specific operational conditions
//   3. No probabilistic scoring, no black-box confidence
//   4. No alarmist language — calm operational awareness
//   5. Derives from existing operational memory only
//   6. Explicitly admits uncertainty and limitations
//
// The system understands destabilization before collapse occurs —
// because it remembers what destabilization looked like before.

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { RampiqEvent } from './rampiq-types';
import type { RecurringCondition } from './institutional-memory';
import { deriveInstitutionalMemory } from './institutional-memory';

// ============================================================
// TYPES
// ============================================================

export interface DestabilizationSignal {
  /** What condition is emerging */
  condition: string;
  /** Explainable evidence */
  evidence: string;
  /** How long this has been developing (minutes) */
  developingMin: number;
  /** Urgency: emerging (early), developing (mid), acute (needs attention now) */
  urgency: 'emerging' | 'developing' | 'acute';
  /** Related zone */
  zoneId?: string;
  /** Related incident IDs */
  incidentIds: string[];
  /** What historically happened under similar conditions */
  historicalContext?: string;
}

export interface StabilityComponent {
  /** What this measures */
  name: string;
  /** Current value (0-100, lower = more stable) */
  pressure: number;
  /** Trend direction */
  trend: 'improving' | 'stable' | 'degrading';
  /** Contributing factors */
  factors: string[];
}

export interface OperationalStabilityIndex {
  /** Overall stability (0-100, lower = more stable) */
  overallPressure: number;
  /** Direction */
  direction: 'stabilizing' | 'stable' | 'destabilizing' | 'acute';
  /** Individual components */
  components: StabilityComponent[];
  /** How long current state has persisted (minutes) */
  durationMin: number;
  /** Narrative summary */
  narrative: string;
}

export interface AnticipatoryOutput {
  /** Active destabilization signals */
  destabilizationSignals: DestabilizationSignal[];
  /** Operational stability index */
  stability: OperationalStabilityIndex;
  /** Early stabilization recommendations */
  earlyRecommendations: EarlyRecommendation[];
}

export interface EarlyRecommendation {
  /** What to consider */
  suggestion: string;
  /** Why — what conditions triggered this */
  rationale: string;
  /** Historical basis */
  historicalBasis: string;
  /** Confidence limitation */
  limitation: string;
  /** Related destabilization signal */
  relatedSignal?: string;
}

// ============================================================
// THRESHOLDS
// ============================================================

const T = {
  /** Minutes of continuous pressure growth before flagging */
  PRESSURE_ACCUMULATION_MIN: 15,
  /** Unresolved escalation count for concern */
  ESCALATION_DENSITY_THRESHOLD: 2,
  /** Recovery backlog growth rate (actions/15min) */
  RECOVERY_BACKLOG_GROWTH: 2,
  /** Inherited pressure unresolved threshold (minutes) */
  INHERITED_STALE_MIN: 30,
  /** Blocked recovery actions for cascade signal */
  BLOCKED_CASCADE_THRESHOLD: 2,
  /** Severity weights */
  SEV: { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 } as Record<string, number>,
} as const;

// ============================================================
// MAIN ENGINE
// ============================================================

/**
 * Derive anticipatory operational cognition.
 * Pure function — deterministic, replay-safe.
 */
export function deriveAnticipatoryState(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  asOf?: Date,
): AnticipatoryOutput {
  const now = asOf ?? new Date();
  const institutional = deriveInstitutionalMemory(incidents, recoveryActions, events, now);

  const destabilizationSignals = detectDestabilization(incidents, recoveryActions, events, institutional.recurringConditions, now);
  const stability = computeStabilityIndex(incidents, recoveryActions, events, now);
  const earlyRecommendations = deriveEarlyRecommendations(destabilizationSignals, stability, institutional.recurringConditions, now);

  return { destabilizationSignals, stability, earlyRecommendations };
}

// ============================================================
// DESTABILIZATION DETECTION
// ============================================================

function detectDestabilization(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  recurringConditions: readonly RecurringCondition[],
  now: Date,
): DestabilizationSignal[] {
  const signals: DestabilizationSignal[] = [];
  const unresolved = incidents.filter(i => !i.resolved_at && !i.closed_at);

  // ── Pressure accumulation ──
  // Check if unresolved count has been growing over last 30 min
  const thirtyAgo = now.getTime() - 30 * 60_000;
  const fifteenAgo = now.getTime() - 15 * 60_000;
  const olderUnresolved = incidents.filter(i => {
    const t = new Date(i.opened_at).getTime();
    return t <= thirtyAgo && (!i.resolved_at || new Date(i.resolved_at).getTime() > thirtyAgo);
  }).length;
  const recentUnresolved = unresolved.length;

  if (recentUnresolved > olderUnresolved && recentUnresolved >= 3) {
    const growthRate = recentUnresolved - olderUnresolved;
    signals.push({
      condition: `Unresolved incident count growing: ${olderUnresolved} → ${recentUnresolved} in 30m`,
      evidence: `${growthRate} net new unresolved incidents. Current unresolved: ${recentUnresolved}.`,
      developingMin: 30,
      urgency: growthRate >= 3 ? 'acute' : growthRate >= 2 ? 'developing' : 'emerging',
      incidentIds: unresolved.map(i => i.id),
    });
  }

  // ── Unresolved escalation accumulation ──
  const escalationEvents = events.filter(e =>
    e.event_type.includes('escalation.requested') &&
    new Date(e.created_at).getTime() >= fifteenAgo
  );
  const acknowledgedEscalations = events.filter(e =>
    e.event_type.includes('escalation.acknowledged') &&
    new Date(e.created_at).getTime() >= fifteenAgo
  );
  const unresolvedEscalations = escalationEvents.length - acknowledgedEscalations.length;

  if (unresolvedEscalations >= T.ESCALATION_DENSITY_THRESHOLD) {
    signals.push({
      condition: `${unresolvedEscalations} unresolved escalations in 15m`,
      evidence: `${escalationEvents.length} escalations requested, ${acknowledgedEscalations.length} acknowledged. Escalation backlog may indicate coordination saturation.`,
      developingMin: 15,
      urgency: unresolvedEscalations >= 3 ? 'acute' : 'developing',
      incidentIds: [],
    });
  }

  // ── Recovery blockage cascade ──
  const blockedActions = actions.filter(a => a.status === 'BLOCKED');
  const withdrawnRecent = actions.filter(a =>
    a.status === 'WITHDRAWN' && a.completed_at &&
    now.getTime() - new Date(a.completed_at).getTime() < 30 * 60_000
  );

  if (blockedActions.length >= T.BLOCKED_CASCADE_THRESHOLD) {
    signals.push({
      condition: `Recovery blockage: ${blockedActions.length} blocked actions`,
      evidence: `${blockedActions.length} recovery actions blocked, ${withdrawnRecent.length} withdrawn in last 30m. Recovery coordination may be structurally constrained.`,
      developingMin: Math.round((now.getTime() - Math.min(...blockedActions.map(a => new Date(a.blocked_at ?? a.created_at).getTime()))) / 60_000),
      urgency: blockedActions.length >= 3 ? 'acute' : 'developing',
      incidentIds: [...new Set(blockedActions.map(a => a.incident_id))],
    });
  }

  // ── Multi-zone propagation ──
  const zoneIncidents = new Map<string, Incident[]>();
  for (const inc of unresolved) {
    if (inc.zone_id) {
      const existing = zoneIncidents.get(inc.zone_id) ?? [];
      existing.push(inc);
      zoneIncidents.set(inc.zone_id, existing);
    }
  }
  const pressuredZones = [...zoneIncidents.entries()].filter(([, incs]) =>
    incs.reduce((s, i) => s + (T.SEV[i.severity] ?? 1), 0) >= 6
  );

  if (pressuredZones.length >= 2) {
    signals.push({
      condition: `Multi-zone pressure: ${pressuredZones.length} zones under elevated load`,
      evidence: `Zones ${pressuredZones.map(([z]) => z).join(', ')} each have severity-weighted pressure ≥ 6. Cross-zone resource contention possible.`,
      developingMin: 0,
      urgency: pressuredZones.length >= 3 ? 'acute' : 'developing',
      incidentIds: pressuredZones.flatMap(([, incs]) => incs.map(i => i.id)),
    });
  }

  // ── Institutional fragility match ──
  for (const cond of recurringConditions) {
    if (cond.significance === 'systemic') {
      signals.push({
        condition: `Recurring systemic condition: ${cond.condition}`,
        evidence: `This pattern has occurred ${cond.occurrences} times. Institutional memory indicates structural operational vulnerability.`,
        developingMin: 0,
        urgency: 'developing',
        historicalContext: `Pattern first seen ${cond.firstSeen}, most recent ${cond.lastSeen}.`,
        incidentIds: cond.incidentIds,
        zoneId: cond.location.zone,
      });
    }
  }

  return signals.sort((a, b) => {
    const urgencyOrder = { acute: 0, developing: 1, emerging: 2 };
    return (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
  });
}

// ============================================================
// OPERATIONAL STABILITY INDEX
// ============================================================

function computeStabilityIndex(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  now: Date,
): OperationalStabilityIndex {
  const unresolved = incidents.filter(i => !i.resolved_at && !i.closed_at);

  // ── Individual components ──
  const components: StabilityComponent[] = [];

  // Active pressure
  const activePressure = unresolved.reduce((s, i) => s + (T.SEV[i.severity] ?? 1), 0);
  const pressureNorm = Math.min(100, activePressure * 4);
  components.push({
    name: 'Active Pressure',
    pressure: pressureNorm,
    trend: pressureNorm > 60 ? 'degrading' : pressureNorm > 30 ? 'stable' : 'improving',
    factors: [`${unresolved.length} unresolved incidents`, `severity-weighted: ${activePressure}`],
  });

  // Escalation density
  const recentEscalations = events.filter(e =>
    e.event_type.includes('escalation') && now.getTime() - new Date(e.created_at).getTime() < 30 * 60_000
  ).length;
  const escNorm = Math.min(100, recentEscalations * 20);
  components.push({
    name: 'Escalation Density',
    pressure: escNorm,
    trend: recentEscalations >= 3 ? 'degrading' : recentEscalations >= 1 ? 'stable' : 'improving',
    factors: [`${recentEscalations} escalation events in 30m`],
  });

  // Recovery velocity
  const activeActions = actions.filter(a => !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status));
  const blockedActions = actions.filter(a => a.status === 'BLOCKED');
  const recoveryPressure = Math.min(100, activeActions.length * 10 + blockedActions.length * 25);
  components.push({
    name: 'Recovery Load',
    pressure: recoveryPressure,
    trend: blockedActions.length >= 2 ? 'degrading' : activeActions.length > 4 ? 'stable' : 'improving',
    factors: [`${activeActions.length} active`, `${blockedActions.length} blocked`],
  });

  // Workload distribution
  const operators = new Set<string>();
  for (const inc of unresolved) operators.add(inc.assigned_to || inc.created_by);
  const maxPerOperator = operators.size > 0
    ? Math.max(...[...operators].map(op => unresolved.filter(i => (i.assigned_to || i.created_by) === op).length))
    : 0;
  const workloadPressure = Math.min(100, maxPerOperator * 20);
  components.push({
    name: 'Workload Concentration',
    pressure: workloadPressure,
    trend: maxPerOperator >= 4 ? 'degrading' : maxPerOperator >= 2 ? 'stable' : 'improving',
    factors: [`${operators.size} active coordinators`, `max load: ${maxPerOperator} incidents`],
  });

  // ── Overall ──
  const overallPressure = Math.round(components.reduce((s, c) => s + c.pressure, 0) / components.length);
  const degradingCount = components.filter(c => c.trend === 'degrading').length;

  const direction: OperationalStabilityIndex['direction'] =
    degradingCount >= 3 ? 'acute' :
    degradingCount >= 2 ? 'destabilizing' :
    overallPressure <= 20 ? 'stabilizing' : 'stable';

  // Duration of current state
  const oldestUnresolved = unresolved.length > 0
    ? Math.min(...unresolved.map(i => new Date(i.opened_at).getTime()))
    : now.getTime();
  const durationMin = Math.round((now.getTime() - oldestUnresolved) / 60_000);

  // Narrative
  const narrativeParts: string[] = [];
  if (direction === 'acute') narrativeParts.push('Multiple operational systems under simultaneous strain.');
  else if (direction === 'destabilizing') narrativeParts.push('Operational conditions showing signs of degradation.');
  else if (direction === 'stabilizing') narrativeParts.push('Conditions improving toward operational stability.');
  else narrativeParts.push('Operations within manageable parameters.');

  const degrading = components.filter(c => c.trend === 'degrading');
  if (degrading.length > 0) narrativeParts.push(`Pressure increasing in: ${degrading.map(c => c.name.toLowerCase()).join(', ')}.`);

  return {
    overallPressure,
    direction,
    components,
    durationMin,
    narrative: narrativeParts.join(' '),
  };
}

// ============================================================
// EARLY STABILIZATION RECOMMENDATIONS
// ============================================================

function deriveEarlyRecommendations(
  signals: readonly DestabilizationSignal[],
  stability: OperationalStabilityIndex,
  recurringConditions: readonly RecurringCondition[],
  now: Date,
): EarlyRecommendation[] {
  const recs: EarlyRecommendation[] = [];

  // Pressure accumulation → early reassignment
  const pressureSignal = signals.find(s => s.condition.includes('growing'));
  if (pressureSignal) {
    recs.push({
      suggestion: 'Consider early coordination redistribution before saturation threshold.',
      rationale: `Unresolved incident count is growing. Current trajectory may exceed coordination capacity.`,
      historicalBasis: 'Operational memory indicates early reassignment historically reduces escalation propagation under similar accumulation patterns.',
      limitation: 'Based on pattern observation, not prediction. Actual conditions may differ.',
      relatedSignal: pressureSignal.condition,
    });
  }

  // Recovery blockage → alternative approach
  const blockageSignal = signals.find(s => s.condition.includes('blockage'));
  if (blockageSignal) {
    recs.push({
      suggestion: 'Recovery coordination may need structural approach change.',
      rationale: `Multiple recovery actions are blocked. Current recovery strategy may be resource-constrained.`,
      historicalBasis: 'Prior incidents with multiple blocked recovery actions stabilized faster when alternative recovery pathways were attempted rather than waiting for blocked actions to unblock.',
      limitation: 'Limited historical sample. Resource availability may differ from prior conditions.',
      relatedSignal: blockageSignal.condition,
    });
  }

  // Multi-zone → resource coordination
  const multiZone = signals.find(s => s.condition.includes('Multi-zone'));
  if (multiZone) {
    recs.push({
      suggestion: 'Cross-zone coordination may benefit from temporary resource sharing.',
      rationale: `Multiple zones under pressure simultaneously. Resource contention between zones possible.`,
      historicalBasis: 'Multi-zone pressure events historically benefit from explicit cross-zone coordination rather than independent zone management.',
      limitation: 'Zone-specific conditions may require zone-specific responses despite aggregate pressure.',
      relatedSignal: multiZone.condition,
    });
  }

  // Overall destabilization → escalation timing
  if (stability.direction === 'destabilizing' || stability.direction === 'acute') {
    recs.push({
      suggestion: 'Operational conditions may warrant proactive escalation before further deterioration.',
      rationale: `Stability index shows ${stability.direction} conditions. ${stability.components.filter(c => c.trend === 'degrading').length} stability components degrading.`,
      historicalBasis: 'Early escalation during destabilization windows historically correlates with shorter total recovery duration.',
      limitation: `Stability index is a composite indicator with ${stability.components.length} components. Individual conditions may not require escalation.`,
    });
  }

  return recs;
}
