/**
 * SOI Intelligence Core — Dispatch Optimizer
 *
 * Ranks recovery options and determines optimal action sequencing
 * based on zone pressure, incident severity, resource availability,
 * and recovery action state.
 *
 * All functions are pure and replay-safe.
 */

import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { SoiRecommendation } from './recovery-recommendations';

// ============================================================
// TYPES
// ============================================================

export interface RankedAction {
  recommendation: SoiRecommendation;
  rank: number;
  urgencyScore: number;
  reasoning: string;
}

export interface DispatchPlan {
  actions: RankedAction[];
  summary: string;
  totalEstimatedMinutes: number;
}

// ============================================================
// OPTIMIZER
// ============================================================

export function rankRecommendations(
  recommendations: readonly SoiRecommendation[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
): DispatchPlan {
  const activeRAs = recoveryActions.filter(ra =>
    ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED'
  );

  const ranked: RankedAction[] = recommendations.map(rec => {
    let urgency = 0;

    // Severity multiplier
    const sevMult = { critical: 4, high: 3, medium: 2, low: 1 }[rec.severity];
    urgency += sevMult * 20;

    // Confidence boost
    urgency += rec.confidence.score * 0.3;

    // Pressure boost
    urgency += rec.preview.beforePressure * 0.5;

    // Aged incident boost
    if (rec.estimatedStabilizationMinutes > 20) {
      urgency += 15;
    }

    // Penalty: if matching recovery already active, reduce urgency
    const matchingActive = activeRAs.filter(ra =>
      rec.sourceIncidentIds.includes(ra.incident_id) && ra.status === 'ACTIVE'
    );
    if (matchingActive.length > 0) {
      urgency -= 20;
    }

    // Penalty: if zone is only degrading (not unstable/critical), lower urgency
    if (rec.severity === 'medium') {
      urgency -= 10;
    }

    const reasoning = urgency >= 80
      ? 'Immediate action recommended — zone under critical pressure'
      : urgency >= 50
      ? 'Action recommended — pressure is building and intervention needed'
      : 'Monitor and act if conditions worsen';

    return { recommendation: rec, rank: 0, urgencyScore: Math.round(urgency), reasoning };
  });

  // Sort by urgency descending
  ranked.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Assign ranks
  ranked.forEach((r, i) => { r.rank = i + 1; });

  const totalEstimated = ranked.reduce(
    (sum, r) => sum + r.recommendation.estimatedStabilizationMinutes, 0
  );

  const summary = ranked.length === 0
    ? 'No recovery actions recommended. Operation is within normal parameters.'
    : `${ranked.length} recommended action${ranked.length > 1 ? 's' : ''}. Top priority: ${ranked[0].recommendation.title}.`;

  return { actions: ranked, summary, totalEstimatedMinutes: totalEstimated };
}
