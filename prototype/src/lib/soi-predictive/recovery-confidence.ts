/**
 * SOI Predictive — Recovery Confidence Scoring
 *
 * Estimates likelihood of successful stabilization given
 * current recovery state, staffing, equipment, and timing.
 */

import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { ForecastConfidence } from './pressure-forecast';

// ============================================================
// TYPES
// ============================================================

export interface RecoveryConfidenceReport {
  overallConfidence: ForecastConfidence;
  score: number; // 0-100
  factors: string[];
  weaknesses: string[];
  estimatedStabilizationMin: number;
  stabilizationLikely: boolean;
}

// ============================================================
// ENGINE
// ============================================================

export function assessRecoveryConfidence(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  zoneId?: string,
): RecoveryConfidenceReport {
  const now = Date.now();

  const activeInc = incidents.filter(i =>
    i.status !== 'RESOLVED' && i.status !== 'CLOSED' &&
    (!zoneId || i.zone_id === zoneId)
  );
  const activeRAs = recoveryActions.filter(ra =>
    ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED' &&
    (!zoneId || ra.zone_id === zoneId)
  );

  let score = 50; // baseline
  const factors: string[] = [];
  const weaknesses: string[] = [];

  // Active recovery actions boost confidence
  const progressing = activeRAs.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED');
  if (progressing.length > 0) {
    score += progressing.length * 8;
    factors.push(`${progressing.length} recovery action${progressing.length > 1 ? 's' : ''} progressing`);
  }

  // Stalled/blocked reduce confidence
  const stalled = activeRAs.filter(ra => ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
  if (stalled.length > 0) {
    score -= stalled.length * 12;
    weaknesses.push(`${stalled.length} stalled recovery action${stalled.length > 1 ? 's' : ''}`);
  }

  // Incident severity
  const criticals = activeInc.filter(i => i.severity === 'CRITICAL');
  const highs = activeInc.filter(i => i.severity === 'HIGH');
  if (criticals.length > 0) {
    score -= criticals.length * 15;
    weaknesses.push(`${criticals.length} critical incident${criticals.length > 1 ? 's' : ''}`);
  }
  if (highs.length > 1) {
    score -= (highs.length - 1) * 8;
    weaknesses.push(`${highs.length} high-severity incidents`);
  }

  // Incident age
  const oldestMin = activeInc.length > 0
    ? Math.max(...activeInc.map(i => (now - new Date(i.opened_at).getTime()) / 60000))
    : 0;
  if (oldestMin > 60) {
    score -= 15;
    weaknesses.push(`Oldest incident unresolved ${Math.round(oldestMin)}m`);
  } else if (oldestMin > 30) {
    score -= 8;
    weaknesses.push(`Incident aging (${Math.round(oldestMin)}m)`);
  }

  // Coverage: do active incidents have recovery actions?
  const coveredInc = activeInc.filter(i => activeRAs.some(ra => ra.incident_id === i.id));
  const coverageRatio = activeInc.length > 0 ? coveredInc.length / activeInc.length : 1;
  if (coverageRatio >= 0.8) {
    score += 10;
    factors.push('Good recovery coverage');
  } else if (coverageRatio < 0.5) {
    score -= 10;
    weaknesses.push(`Only ${Math.round(coverageRatio * 100)}% of incidents covered by recovery`);
  }

  // No incidents = high confidence
  if (activeInc.length === 0) {
    score = 90;
    factors.push('No active incidents');
  }

  score = Math.max(5, Math.min(95, Math.round(score)));

  const confidence: ForecastConfidence = score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low';

  // Stabilization time estimate
  const baseTime = criticals.length > 0 ? 30 : highs.length > 0 ? 20 : 10;
  const agePenalty = Math.min(oldestMin / 6, 15);
  const recoveryBonus = progressing.length * 4;
  const estMin = Math.max(5, Math.round(baseTime + agePenalty - recoveryBonus));

  return {
    overallConfidence: confidence,
    score,
    factors,
    weaknesses,
    estimatedStabilizationMin: estMin,
    stabilizationLikely: score >= 50,
  };
}
