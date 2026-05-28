/**
 * SOI Voice — Ambient Awareness Engine
 *
 * Subtle operational atmosphere cues. Not notification sounds.
 * High-end command center feel. Sparse, low-volume, purposeful.
 *
 * Uses Web Audio API for synthesized tones — no audio files needed.
 */

// ============================================================
// TYPES
// ============================================================

export type AmbientCue =
  | 'escalation'
  | 'stabilization'
  | 'stalled'
  | 'chain_complete'
  | 'chain_failed'
  | 'priority_shift';

// ============================================================
// AUDIO CONTEXT
// ============================================================

let audioCtx: AudioContext | null = null;
let ambientEnabled = false;
let lastCuePlayed: Record<string, number> = {};

const CUE_COOLDOWN_MS = 20000; // 20 seconds between same cue type

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch { return null; }
  }
  return audioCtx;
}

// ============================================================
// PUBLIC API
// ============================================================

export function enableAmbient(): void {
  ambientEnabled = true;
  // Resume audio context if suspended (browser autoplay policy)
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') ctx.resume();
}

export function disableAmbient(): void {
  ambientEnabled = false;
}

export function toggleAmbient(): boolean {
  ambientEnabled = !ambientEnabled;
  if (ambientEnabled) {
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') ctx.resume();
  }
  return ambientEnabled;
}

export function isAmbientEnabled(): boolean {
  return ambientEnabled;
}

/**
 * Play an ambient operational cue if cooldown allows.
 */
export function playAmbientCue(cue: AmbientCue): void {
  if (!ambientEnabled) return;

  const now = Date.now();
  const last = lastCuePlayed[cue];
  if (last && (now - last) < CUE_COOLDOWN_MS) return;
  lastCuePlayed[cue] = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  switch (cue) {
    case 'escalation':
      // Two-tone rising: subtle urgency
      playTone(ctx, 320, 0.12, 0.15);
      setTimeout(() => playTone(ctx, 440, 0.12, 0.12), 180);
      break;

    case 'stabilization':
      // Descending resolution: calm confirmation
      playTone(ctx, 520, 0.15, 0.08);
      setTimeout(() => playTone(ctx, 440, 0.15, 0.07), 200);
      setTimeout(() => playTone(ctx, 380, 0.2, 0.06), 420);
      break;

    case 'stalled':
      // Single low tone: attention needed
      playTone(ctx, 260, 0.3, 0.1);
      break;

    case 'chain_complete':
      // Clean rising triad: mission accomplished
      playTone(ctx, 440, 0.12, 0.08);
      setTimeout(() => playTone(ctx, 554, 0.12, 0.07), 150);
      setTimeout(() => playTone(ctx, 660, 0.2, 0.06), 300);
      break;

    case 'chain_failed':
      // Two descending tones: needs attention
      playTone(ctx, 380, 0.15, 0.12);
      setTimeout(() => playTone(ctx, 280, 0.25, 0.1), 220);
      break;

    case 'priority_shift':
      // Single mid tone: awareness ping
      playTone(ctx, 480, 0.15, 0.06);
      break;
  }
}

// ============================================================
// TONE SYNTHESIS
// ============================================================

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration + 0.05);
}
