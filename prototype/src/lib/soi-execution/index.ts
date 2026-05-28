/**
 * SOI Live Execution Engine
 *
 * Live operational execution progression with state machines,
 * chain monitoring, adaptive recovery, and timeline tracking.
 */

export {
  type ExecutionPhase, type StepPhase, type TimingEstimate,
  isTerminalPhase, isTerminalStep, isValidExecutionTransition, isValidStepTransition,
  estimateStepTiming,
} from './execution-state-machine';

export {
  type LiveStepState,
  createLiveStep, dispatchStep, acknowledgeStep, activateStep, completeStep, stallStep, failStep,
  evaluateStepProgression,
} from './step-transition-engine';

export {
  type LiveExecutionState,
  createLiveExecution, approveLiveExecution, cancelLiveExecution,
  dispatchNextStep, tickExecution,
  isExecutionActive, executionProgressSummary,
} from './live-execution-engine';

export {
  type ExecutionTimeline, type TimelineEntry, type TimelineEntryType,
  createTimeline, addEntry, formatTimelineTime, lastEntryOfType,
} from './execution-timeline';

export {
  type ChainHealth, type ChainMonitorReport,
  evaluateChainHealth,
} from './recovery-chain-monitor';

export {
  type AdaptiveRecommendation,
  generateAdaptiveRecommendations,
} from './adaptive-recovery-engine';
