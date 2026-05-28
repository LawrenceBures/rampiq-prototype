/**
 * SOI Live Execution — Recovery Chain Monitor
 *
 * Continuously evaluates execution effectiveness by comparing
 * current operational state against pre-execution baseline.
 */

import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { LiveExecutionState } from './live-execution-engine';

// ============================================================
// TYPES
// ============================================================

export type ChainHealth = 'progressing' | 'stalled' | 'regressing' | 'stabilized' | 'unknown';

export interface ChainMonitorReport {
  health: ChainHealth;
  pressureBefore: number;
  pressureNow: number;
  pressureDelta: number;
  completedSteps: number;
  totalSteps: number;
  stalledSteps: number;
  failedSteps: number;
  observations: string[];
  escalationNeeded: boolean;
  escalationReason?: string;
}

// ============================================================
// MONITOR
// ============================================================

export function evaluateChainHealth(
  execution: LiveExecutionState,
  preAssessment: OperationalAssessment,
  currentAssessment: OperationalAssessment,
): ChainMonitorReport {
  const targetZone = execution.targetZone;

  const prePressure = targetZone
    ? preAssessment.zoneAssessments.find(z => z.zoneId === targetZone)?.pressure ?? preAssessment.globalPressure
    : preAssessment.globalPressure;

  const nowPressure = targetZone
    ? currentAssessment.zoneAssessments.find(z => z.zoneId === targetZone)?.pressure ?? currentAssessment.globalPressure
    : currentAssessment.globalPressure;

  const delta = prePressure - nowPressure;
  const completed = execution.steps.filter(s => s.phase === 'completed').length;
  const stalled = execution.steps.filter(s => s.phase === 'stalled').length;
  const failed = execution.steps.filter(s => s.phase === 'failed').length;
  const total = execution.steps.length;

  const observations: string[] = [];
  let health: ChainHealth = 'unknown';
  let escalationNeeded = false;
  let escalationReason: string | undefined;

  // Determine health
  if (completed === total && delta > 0) {
    health = 'stabilized';
    observations.push(`All ${total} steps completed. Pressure reduced by ${delta}.`);
  } else if (delta > 10) {
    health = 'progressing';
    observations.push(`Pressure reduced ${prePressure} → ${nowPressure} (−${delta}).`);
  } else if (delta >= -5) {
    health = stalled > 0 ? 'stalled' : 'progressing';
    observations.push(`Pressure holding at ${nowPressure}.`);
  } else {
    health = 'regressing';
    observations.push(`Pressure increased ${prePressure} → ${nowPressure} (+${Math.abs(delta)}).`);
  }

  if (stalled > 0) {
    observations.push(`${stalled} step${stalled > 1 ? 's' : ''} stalled — may need intervention.`);
    if (stalled >= 2) {
      escalationNeeded = true;
      escalationReason = `${stalled} recovery steps stalled — chain effectiveness degraded`;
    }
  }

  if (failed > 0) {
    observations.push(`${failed} step${failed > 1 ? 's' : ''} failed.`);
    escalationNeeded = true;
    escalationReason = `${failed} recovery step${failed > 1 ? 's' : ''} failed — manual intervention needed`;
  }

  // Check adjacent zones
  const adjacentPressure = currentAssessment.zoneAssessments
    .filter(z => z.zoneId !== targetZone && z.stability !== 'stable');
  if (adjacentPressure.length > 0 && health !== 'stabilized') {
    observations.push(`Adjacent pressure: ${adjacentPressure.map(z => `${z.zoneLabel} (${z.pressure})`).join(', ')}`);
    if (adjacentPressure.some(z => z.pressure > prePressure)) {
      escalationNeeded = true;
      escalationReason = escalationReason ?? 'Adjacent zone pressure exceeding recovery zone — cascade risk';
    }
  }

  return {
    health,
    pressureBefore: prePressure,
    pressureNow: nowPressure,
    pressureDelta: delta,
    completedSteps: completed,
    totalSteps: total,
    stalledSteps: stalled,
    failedSteps: failed,
    observations,
    escalationNeeded,
    escalationReason,
  };
}
