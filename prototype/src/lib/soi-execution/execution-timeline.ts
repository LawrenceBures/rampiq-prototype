/**
 * SOI Live Execution — Execution Timeline
 *
 * Generates and maintains a live execution history log.
 * Each entry is timestamped and categorized for display.
 */

// ============================================================
// TYPES
// ============================================================

export type TimelineEntryType =
  | 'plan_approved'
  | 'step_dispatched'
  | 'step_acknowledged'
  | 'step_active'
  | 'step_completed'
  | 'step_stalled'
  | 'step_failed'
  | 'pressure_update'
  | 'adaptive_recommendation'
  | 'execution_completed'
  | 'execution_failed'
  | 'escalation_triggered';

export interface TimelineEntry {
  id: string;
  timestamp: number;
  type: TimelineEntryType;
  title: string;
  detail?: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  stepId?: string;
}

export interface ExecutionTimeline {
  entries: TimelineEntry[];
  startedAt: number;
}

// ============================================================
// TIMELINE OPERATIONS
// ============================================================

let entryCounter = 0;

export function createTimeline(): ExecutionTimeline {
  return { entries: [], startedAt: Date.now() };
}

export function addEntry(
  timeline: ExecutionTimeline,
  type: TimelineEntryType,
  title: string,
  severity: TimelineEntry['severity'],
  detail?: string,
  stepId?: string,
): ExecutionTimeline {
  entryCounter++;
  return {
    ...timeline,
    entries: [
      ...timeline.entries,
      {
        id: `tl-${entryCounter}`,
        timestamp: Date.now(),
        type,
        title,
        detail,
        severity,
        stepId,
      },
    ],
  };
}

export function formatTimelineTime(timestamp: number, referenceTime: number): string {
  const elapsed = Math.round((timestamp - referenceTime) / 1000);
  if (elapsed < 60) return `+${elapsed}s`;
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  return `+${min}m${sec > 0 ? ` ${sec}s` : ''}`;
}

/**
 * Get the most recent entry of a given type.
 */
export function lastEntryOfType(
  timeline: ExecutionTimeline,
  type: TimelineEntryType,
): TimelineEntry | null {
  for (let i = timeline.entries.length - 1; i >= 0; i--) {
    if (timeline.entries[i].type === type) return timeline.entries[i];
  }
  return null;
}
