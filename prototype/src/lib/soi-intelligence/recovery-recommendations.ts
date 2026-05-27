/**
 * SOI Intelligence Core — Recovery Recommendations
 *
 * Generates actionable recovery recommendations from operational state.
 * Each recommendation includes reasoning chain, confidence, estimated
 * stabilization time, and executable action descriptors.
 *
 * All functions are pure and replay-safe.
 */

import type { SoiEvent, Severity } from '@/lib/soi-types';
import type { Zone } from '@/lib/soi-types';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import { assessOperation, type ZoneAssessment, type PressureSource } from './operational-reasoning';
import { computeConfidence, assessDataCompleteness, type ConfidenceResult } from './confidence-scoring';
import { simulateRecovery, type WhatIfResult } from './what-if-simulator';

// ============================================================
// TYPES
// ============================================================

export interface RecommendedAction {
  type: 'dispatch_agent' | 'reassign_equipment' | 'escalate_support' | 'hold_push' | 'monitor';
  label: string;
  target: string;
  assignedTo?: string;
  expectedImpact: string;
}

export interface SoiRecommendation {
  id: string;
  title: string;
  summary: string;
  affectedZone: string;
  affectedGate?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: ConfidenceResult;
  estimatedStabilizationMinutes: number;
  reasoning: string[];
  recommendedActions: RecommendedAction[];
  preview: WhatIfResult;
  /** Single primary incident for recovery action creation. Deterministic: CRITICAL > HIGH > oldest. */
  primaryIncidentId: string | null;
  sourceIncidentIds: string[];
  generatedAt: string;
}

// ============================================================
// RECOMMENDATION GENERATION
// ============================================================

const SEV_WEIGHT: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * Select a single primary incident for recovery action creation.
 * Deterministic: CRITICAL > HIGH > oldest unresolved > first by ID.
 */
function selectPrimaryIncident(incidents: readonly Incident[]): string | null {
  if (incidents.length === 0) return null;
  const sorted = [...incidents].sort((a, b) => {
    const sevDiff = (SEV_WEIGHT[b.severity as Severity] ?? 1) - (SEV_WEIGHT[a.severity as Severity] ?? 1);
    if (sevDiff !== 0) return sevDiff;
    return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
  });
  return sorted[0].id;
}

export function generateRecommendations(
  events: readonly SoiEvent[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  zones: readonly Zone[],
  asOf?: Date,
): SoiRecommendation[] {
  const now = asOf ?? new Date();
  const assessment = assessOperation(events, incidents, recoveryActions, zones, asOf);
  const recommendations: SoiRecommendation[] = [];

  for (const za of assessment.zoneAssessments) {
    if (za.stability === 'stable') continue;

    const zoneRecs = generateZoneRecommendations(
      za, events, incidents, recoveryActions, zones, now,
    );
    recommendations.push(...zoneRecs);
  }

  // Sort: highest severity first, then confidence
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => {
    const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence.score - a.confidence.score;
  });

  return recommendations.slice(0, 8);
}

function generateZoneRecommendations(
  za: ZoneAssessment,
  events: readonly SoiEvent[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  zones: readonly Zone[],
  now: Date,
): SoiRecommendation[] {
  const recs: SoiRecommendation[] = [];
  const nowMs = now.getTime();

  const zoneIncidents = incidents.filter(i =>
    i.status !== 'RESOLVED' && i.status !== 'CLOSED' &&
    (i.zone_id === za.zoneId || (i.gate_id && za.pressureSources.some(ps => ps.affectedGates.includes(i.gate_id!))))
  );

  const zoneRecoveryActions = recoveryActions.filter(ra =>
    ra.zone_id === za.zoneId || (ra.gate_id && za.pressureSources.some(ps => ps.affectedGates.includes(ra.gate_id!)))
  );

  const activeRAs = zoneRecoveryActions.filter(ra =>
    ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED'
  );

  // --- Recommendation: Staffing reinforcement for high-pressure zones ---
  const unresolvedSource = za.pressureSources.find(ps => ps.type === 'unresolved_incidents');
  if (unresolvedSource && za.unresolvedCount >= 2) {
    const reasoning: string[] = [
      `${za.zoneLabel} has ${za.unresolvedCount} unresolved incidents.`,
      `Zone pressure is ${za.pressure}/100 (${za.stability}).`,
      ...za.explanation,
    ];

    const actions: RecommendedAction[] = [{
      type: 'dispatch_agent',
      label: `Deploy additional support to ${za.zoneLabel}`,
      target: za.zoneId,
      expectedImpact: `Reduce incident backlog and enable parallel resolution across ${unresolvedSource.affectedGates.length} affected gates`,
    }];

    if (za.unresolvedCount >= 3) {
      actions.push({
        type: 'escalate_support',
        label: `Request crew chief coordination for ${za.zoneLabel}`,
        target: za.zoneId,
        expectedImpact: 'Coordinate multi-gate recovery and prioritize critical incidents',
      });
    }

    const confidence = computeConfidence({
      relatedIncidentsInZone: za.unresolvedCount,
      equipmentImplicated: za.pressureSources.some(ps => ps.type === 'equipment_recurrence'),
      severityLevel: za.criticalCount > 0 ? 'CRITICAL' : 'HIGH',
      incidentAgeMinutes: za.oldestUnresolvedMinutes,
      matchingRecoveryExists: activeRAs.length > 0,
      dataCompleteness: assessDataCompleteness(zoneIncidents, events, za.zoneId),
      historicalPatternMatch: false,
      workforcePressureHigh: za.unresolvedCount >= 3,
    });

    const preview = simulateRecovery(za, actions, zoneIncidents, activeRAs);

    recs.push({
      id: `rec-staff-${za.zoneId}`,
      title: `Reinforce ${za.zoneLabel}`,
      summary: `${za.unresolvedCount} unresolved incidents creating ${za.stability} conditions. Deploy support to reduce pressure.`,
      affectedZone: za.zoneId,
      affectedGate: unresolvedSource.affectedGates[0],
      severity: za.stability === 'critical' ? 'critical' : za.stability === 'unstable' ? 'high' : 'medium',
      confidence,
      estimatedStabilizationMinutes: estimateStabilization(za, activeRAs.length),
      reasoning,
      recommendedActions: actions,
      preview,
      primaryIncidentId: selectPrimaryIncident(zoneIncidents),
      sourceIncidentIds: zoneIncidents.map(i => i.id),
      generatedAt: now.toISOString(),
    });
  }

  // --- Recommendation: Equipment reassignment ---
  const equipSource = za.pressureSources.find(ps => ps.type === 'equipment_recurrence');
  if (equipSource) {
    const reasoning = [
      equipSource.description,
      `Recurring equipment issues at gate${equipSource.affectedGates.length > 1 ? 's' : ''} ${equipSource.affectedGates.join(', ')}.`,
      'Equipment swap or replacement would eliminate this pressure source.',
    ];

    const actions: RecommendedAction[] = [{
      type: 'reassign_equipment',
      label: `Replace or reassign equipment at ${equipSource.affectedGates.join(', ')}`,
      target: equipSource.affectedGates[0] ?? za.zoneId,
      expectedImpact: 'Eliminate recurring equipment failures and prevent cascade to adjacent operations',
    }];

    const confidence = computeConfidence({
      relatedIncidentsInZone: za.unresolvedCount,
      equipmentImplicated: true,
      severityLevel: 'HIGH',
      incidentAgeMinutes: za.oldestUnresolvedMinutes,
      matchingRecoveryExists: activeRAs.some(ra => ra.action_type === 'EQUIPMENT_SWAP'),
      dataCompleteness: assessDataCompleteness(zoneIncidents, events, za.zoneId),
      historicalPatternMatch: false,
      workforcePressureHigh: false,
    });

    const preview = simulateRecovery(za, actions, zoneIncidents, activeRAs);

    recs.push({
      id: `rec-equip-${za.zoneId}`,
      title: `Equipment issue in ${za.zoneLabel}`,
      summary: equipSource.description,
      affectedZone: za.zoneId,
      affectedGate: equipSource.affectedGates[0],
      severity: equipSource.severity === 'critical' ? 'critical' : 'high',
      confidence,
      estimatedStabilizationMinutes: 15,
      reasoning,
      recommendedActions: actions,
      preview,
      primaryIncidentId: selectPrimaryIncident(zoneIncidents.filter(i =>
        i.gate_id && equipSource.affectedGates.includes(i.gate_id)
      )) ?? selectPrimaryIncident(zoneIncidents),
      sourceIncidentIds: equipSource.contributingIds,
      generatedAt: now.toISOString(),
    });
  }

  // --- Recommendation: Escalation for aged incidents ---
  const agedSource = za.pressureSources.find(ps => ps.type === 'aged_incident');
  if (agedSource && za.oldestUnresolvedMinutes > 30) {
    const reasoning = [
      agedSource.description,
      `Prolonged unresolved state increases cascade risk to adjacent gates.`,
      za.oldestUnresolvedMinutes > 60
        ? 'Exceeds 60-minute threshold — immediate escalation recommended.'
        : 'Approaching critical age threshold — escalation should be considered.',
    ];

    const actions: RecommendedAction[] = [{
      type: 'escalate_support',
      label: `Escalate aged incident${agedSource.contributingIds.length > 1 ? 's' : ''} in ${za.zoneLabel}`,
      target: za.zoneId,
      expectedImpact: 'Bring leadership attention and additional resources to stalled resolution',
    }];

    // Check if existing recovery is stalled rather than duplicating
    const stalledRAs = activeRAs.filter(ra => ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
    if (stalledRAs.length > 0) {
      actions.unshift({
        type: 'monitor',
        label: `Unblock ${stalledRAs.length} stalled recovery action${stalledRAs.length > 1 ? 's' : ''}`,
        target: za.zoneId,
        expectedImpact: 'Existing recovery paths are stalled — acknowledging or unblocking may be sufficient',
      });
      reasoning.push(`${stalledRAs.length} existing recovery action${stalledRAs.length > 1 ? 's are' : ' is'} stalled — consider progressing before creating new actions.`);
    }

    const confidence = computeConfidence({
      relatedIncidentsInZone: za.unresolvedCount,
      equipmentImplicated: false,
      severityLevel: za.criticalCount > 0 ? 'CRITICAL' : 'HIGH',
      incidentAgeMinutes: za.oldestUnresolvedMinutes,
      matchingRecoveryExists: stalledRAs.length > 0,
      dataCompleteness: assessDataCompleteness(zoneIncidents, events, za.zoneId),
      historicalPatternMatch: false,
      workforcePressureHigh: za.unresolvedCount >= 3,
    });

    const preview = simulateRecovery(za, actions, zoneIncidents, activeRAs);

    recs.push({
      id: `rec-esc-${za.zoneId}`,
      title: `Escalate in ${za.zoneLabel}`,
      summary: `Incident${agedSource.contributingIds.length > 1 ? 's' : ''} unresolved for ${za.oldestUnresolvedMinutes}+ minutes. Escalation needed.`,
      affectedZone: za.zoneId,
      severity: za.oldestUnresolvedMinutes > 60 ? 'critical' : 'high',
      confidence,
      estimatedStabilizationMinutes: estimateStabilization(za, activeRAs.length) + 10,
      reasoning,
      recommendedActions: actions,
      preview,
      primaryIncidentId: selectPrimaryIncident(
        zoneIncidents.filter(i => agedSource.contributingIds.includes(i.id))
      ) ?? selectPrimaryIncident(zoneIncidents),
      sourceIncidentIds: agedSource.contributingIds,
      generatedAt: now.toISOString(),
    });
  }

  return recs;
}

function estimateStabilization(za: ZoneAssessment, activeRecoveryCount: number): number {
  const baseTime = za.criticalCount > 0 ? 25 : za.unresolvedCount >= 3 ? 20 : 12;
  const agePenalty = Math.min(za.oldestUnresolvedMinutes / 10, 15);
  const recoveryBonus = activeRecoveryCount * 3;
  return Math.round(Math.max(5, baseTime + agePenalty - recoveryBonus));
}
