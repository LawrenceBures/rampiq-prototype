/**
 * SOI Voice — OpenAI TTS Engine
 *
 * Client-side engine that calls the /api/soi/tts server route
 * to generate speech via OpenAI TTS. Falls back to browser
 * SpeechSynthesis if unavailable.
 */

import { prepareForSpeech } from './pronunciation';

// ============================================================
// TYPES
// ============================================================

export type TTSMode = 'openai' | 'browser' | 'unavailable';

// ============================================================
// STATE
// ============================================================

let openaiAvailable: boolean | null = null; // null = not checked yet
let currentAudio: HTMLAudioElement | null = null;
let onStateChange: ((speaking: boolean) => void) | null = null;

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Check if OpenAI TTS is available (server has API key).
 */
export async function checkOpenAITTS(): Promise<boolean> {
  if (openaiAvailable !== null) return openaiAvailable;
  try {
    const res = await fetch('/api/soi/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'test' }),
    });
    // If we get audio back, it's available. If JSON with error, check.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('audio')) {
      openaiAvailable = true;
    } else {
      const data = await res.json();
      openaiAvailable = !data.error || data.error === 'openai_error'; // key exists but may have billing issue
      if (data.error === 'no_api_key') openaiAvailable = false;
    }
  } catch {
    openaiAvailable = false;
  }
  return openaiAvailable;
}

/**
 * Get current TTS mode.
 */
export function getTTSMode(): TTSMode {
  if (openaiAvailable === true) return 'openai';
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) return 'browser';
  return 'unavailable';
}

/**
 * Register a callback for speaking state changes.
 */
export function onOpenAISpeakingChange(cb: (speaking: boolean) => void): void {
  onStateChange = cb;
}

/**
 * Speak text via OpenAI TTS.
 * Returns true if OpenAI was used, false if fell back to browser.
 */
export async function speakWithOpenAI(
  text: string,
  voice: string = 'onyx',
): Promise<boolean> {
  const prepared = prepareForSpeech(text);

  // Stop any current playback
  stopOpenAI();

  try {
    const res = await fetch('/api/soi/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prepared, voice }),
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('audio')) {
      return false; // server returned error JSON, not audio
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    return new Promise<boolean>((resolve) => {
      audio.onplay = () => { onStateChange?.(true); };
      audio.onended = () => {
        onStateChange?.(false);
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        onStateChange?.(false);
        URL.revokeObjectURL(url);
        currentAudio = null;
        resolve(false);
      };
      audio.play().catch(() => {
        onStateChange?.(false);
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Stop OpenAI TTS playback.
 */
export function stopOpenAI(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
    onStateChange?.(false);
  }
}

/**
 * Check if OpenAI TTS is currently playing.
 */
export function isOpenAIPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
