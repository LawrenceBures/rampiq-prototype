/**
 * SOI Narrative — Execution Narrator
 *
 * Converts raw execution transitions into human operational narration.
 * Grounded in real step state, pressure deltas, and chain health.
 */

import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import type { LiveStepState } from '@/lib/soi-execution/step-transition-engine';
import type { PlannedStep } from '@/lib/soi-agentic/execution-planner';
import type { ChainMonitorReport } from '@/lib/soi-execution/recovery-chain-monitor';

// ============================================================
// TYPES
// ============================================================

export interface ExecutionNarrative {
  title: string;
  narrative: string;
  category: 'execution_progress' | 'step_completed' | 'step_failed' | 'step_stalled';
  severity: 'info' | 'success' | 'warning' | 'critical';
  stepId?: string;
}

// ============================================================
// NARRATOR
// ============================================================

export function narrateStepTransition(
  step: PlannedStep,
  stepState: LiveStepState,
  chainReport: ChainMonitorReport | null,
  zoneLabel: string,
): ExecutionNarrative | null {
  switch (stepState.phase) {
    case 'dispatched':
      return {
        title: `${step.title}`,
        narrative: `Recovery action dispatched to ${step.target}. ${step.reasoning[0] ?? ''}`,
        category: 'execution_progress',
        severity: 'info',
        stepId: step.stepId,
      };

    case 'acknowledged':
      return {
        title: `${step.title} — acknowledged`,
        narrative: `Assignment acknowledged. ${step.actionType === 'dispatch' ? 'Agent en route to position.' : 'Action confirmed and staging.'}`,
        category: 'execution_progress',
        severity: 'info',
        stepId: step.stepId,
      };

    case 'active':
      return {
        title: `${step.title} — active`,
        narrative: `Recovery action now active at ${step.target}. Monitoring for operational impact.`,
        category: 'execution_progress',
        severity: 'info',
        stepId: step.stepId,
      };

    case 'completed': {
      const pressureNote = chainReport && chainReport.pressureDelta > 5
        ? ` Operational pressure at ${zoneLabel} reduced by ${chainReport.pressureDelta} points.`
        : chainReport && chainReport.pressureDelta > 0
        ? ` Pressure showing early reduction.`
        : '';
      return {
        title: `${step.title} — completed`,
        narrative: `${step.title} completed successfully.${pressureNote} ${
          chainReport && chainReport.health === 'progressing'
            ? 'Recovery trajectory remains favorable.'
            : chainReport && chainReport.health === 'stalled'
            ? 'Overall recovery chain is stalled — monitor closely.'
            : ''
        }`.trim(),
        category: 'step_completed',
        severity: 'success',
        stepId: step.stepId,
      };
    }

    case 'stalled':
      return {
        title: `${step.title} — stalled`,
        narrative: `${step.title} has exceeded expected duration. ${
          step.actionType === 'dispatch'
            ? 'Agent may not have reached position or acknowledgement is delayed.'
            : step.actionType === 'acknowledge' || step.actionType === 'unblock'
            ? 'Recovery action progression has stalled — may need manual intervention.'
            : 'Step duration exceeding modeled estimate.'
        }`,
        category: 'step_stalled',
        severity: 'warning',
        stepId: step.stepId,
      };

    case 'failed':
      return {
        title: `${step.title} — failed`,
        narrative: `${step.title} has failed. ${stepState.error ?? 'Step exceeded maximum duration without completion.'} This may require manual intervention or plan adjustment.`,
        category: 'step_failed',
        severity: 'critical',
        stepId: step.stepId,
      };

    default:
      return null;
  }
}

export function narrateChainCompletion(
  execution: LiveExecutionState,
  chainReport: ChainMonitorReport,
  zoneLabel: string,
): ExecutionNarrative {
  const completed = execution.steps.filter(s => s.phase === 'completed').length;
  const failed = execution.steps.filter(s => s.phase === 'failed').length;
  const total = execution.steps.length;

  if (execution.phase === 'completed' && failed === 0) {
    return {
      title: 'Recovery chain completed',
      narrative: `All ${total} recovery steps completed successfully. ${
        chainReport.pressureDelta > 0
          ? `Pressure at ${zoneLabel} reduced by ${chainReport.pressureDelta} points (${chainReport.pressureBefore} → ${chainReport.pressureNow}).`
          : `Pressure at ${zoneLabel} currently at ${chainReport.pressureNow}.`
      } ${chainReport.health === 'stabilized' ? 'Zone has stabilized.' : 'Continue monitoring for sustained stability.'}`,
      category: 'step_completed',
      severity: 'success',
    };
  }

  return {
    title: 'Recovery chain concluded with issues',
    narrative: `Recovery chain concluded. ${completed}/${total} steps completed, ${failed} failed. ${
      chainReport.pressureDelta > 0
        ? `Some pressure relief achieved (−${chainReport.pressureDelta}).`
        : 'Pressure has not improved as expected.'
    } Manual assessment recommended.`,
    category: 'step_failed',
    severity: failed > 0 ? 'critical' : 'warning',
  };
}
