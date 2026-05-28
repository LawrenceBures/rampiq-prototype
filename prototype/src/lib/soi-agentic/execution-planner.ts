/**
 * SOI Agentic — Execution Planner
 *
 * Generates multi-step recovery chains from operational objectives.
 * Each plan step maps to an executable lifecycle command.
 *
 * All plans are deterministic and explainable.
 */

import type { OperationalObjective } from './objective-builder';
import type { OperationalAssessment, ZoneAssessment, PressureSource } from '@/lib/soi-intelligence/operational-reasoning';
import type { SoiRecommendation } from '@/lib/soi-intelligence/recovery-recommendations';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';

// ============================================================
// TYPES
// ============================================================

export type StepActionType = 'dispatch' | 'reassign' | 'escalate' | 'hold' | 'recover' | 'stabilize' | 'acknowledge' | 'unblock';

export interface PlannedStep {
  stepId: string;
  sequence: number;
  title: string;
  actionType: StepActionType;
  target: string;
  targetIncidentId?: string;
  targetRecoveryActionId?: string;
  reasoning: string[];
  estimatedImpact: string;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedDurationMinutes: number;
}

export interface ExecutionPlan {
  planId: string;
  objectiveId: string;
  objective: OperationalObjective;
  steps: PlannedStep[];
  totalEstimatedMinutes: number;
  estimatedPressureReduction: number;
  confidence: number;
  summary: string;
  tradeoffs: string[];
  assumptions: string[];
}

// ============================================================
// PLANNER
// ============================================================

export function buildExecutionPlan(
  objective: OperationalObjective,
  assessment: OperationalAssessment,
  recommendations: readonly SoiRecommendation[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
): ExecutionPlan {
  const za = objective.targetZone
    ? assessment.zoneAssessments.find(z => z.zoneId === objective.targetZone)
    : getWorstZone(assessment);

  const steps: PlannedStep[] = [];
  const tradeoffs: string[] = [];
  const assumptions: string[] = ['Current operational state continues during execution'];
  let seq = 0;

  if (!za) {
    return emptyPlan(objective, 'No zone data available to plan against.');
  }

  const zoneIncidents = incidents.filter(i =>
    i.status !== 'RESOLVED' && i.status !== 'CLOSED' &&
    (i.zone_id === za.zoneId || (i.gate_id && za.pressureSources.some(ps => ps.affectedGates.includes(i.gate_id!))))
  );

  const zoneRAs = recoveryActions.filter(ra =>
    (ra.zone_id === za.zoneId || (ra.gate_id && za.pressureSources.some(ps => ps.affectedGates.includes(ra.gate_id!)))) &&
    ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED'
  );

  // --- Step: Unblock stalled recovery actions ---
  const stalledRAs = zoneRAs.filter(ra => ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
  for (const ra of stalledRAs.slice(0, 3)) {
    seq++;
    steps.push({
      stepId: `step-${seq}`,
      sequence: seq,
      title: ra.status === 'PROPOSED' ? `Acknowledge: ${ra.title}` : `Unblock: ${ra.title}`,
      actionType: ra.status === 'PROPOSED' ? 'acknowledge' : 'unblock',
      target: ra.gate_id ?? za.zoneId,
      targetRecoveryActionId: ra.id,
      targetIncidentId: ra.incident_id,
      reasoning: [
        `${ra.title} is ${ra.status.toLowerCase()} and needs progression`,
        'Existing recovery actions should be advanced before creating new ones',
      ],
      estimatedImpact: 'Progress existing recovery chain',
      riskLevel: 'low',
      estimatedDurationMinutes: 3,
    });
  }

  // --- Step: Dispatch support for unresolved incidents ---
  const unresolvedWithoutRA = zoneIncidents.filter(i =>
    !zoneRAs.some(ra => ra.incident_id === i.id && ra.status !== 'WITHDRAWN')
  );
  const criticalFirst = [...unresolvedWithoutRA].sort((a, b) => {
    const sw: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (sw[a.severity] ?? 3) - (sw[b.severity] ?? 3);
  });

  for (const inc of criticalFirst.slice(0, 3)) {
    seq++;
    const isProtectOutbound = objective.type === 'protect_outbound_push';
    steps.push({
      stepId: `step-${seq}`,
      sequence: seq,
      title: `${isProtectOutbound ? 'Priority dispatch' : 'Dispatch recovery'}: ${inc.title.slice(0, 50)}`,
      actionType: 'dispatch',
      target: inc.gate_id ?? za.zoneId,
      targetIncidentId: inc.id,
      reasoning: [
        `${inc.severity} incident unresolved without active recovery`,
        `Gate ${inc.gate_id ?? 'unknown'} — ${inc.title}`,
        ...(isProtectOutbound ? ['Departure timeline at risk — priority dispatch'] : []),
      ],
      estimatedImpact: `Create recovery action for ${inc.severity.toLowerCase()} incident`,
      riskLevel: inc.severity === 'CRITICAL' ? 'high' : 'medium',
      estimatedDurationMinutes: inc.severity === 'CRITICAL' ? 8 : 12,
    });
  }

  // --- Step: Escalate if still critical after dispatch ---
  if (za.criticalCount > 2 || za.oldestUnresolvedMinutes > 45) {
    seq++;
    steps.push({
      stepId: `step-${seq}`,
      sequence: seq,
      title: `Escalate: request ops support for ${za.zoneLabel}`,
      actionType: 'escalate',
      target: za.zoneId,
      reasoning: [
        za.criticalCount > 2 ? `${za.criticalCount} critical incidents exceed zone capacity` : '',
        za.oldestUnresolvedMinutes > 45 ? `Oldest incident unresolved for ${za.oldestUnresolvedMinutes}m` : '',
      ].filter(Boolean),
      estimatedImpact: 'Bring leadership attention and additional resources',
      riskLevel: 'low',
      estimatedDurationMinutes: 5,
    });
    tradeoffs.push('Escalation consumes leadership attention');
  }

  // --- Step: Hold outbound if protecting push ---
  if (objective.type === 'protect_outbound_push' && za.pressure >= 70) {
    seq++;
    steps.push({
      stepId: `step-${seq}`,
      sequence: seq,
      title: 'Hold outbound push 3–5m if instability persists',
      actionType: 'hold',
      target: za.zoneId,
      reasoning: ['Gate stability not yet confirmed', 'Short hold prevents departure into active incident zone'],
      estimatedImpact: 'Prevent schedule disruption from unstable gate ops',
      riskLevel: 'medium',
      estimatedDurationMinutes: 5,
    });
    tradeoffs.push('Outbound departure delay of 3–5 minutes');
  }

  // --- Step: Stabilize checkpoint ---
  if (steps.length > 0 && objective.type !== 'dispatch_recovery') {
    seq++;
    steps.push({
      stepId: `step-${seq}`,
      sequence: seq,
      title: `Monitor: confirm ${za.zoneLabel} stabilization`,
      actionType: 'stabilize',
      target: za.zoneId,
      reasoning: ['Verify pressure reduction after recovery actions execute', 'Confirm no new cascades form'],
      estimatedImpact: 'Confirm operational stability',
      riskLevel: 'low',
      estimatedDurationMinutes: 10,
    });
  }

  // Compute totals
  const totalMinutes = steps.reduce((s, step) => s + step.estimatedDurationMinutes, 0);
  const pressureReduction = Math.min(za.pressure, steps.length * 12 + stalledRAs.length * 8);

  if (objective.constraints.some(c => c.includes('minimize staffing'))) {
    tradeoffs.push('Conservative staffing approach may extend stabilization time');
    assumptions.push('Existing staff can absorb incremental load');
  }

  if (objective.riskTolerance === 'high') {
    assumptions.push('Aggressive recovery accepted — higher resource churn expected');
  }

  const confidence = Math.min(95, 40 + steps.length * 8 + (stalledRAs.length > 0 ? 10 : 0));

  return {
    planId: `plan-${objective.objectiveId}`,
    objectiveId: objective.objectiveId,
    objective,
    steps,
    totalEstimatedMinutes: totalMinutes,
    estimatedPressureReduction: Math.round(pressureReduction),
    confidence,
    summary: steps.length === 0
      ? `No actionable steps identified for ${za.zoneLabel}. Zone may already be under recovery.`
      : `${steps.length}-step recovery plan for ${za.zoneLabel}. Est. ${totalMinutes}m to stabilization. Pressure reduction: ~${Math.round(pressureReduction)} points.`,
    tradeoffs,
    assumptions,
  };
}

/**
 * Build an alternative plan with different constraints.
 */
export function buildAlternativePlan(
  objective: OperationalObjective,
  assessment: OperationalAssessment,
  recommendations: readonly SoiRecommendation[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
): ExecutionPlan {
  // Flip risk tolerance for alternative
  const altObjective: OperationalObjective = {
    ...objective,
    objectiveId: `${objective.objectiveId}-alt`,
    riskTolerance: objective.riskTolerance === 'high' ? 'low' : 'high',
    constraints: objective.riskTolerance === 'high'
      ? [...objective.constraints, 'minimize staffing disruption']
      : objective.constraints.filter(c => !c.includes('minimize')),
  };
  return buildExecutionPlan(altObjective, assessment, recommendations, incidents, recoveryActions);
}

function getWorstZone(assessment: OperationalAssessment): ZoneAssessment | null {
  if (assessment.zoneAssessments.length === 0) return null;
  return [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
}

function emptyPlan(objective: OperationalObjective, reason: string): ExecutionPlan {
  return {
    planId: `plan-${objective.objectiveId}`,
    objectiveId: objective.objectiveId,
    objective,
    steps: [],
    totalEstimatedMinutes: 0,
    estimatedPressureReduction: 0,
    confidence: 0,
    summary: reason,
    tradeoffs: [],
    assumptions: [],
  };
}
