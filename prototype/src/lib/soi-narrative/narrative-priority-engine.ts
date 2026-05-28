/**
 * SOI Narrative — Priority Engine
 *
 * Prevents narrative spam by enforcing cooldowns, collapsing
 * low-value updates, and prioritizing critical communications.
 */

// ============================================================
// TYPES
// ============================================================

export type NarrativeCategory =
  | 'execution_progress'
  | 'step_completed'
  | 'step_failed'
  | 'step_stalled'
  | 'escalation'
  | 'stabilization'
  | 'pressure_update'
  | 'adaptive_warning'
  | 'briefing'
  | 'chain_completed'
  | 'chain_failed';

export interface NarrativePriority {
  category: NarrativeCategory;
  weight: number;
  pinned: boolean;
}

// ============================================================
// PRIORITY MAP
// ============================================================

const PRIORITY_WEIGHTS: Record<NarrativeCategory, number> = {
  chain_failed: 100,
  step_failed: 90,
  escalation: 85,
  adaptive_warning: 80,
  chain_completed: 75,
  step_stalled: 70,
  stabilization: 65,
  briefing: 60,
  step_completed: 40,
  pressure_update: 30,
  execution_progress: 20,
};

const PINNED_CATEGORIES: Set<NarrativeCategory> = new Set([
  'chain_failed', 'escalation', 'adaptive_warning', 'chain_completed',
]);

export function getPriority(category: NarrativeCategory): NarrativePriority {
  return {
    category,
    weight: PRIORITY_WEIGHTS[category] ?? 10,
    pinned: PINNED_CATEGORIES.has(category),
  };
}

// ============================================================
// COOLDOWN TRACKER
// ============================================================

export interface CooldownState {
  lastEmitted: Record<string, number>;
}

const COOLDOWN_MS: Record<NarrativeCategory, number> = {
  execution_progress: 8000,
  step_completed: 3000,
  step_failed: 0,
  step_stalled: 5000,
  escalation: 10000,
  stabilization: 15000,
  pressure_update: 12000,
  adaptive_warning: 8000,
  briefing: 0,
  chain_completed: 0,
  chain_failed: 0,
};

export function createCooldownState(): CooldownState {
  return { lastEmitted: {} };
}

/**
 * Check if a narrative category is allowed to emit.
 * Returns true if cooldown has expired or no cooldown exists.
 */
export function canEmit(state: CooldownState, category: NarrativeCategory, now?: number): boolean {
  const t = now ?? Date.now();
  const last = state.lastEmitted[category];
  if (last === undefined) return true;
  return (t - last) >= (COOLDOWN_MS[category] ?? 0);
}

export function markEmitted(state: CooldownState, category: NarrativeCategory, now?: number): CooldownState {
  return {
    lastEmitted: { ...state.lastEmitted, [category]: now ?? Date.now() },
  };
}
