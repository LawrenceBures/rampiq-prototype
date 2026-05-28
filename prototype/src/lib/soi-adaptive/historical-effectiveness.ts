/**
 * SOI Adaptive — Historical Effectiveness Tracker
 *
 * Analyzes prior recovery outcomes to inform future confidence.
 * Uses existing incident/recovery data as historical record.
 * No external database — derives from operational memory.
 */

import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { ForecastConfidence } from '@/lib/soi-predictive/pressure-forecast';

// ============================================================
// TYPES
// ============================================================

export interface HistoricalPattern {
  type: 'quick_resolution' | 'slow_resolution' | 'stalled_recovery' | 'escalation_required' | 'equipment_bottleneck' | 'staffing_collapse';
  frequency: number; // times observed
  avgResolutionMin: number | null;
  confidence: ForecastConfidence;
  narrative: string;
}

export interface HistoricalEffectiveness {
  totalRecoveries: number;
  completedRecoveries: number;
  failedRecoveries: number;
  avgResolutionMin: number | null;
  successRate: number; // 0-1
  patterns: HistoricalPattern[];
  adjustedConfidence: number; // -20 to +20
  narrative: string;
}

// ============================================================
// ANALYZER
// ============================================================

export function analyzeHistoricalEffectiveness(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
): HistoricalEffectiveness {
  const now = Date.now();

  // All recoveries (including completed)
  const allRAs = recoveryActions;
  const completed = allRAs.filter(ra => ra.status === 'COMPLETE');
  const failed = allRAs.filter(ra => ra.status === 'ESCALATED' || ra.status === 'WITHDRAWN');

  // Resolution times from resolved incidents
  const resolved = incidents.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED');
  const resTimes = resolved
    .filter(i => i.resolved_at && i.opened_at)
    .map(i => (new Date(i.resolved_at!).getTime() - new Date(i.opened_at).getTime()) / 60000)
    .filter(t => t > 0 && t < 480); // exclude >8h outliers

  const avgRes = resTimes.length > 0 ? Math.round(resTimes.reduce((a, b) => a + b, 0) / resTimes.length) : null;
  const successRate = allRAs.length > 0 ? completed.length / allRAs.length : 0;

  // Pattern detection
  const patterns: HistoricalPattern[] = [];

  // Quick resolutions (<15m)
  const quick = resTimes.filter(t => t < 15);
  if (quick.length >= 2) {
    patterns.push({
      type: 'quick_resolution',
      frequency: quick.length,
      avgResolutionMin: Math.round(quick.reduce((a, b) => a + b, 0) / quick.length),
      confidence: 'high',
      narrative: `${quick.length} incidents resolved quickly (<15m). Operations capable of rapid recovery.`,
    });
  }

  // Slow resolutions (>45m)
  const slow = resTimes.filter(t => t > 45);
  if (slow.length >= 2) {
    patterns.push({
      type: 'slow_resolution',
      frequency: slow.length,
      avgResolutionMin: Math.round(slow.reduce((a, b) => a + b, 0) / slow.length),
      confidence: 'moderate',
      narrative: `${slow.length} incidents required extended resolution (>45m). May indicate systemic bottleneck.`,
    });
  }

  // Stalled recoveries
  const stalled = allRAs.filter(ra => ra.status === 'BLOCKED' || ra.status === 'PROPOSED');
  if (stalled.length >= 2) {
    patterns.push({
      type: 'stalled_recovery',
      frequency: stalled.length,
      avgResolutionMin: null,
      confidence: 'low',
      narrative: `${stalled.length} recovery actions stalled. Recovery pipeline may be congested.`,
    });
  }

  // Equipment bottleneck
  const equipRAs = allRAs.filter(ra => ra.action_type === 'EQUIPMENT_SWAP');
  const equipFailed = equipRAs.filter(ra => ra.status === 'WITHDRAWN' || ra.status === 'BLOCKED');
  if (equipFailed.length >= 2) {
    patterns.push({
      type: 'equipment_bottleneck',
      frequency: equipFailed.length,
      avgResolutionMin: null,
      confidence: 'moderate',
      narrative: `Equipment reassignment has failed/stalled ${equipFailed.length} times. Equipment availability may be constrained.`,
    });
  }

  // Confidence adjustment from history
  let adjustedConfidence = 0;
  if (successRate >= 0.7) adjustedConfidence += 10;
  else if (successRate < 0.4 && allRAs.length >= 3) adjustedConfidence -= 10;
  if (patterns.some(p => p.type === 'stalled_recovery')) adjustedConfidence -= 5;
  if (patterns.some(p => p.type === 'quick_resolution')) adjustedConfidence += 5;
  if (patterns.some(p => p.type === 'equipment_bottleneck')) adjustedConfidence -= 5;

  const narrative = allRAs.length === 0
    ? 'No historical recovery data available.'
    : `${allRAs.length} recovery actions observed. ${completed.length} completed, ${failed.length} failed. Success rate: ${Math.round(successRate * 100)}%.${avgRes !== null ? ` Avg resolution: ${avgRes}m.` : ''}`;

  return {
    totalRecoveries: allRAs.length,
    completedRecoveries: completed.length,
    failedRecoveries: failed.length,
    avgResolutionMin: avgRes,
    successRate,
    patterns,
    adjustedConfidence,
    narrative,
  };
}
