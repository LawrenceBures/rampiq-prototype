// RampIQ — Contextualized Workforce Intelligence
// Phase 11.5: Governance-aware personnel analysis.
//
// CORE PRINCIPLE:
//   Evaluate OPERATIONAL BEHAVIOR WITHIN OPERATIONAL CONTEXT.
//   Never isolated productivity. Never naked metrics.
//
// RULES:
//   1. Pure functions only — deterministic, replay-safe
//   2. Every metric MUST include operational context
//   3. No leaderboards, no rankings, no scorecards
//   4. No gamification, no compliance scoring
//   5. All access auditable via governance-audit.ts
//   6. Derives from existing operational memory only
//   7. Separation: this module powers MANAGEMENT surfaces only
//      — never frontline coordination surfaces
//
// FORBIDDEN OUTPUTS:
//   - "top performer" / "lowest performer"
//   - comparative employee dashboards
//   - recommendation compliance rates per operator
//   - score-based workforce sorting
//   - automated disciplinary recommendations
//
// REQUIRED: Every insight must answer
//   "How did coordination behave UNDER THESE CONDITIONS?"
//   Never "Who is best?"

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { RampiqEvent } from './rampiq-types';
import type { RecoveryEffectiveness } from './outcome-measurement';
import { deriveOperationalOutcomes } from './outcome-measurement';

// ============================================================
// TYPES
// ============================================================

/** Operational context at the time of any measurement */
export interface OperationalContext {
  /** Active incident count when this behavior occurred */
  activeIncidentCount: number;
  /** Severity distribution at that moment */
  severityMix: { critical: number; high: number; medium: number; low: number };
  /** Was the operator at or above saturation threshold? */
  atSaturation: boolean;
  /** Number of simultaneous escalations */
  activeEscalations: number;
  /** Zone pressure level (0-100) */
  zonePressure: number;
}

/** A single contextualized operational insight about coordination behavior */
export interface ContextualizedInsight {
  /** What was observed */
  observation: string;
  /** The operational conditions when it was observed */
  context: OperationalContext;
  /** Context narrative — mandatory, replaces naked metrics */
  contextNarrative: string;
  /** Category */
  category: 'stabilization' | 'escalation_response' | 'recovery_coordination' | 'workload_resilience' | 'support_opportunity';
  /** Time period this covers */
  periodStart: string;
  periodEnd: string;
  /** Supporting incident IDs */
  incidentIds: string[];
}

/** Workforce intelligence output for a single operator */
export interface OperatorIntelligence {
  operatorId: string;
  /** Total incidents coordinated in the analysis window */
  incidentsCoordinated: number;
  /** Contextualized insights — never naked metrics */
  insights: ContextualizedInsight[];
  /** Aggregate operational context across the window */
  aggregateContext: {
    avgActiveIncidents: number;
    peakActiveIncidents: number;
    totalEscalationsHandled: number;
    totalReassignmentsParticipated: number;
    avgZonePressure: number;
  };
}

export interface WorkforceIntelligenceOutput {
  /** Per-operator contextualized intelligence */
  operators: OperatorIntelligence[];
  /** System-level coordination patterns (no individual attribution) */
  systemPatterns: ContextualizedInsight[];
  /** Governance metadata */
  analysisTimestamp: string;
  analysisWindow: { start: string; end: string };
}

// ============================================================
// MAIN ENGINE
// ============================================================

const SEV_WEIGHT: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 };

/**
 * Derive contextualized workforce intelligence.
 * Pure function — deterministic, replay-safe.
 *
 * This module is for MANAGEMENT surfaces only.
 * It must NEVER be rendered on frontline coordination surfaces.
 * All access must be governance-audited.
 */
export function deriveWorkforceIntelligence(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  asOf?: Date,
): WorkforceIntelligenceOutput {
  const now = asOf ?? new Date();
  const windowMs = 4 * 60 * 60_000; // 4-hour analysis window
  const windowStart = new Date(now.getTime() - windowMs);
  const windowStartStr = windowStart.toISOString();

  // Filter to analysis window
  const windowEvents = events.filter(e => new Date(e.created_at).getTime() >= windowStart.getTime());
  const windowIncidents = incidents.filter(i => new Date(i.opened_at).getTime() >= windowStart.getTime());
  const outcomes = deriveOperationalOutcomes(incidents, recoveryActions, events, now);

  // Identify operators who participated
  const operatorIds = new Set<string>();
  for (const inc of windowIncidents) {
    if (inc.created_by) operatorIds.add(inc.created_by);
    if (inc.assigned_to) operatorIds.add(inc.assigned_to);
  }
  for (const ev of windowEvents) {
    if (ev.reported_by && ev.entity_type) operatorIds.add(ev.reported_by);
  }

  // Per-operator analysis
  const operators: OperatorIntelligence[] = [];
  for (const opId of operatorIds) {
    const opInsights = analyzeOperator(opId, windowIncidents, recoveryActions, windowEvents, outcomes.recoveryEffectiveness, now);
    if (opInsights.incidentsCoordinated > 0) {
      operators.push(opInsights);
    }
  }

  // System-level patterns (no individual attribution)
  const systemPatterns = deriveSystemPatterns(windowIncidents, recoveryActions, windowEvents, outcomes, now);

  return {
    operators,
    systemPatterns,
    analysisTimestamp: now.toISOString(),
    analysisWindow: { start: windowStartStr, end: now.toISOString() },
  };
}

// ============================================================
// PER-OPERATOR ANALYSIS (always contextualized)
// ============================================================

function analyzeOperator(
  operatorId: string,
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  recoveryEffectiveness: readonly RecoveryEffectiveness[],
  now: Date,
): OperatorIntelligence {
  // Incidents this operator coordinated
  const coordinated = incidents.filter(i => i.created_by === operatorId || i.assigned_to === operatorId);
  const insights: ContextualizedInsight[] = [];

  // Build operational context at each incident
  for (const inc of coordinated) {
    const incTime = new Date(inc.opened_at).getTime();
    const concurrent = incidents.filter(i => {
      const opened = new Date(i.opened_at).getTime();
      const resolved = i.resolved_at ? new Date(i.resolved_at).getTime() : Infinity;
      return opened <= incTime && resolved > incTime;
    });

    const context: OperationalContext = {
      activeIncidentCount: concurrent.length,
      severityMix: {
        critical: concurrent.filter(i => i.severity === 'CRITICAL').length,
        high: concurrent.filter(i => i.severity === 'HIGH').length,
        medium: concurrent.filter(i => i.severity === 'MEDIUM').length,
        low: concurrent.filter(i => i.severity === 'LOW').length,
      },
      atSaturation: concurrent.length >= 3,
      activeEscalations: events.filter(e =>
        e.event_type.includes('escalation') && new Date(e.created_at).getTime() <= incTime
      ).length,
      zonePressure: concurrent.reduce((s, i) => s + (SEV_WEIGHT[i.severity] ?? 1), 0) * 10,
    };

    const effectiveness = recoveryEffectiveness.find(r => r.incidentId === inc.id);

    // Stabilization insight
    if (effectiveness?.totalResolutionTime != null) {
      const contextParts = [];
      if (context.activeIncidentCount >= 3) contextParts.push(`${context.activeIncidentCount} simultaneous incidents`);
      if (context.severityMix.critical > 0) contextParts.push(`${context.severityMix.critical} critical`);
      if (context.atSaturation) contextParts.push('at workload saturation');
      if (context.activeEscalations > 0) contextParts.push(`${context.activeEscalations} active escalations`);

      insights.push({
        observation: `Incident "${inc.title.slice(0, 30)}" resolved in ${effectiveness.totalResolutionTime}m` +
          (effectiveness.escalated ? ' (with escalation)' : '') +
          (effectiveness.reassigned ? ' (with reassignment)' : ''),
        context,
        contextNarrative: contextParts.length > 0
          ? `Occurred during: ${contextParts.join(', ')}.`
          : 'Occurred under nominal operational conditions.',
        category: 'stabilization',
        periodStart: inc.opened_at,
        periodEnd: inc.resolved_at ?? now.toISOString(),
        incidentIds: [inc.id],
      });
    }

    // Support opportunity: incident stuck in CONFIRMED too long
    if (inc.status === 'CONFIRMED' && !inc.recovering_at) {
      const stalledMin = Math.round((now.getTime() - new Date(inc.acknowledged_at ?? inc.opened_at).getTime()) / 60_000);
      if (stalledMin >= 20) {
        insights.push({
          observation: `Incident "${inc.title.slice(0, 30)}" at CONFIRMED for ${stalledMin}m — recovery not yet initiated.`,
          context,
          contextNarrative: context.atSaturation
            ? `Coordinator was at workload saturation with ${context.activeIncidentCount} active incidents. Delayed recovery initiation may reflect resource constraints rather than coordination gap.`
            : `Workload was manageable (${context.activeIncidentCount} active). May benefit from additional training on recovery initiation timing.`,
          category: 'support_opportunity',
          periodStart: inc.opened_at,
          periodEnd: now.toISOString(),
          incidentIds: [inc.id],
        });
      }
    }
  }

  // Aggregate context
  const escalationEvents = events.filter(e =>
    e.event_type.includes('escalation') && e.reported_by === operatorId
  );
  const reassignEvents = events.filter(e =>
    e.event_type.includes('reassigned') && (e.reported_by === operatorId || e.state_after === operatorId || e.state_before === operatorId)
  );

  return {
    operatorId,
    incidentsCoordinated: coordinated.length,
    insights,
    aggregateContext: {
      avgActiveIncidents: coordinated.length > 0
        ? Math.round(coordinated.reduce((s, i) => {
            const concurrent = incidents.filter(j => {
              const t = new Date(i.opened_at).getTime();
              return new Date(j.opened_at).getTime() <= t && (!j.resolved_at || new Date(j.resolved_at).getTime() > t);
            }).length;
            return s + concurrent;
          }, 0) / coordinated.length)
        : 0,
      peakActiveIncidents: 0, // simplified
      totalEscalationsHandled: escalationEvents.length,
      totalReassignmentsParticipated: reassignEvents.length,
      avgZonePressure: 0, // simplified
    },
  };
}

// ============================================================
// SYSTEM-LEVEL PATTERNS (no individual attribution)
// ============================================================

function deriveSystemPatterns(
  incidents: readonly Incident[],
  actions: readonly RecoveryAction[],
  events: readonly RampiqEvent[],
  outcomes: ReturnType<typeof deriveOperationalOutcomes>,
  now: Date,
): ContextualizedInsight[] {
  const patterns: ContextualizedInsight[] = [];

  // System-level: escalation effectiveness
  const escalationEvents = events.filter(e => e.event_type.includes('escalation.requested'));
  if (escalationEvents.length > 0) {
    const improved = outcomes.pressureDeltas.filter(d => d.actionType === 'escalation' && d.outcome === 'improved');
    const total = outcomes.pressureDeltas.filter(d => d.actionType === 'escalation');

    patterns.push({
      observation: `${escalationEvents.length} escalations in analysis window. ${improved.length} of ${total.length} measured escalations showed pressure improvement.`,
      context: {
        activeIncidentCount: incidents.filter(i => !i.resolved_at).length,
        severityMix: { critical: 0, high: 0, medium: 0, low: 0 },
        atSaturation: false, activeEscalations: escalationEvents.length, zonePressure: 0,
      },
      contextNarrative: 'System-level escalation effectiveness across all coordinators and zones.',
      category: 'escalation_response',
      periodStart: new Date(now.getTime() - 4 * 60 * 60_000).toISOString(),
      periodEnd: now.toISOString(),
      incidentIds: [],
    });
  }

  // System-level: recovery success rate
  if (outcomes.aggregate.recoverySuccessRate !== null) {
    const rate = outcomes.aggregate.recoverySuccessRate;
    patterns.push({
      observation: `Recovery action success rate: ${Math.round(rate * 100)}%. ${rate < 0.5 ? 'Below 50% — systemic recovery coordination may need structural review.' : 'Within acceptable range.'}`,
      context: {
        activeIncidentCount: incidents.length, severityMix: { critical: 0, high: 0, medium: 0, low: 0 },
        atSaturation: false, activeEscalations: 0, zonePressure: 0,
      },
      contextNarrative: 'System-level recovery effectiveness across all incidents and coordinators.',
      category: 'recovery_coordination',
      periodStart: new Date(now.getTime() - 4 * 60 * 60_000).toISOString(),
      periodEnd: now.toISOString(),
      incidentIds: [],
    });
  }

  return patterns;
}
