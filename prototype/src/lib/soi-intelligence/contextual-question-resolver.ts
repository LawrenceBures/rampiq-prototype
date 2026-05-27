/**
 * SOI Intelligence Core — Contextual Question Resolver
 *
 * Enriches incomplete questions using conversational context.
 * If a question lacks zone/gate/resource targets, infers them
 * from the active conversation memory.
 *
 * No LLM. Deterministic inference only.
 */

import type { ConversationContext } from './operational-conversation-memory';
import { isContextActive } from './operational-conversation-memory';
import type { RoutedQuestion, QuestionIntent } from './operational-question-router';

// ============================================================
// TYPES
// ============================================================

export interface ResolvedContext {
  resolvedQuestion: RoutedQuestion;
  inferredFrom: string[];
  confidence: 'high' | 'moderate' | 'low';
  clarificationNeeded?: string;
}

// ============================================================
// PRONOUN / REFERENCE PATTERNS
// ============================================================

const PRONOUN_PATTERNS = [
  /\b(?:there|that\s+zone|this\s+zone|it|this|that)\b/,
  /\b(?:him|her|them|they|the\s+agent|the\s+resource)\b/,
  /\b(?:adjacent|neighboring|nearby|next\s+to)\b/,
];

const FOLLOW_UP_PATTERNS = [
  /^(?:and|also|what\s+about|how\s+about|what\s+if)\b/,
  /^(?:ok|okay|now|then|next|also|but)\b/,
  /\b(?:instead|alternatively|other)\b/,
];

// ============================================================
// RESOLVER
// ============================================================

/**
 * Resolve a routed question against conversation context.
 * Infers missing targets from active context when confidence is sufficient.
 */
export function resolveWithContext(
  question: RoutedQuestion,
  memory: ConversationContext,
): ResolvedContext {
  // If context expired, return question as-is
  if (!isContextActive(memory)) {
    return {
      resolvedQuestion: question,
      inferredFrom: [],
      confidence: question.targetZone || question.resourceId ? 'high' : 'moderate',
    };
  }

  const lower = question.raw.toLowerCase();
  const inferred: string[] = [];
  const resolved = { ...question };

  // --- Infer zone if missing ---
  if (!resolved.targetZone && memory.activeZone) {
    const needsZone = isZoneRelevantIntent(resolved.intent);
    const hasReference = PRONOUN_PATTERNS.some(p => p.test(lower)) ||
      FOLLOW_UP_PATTERNS.some(p => p.test(lower)) ||
      !hasExplicitTarget(lower);

    if (needsZone && hasReference) {
      resolved.targetZone = memory.activeZone;
      inferred.push(`zone: ${memory.activeZoneLabel ?? memory.activeZone}`);
    }
  }

  // --- Infer gate if missing ---
  if (!resolved.targetGate && memory.activeGate) {
    const hasGateRef = /\b(?:gate|that\s+gate|this\s+gate|the\s+gate)\b/.test(lower);
    if (hasGateRef) {
      resolved.targetGate = memory.activeGate;
      inferred.push(`gate: ${memory.activeGate}`);
    }
  }

  // --- Infer resource if missing ---
  if (!resolved.resourceId && memory.activeResourceId) {
    const hasResourceRef = /\b(?:him|her|them|the\s+agent|the\s+resource|that\s+(?:agent|resource|person|equipment))\b/.test(lower) ||
      /\b(?:he|she|they)\s+(?:becomes?|is|are|was|were)\b/.test(lower);
    if (hasResourceRef) {
      resolved.resourceId = memory.activeResourceId;
      inferred.push(`resource: ${memory.activeResourceId}`);
    }
  }

  // --- Determine confidence ---
  let confidence: 'high' | 'moderate' | 'low';
  if (inferred.length === 0) {
    confidence = resolved.targetZone || resolved.resourceId ? 'high' : 'moderate';
  } else if (inferred.length === 1) {
    confidence = 'moderate';
  } else {
    confidence = 'low';
  }

  // --- Check for ambiguity that needs clarification ---
  let clarificationNeeded: string | undefined;
  if (!resolved.targetZone && !memory.activeZone && isZoneRelevantIntent(resolved.intent) && resolved.intent !== 'summary') {
    // No zone in question and no context — might need clarification
    // But don't ask for summary/recovery_plan since they work globally
    if (resolved.intent === 'stability_timing' || resolved.intent === 'cause_explanation') {
      // These are fine globally — they'll use the worst zone
    }
  }

  return {
    resolvedQuestion: resolved,
    inferredFrom: inferred,
    confidence,
    clarificationNeeded,
  };
}

// ============================================================
// HELPERS
// ============================================================

function isZoneRelevantIntent(intent: QuestionIntent): boolean {
  return intent === 'stability_timing' ||
    intent === 'cause_explanation' ||
    intent === 'risk_assessment' ||
    intent === 'recovery_plan';
}

function hasExplicitTarget(input: string): boolean {
  // Check if the input contains an explicit zone/gate reference
  return /\b\d+[a-z](?:-[a-z])?\b/i.test(input) ||
    /\bgates?-\d+/i.test(input) ||
    /\bzone\s+\d/i.test(input);
}
