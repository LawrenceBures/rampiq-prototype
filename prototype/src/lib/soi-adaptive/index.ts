/**
 * SOI Adaptive Operational Reasoning
 *
 * Context-sensitive intervention weighting, historical
 * effectiveness tracking, and pattern-aware confidence.
 */

export {
  analyzeOperationalContext,
  type OperationalProfile, type PressureComposition,
} from './operational-context-analyzer';

export {
  computeAdaptiveModifiers,
  explainWeighting,
  type AdaptiveModifiers,
} from './dynamic-weighting';

export {
  analyzeHistoricalEffectiveness,
  type HistoricalEffectiveness, type HistoricalPattern,
} from './historical-effectiveness';
