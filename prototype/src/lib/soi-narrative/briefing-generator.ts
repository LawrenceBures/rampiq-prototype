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
    const incNote = activeIncidentCount > 0 ? `${activeIncidentCount} incident${activeIncidentCount !== 1 ? 's' : ''} being managed.` : 'No active incidents.';
    sections.push({
      heading: 'Situation',
      content: `All clear. Pressure at ${assessment.globalPressure}. ${incNote} Nothing needs immediate attention.`,
    });
  } else {
    const zoneDesc = pressuredZones.map(z =>
      `${z.zoneLabel} at ${z.pressure} (${z.stability}, ${z.unresolvedCount} unresolved)`
    ).join('; ');
    sections.push({
      heading: 'Situation',
      content: `${pressuredZones.length} area${pressuredZones.length > 1 ? 's' : ''} under pressure: ${zoneDesc}.${stableZones.length > 0 ? ` ${stableZones.length} stable.` : ' No stable zones.'}`,
    });
  }

  // What's causing it
  if (assessment.topPressureSources.length > 0) {
    sections.push({
      heading: 'Driving Factors',
      content: assessment.topPressureSources.slice(0, 3).map(ps => ps.description).join('. ') + '.',
    });
  }

  // Recovery
  if (execution) {
    const progress = executionProgressSummary(execution);
    sections.push({
      heading: 'Recovery',
      content: `Recovery chain ${execution.phase}: ${progress.completed} of ${progress.total} steps done${progress.stalled > 0 ? `, ${progress.stalled} stalled` : ''}${progress.failed > 0 ? `, ${progress.failed} failed` : ''}.`,
    });
  } else if (activeRecoveryCount > 0) {
    sections.push({
      heading: 'Recovery',
      content: `${activeRecoveryCount} recovery action${activeRecoveryCount > 1 ? 's' : ''} running.`,
    });
  }

  // What to do
  if (recommendations.length > 0) {
    const top = recommendations[0];
    sections.push({
      heading: 'Recommendation',
      content: `I'd prioritize: ${top.title}. ${top.recommendedActions[0]?.expectedImpact ?? ''} Confidence ${top.confidence.score}%.`,
    });
  }

  // Timeline
  if (dispatchPlan.totalEstimatedMinutes > 0 && pressuredZones.length > 0) {
    const rangeMin = Math.round(dispatchPlan.totalEstimatedMinutes * 0.75);
    const rangeMax = Math.round(dispatchPlan.totalEstimatedMinutes * 1.35);
    sections.push({
      heading: 'Timeline',
      content: `${rangeMin} to ${rangeMax} minutes to full stability if recovery continues on track.`,
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
