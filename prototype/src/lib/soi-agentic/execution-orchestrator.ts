/**
 * SOI Agentic — Execution Orchestrator
 *
 * Handles staged approval, execution sequencing, recovery creation,
 * and chain progression. All execution goes through existing
 * lifecycle commands — no direct database mutation.
 */

import type { ExecutionPlan, PlannedStep } from './execution-planner';
import { createRecoveryAction, transitionRecoveryAction } from '@/lib/lifecycle-commands';
import type { Severity } from '@/lib/soi-types';

// ============================================================
// TYPES
// ============================================================

export type StepStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';

export interface ExecutionState {
  planId: string;
  status: 'staged' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';
  steps: StepState[];
  startedAt?: number;
  completedAt?: number;
  currentStepIndex: number;
  error?: string;
}

export interface StepState {
  stepId: string;
  status: StepStatus;
  createdEntityId?: string;
  error?: string;
  executedAt?: number;
}

// ============================================================
// ORCHESTRATOR
// ============================================================

export function createExecutionState(plan: ExecutionPlan): ExecutionState {
  return {
    planId: plan.planId,
    status: 'staged',
    steps: plan.steps.map(s => ({
      stepId: s.stepId,
      status: 'pending' as StepStatus,
    })),
    currentStepIndex: 0,
  };
}

export function approveExecution(state: ExecutionState): ExecutionState {
  return { ...state, status: 'approved' };
}

export function cancelExecution(state: ExecutionState): ExecutionState {
  return { ...state, status: 'cancelled' };
}

/**
 * Execute the next pending step in the plan.
 * Returns updated state after execution attempt.
 *
 * Uses existing lifecycle commands exclusively.
 */
export async function executeNextStep(
  state: ExecutionState,
  plan: ExecutionPlan,
  actorId: string,
  actorRole: string,
): Promise<ExecutionState> {
  if (state.status !== 'approved' && state.status !== 'executing') {
    return state;
  }

  const nextIndex = state.steps.findIndex(s => s.status === 'pending');
  if (nextIndex === -1) {
    return { ...state, status: 'completed', completedAt: Date.now() };
  }

  const step = plan.steps[nextIndex];
  if (!step) {
    return { ...state, status: 'completed', completedAt: Date.now() };
  }

  const updatedState: ExecutionState = {
    ...state,
    status: 'executing',
    startedAt: state.startedAt ?? Date.now(),
    currentStepIndex: nextIndex,
  };

  const stepResult = await executeStep(step, actorId, actorRole);

  const updatedSteps = [...updatedState.steps];
  updatedSteps[nextIndex] = stepResult;

  // Check if all done
  const allDone = updatedSteps.every(s => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed');

  return {
    ...updatedState,
    steps: updatedSteps,
    status: allDone ? (updatedSteps.some(s => s.status === 'failed') ? 'failed' : 'completed') : 'executing',
    completedAt: allDone ? Date.now() : undefined,
  };
}

async function executeStep(
  step: PlannedStep,
  actorId: string,
  actorRole: string,
): Promise<StepState> {
  const base: StepState = { stepId: step.stepId, status: 'executing', executedAt: Date.now() };

  try {
    switch (step.actionType) {
      case 'dispatch':
      case 'recover': {
        if (!step.targetIncidentId) {
          return { ...base, status: 'skipped', error: 'No target incident' };
        }
        const ra = await createRecoveryAction({
          incident_id: step.targetIncidentId,
          title: step.title,
          action_type: step.actionType === 'dispatch' ? 'DISPATCH' : 'OTHER',
          severity: step.riskLevel === 'high' ? 'CRITICAL' as Severity : 'HIGH' as Severity,
          proposed_by: actorId,
          description: `SOI execution plan: ${step.reasoning[0] ?? step.title}`,
        });
        if (ra) {
          return { ...base, status: 'completed', createdEntityId: ra.id };
        }
        return { ...base, status: 'failed', error: 'Failed to create recovery action' };
      }

      case 'acknowledge': {
        if (!step.targetRecoveryActionId) {
          return { ...base, status: 'skipped', error: 'No target recovery action' };
        }
        const result = await transitionRecoveryAction({
          action_id: step.targetRecoveryActionId,
          new_status: 'ACKNOWLEDGED',
          actor_id: actorId,
          actor_role: actorRole,
          notes: `SOI execution plan: ${step.title}`,
        });
        return result
          ? { ...base, status: 'completed', createdEntityId: step.targetRecoveryActionId }
          : { ...base, status: 'failed', error: 'Failed to acknowledge recovery action' };
      }

      case 'unblock': {
        if (!step.targetRecoveryActionId) {
          return { ...base, status: 'skipped', error: 'No target recovery action' };
        }
        const result = await transitionRecoveryAction({
          action_id: step.targetRecoveryActionId,
          new_status: 'ACTIVE',
          actor_id: actorId,
          actor_role: actorRole,
          notes: `SOI execution plan: unblocking — ${step.title}`,
        });
        return result
          ? { ...base, status: 'completed', createdEntityId: step.targetRecoveryActionId }
          : { ...base, status: 'failed', error: 'Failed to unblock recovery action' };
      }

      case 'escalate':
      case 'hold':
      case 'reassign':
      case 'stabilize': {
        // These are coordination signals — log as completed (monitoring step)
        return { ...base, status: 'completed' };
      }

      default:
        return { ...base, status: 'skipped', error: `Unknown action type: ${step.actionType}` };
    }
  } catch (err) {
    return { ...base, status: 'failed', error: String(err) };
  }
}

/**
 * Get execution progress summary.
 */
export function executionProgress(state: ExecutionState): {
  completed: number;
  total: number;
  failed: number;
  percentage: number;
} {
  const total = state.steps.length;
  const completed = state.steps.filter(s => s.status === 'completed').length;
  const failed = state.steps.filter(s => s.status === 'failed').length;
  return {
    completed,
    total,
    failed,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
