/**
 * SOI Agentic — Post-Execution Monitor
 *
 * After plan execution, monitors operational state changes
 * and surfaces progress or regression signals.
 */

import type { ExecutionState } from './execution-orchestrator';
import type { ExecutionPlan } from './execution-planner';
import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';

// ============================================================
// TYPES
// ============================================================

export interface MonitoringReport {
  planId: string;
  status: 'improving' | 'stable' | 'regressing' | 'unknown';
  pressureBefore: number;
  pressureNow: number;
  pressureDelta: number;
  unresolvedBefore: number;
  unresolvedNow: number;
  observations: string[];
  recommendedAction?: string;
}

// ============================================================
// MONITOR
// ============================================================

export function monitorPostExecution(
  plan: ExecutionPlan,
  executionState: ExecutionState,
  preAssessment: OperationalAssessment,
  currentAssessment: OperationalAssessment,
): MonitoringReport {
  const targetZone = plan.objective.targetZone;

  const prePressure = targetZone
    ? preAssessment.zoneAssessments.find(z => z.zoneId === targetZone)?.pressure ?? preAssessment.globalPressure
    : preAssessment.globalPressure;

  const nowPressure = targetZone
    ? currentAssessment.zoneAssessments.find(z => z.zoneId === targetZone)?.pressure ?? currentAssessment.globalPressure
    : currentAssessment.globalPressure;

  const preUnresolved = targetZone
    ? preAssessment.zoneAssessments.find(z => z.zoneId === targetZone)?.unresolvedCount ?? 0
    : preAssessment.zoneAssessments.reduce((s, z) => s + z.unresolvedCount, 0);

  const nowUnresolved = targetZone
    ? currentAssessment.zoneAssessments.find(z => z.zoneId === targetZone)?.unresolvedCount ?? 0
    : currentAssessment.zoneAssessments.reduce((s, z) => s + z.unresolvedCount, 0);

  const delta = prePressure - nowPressure;
  const observations: string[] = [];
  let status: MonitoringReport['status'] = 'unknown';

  if (delta > 10) {
    status = 'improving';
    observations.push(`Pressure reduced from ${prePressure} → ${nowPressure} (−${delta})`);
  } else if (delta >= 0) {
    status = 'stable';
    observations.push(`Pressure holding at ${nowPressure} (was ${prePressure})`);
  } else {
    status = 'regressing';
    observations.push(`Pressure increased from ${prePressure} → ${nowPressure} (+${Math.abs(delta)})`);
  }

  if (nowUnresolved < preUnresolved) {
    observations.push(`Unresolved incidents reduced: ${preUnresolved} → ${nowUnresolved}`);
  } else if (nowUnresolved > preUnresolved) {
    observations.push(`New incidents appeared: unresolved count ${preUnresolved} → ${nowUnresolved}`);
  }

  const completedSteps = executionState.steps.filter(s => s.status === 'completed').length;
  const failedSteps = executionState.steps.filter(s => s.status === 'failed').length;
  observations.push(`Execution: ${completedSteps}/${executionState.steps.length} steps completed${failedSteps > 0 ? `, ${failedSteps} failed` : ''}`);

  // Check adjacent zones for cascade
  const adjacentPressure = currentAssessment.zoneAssessments
    .filter(z => z.zoneId !== targetZone && z.stability !== 'stable');
  if (adjacentPressure.length > 0) {
    observations.push(`Adjacent zones under pressure: ${adjacentPressure.map(z => `${z.zoneLabel} (${z.pressure})`).join(', ')}`);
  }

  let recommendedAction: string | undefined;
  if (status === 'regressing') {
    recommendedAction = 'Pressure increasing — consider escalation or additional resource deployment';
  } else if (failedSteps > 0) {
    recommendedAction = `${failedSteps} execution step${failedSteps > 1 ? 's' : ''} failed — review and retry or adjust plan`;
  } else if (status === 'stable' && nowPressure > 50) {
    recommendedAction = 'Pressure still elevated — continue monitoring or extend recovery actions';
  }

  return {
    planId: plan.planId,
    status,
    pressureBefore: prePressure,
    pressureNow: nowPressure,
    pressureDelta: delta,
    unresolvedBefore: preUnresolved,
    unresolvedNow: nowUnresolved,
    observations,
    recommendedAction,
  };
}
