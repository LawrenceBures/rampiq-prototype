/**
 * SOI Voice — Voice Response Engine
 *
 * Decides when SOI should speak vs. stay silent.
 * High-value events get spoken. Low-value updates stay visual.
 */

import type { NarrativeCategory } from '@/lib/soi-narrative/narrative-priority-engine';
import type { AudioPriority } from './audio-priority-engine';

// ============================================================
// SPOKEN CATEGORIES
// ============================================================

const SPOKEN_CATEGORIES: Record<NarrativeCategory, { speak: boolean; priority: AudioPriority }> = {
  chain_failed:         { speak: true,  priority: 'critical' },
  step_failed:          { speak: true,  priority: 'critical' },
  escalation:           { speak: true,  priority: 'critical' },
  adaptive_warning:     { speak: true,  priority: 'high' },
  chain_completed:      { speak: true,  priority: 'high' },
  step_stalled:         { speak: true,  priority: 'high' },
  stabilization:        { speak: true,  priority: 'normal' },
  briefing:             { speak: true,  priority: 'normal' },
  step_completed:       { speak: false, priority: 'low' },
  pressure_update:      { speak: false, priority: 'low' },
  execution_progress:   { speak: false, priority: 'low' },
};

/**
 * Determine if a narrative should be spoken.
 */
export function shouldSpeak(category: NarrativeCategory): boolean {
  return SPOKEN_CATEGORIES[category]?.speak ?? false;
}

/**
 * Get the audio priority for a narrative category.
 */
export function getSpokenPriority(category: NarrativeCategory): AudioPriority {
  return SPOKEN_CATEGORIES[category]?.priority ?? 'low';
}

/**
 * Shorten narrative text for spoken delivery.
 * Spoken text should be more concise than visual text.
 */
export function condenseForSpeech(text: string): string {
  // Trim to ~2 sentences for spoken delivery
  const sentences = text.split(/[.!]\s+/).filter(Boolean);
  if (sentences.length <= 2) return text;

  // Take first two sentences + any that contain key operational words
  const key = sentences.filter(s =>
    /\b(?:critical|escalat|fail|stall|stabiliz|pressure|recover|cascade)\b/i.test(s)
  );

  const selected = sentences.slice(0, 2);
  for (const k of key) {
    if (!selected.includes(k) && selected.length < 3) selected.push(k);
  }

  return selected.join('. ').replace(/\.+$/, '') + '.';
}
