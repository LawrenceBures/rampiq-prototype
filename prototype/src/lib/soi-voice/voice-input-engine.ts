/**
 * SOI Voice — Voice Input Engine
 *
 * Browser-native speech recognition (Web Speech API).
 * Push-to-talk mode. No continuous listening by default.
 */

// Web Speech API types (not in default TS lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognition;

// ============================================================
// TYPES
// ============================================================

export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';

export interface VoiceInputResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

type VoiceCallback = (result: VoiceInputResult) => void;
type StateCallback = (state: VoiceInputState) => void;

// ============================================================
// ENGINE
// ============================================================

let recognition: SpeechRecognition | null = null;
let currentState: VoiceInputState = 'idle';
let onResultCallback: VoiceCallback | null = null;
let onStateCallback: StateCallback | null = null;

/**
 * Check if speech recognition is available.
 */
export function isVoiceInputAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Set callbacks for voice events.
 */
export function onVoiceResult(cb: VoiceCallback): void {
  onResultCallback = cb;
}

export function onVoiceStateChange(cb: StateCallback): void {
  onStateCallback = cb;
}

function setState(s: VoiceInputState): void {
  currentState = s;
  onStateCallback?.(s);
}

/**
 * Start listening (push-to-talk).
 * Stops automatically after speech ends.
 */
export function startListening(): void {
  if (!isVoiceInputAvailable()) {
    setState('error');
    return;
  }

  if (recognition) {
    recognition.abort();
  }

  const SpeechRecognitionClass = (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    setState('error');
    return;
  }

  recognition = new SpeechRecognitionClass();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => setState('listening');

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const last = event.results[event.results.length - 1];
    const transcript = last[0].transcript.trim();
    const confidence = last[0].confidence;
    const isFinal = last.isFinal;

    onResultCallback?.({ transcript, confidence, isFinal });

    if (isFinal) {
      setState('processing');
    }
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === 'no-speech' || event.error === 'aborted') {
      setState('idle');
    } else {
      console.error('[SOI Voice] recognition error:', event.error);
      setState('error');
      // Auto-recover after error
      setTimeout(() => { if (currentState === 'error') setState('idle'); }, 3000);
    }
  };

  recognition.onend = () => {
    if (currentState === 'listening') setState('idle');
    recognition = null;
  };

  try {
    recognition.start();
  } catch {
    setState('error');
  }
}

/**
 * Stop listening immediately.
 */
export function stopListening(): void {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  setState('idle');
}

/**
 * Get current voice input state.
 */
export function getVoiceInputState(): VoiceInputState {
  return currentState;
}

/**
 * Clean up a voice transcript for command processing.
 * Removes filler words and normalizes.
 */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/^(?:hey\s+)?(?:soi|s\.?o\.?i\.?)\s*[,.]?\s*/i, '') // strip wake word
    .replace(/\b(?:um|uh|like|you know|so|okay|ok)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
