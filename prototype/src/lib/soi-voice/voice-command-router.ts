/**
 * SOI Voice — Voice Command Router
 *
 * Routes cleaned voice transcripts into the existing SOI
 * copilot + agentic command architecture.
 */

import { cleanTranscript } from './voice-input-engine';

// ============================================================
// TYPES
// ============================================================

export type VoiceCommandType =
  | 'operational_question'
  | 'approval'
  | 'cancellation'
  | 'briefing_request'
  | 'status_check';

export interface VoiceCommand {
  type: VoiceCommandType;
  text: string;
  originalTranscript: string;
}

// ============================================================
// ROUTER
// ============================================================

const APPROVAL_PATTERNS = [
  /\b(?:approve|confirm|confirmed|go|proceed|execute|dispatch|do\s+it|yes|affirmative)\b/i,
  /\bapprove\s+(?:the\s+)?(?:plan|recovery|execution|dispatch)\b/i,
  /\bapprove\s+and\s+dispatch\b/i,
];

const CANCELLATION_PATTERNS = [
  /\b(?:cancel|abort|stop|nevermind|never\s+mind|scratch\s+that|hold|belay\s+that)\b/i,
];

const BRIEFING_PATTERNS = [
  /\b(?:brief\s+me|briefing|situation\s+report|sitrep|sit\s+rep)\b/i,
  /\bgive\s+me\s+(?:a\s+)?(?:brief|briefing|situation|overview|status)\b/i,
];

const STATUS_PATTERNS = [
  /\b(?:what'?s?\s+the\s+status|execution\s+status|how\s+is\s+recovery|show\s+status)\b/i,
  /\bwhat\s+step\s+are\s+we\s+on\b/i,
  /\bwhere\s+are\s+we\b/i,
];

export function routeVoiceCommand(rawTranscript: string): VoiceCommand {
  const cleaned = cleanTranscript(rawTranscript);
  const original = rawTranscript;

  if (APPROVAL_PATTERNS.some(p => p.test(cleaned))) {
    return { type: 'approval', text: cleaned, originalTranscript: original };
  }

  if (CANCELLATION_PATTERNS.some(p => p.test(cleaned))) {
    return { type: 'cancellation', text: cleaned, originalTranscript: original };
  }

  if (BRIEFING_PATTERNS.some(p => p.test(cleaned))) {
    return { type: 'briefing_request', text: 'summarize', originalTranscript: original };
  }

  if (STATUS_PATTERNS.some(p => p.test(cleaned))) {
    return { type: 'status_check', text: 'show plan status', originalTranscript: original };
  }

  // Default: treat as operational question
  return { type: 'operational_question', text: cleaned, originalTranscript: original };
}
