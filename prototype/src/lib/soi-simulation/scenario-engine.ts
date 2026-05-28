/**
 * SOI Simulation — Scenario Engine
 *
 * Models operational interventions and compares projected outcomes.
 * Deterministic. No ML. All traceable.
 */

import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { ZoneForecast, ForecastConfidence } from '@/lib/soi-predictive/pressure-forecast';
import type { CascadeRisk } from '@/lib/soi-predictive/cascade-forecast';
import type { RecoveryConfidenceReport } from '@/lib/soi-predictive/recovery-confidence';
import type { OperationalProfile } from '@/lib/soi-adaptive/operational-context-analyzer';
import { computeAdaptiveModifiers, explainWeighting } from '@/lib/soi-adaptive/dynamic-weighting';

// ============================================================
// TYPES
// ============================================================

export type InterventionType =
  | 'no_action'
  | 'dispatch_recovery'
  | 'delay_recovery'
  | 'reroute_staffing'
  | 'reassign_equipment'
  | 'split_resources'
  | 'escalate_support';

export interface ScenarioOutcome {
  zoneId: string;
  zoneLabel: string;
  currentPressure: number;
  projectedPressure: number;
  stabilizationMinutes: number;
  cascadeRiskReduced: boolean;
  departureImpact: 'improved' | 'unchanged' | 'worsened';
}

export interface ScenarioTradeoff {
  description: string;
  severity: 'low' | 'medium' | 'high';
  affectedZone?: string;
}

export interface Scenario {
  id: string;
  intervention: InterventionType;
  label: string;
  description: string;
  outcomes: ScenarioOutcome[];
  tradeoffs: ScenarioTradeoff[];
  overallStabilizationMin: number;
  overallConfidence: ForecastConfidence;
  cascadeRiskAfter: number; // 0-100
  narrative: string;
}

// ============================================================
// INTERVENTION DEFINITIONS
// ============================================================

const INTERVENTION_LABELS: Record<InterventionType, string> = {
  no_action: 'No Action',
  dispatch_recovery: 'Dispatch Recovery',
  delay_recovery: 'Delay Recovery',
  reroute_staffing: 'Reroute Staffing',
  reassign_equipment: 'Reassign Equipment',
  split_resources: 'Split Resources',
  escalate_support: 'Escalate Support',
};

// ============================================================
// ENGINE
// ============================================================

export function simulateScenario(
  intervention: InterventionType,
  targetZoneId: string | undefined,
  assessment: OperationalAssessment,
  forecast: { zones: readonly ZoneForecast[] },
  cascadeRisks: readonly CascadeRisk[],
  recoveryConf: RecoveryConfidenceReport,
  profile?: OperationalProfile,
): Scenario {
  const target = targetZoneId
    ? assessment.zoneAssessments.find(z => z.zoneId === targetZoneId)
    : [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0] ?? null;

  const targetFc = target ? forecast.zones.find(z => z.zoneId === target.zoneId) : null;
  const allZones = assessment.zoneAssessments;

  // Intervention modifiers
  // Use adaptive modifiers when operational profile available, else static
  const mod = profile ? computeAdaptiveModifiers(intervention, profile) : getModifiers(intervention);
  const weightExplanation = profile ? explainWeighting(intervention, profile) : null;

  const outcomes: ScenarioOutcome[] = allZones.map(za => {
    const fc = forecast.zones.find(z => z.zoneId === za.zoneId);
    const isTarget = za.zoneId === target?.zoneId;
    const baseProjected = fc?.pressure15m ?? za.pressure;

    let projected = baseProjected;
    if (isTarget) {
      projected = Math.max(0, Math.min(100, projected + mod.targetPressureDelta));
    } else {
      projected = Math.max(0, Math.min(100, projected + mod.adjacentPressureDelta));
    }

    const stabMin = isTarget
      ? Math.max(5, Math.round(recoveryConf.estimatedStabilizationMin + mod.stabilizationDelta))
      : Math.round(recoveryConf.estimatedStabilizationMin * 1.2);

    return {
      zoneId: za.zoneId,
      zoneLabel: za.zoneLabel,
      currentPressure: za.pressure,
      projectedPressure: Math.round(projected),
      stabilizationMinutes: stabMin,
      cascadeRiskReduced: isTarget && mod.targetPressureDelta < -10,
      departureImpact: isTarget && mod.targetPressureDelta < -15 ? 'improved' : mod.adjacentPressureDelta > 5 ? 'worsened' : 'unchanged',
    };
  });

  const tradeoffs: ScenarioTradeoff[] = [];
  if (mod.adjacentPressureDelta > 0) {
    tradeoffs.push({
      description: `May increase pressure in adjacent zones by ~${mod.adjacentPressureDelta} points (resource redeployment)`,
      severity: mod.adjacentPressureDelta > 8 ? 'high' : 'medium',
    });
  }
  if (intervention === 'delay_recovery') {
    tradeoffs.push({ description: 'Incident aging will increase pressure faster', severity: 'high' });
    tradeoffs.push({ description: 'Departure windows may compress beyond recovery', severity: 'medium' });
  }
  if (intervention === 'split_resources') {
    tradeoffs.push({ description: 'Divided attention may slow primary zone stabilization', severity: 'medium' });
  }
  if (intervention === 'reassign_equipment') {
    tradeoffs.push({ description: 'Equipment transition period (~5–10m) before new unit operational', severity: 'low' });
  }

  const targetOutcome = outcomes.find(o => o.zoneId === target?.zoneId);
  const overallStab = targetOutcome?.stabilizationMinutes ?? recoveryConf.estimatedStabilizationMin;

  const cascadeAfter = cascadeRisks.length > 0
    ? Math.max(0, cascadeRisks[0].transferLikelihood + mod.cascadeDelta)
    : 0;

  const confScore = recoveryConf.score + mod.confidenceDelta;
  const overallConfidence: ForecastConfidence = confScore >= 70 ? 'high' : confScore >= 40 ? 'moderate' : 'low';

  let narrative = generateNarrative(intervention, target, targetOutcome, tradeoffs, overallStab, overallConfidence);
  if (weightExplanation) narrative += ` ${weightExplanation}`;

  return {
    id: `sim-${intervention}-${Date.now()}`,
    intervention,
    label: INTERVENTION_LABELS[intervention],
    description: getInterventionDescription(intervention, target),
    outcomes,
    tradeoffs,
    overallStabilizationMin: overallStab,
    overallConfidence,
    cascadeRiskAfter: Math.round(Math.max(0, Math.min(100, cascadeAfter))),
    narrative,
  };
}

/**
 * Generate the standard three scenarios: no action, recommended, alternative.
 */
export function compareScenarios(
  targetZoneId: string | undefined,
  assessment: OperationalAssessment,
  forecast: { zones: readonly ZoneForecast[] },
  cascadeRisks: readonly CascadeRisk[],
  recoveryConf: RecoveryConfidenceReport,
  profile?: OperationalProfile,
): Scenario[] {
  // Choose best comparison set based on operational composition
  const interventions: InterventionType[] = ['no_action', 'dispatch_recovery'];
  if (profile?.composition === 'equipment_driven') {
    interventions.push('reassign_equipment');
  } else if (profile?.composition === 'staffing_driven') {
    interventions.push('reroute_staffing');
  } else if (profile?.composition === 'cascade_propagation') {
    interventions.push('split_resources');
  } else {
    interventions.push('reroute_staffing');
  }

  return interventions.map(i => simulateScenario(i, targetZoneId, assessment, forecast, cascadeRisks, recoveryConf, profile));
}

// ============================================================
// MODIFIERS
// ============================================================

interface Modifiers {
  targetPressureDelta: number;
  adjacentPressureDelta: number;
  stabilizationDelta: number;
  cascadeDelta: number;
  confidenceDelta: number;
}

function getModifiers(intervention: InterventionType): Modifiers {
  switch (intervention) {
    case 'no_action':
      return { targetPressureDelta: 8, adjacentPressureDelta: 3, stabilizationDelta: 10, cascadeDelta: 10, confidenceDelta: -15 };
    case 'dispatch_recovery':
      return { targetPressureDelta: -25, adjacentPressureDelta: 2, stabilizationDelta: -8, cascadeDelta: -20, confidenceDelta: 15 };
    case 'delay_recovery':
      return { targetPressureDelta: 12, adjacentPressureDelta: 5, stabilizationDelta: 15, cascadeDelta: 15, confidenceDelta: -20 };
    case 'reroute_staffing':
      return { targetPressureDelta: -18, adjacentPressureDelta: 6, stabilizationDelta: -5, cascadeDelta: -12, confidenceDelta: 10 };
    case 'reassign_equipment':
      return { targetPressureDelta: -20, adjacentPressureDelta: 0, stabilizationDelta: -6, cascadeDelta: -15, confidenceDelta: 12 };
    case 'split_resources':
      return { targetPressureDelta: -12, adjacentPressureDelta: -5, stabilizationDelta: 3, cascadeDelta: -8, confidenceDelta: 5 };
    case 'escalate_support':
      return { targetPressureDelta: -15, adjacentPressureDelta: -2, stabilizationDelta: -4, cascadeDelta: -10, confidenceDelta: 8 };
  }
}

function getInterventionDescription(intervention: InterventionType, target: ZoneAssessment | null | undefined): string {
  const zone = target?.zoneLabel ?? 'target zone';
  switch (intervention) {
    case 'no_action': return `Take no intervention. Monitor ${zone} current trajectory.`;
    case 'dispatch_recovery': return `Deploy recovery resources to ${zone} immediately.`;
    case 'delay_recovery': return `Delay intervention. Wait for conditions to clarify.`;
    case 'reroute_staffing': return `Redistribute workforce toward ${zone} from stable zones.`;
    case 'reassign_equipment': return `Reassign equipment to resolve blocking failures at ${zone}.`;
    case 'split_resources': return `Split recovery resources across ${zone} and adjacent zones.`;
    case 'escalate_support': return `Escalate to ops management for additional support at ${zone}.`;
  }
}

function generateNarrative(
  intervention: InterventionType,
  target: ZoneAssessment | null | undefined,
  outcome: ScenarioOutcome | undefined,
  tradeoffs: ScenarioTradeoff[],
  stabMin: number,
  confidence: ForecastConfidence,
): string {
  const zone = target?.zoneLabel ?? 'the target zone';
  if (!outcome) return `Insufficient data to model ${INTERVENTION_LABELS[intervention]} scenario.`;

  const pressureChange = outcome.projectedPressure - outcome.currentPressure;
  const direction = pressureChange < -5 ? 'reduces' : pressureChange > 5 ? 'increases' : 'maintains';

  let text = `${INTERVENTION_LABELS[intervention]} ${direction} projected pressure at ${zone} from ${outcome.currentPressure} to ${outcome.projectedPressure}. `;
  text += `Estimated stabilization: ${stabMin} minutes (${confidence} confidence). `;

  if (tradeoffs.length > 0) {
    text += `Tradeoff: ${tradeoffs[0].description}. `;
  }

  if (outcome.cascadeRiskReduced) {
    text += 'Cascade propagation risk reduced. ';
  }

  return text.trim();
}
