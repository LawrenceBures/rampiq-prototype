/**
 * SOI Narrative — Escalation Narrator
 *
 * Generates narratives when pressure increases, cascades emerge,
 * recovery regresses, or fragile zones worsen.
 */

import type { ChainMonitorReport } from '@/lib/soi-execution/recovery-chain-monitor';
import type { AdaptiveRecommendation } from '@/lib/soi-execution/adaptive-recovery-engine';

// ============================================================
// TYPES
// ============================================================

export interface EscalationNarrative {
  title: string;
  narrative: string;
  category: 'escalation' | 'adaptive_warning';
  severity: 'warning' | 'critical';
  urgency: 'immediate' | 'soon' | 'advisory';
}

// ============================================================
// NARRATOR
// ============================================================

export function narrateEscalation(
  report: ChainMonitorReport,
  zoneLabel: string,
): EscalationNarrative | null {
  if (report.health === 'regressing') {
    return {
      title: `Pressure escalating — ${zoneLabel}`,
      narrative: `Operational pressure is accelerating faster than modeled expectations. ${zoneLabel} pressure increased from ${report.pressureBefore} to ${report.pressureNow} during active recovery. ${
        report.escalationReason
          ? report.escalationReason + '.'
          : 'Intervention recommended before adjacent gates destabilize.'
      }`,
      category: 'escalation',
      severity: 'critical',
      urgency: 'immediate',
    };
  }

  if (report.health === 'stalled' && report.stalledSteps >= 2) {
    return {
      title: `Recovery stalled — ${zoneLabel}`,
      narrative: `Recovery chain has stalled with ${report.stalledSteps} steps awaiting progression. Current staffing or resource availability may be insufficient. ${
        report.pressureNow > 70
          ? 'Sustained high pressure increases cascade risk to adjacent gates.'
          : 'Moderate pressure sustained — early intervention can prevent escalation.'
      }`,
      category: 'escalation',
      severity: 'warning',
      urgency: 'soon',
    };
  }

  return null;
}

export function narrateAdaptiveWarning(
  rec: AdaptiveRecommendation,
  zoneLabel: string,
): EscalationNarrative {
  return {
    title: rec.title,
    narrative: `${rec.reason} ${rec.detail}`,
    category: 'adaptive_warning',
    severity: rec.urgency === 'immediate' ? 'critical' : 'warning',
    urgency: rec.urgency,
  };
}
