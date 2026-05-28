/**
 * SOI LLM Voice Layer
 *
 * Natural language intelligence on top of SOI's deterministic engine.
 * The LLM is the voice. The operational engine is the brain.
 */

export {
  voiceRewrite,
  isVoiceAvailable,
  setVoiceKey,
  clearVoiceKey,
  type VoiceResult,
} from './llm-voice-layer';

export {
  SOI_SYSTEM_PROMPT,
  isGroundedDataValid,
  type GroundedData,
} from './grounding-contract';

export {
  buildVoicePrompt,
  buildBriefingPrompt,
} from './prompt-builder';

export {
  validateResponse,
  sanitizeOrFallback,
  type SafetyCheckResult,
} from './response-safety';
