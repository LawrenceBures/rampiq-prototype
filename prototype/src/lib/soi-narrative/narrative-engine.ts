/**
 * SOI Narrative — Narrative Engine
 *
 * Public API for generating operational narratives from live state.
 * Integrates execution, escalation, stabilization, and briefing narrators
 * with priority/cooldown management.
 */

import { narrateStepTransition, narrateChainCompletion, type ExecutionNarrative } from './execution-narrator';
import { narrateEscalation, narrateAdaptiveWarning, type EscalationNarrative } from './escalation-narrator';
import { narrateStabilization, type StabilizationNarrative } from './stabilization-narrator';
import { generateBriefing, type OperationalBriefing } from './briefing-generator';
import {
  getPriority, canEmit, markEmitted, type CooldownState, type NarrativeCategory,
} from './narrative-priority-engine';
import type { LiveExecutionState } from '@/lib/soi-execution/live-execution-engine';
import type { PlannedStep } from '@/lib/soi-agentic/execution-planner';
import type { ChainMonitorReport } from '@/lib/soi-execution/recovery-chain-monitor';
import type { AdaptiveRecommendation } from '@/lib/soi-execution/adaptive-recovery-engine';
import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { SoiRecommendation } from '@/lib/soi-intelligence/recovery-recommendations';
import type { DispatchPlan } from '@/lib/soi-intelligence/dispatch-optimizer';

// ============================================================
// TYPES
// ============================================================

export interface NarrativeEntry {
  id: string;
  timestamp: number;
  title: string;
  narrative: string;
  category: NarrativeCategory;
  severity: 'info' | 'success' | 'warning' | 'critical';
  pinned: boolean;
  stepId?: string;
}

export interface NarrativeFeed {
  entries: NarrativeEntry[];
  cooldown: CooldownState;
}

// ============================================================
// FEED MANAGEMENT
// ============================================================

let narrativeCounter = 0;

export function createNarrativeFeed(): NarrativeFeed {
  return { entries: [], cooldown: { lastEmitted: {} } };
}

function pushEntry(
  feed: NarrativeFeed,
  category: NarrativeCategory,
  title: string,
  narrative: string,
  severity: 'info' | 'success' | 'warning' | 'critical',
  stepId?: string,
): NarrativeFeed {
  if (!canEmit(feed.cooldown, category)) return feed;

  narrativeCounter++;
  const priority = getPriority(category);

  return {
    entries: [
      ...feed.entries,
      {
        id: `nar-${narrativeCounter}`,
        timestamp: Date.now(),
        title,
        narrative,
        category,
        severity,
        pinned: priority.pinned,
        stepId,
      },
    ].slice(-20), // keep last 20
    cooldown: markEmitted(feed.cooldown, category),
  };
}

// ============================================================
// PUBLIC API — NARRATIVE GENERATION
// ============================================================

/**
 * Generate narratives from a step transition event.
 */
export function narrateStep(
  feed: NarrativeFeed,
  step: PlannedStep,
  stepState: import('@/lib/soi-execution/step-transition-engine').LiveStepState,
  chainReport: ChainMonitorReport | null,
  zoneLabel: string,
): NarrativeFeed {
  const nar = narrateStepTransition(step, stepState, chainReport, zoneLabel);
  if (!nar) return feed;
  return pushEntry(feed, nar.category, nar.title, nar.narrative, nar.severity, nar.stepId);
}

/**
 * Generate narratives from chain health monitoring.
 */
export function narrateChainHealth(
  feed: NarrativeFeed,
  report: ChainMonitorReport,
  execution: LiveExecutionState,
  zoneLabel: string,
): NarrativeFeed {
  let updated = feed;

  // Escalation narratives
  const escNar = narrateEscalation(report, zoneLabel);
  if (escNar) {
    updated = pushEntry(updated, escNar.category, escNar.title, escNar.narrative, escNar.severity);
  }

  // Stabilization narratives
  const stabNar = narrateStabilization(report, zoneLabel);
  if (stabNar) {
    updated = pushEntry(updated, stabNar.category, stabNar.title, stabNar.narrative, stabNar.severity);
  }

  // Chain completion
  if (execution.phase === 'completed' || execution.phase === 'failed') {
    const compNar = narrateChainCompletion(execution, report, zoneLabel);
    updated = pushEntry(updated, execution.phase === 'completed' ? 'chain_completed' : 'chain_failed',
      compNar.title, compNar.narrative, compNar.severity);
  }

  return updated;
}

/**
 * Generate narratives from adaptive recommendations.
 */
export function narrateAdaptive(
  feed: NarrativeFeed,
  recommendations: readonly AdaptiveRecommendation[],
  zoneLabel: string,
): NarrativeFeed {
  let updated = feed;
  for (const rec of recommendations.slice(0, 2)) {
    const nar = narrateAdaptiveWarning(rec, zoneLabel);
    updated = pushEntry(updated, nar.category, nar.title, nar.narrative, nar.severity);
  }
  return updated;
}

/**
 * Generate an operational briefing as a narrative entry.
 */
export function narrateBriefing(
  feed: NarrativeFeed,
  assessment: OperationalAssessment,
  recommendations: readonly SoiRecommendation[],
  dispatchPlan: DispatchPlan,
  execution: LiveExecutionState | null,
  activeIncidentCount: number,
  activeRecoveryCount: number,
): { feed: NarrativeFeed; briefing: OperationalBriefing } {
  const briefing = generateBriefing(assessment, recommendations, dispatchPlan, execution, activeIncidentCount, activeRecoveryCount);
  const updated = pushEntry(feed, 'briefing', briefing.title, briefing.narrative, briefing.severity === 'critical' ? 'critical' : 'info');
  return { feed: updated, briefing };
}

/**
 * Get visible narratives sorted by priority (critical pinned first, then recency).
 */
export function getVisibleNarratives(feed: NarrativeFeed, maxCount = 8): NarrativeEntry[] {
  const sorted = [...feed.entries].sort((a, b) => {
    // Pinned first
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Then by timestamp (newest first)
    return b.timestamp - a.timestamp;
  });
  return sorted.slice(0, maxCount);
}
