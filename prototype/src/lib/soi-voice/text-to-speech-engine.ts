/**
 * SOI Voice — Text-to-Speech Engine
 *
 * Browser-native speech synthesis with priority queueing,
 * interruption support, and calm operational tone.
 */

import {
  type AudioPriorityState, type AudioPriority,
  enqueueAudio, dequeueNext, finishPlayback, shouldInterrupt,
} from './audio-priority-engine';

// ============================================================
// TYPES
// ============================================================

export type TTSState = 'idle' | 'speaking' | 'queued';

export interface TTSConfig {
  enabled: boolean;
  rate: number;
  pitch: number;
  volume: number;
  voiceName?: string;
}

// ============================================================
// DEFAULTS
// ============================================================

const DEFAULT_CONFIG: TTSConfig = {
  enabled: true,
  rate: 0.95,
  pitch: 0.95,
  volume: 0.8,
};

// ============================================================
// ENGINE
// ============================================================

let config: TTSConfig = { ...DEFAULT_CONFIG };
let audioState: AudioPriorityState = {
  queue: [], currentlyPlaying: null, cooldowns: {}, muted: false,
};

/**
 * Check if speech synthesis is available.
 */
export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Configure TTS settings.
 */
export function configureTTS(update: Partial<TTSConfig>): void {
  config = { ...config, ...update };
}

/**
 * Get current TTS state.
 */
export function getTTSState(): TTSState {
  if (!isTTSAvailable()) return 'idle';
  if (window.speechSynthesis.speaking) return 'speaking';
  if (audioState.queue.length > 0) return 'queued';
  return 'idle';
}

/**
 * Speak text with priority queueing.
 */
export function speak(
  text: string,
  priority: AudioPriority = 'normal',
  category: string = 'general',
): void {
  if (!isTTSAvailable() || !config.enabled) return;

  audioState = enqueueAudio(audioState, text, priority, category);
  processQueue();
}

/**
 * Speak a critical alert — interrupts current speech.
 */
export function speakCritical(text: string, category: string = 'escalation'): void {
  if (!isTTSAvailable() || !config.enabled) return;

  audioState = enqueueAudio(audioState, text, 'critical', category);

  if (shouldInterrupt(audioState)) {
    window.speechSynthesis.cancel();
    audioState = finishPlayback(audioState);
  }

  processQueue();
}

/**
 * Stop all speech and clear queue.
 */
export function stopSpeaking(): void {
  if (!isTTSAvailable()) return;
  window.speechSynthesis.cancel();
  audioState = { ...audioState, queue: [], currentlyPlaying: null };
}

/**
 * Toggle TTS enabled/disabled.
 */
export function toggleTTS(): boolean {
  config.enabled = !config.enabled;
  if (!config.enabled) stopSpeaking();
  return config.enabled;
}

export function isTTSEnabled(): boolean {
  return config.enabled;
}

// ============================================================
// INTERNAL
// ============================================================

function processQueue(): void {
  if (!isTTSAvailable() || window.speechSynthesis.speaking) return;

  const { item, state } = dequeueNext(audioState);
  audioState = state;

  if (!item) return;

  const utterance = new SpeechSynthesisUtterance(item.text);
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;
  utterance.volume = config.volume;

  // Try to find a calm, professional voice
  const voices = window.speechSynthesis.getVoices();
  if (config.voiceName) {
    const preferred = voices.find(v => v.name.includes(config.voiceName!));
    if (preferred) utterance.voice = preferred;
  } else {
    // Prefer English voices that sound professional
    const preferred = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel'))
    ) ?? voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
  }

  utterance.onend = () => {
    audioState = finishPlayback(audioState);
    // Process next item in queue
    setTimeout(processQueue, 300);
  };

  utterance.onerror = () => {
    audioState = finishPlayback(audioState);
    setTimeout(processQueue, 300);
  };

  window.speechSynthesis.speak(utterance);
}
