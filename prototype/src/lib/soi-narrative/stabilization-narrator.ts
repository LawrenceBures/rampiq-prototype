/**
 * SOI Narrative — Stabilization Narrator
 *
 * Generates narratives when recovery stabilizes, pressure normalizes,
 * cascade risk drops, or chains complete successfully.
 */

import type { ChainMonitorReport } from '@/lib/soi-execution/recovery-chain-monitor';
import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';

// ============================================================
// TYPES
// ============================================================

export interface StabilizationNarrative {
  title: string;
  narrative: string;
  category: 'stabilization' | 'pressure_update' | 'chain_completed';
  severity: 'success' | 'info';
}

// ============================================================
// NARRATOR
// ============================================================

export function narrateStabilization(
  report: ChainMonitorReport,
  zoneLabel: string,
): StabilizationNarrative | null {
  if (report.health === 'stabilized') {
    return {
      title: `Stabilization confirmed — ${zoneLabel}`,
      narrative: `Recovery chain stabilization confirmed. Pressure across ${zoneLabel} has returned below escalation threshold (${report.pressureBefore} → ${report.pressureNow}). No active cascade propagation currently detected. ${
        report.completedSteps === report.totalSteps
          ? 'All recovery steps completed successfully.'
          : `${report.completedSteps}/${report.totalSteps} steps completed.`
      }`,
      category: 'chain_completed',
      severity: 'success',
    };
  }

  if (report.health === 'progressing' && report.pressureDelta >= 15) {
    return {
      title: `Pressure reducing — ${zoneLabel}`,
      narrative: `Operational pressure at ${zoneLabel} reduced by ${report.pressureDelta} points (${report.pressureBefore} → ${report.pressureNow}). Current recovery trajectory remains favorable. ${
        report.pressureNow < 40
          ? 'Approaching stable operational state.'
          : 'Continued monitoring recommended until pressure drops below threshold.'
      }`,
      category: 'pressure_update',
      severity: 'info',
    };
  }

  return null;
}

export function narrateOperationalStability(
  assessment: OperationalAssessment,
): StabilizationNarrative | null {
  if (assessment.globalStability === 'stable' && assessment.globalPressure < 20) {
    return {
      title: 'Operational stability restored',
      narrative: `Operations stable. Pressure at ${assessment.globalPressure}. No escalation signals. Normal operations can continue.`,
      category: 'stabilization',
      severity: 'success',
    };
  }

  return null;
}
