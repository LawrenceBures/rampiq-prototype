/**
 * SOI Intelligence Core
 *
 * Deterministic operational reasoning layer.
 * The LLM is not the brain yet — SOI's operational model is the brain.
 * Natural language comes later as the voice.
 *
 * Modules:
 *   operational-reasoning  — zone/gate pressure analysis, instability explanation
 *   recovery-recommendations — actionable recovery recommendations with confidence
 *   confidence-scoring     — evidence-based confidence model
 *   what-if-simulator      — deterministic impact simulation
 *   dispatch-optimizer     — recovery action ranking and sequencing
 *   soi-command-parser     — typed command intent parsing
 */

export {
  assessOperation,
  assessZone,
  explainInstability,
  type OperationalAssessment,
  type ZoneAssessment,
  type PressureSource,
} from './operational-reasoning';

export {
  generateRecommendations,
  type SoiRecommendation,
  type RecommendedAction,
} from './recovery-recommendations';

export {
  computeConfidence,
  assessDataCompleteness,
  type ConfidenceResult,
  type ConfidenceFactors,
} from './confidence-scoring';

export {
  simulateRecovery,
  simulateScenario,
  type WhatIfResult,
  type WhatIfScenario,
} from './what-if-simulator';

export {
  rankRecommendations,
  type RankedAction,
  type DispatchPlan,
} from './dispatch-optimizer';

export {
  parseCommand,
  resolveZonePattern,
  type CommandIntent,
} from './soi-command-parser';
