/**
 * SOI Intelligence Core — Operational Context Engine
 *
 * Public API for context-aware question resolution.
 * Enriches incomplete questions, infers targets from conversation
 * memory, and determines follow-up references.
 *
 * No LLM. Deterministic inference only.
 */

import type { ConversationContext } from './operational-conversation-memory';
import { isContextActive, updateContext, intentToTopic } from './operational-conversation-memory';
import { routeQuestion, type RoutedQuestion } from './operational-question-router';
import { resolveWithContext, type ResolvedContext } from './contextual-question-resolver';
import type { CopilotAnswer, OperationalContext } from './operational-answer-generator';
import type { OperationalAssessment } from './operational-reasoning';
import type { Zone } from '@/lib/soi-types';

export type { ResolvedContext } from './contextual-question-resolver';

// ============================================================
// PUBLIC API
// ============================================================

export interface ContextualResult {
  resolvedQuestion: RoutedQuestion;
  resolvedContext: ResolvedContext;
  updatedMemory: ConversationContext;
}

/**
 * Resolve a raw question against conversation memory and operational state.
 *
 * Flow:
 *   1. Route the raw question (intent classification)
 *   2. Resolve against conversation context (infer missing targets)
 *   3. Return enriched question + updated memory
 */
export function resolveOperationalContext(
  raw: string,
  memory: ConversationContext,
  zones?: readonly Zone[],
): { resolved: ResolvedContext; routed: RoutedQuestion } {
  const routed = routeQuestion(raw, zones);
  const resolved = resolveWithContext(routed, memory);
  return { resolved, routed: resolved.resolvedQuestion };
}

/**
 * Update conversation memory after a successful copilot answer.
 * Extracts context cues from the question and answer to maintain
 * conversational continuity.
 */
export function updateMemoryFromAnswer(
  memory: ConversationContext,
  question: RoutedQuestion,
  answer: CopilotAnswer,
  assessment: OperationalAssessment,
  zones?: readonly Zone[],
): ConversationContext {
  const zoneLabel = question.targetZone
    ? zones?.find(z => z.id === question.targetZone)?.label
    : undefined;

  // Extract zone from answer if question didn't have one
  // (e.g., "biggest risk" → answer mentions Gates 52A-C)
  let inferredZone = question.targetZone;
  let inferredZoneLabel = zoneLabel;
  if (!inferredZone && assessment.zoneAssessments.length > 0) {
    // If the answer focused on a specific zone (worst zone), capture it
    const worst = [...assessment.zoneAssessments].sort((a, b) => b.pressure - a.pressure)[0];
    if (worst && worst.stability !== 'stable') {
      inferredZone = worst.zoneId;
      inferredZoneLabel = worst.zoneLabel;
    }
  }

  return updateContext(memory, {
    activeZone: inferredZone,
    activeZoneLabel: inferredZoneLabel,
    activeGate: question.targetGate,
    activeResourceId: question.resourceId,
    activeTopic: intentToTopic(question.intent),
    lastIntent: question.intent,
    lastAnswerTitle: answer.title,
  });
}
