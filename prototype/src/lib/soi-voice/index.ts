/**
 * SOI Voice + Ambient Operations Layer
 *
 * Multimodal operational presence:
 * voice input, spoken responses, ambient awareness cues.
 */

// Voice input
export {
  isVoiceInputAvailable, startListening, stopListening,
  getVoiceInputState, onVoiceResult, onVoiceStateChange, cleanTranscript,
  type VoiceInputState, type VoiceInputResult,
} from './voice-input-engine';

// Voice command routing
export { routeVoiceCommand, type VoiceCommand, type VoiceCommandType } from './voice-command-router';

// Voice response decisions
export { shouldSpeak, getSpokenPriority, condenseForSpeech } from './voice-response-engine';

// Text-to-speech
export {
  isTTSAvailable, speak, speakDirect, speakCritical, stopSpeaking, toggleTTS, isTTSEnabled,
  enableTTS, disableTTS, configureTTS, getTTSState, onTTSStateChange, getDiagnostic,
  type TTSConfig, type TTSState, type TTSDiagnostic,
} from './text-to-speech-engine';

// Ambient awareness
export {
  enableAmbient, disableAmbient, toggleAmbient, isAmbientEnabled, playAmbientCue,
  type AmbientCue,
} from './ambient-awareness-engine';

// Audio priority
export {
  createAudioState, enqueueAudio, dequeueNext, finishPlayback, shouldInterrupt, toggleMute,
  type AudioPriorityState, type AudioPriority, type AudioQueueItem,
} from './audio-priority-engine';

// Spoken briefings
export { generateSpokenBriefing } from './spoken-briefing-generator';
