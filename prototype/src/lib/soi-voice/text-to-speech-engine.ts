/**
 * SOI Voice — Text-to-Speech Engine
 *
 * Browser-native speech synthesis with priority queueing,
 * interruption support, and calm operational tone.
 *
 * Handles Chrome's async voice loading via onvoiceschanged.
 */

import { prepareForSpeech } from './pronunciation';
import {
  type AudioPriorityState, type AudioPriority,
  enqueueAudio, dequeueNext, finishPlayback, shouldInterrupt,
} from './audio-priority-engine';

// ============================================================
// TYPES
// ============================================================

export type TTSState = 'idle' | 'speaking' | 'queued' | 'error' | 'blocked';

export interface TTSConfig {
  enabled: boolean;
  rate: number;
  pitch: number;
  volume: number;
  voiceName?: string;
}

export interface TTSDiagnostic {
  available: boolean;
  enabled: boolean;
  voicesLoaded: number;
  selectedVoice: string | null;
  state: TTSState;
  lastSpokenText: string | null;
  lastError: string | null;
}

// ============================================================
// STATE
// ============================================================

let config: TTSConfig = {
  enabled: false,  // starts disabled — dashboard toggles on
  rate: 0.95,
  pitch: 0.95,
  volume: 0.85,
};

let audioState: AudioPriorityState = {
  queue: [], currentlyPlaying: null, cooldowns: {}, muted: false,
};

let voicesReady = false;
let selectedVoice: SpeechSynthesisVoice | null = null;
let lastSpoken: string | null = null;
let lastError: string | null = null;
let stateChangeCallback: ((state: TTSState) => void) | null = null;

// ============================================================
// INIT — handle async voice loading
// ============================================================

function initVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesReady = true;
      // Pick a calm English voice
      selectedVoice = voices.find(v =>
        v.lang.startsWith('en') && (
          v.name.includes('Samantha') || v.name.includes('Karen') ||
          v.name.includes('Daniel') || v.name.includes('Google US')
        )
      ) ?? voices.find(v => v.lang.startsWith('en') && v.localService) ?? voices.find(v => v.lang.startsWith('en')) ?? voices[0];
    }
  };

  loadVoices();
  if (!voicesReady && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// Auto-init on import (client-side only)
if (typeof window !== 'undefined') {
  initVoices();
}

// ============================================================
// PUBLIC API
// ============================================================

export function isTTSAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function configureTTS(update: Partial<TTSConfig>): void {
  config = { ...config, ...update };
}

export function getTTSState(): TTSState {
  if (!isTTSAvailable()) return 'error';
  if (window.speechSynthesis.speaking) return 'speaking';
  if (audioState.queue.length > 0) return 'queued';
  return 'idle';
}

export function onTTSStateChange(cb: (state: TTSState) => void): void {
  stateChangeCallback = cb;
}

export function getDiagnostic(): TTSDiagnostic {
  return {
    available: isTTSAvailable(),
    enabled: config.enabled,
    voicesLoaded: isTTSAvailable() ? window.speechSynthesis.getVoices().length : 0,
    selectedVoice: selectedVoice?.name ?? null,
    state: getTTSState(),
    lastSpokenText: lastSpoken,
    lastError: lastError,
  };
}

/**
 * Speak text with priority queueing.
 * For direct voice responses, use category 'direct_response' (no cooldown).
 */
export function speak(
  text: string,
  priority: AudioPriority = 'normal',
  category: string = 'general',
): void {
  if (!isTTSAvailable() || !config.enabled) return;
  if (!voicesReady) initVoices();

  audioState = enqueueAudio(audioState, text, priority, category);
  processQueue();
}

/**
 * Speak immediately — bypasses priority queue and cooldowns.
 * Use for direct voice responses and test voice.
 */
export function speakDirect(text: string): void {
  if (!isTTSAvailable()) {
    lastError = 'speechSynthesis not available';
    return;
  }
  if (!config.enabled) {
    lastError = 'voice output disabled';
    return;
  }
  if (!voicesReady) initVoices();

  // Cancel any current speech
  window.speechSynthesis.cancel();
  audioState = finishPlayback(audioState);

  const utterance = createUtterance(text);
  lastSpoken = text;
  lastError = null;

  utterance.onstart = () => { stateChangeCallback?.('speaking'); };
  utterance.onend = () => {
    stateChangeCallback?.('idle');
    audioState = finishPlayback(audioState);
    setTimeout(processQueue, 200);
  };
  utterance.onerror = (e) => {
    lastError = (e as SpeechSynthesisErrorEvent).error ?? 'unknown error';
    stateChangeCallback?.('error');
    audioState = finishPlayback(audioState);
  };

  window.speechSynthesis.speak(utterance);
}

export function speakCritical(text: string, category: string = 'escalation'): void {
  if (!isTTSAvailable() || !config.enabled) return;
  if (!voicesReady) initVoices();

  audioState = enqueueAudio(audioState, text, 'critical', category);

  if (shouldInterrupt(audioState)) {
    window.speechSynthesis.cancel();
    audioState = finishPlayback(audioState);
  }

  processQueue();
}

export function stopSpeaking(): void {
  if (!isTTSAvailable()) return;
  window.speechSynthesis.cancel();
  audioState = { ...audioState, queue: [], currentlyPlaying: null };
  stateChangeCallback?.('idle');
}

export function toggleTTS(): boolean {
  config.enabled = !config.enabled;
  if (!config.enabled) stopSpeaking();
  return config.enabled;
}

export function isTTSEnabled(): boolean {
  return config.enabled;
}

export function enableTTS(): void {
  config.enabled = true;
  if (!voicesReady) initVoices();
}

export function disableTTS(): void {
  config.enabled = false;
  stopSpeaking();
}

// ============================================================
// INTERNAL
// ============================================================

function createUtterance(text: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(prepareForSpeech(text));
  utterance.rate = config.rate;
  utterance.pitch = config.pitch;
  utterance.volume = config.volume;
  if (selectedVoice) utterance.voice = selectedVoice;
  return utterance;
}

function processQueue(): void {
  if (!isTTSAvailable() || window.speechSynthesis.speaking) return;

  const { item, state } = dequeueNext(audioState);
  audioState = state;

  if (!item) return;

  const utterance = createUtterance(item.text);
  lastSpoken = item.text;
  lastError = null;

  utterance.onstart = () => { stateChangeCallback?.('speaking'); };
  utterance.onend = () => {
    audioState = finishPlayback(audioState);
    stateChangeCallback?.('idle');
    setTimeout(processQueue, 300);
  };
  utterance.onerror = (e) => {
    lastError = (e as SpeechSynthesisErrorEvent).error ?? 'unknown error';
    audioState = finishPlayback(audioState);
    stateChangeCallback?.('error');
    setTimeout(processQueue, 300);
  };

  window.speechSynthesis.speak(utterance);
}
