/**
 * SOI Live Execution — State Machine
 *
 * Defines execution and step states with valid transitions.
 * All transitions are deterministic and auditable.
 */

// ============================================================
// EXECUTION STATES
// ============================================================

export type ExecutionPhase =
  | 'pending'
  | 'approved'
  | 'staging'
  | 'active'
  | 'blocked'
  | 'delayed'
  | 'recovering'
  | 'stabilized'
  | 'completed'
  | 'failed'
  | 'cancelled';

const EXECUTION_TRANSITIONS: Record<ExecutionPhase, ExecutionPhase[]> = {
  pending:     ['approved', 'cancelled'],
  approved:    ['staging', 'cancelled'],
  staging:     ['active', 'failed', 'cancelled'],
  active:      ['blocked', 'delayed', 'recovering', 'stabilized', 'completed', 'failed', 'cancelled'],
  blocked:     ['active', 'failed', 'cancelled'],
  delayed:     ['active', 'blocked', 'failed', 'cancelled'],
  recovering:  ['stabilized', 'blocked', 'delayed', 'failed'],
  stabilized:  ['completed', 'active'],
  completed:   [],
  failed:      [],
  cancelled:   [],
};

export function isValidExecutionTransition(from: ExecutionPhase, to: ExecutionPhase): boolean {
  return EXECUTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalPhase(phase: ExecutionPhase): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'cancelled';
}

// ============================================================
// STEP STATES
// ============================================================

export type StepPhase =
  | 'queued'
  | 'dispatched'
  | 'acknowledged'
  | 'active'
  | 'completed'
  | 'stalled'
  | 'failed';

const STEP_TRANSITIONS: Record<StepPhase, StepPhase[]> = {
  queued:       ['dispatched', 'failed'],
  dispatched:   ['acknowledged', 'stalled', 'failed'],
  acknowledged: ['active', 'stalled', 'failed'],
  active:       ['completed', 'stalled', 'failed'],
  stalled:      ['active', 'failed'],
  completed:    [],
  failed:       [],
};

export function isValidStepTransition(from: StepPhase, to: StepPhase): boolean {
  return STEP_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStep(phase: StepPhase): boolean {
  return phase === 'completed' || phase === 'failed';
}

// ============================================================
// TIMING MODELS (deterministic, severity-weighted)
// ============================================================

export interface TimingEstimate {
  dispatchMs: number;
  acknowledgementMs: number;
  activeDurationMs: number;
  stallThresholdMs: number;
}

export function estimateStepTiming(
  actionType: string,
  riskLevel: string,
): TimingEstimate {
  const base = {
    dispatchMs: 3000,
    acknowledgementMs: 2000,
    activeDurationMs: 8000,
    stallThresholdMs: 15000,
  };

  switch (actionType) {
    case 'dispatch':
      base.dispatchMs = riskLevel === 'high' ? 2000 : 4000;
      base.acknowledgementMs = riskLevel === 'high' ? 1500 : 2500;
      base.activeDurationMs = riskLevel === 'high' ? 6000 : 10000;
      break;
    case 'acknowledge':
    case 'unblock':
      base.dispatchMs = 1000;
      base.acknowledgementMs = 1000;
      base.activeDurationMs = 2000;
      break;
    case 'escalate':
      base.dispatchMs = 1000;
      base.acknowledgementMs = 1500;
      base.activeDurationMs = 3000;
      break;
    case 'hold':
      base.dispatchMs = 1000;
      base.acknowledgementMs = 1000;
      base.activeDurationMs = 5000;
      break;
    case 'stabilize':
      base.dispatchMs = 1000;
      base.acknowledgementMs = 1000;
      base.activeDurationMs = 12000;
      base.stallThresholdMs = 20000;
      break;
  }

  return base;
}
