/**
 * SOI Narrative Engine
 *
 * Living operational narration grounded in real operational state.
 */

export {
  createNarrativeFeed, narrateStep, narrateChainHealth, narrateAdaptive, narrateBriefing,
  getVisibleNarratives,
  type NarrativeEntry, type NarrativeFeed,
} from './narrative-engine';

export { generateBriefing, type OperationalBriefing, type BriefingSection } from './briefing-generator';
export { narrateStepTransition, narrateChainCompletion, type ExecutionNarrative } from './execution-narrator';
export { narrateEscalation, narrateAdaptiveWarning, type EscalationNarrative } from './escalation-narrator';
export { narrateStabilization, narrateOperationalStability, type StabilizationNarrative } from './stabilization-narrator';
export { getPriority, canEmit, createCooldownState, type NarrativeCategory, type NarrativePriority } from './narrative-priority-engine';
