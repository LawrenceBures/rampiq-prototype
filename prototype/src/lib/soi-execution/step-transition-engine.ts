/**
 * SOI Live Execution — Step Transition Engine
 *
 * Manages individual step state progression with deterministic
 * timing and stall detection.
 */

import { type StepPhase, estimateStepTiming, isTerminalStep } from './execution-state-machine';

// ============================================================
// TYPES
// ============================================================

export interface LiveStepState {
  stepId: string;
  phase: StepPhase;
  dispatchedAt?: number;
  acknowledgedAt?: number;
  activeAt?: number;
  completedAt?: number;
  stalledAt?: number;
  failedAt?: number;
  createdEntityId?: string;
  error?: string;
}

// ============================================================
// TRANSITIONS
// ============================================================

export function createLiveStep(stepId: string): LiveStepState {
  return { stepId, phase: 'queued' };
}

export function dispatchStep(step: LiveStepState, entityId?: string): LiveStepState {
  if (step.phase !== 'queued') return step;
  return { ...step, phase: 'dispatched', dispatchedAt: Date.now(), createdEntityId: entityId };
}

export function acknowledgeStep(step: LiveStepState): LiveStepState {
  if (step.phase !== 'dispatched') return step;
  return { ...step, phase: 'acknowledged', acknowledgedAt: Date.now() };
}

export function activateStep(step: LiveStepState): LiveStepState {
  if (step.phase !== 'acknowledged' && step.phase !== 'stalled') return step;
  return { ...step, phase: 'active', activeAt: Date.now() };
}

export function completeStep(step: LiveStepState): LiveStepState {
  if (step.phase !== 'active') return step;
  return { ...step, phase: 'completed', completedAt: Date.now() };
}

export function stallStep(step: LiveStepState): LiveStepState {
  if (isTerminalStep(step.phase)) return step;
  return { ...step, phase: 'stalled', stalledAt: Date.now() };
}

export function failStep(step: LiveStepState, error: string): LiveStepState {
  if (isTerminalStep(step.phase)) return step;
  return { ...step, phase: 'failed', failedAt: Date.now(), error };
}

/**
 * Evaluate whether a step should auto-transition based on elapsed time.
 * Returns the next phase or null if no transition needed.
 */
export function evaluateStepProgression(
  step: LiveStepState,
  actionType: string,
  riskLevel: string,
  now: number,
): StepPhase | null {
  if (isTerminalStep(step.phase)) return null;

  const timing = estimateStepTiming(actionType, riskLevel);

  switch (step.phase) {
    case 'dispatched': {
      const elapsed = now - (step.dispatchedAt ?? now);
      if (elapsed >= timing.stallThresholdMs) return 'stalled';
      if (elapsed >= timing.acknowledgementMs) return 'acknowledged';
      return null;
    }
    case 'acknowledged': {
      const elapsed = now - (step.acknowledgedAt ?? now);
      if (elapsed >= timing.acknowledgementMs) return 'active';
      return null;
    }
    case 'active': {
      const elapsed = now - (step.activeAt ?? now);
      if (elapsed >= timing.stallThresholdMs) return 'stalled';
      if (elapsed >= timing.activeDurationMs) return 'completed';
      return null;
    }
    case 'stalled': {
      const elapsed = now - (step.stalledAt ?? now);
      if (elapsed >= timing.stallThresholdMs * 2) return 'failed';
      return null;
    }
    default:
      return null;
  }
}
