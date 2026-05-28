/**
 * SOI Live Execution — Adaptive Recovery Engine
 *
 * Generates dynamic recommendations when operational state
 * worsens during active recovery. Not autonomous — surfaces
 * suggestions for human approval.
 */

import type { ChainMonitorReport } from './recovery-chain-monitor';
import type { LiveExecutionState } from './live-execution-engine';

// ============================================================
// TYPES
// ============================================================

export interface AdaptiveRecommendation {
  id: string;
  type: 'escalate' | 'alternate_resource' | 'outbound_hold' | 'staffing_support' | 'fallback_chain';
  title: string;
  reason: string;
  urgency: 'immediate' | 'soon' | 'advisory';
  detail: string;
}

// ============================================================
// ENGINE
// ============================================================

export function generateAdaptiveRecommendations(
  report: ChainMonitorReport,
  execution: LiveExecutionState,
): AdaptiveRecommendation[] {
  const recs: AdaptiveRecommendation[] = [];
  let counter = 0;

  // Regressing pressure
  if (report.health === 'regressing') {
    counter++;
    recs.push({
      id: `adapt-${counter}`,
      type: 'escalate',
      title: 'Escalate recovery',
      reason: `Pressure increased during execution (${report.pressureBefore} → ${report.pressureNow}).`,
      urgency: 'immediate',
      detail: 'Recovery effectiveness below modeled threshold. Escalation recommended before adjacent zones destabilize.',
    });
  }

  // Stalled steps
  if (report.stalledSteps >= 2) {
    counter++;
    recs.push({
      id: `adapt-${counter}`,
      type: 'alternate_resource',
      title: 'Deploy alternate resources',
      reason: `${report.stalledSteps} steps stalled — current resources may be blocked.`,
      urgency: 'soon',
      detail: 'Consider reassigning from a stable zone or requesting additional support.',
    });
  }

  // Failed steps
  if (report.failedSteps > 0) {
    counter++;
    recs.push({
      id: `adapt-${counter}`,
      type: 'fallback_chain',
      title: 'Activate fallback recovery',
      reason: `${report.failedSteps} execution step${report.failedSteps > 1 ? 's' : ''} failed.`,
      urgency: 'immediate',
      detail: 'Primary recovery chain compromised. Rebuild plan or escalate to ops.',
    });
  }

  // High pressure persisting
  if (report.pressureNow >= 80 && report.completedSteps >= Math.floor(report.totalSteps / 2)) {
    counter++;
    recs.push({
      id: `adapt-${counter}`,
      type: 'outbound_hold',
      title: 'Consider outbound hold',
      reason: `Pressure at ${report.pressureNow} despite ${report.completedSteps}/${report.totalSteps} steps completed.`,
      urgency: 'soon',
      detail: 'Short outbound delay (3–5m) may prevent departure into unstable gate operations.',
    });
  }

  // Escalation flagged by monitor
  if (report.escalationNeeded && !recs.some(r => r.type === 'escalate')) {
    counter++;
    recs.push({
      id: `adapt-${counter}`,
      type: 'staffing_support',
      title: 'Request staffing support',
      reason: report.escalationReason ?? 'Recovery chain needs additional coordination.',
      urgency: 'soon',
      detail: 'Current staffing insufficient for recovery velocity. Request ops support or overtime extension.',
    });
  }

  return recs;
}
