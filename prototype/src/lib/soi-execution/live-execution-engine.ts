/**
 * SOI Live Execution — Live Execution Engine
 *
 * Orchestrates live execution chain progression with deterministic
 * timing, stall detection, and timeline generation.
 *
 * Public API for starting, ticking, and evaluating execution chains.
 */

import { type ExecutionPhase, isTerminalPhase, isTerminalStep } from './execution-state-machine';
import {
  type LiveStepState, createLiveStep, dispatchStep, acknowledgeStep,
  activateStep, completeStep, stallStep, failStep, evaluateStepProgression,
} from './step-transition-engine';
import { type ExecutionTimeline, createTimeline, addEntry } from './execution-timeline';
import type { ExecutionPlan, PlannedStep } from '@/lib/soi-agentic/execution-planner';
import { createRecoveryAction, transitionRecoveryAction } from '@/lib/lifecycle-commands';
import type { Severity } from '@/lib/soi-types';

// ============================================================
// TYPES
// ============================================================

export interface LiveExecutionState {
  planId: string;
  phase: ExecutionPhase;
  targetZone?: string;
  steps: LiveStepState[];
  timeline: ExecutionTimeline;
  startedAt?: number;
  completedAt?: number;
  currentStepIndex: number;
}

// ============================================================
// ENGINE — LIFECYCLE
// ============================================================

export function createLiveExecution(plan: ExecutionPlan): LiveExecutionState {
  return {
    planId: plan.planId,
    phase: 'pending',
    targetZone: plan.objective.targetZone,
    steps: plan.steps.map(s => createLiveStep(s.stepId)),
    timeline: createTimeline(),
    currentStepIndex: 0,
  };
}

export function approveLiveExecution(state: LiveExecutionState): LiveExecutionState {
  const timeline = addEntry(state.timeline, 'plan_approved', 'Recovery chain approved', 'info');
  return { ...state, phase: 'approved', timeline, startedAt: Date.now() };
}

export function cancelLiveExecution(state: LiveExecutionState): LiveExecutionState {
  return { ...state, phase: 'cancelled' };
}

// ============================================================
// ENGINE — DISPATCH NEXT STEP
// ============================================================

/**
 * Dispatch the next queued step. Calls lifecycle commands to create
 * the actual recovery action, then transitions to 'dispatched'.
 */
export async function dispatchNextStep(
  state: LiveExecutionState,
  plan: ExecutionPlan,
  actorId: string,
  actorRole: string,
): Promise<LiveExecutionState> {
  if (isTerminalPhase(state.phase)) return state;

  const nextIdx = state.steps.findIndex(s => s.phase === 'queued');
  if (nextIdx === -1) return state;

  const planStep = plan.steps[nextIdx];
  if (!planStep) return state;

  let updatedState = { ...state, phase: 'active' as ExecutionPhase, currentStepIndex: nextIdx };

  // Execute the lifecycle command
  const entityId = await executeLifecycleCommand(planStep, actorId, actorRole);

  // Transition to dispatched
  const updatedSteps = [...updatedState.steps];
  if (entityId === false) {
    updatedSteps[nextIdx] = failStep(updatedSteps[nextIdx], 'Lifecycle command failed');
    const tl = addEntry(updatedState.timeline, 'step_failed', planStep.title, 'critical', 'Lifecycle command returned error', planStep.stepId);
    updatedState = { ...updatedState, steps: updatedSteps, timeline: tl };
  } else {
    updatedSteps[nextIdx] = dispatchStep(updatedSteps[nextIdx], entityId ?? undefined);
    const tl = addEntry(updatedState.timeline, 'step_dispatched', planStep.title, 'info', undefined, planStep.stepId);
    updatedState = { ...updatedState, steps: updatedSteps, timeline: tl };
  }

  return updatedState;
}

async function executeLifecycleCommand(
  step: PlannedStep,
  actorId: string,
  actorRole: string,
): Promise<string | null | false> {
  try {
    switch (step.actionType) {
      case 'dispatch':
      case 'recover': {
        if (!step.targetIncidentId) return null;
        const ra = await createRecoveryAction({
          incident_id: step.targetIncidentId,
          title: step.title,
          action_type: step.actionType === 'dispatch' ? 'DISPATCH' : 'OTHER',
          severity: step.riskLevel === 'high' ? 'CRITICAL' as Severity : 'HIGH' as Severity,
          proposed_by: actorId,
          description: `SOI live execution: ${step.reasoning[0] ?? step.title}`,
        });
        return ra ? ra.id : false;
      }
      case 'acknowledge': {
        if (!step.targetRecoveryActionId) return null;
        const r = await transitionRecoveryAction({
          action_id: step.targetRecoveryActionId,
          new_status: 'ACKNOWLEDGED',
          actor_id: actorId,
          actor_role: actorRole,
        });
        return r ? step.targetRecoveryActionId : false;
      }
      case 'unblock': {
        if (!step.targetRecoveryActionId) return null;
        const r = await transitionRecoveryAction({
          action_id: step.targetRecoveryActionId,
          new_status: 'ACTIVE',
          actor_id: actorId,
          actor_role: actorRole,
          notes: 'SOI live execution: unblocking',
        });
        return r ? step.targetRecoveryActionId : false;
      }
      case 'escalate':
      case 'hold':
      case 'reassign':
      case 'stabilize':
        return null; // coordination signals — no lifecycle command needed
      default:
        return null;
    }
  } catch {
    return false;
  }
}

// ============================================================
// ENGINE — TICK (progression evaluation)
// ============================================================

/**
 * Evaluate all active steps for time-based progression.
 * Call this on an interval (e.g., every 2 seconds) to advance steps.
 */
export function tickExecution(
  state: LiveExecutionState,
  plan: ExecutionPlan,
): LiveExecutionState {
  if (isTerminalPhase(state.phase)) return state;

  const now = Date.now();
  let updatedSteps = [...state.steps];
  let updatedTimeline = state.timeline;
  let anyChange = false;

  for (let i = 0; i < updatedSteps.length; i++) {
    const step = updatedSteps[i];
    if (isTerminalStep(step.phase) || step.phase === 'queued') continue;

    const planStep = plan.steps[i];
    if (!planStep) continue;

    const nextPhase = evaluateStepProgression(step, planStep.actionType, planStep.riskLevel, now);
    if (nextPhase) {
      anyChange = true;
      switch (nextPhase) {
        case 'acknowledged':
          updatedSteps[i] = acknowledgeStep(step);
          updatedTimeline = addEntry(updatedTimeline, 'step_acknowledged', `${planStep.title} acknowledged`, 'info', undefined, step.stepId);
          break;
        case 'active':
          updatedSteps[i] = activateStep(step);
          updatedTimeline = addEntry(updatedTimeline, 'step_active', `${planStep.title} active`, 'info', undefined, step.stepId);
          break;
        case 'completed':
          updatedSteps[i] = completeStep(step);
          updatedTimeline = addEntry(updatedTimeline, 'step_completed', `${planStep.title} completed`, 'success', undefined, step.stepId);
          break;
        case 'stalled':
          updatedSteps[i] = stallStep(step);
          updatedTimeline = addEntry(updatedTimeline, 'step_stalled', `${planStep.title} stalled`, 'warning', 'Step exceeded expected duration', step.stepId);
          break;
        case 'failed':
          updatedSteps[i] = failStep(step, 'Exceeded stall timeout');
          updatedTimeline = addEntry(updatedTimeline, 'step_failed', `${planStep.title} failed`, 'critical', 'Step exceeded maximum duration', step.stepId);
          break;
      }
    }
  }

  if (!anyChange) return state;

  // Evaluate overall execution phase
  const allDone = updatedSteps.every(s => isTerminalStep(s.phase));
  const anyStalled = updatedSteps.some(s => s.phase === 'stalled');
  const anyFailed = updatedSteps.some(s => s.phase === 'failed');

  let phase = state.phase;
  if (allDone) {
    phase = anyFailed ? 'failed' : 'completed';
    updatedTimeline = addEntry(updatedTimeline, phase === 'completed' ? 'execution_completed' : 'execution_failed',
      phase === 'completed' ? 'Recovery chain completed' : 'Recovery chain failed', phase === 'completed' ? 'success' : 'critical');
  } else if (anyStalled && !anyFailed) {
    phase = 'blocked';
  } else if (state.phase === 'blocked' && !anyStalled) {
    phase = 'active';
  }

  return {
    ...state,
    steps: updatedSteps,
    timeline: updatedTimeline,
    phase,
    completedAt: allDone ? Date.now() : undefined,
  };
}

// ============================================================
// ENGINE — QUERIES
// ============================================================

export function isExecutionActive(state: LiveExecutionState): boolean {
  return !isTerminalPhase(state.phase) && state.phase !== 'pending';
}

export function executionProgressSummary(state: LiveExecutionState): {
  completed: number;
  active: number;
  stalled: number;
  failed: number;
  queued: number;
  total: number;
  percentage: number;
} {
  const total = state.steps.length;
  return {
    completed: state.steps.filter(s => s.phase === 'completed').length,
    active: state.steps.filter(s => s.phase === 'active' || s.phase === 'dispatched' || s.phase === 'acknowledged').length,
    stalled: state.steps.filter(s => s.phase === 'stalled').length,
    failed: state.steps.filter(s => s.phase === 'failed').length,
    queued: state.steps.filter(s => s.phase === 'queued').length,
    total,
    percentage: total > 0 ? Math.round((state.steps.filter(s => s.phase === 'completed').length / total) * 100) : 0,
  };
}
