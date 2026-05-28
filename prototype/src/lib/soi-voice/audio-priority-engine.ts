/**
 * SOI Voice — Audio Priority Engine
 *
 * Prevents audio chaos. Enforces one-at-a-time speech,
 * priority interruption, cooldown suppression, and queue management.
 */

// ============================================================
// TYPES
// ============================================================

export type AudioPriority = 'critical' | 'high' | 'normal' | 'low';

export interface AudioQueueItem {
  id: string;
  text: string;
  priority: AudioPriority;
  category: string;
  timestamp: number;
}

export interface AudioPriorityState {
  queue: AudioQueueItem[];
  currentlyPlaying: string | null;
  cooldowns: Record<string, number>;
  muted: boolean;
}

// ============================================================
// PRIORITY WEIGHTS
// ============================================================

const PRIORITY_WEIGHT: Record<AudioPriority, number> = {
  critical: 100,
  high: 70,
  normal: 40,
  low: 10,
};

const CATEGORY_COOLDOWN_MS: Record<string, number> = {
  escalation: 15000,
  step_completed: 8000,
  step_stalled: 10000,
  step_failed: 0,
  briefing: 0,
  stabilization: 20000,
  execution_progress: 12000,
  ambient: 30000,
};

// ============================================================
// ENGINE
// ============================================================

export function createAudioState(): AudioPriorityState {
  return { queue: [], currentlyPlaying: null, cooldowns: {}, muted: false };
}

/**
 * Enqueue an audio item if cooldown allows.
 * Critical items bypass cooldown.
 */
export function enqueueAudio(
  state: AudioPriorityState,
  text: string,
  priority: AudioPriority,
  category: string,
): AudioPriorityState {
  if (state.muted) return state;

  const now = Date.now();

  // Check cooldown (critical bypasses)
  if (priority !== 'critical') {
    const lastPlayed = state.cooldowns[category];
    const cooldown = CATEGORY_COOLDOWN_MS[category] ?? 10000;
    if (lastPlayed && (now - lastPlayed) < cooldown) return state;
  }

  const item: AudioQueueItem = {
    id: `aq-${now}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    priority,
    category,
    timestamp: now,
  };

  // Insert sorted by priority (highest first)
  const queue = [...state.queue, item].sort(
    (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
  );

  // Cap queue size
  return { ...state, queue: queue.slice(0, 5) };
}

/**
 * Dequeue the next item to play.
 */
export function dequeueNext(state: AudioPriorityState): {
  item: AudioQueueItem | null;
  state: AudioPriorityState;
} {
  if (state.queue.length === 0 || state.currentlyPlaying) {
    return { item: null, state };
  }

  const [next, ...rest] = state.queue;
  return {
    item: next,
    state: {
      ...state,
      queue: rest,
      currentlyPlaying: next.id,
      cooldowns: { ...state.cooldowns, [next.category]: Date.now() },
    },
  };
}

/**
 * Mark current playback as finished.
 */
export function finishPlayback(state: AudioPriorityState): AudioPriorityState {
  return { ...state, currentlyPlaying: null };
}

/**
 * Check if a critical item should interrupt current playback.
 */
export function shouldInterrupt(state: AudioPriorityState): boolean {
  if (!state.currentlyPlaying || state.queue.length === 0) return false;
  return state.queue[0].priority === 'critical';
}

export function toggleMute(state: AudioPriorityState): AudioPriorityState {
  return { ...state, muted: !state.muted, queue: state.muted ? state.queue : [] };
}
