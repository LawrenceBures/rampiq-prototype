/**
 * SOI Narrative — Briefing Generator
 *
 * Generates command-center-style operational briefings synthesizing
 * current pressure, active recoveries, risks, and stabilization estimates.
 */

import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { SoiRecommendation } from '@/lib/soi-intelligence/recovery-recommendations';
import type { DispatchPlan } from '@/lib/soi-intelligence/dispatch-optimizer';
import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import { executionProgressSummary } from '@/lib/soi-execution/live-execution-engine';

// ============================================================
// TYPES
// ============================================================

export interface OperationalBriefing {
  title: string;
  narrative: string;
  sections: BriefingSection[];
  severity: 'nominal' | 'elevated' | 'critical';
  generatedAt: number;
}

export interface BriefingSection {
  heading: string;
  content: string;
}

// ============================================================
// GENERATOR
// ============================================================

export function generateBriefing(
  assessment: OperationalAssessment,
  recommendations: readonly SoiRecommendation[],
  dispatchPlan: DispatchPlan,
  execution: LiveExecutionState | null,
  activeIncidentCount: number,
  activeRecoveryCount: number,
): OperationalBriefing {
  const sections: BriefingSection[] = [];

  // Operational state
  const pressuredZones = assessment.zoneAssessments.filter(z => z.stability !== 'stable');
  const stableZones = assessment.zoneAssessments.filter(z => z.stability === 'stable');

  const severity: OperationalBriefing['severity'] =
    assessment.globalStability === 'critical' ? 'critical'
    : assessment.globalStability === 'unstable' || assessment.globalStability === 'degrading' ? 'elevated'
    : 'nominal';

  // Situation
  if (pressuredZones.length === 0) {
    sections.push({
      heading: 'Operational State',
      content: `All ${assessment.zoneAssessments.length} zones reporting stable. ${activeIncidentCount} incidents under management. No elevated pressure detected.`,
    });
  } else {
    const zoneDesc = pressuredZones.map(z =>
      `${z.zoneLabel} (${z.stability}, pressure ${z.pressure}/100, ${z.unresolvedCount} unresolved)`
    ).join('; ');
    sections.push({
      heading: 'Operational State',
      content: `Pressure concentrated in ${pressuredZones.length} zone${pressuredZones.length > 1 ? 's' : ''}: ${zoneDesc}. ${stableZones.length > 0 ? `${stableZones.length} zone${stableZones.length > 1 ? 's' : ''} stable.` : 'No stable zones.'}`,
    });
  }

  // Primary drivers
  if (assessment.topPressureSources.length > 0) {
    sections.push({
      heading: 'Primary Destabilization Drivers',
      content: assessment.topPressureSources.slice(0, 3).map(ps => ps.description).join('. ') + '.',
    });
  }

  // Active recovery
  if (execution) {
    const progress = executionProgressSummary(execution);
    sections.push({
      heading: 'Active Recovery',
      content: `Recovery chain ${execution.phase}: ${progress.completed}/${progress.total} steps completed${progress.stalled > 0 ? `, ${progress.stalled} stalled` : ''}${progress.failed > 0 ? `, ${progress.failed} failed` : ''}. ${
        execution.phase === 'completed' ? 'Chain execution concluded.' : 'Monitoring for operational impact.'
      }`,
    });
  } else if (activeRecoveryCount > 0) {
    sections.push({
      heading: 'Recovery Status',
      content: `${activeRecoveryCount} recovery action${activeRecoveryCount > 1 ? 's' : ''} in progress. No coordinated execution chain active.`,
    });
  }

  // Recommendations
  if (recommendations.length > 0) {
    const top = recommendations[0];
    sections.push({
      heading: 'Priority Recommendation',
      content: `${top.title} (${top.severity} severity, ${top.confidence.score}% confidence). ${top.recommendedActions[0]?.expectedImpact ?? ''}`,
    });
  }

  // Stabilization
  if (dispatchPlan.totalEstimatedMinutes > 0 && pressuredZones.length > 0) {
    const rangeMin = Math.round(dispatchPlan.totalEstimatedMinutes * 0.75);
    const rangeMax = Math.round(dispatchPlan.totalEstimatedMinutes * 1.35);
    sections.push({
      heading: 'Projected Stabilization',
      content: `Estimated ${rangeMin}–${rangeMax} minutes to full operational stability. Assumes current recovery trajectory continues without new critical incidents.`,
    });
  }

  // Build narrative
  const narrative = sections.map(s => `${s.content}`).join('\n\n');

  return {
    title: 'SOI Operational Briefing',
    narrative,
    sections,
    severity,
    generatedAt: Date.now(),
  };
}
