/**
 * SOI Intelligence Core — Operational Copilot
 *
 * Public entry point for contextual operational conversation.
 * Routes natural language questions through context resolution,
 * intent recognition, and answer generation.
 *
 * Maintains conversational context for follow-up questions.
 *
 * No LLM. No hallucination. All modeled estimates are labeled
 * as deterministic, not live predictions.
 */

import { generateAnswer, type CopilotAnswer, type OperationalContext } from './operational-answer-generator';
import { resolveOperationalContext, updateMemoryFromAnswer } from './operational-context-engine';
import type { ConversationContext } from './operational-conversation-memory';
import type { Zone } from '@/lib/soi-types';

export type { CopilotAnswer, OperationalContext } from './operational-answer-generator';
export type { RoutedQuestion } from './operational-question-router';

export interface CopilotResult {
  answer: CopilotAnswer;
  updatedMemory: ConversationContext;
  inferredFrom: string[];
  contextConfidence: 'high' | 'moderate' | 'low';
}

/**
 * Answer an operational question using deterministic reasoning
 * with conversational context.
 *
 * Flow: input → context resolution → route → generate answer → update memory
 */
export function answerOperationalQuestion(
  input: string,
  ctx: OperationalContext,
  zones?: readonly Zone[],
  memory?: ConversationContext,
): CopilotAnswer;

export function answerOperationalQuestion(
  input: string,
  ctx: OperationalContext,
  zones: readonly Zone[] | undefined,
  memory: ConversationContext,
  returnFull: true,
): CopilotResult;

export function answerOperationalQuestion(
  input: string,
  ctx: OperationalContext,
  zones?: readonly Zone[],
  memory?: ConversationContext,
  returnFull?: boolean,
): CopilotAnswer | CopilotResult {
  const mem = memory ?? { lastUpdatedAt: 0 };

  // 1. Resolve context: enrich question from conversation memory
  const { resolved, routed } = resolveOperationalContext(input, mem, zones);

  // 2. Generate answer from enriched question
  const answer = generateAnswer(resolved.resolvedQuestion, ctx);

  // 3. Update memory from answer
  const updatedMemory = updateMemoryFromAnswer(
    mem, resolved.resolvedQuestion, answer, ctx.assessment, zones
  );

  if (returnFull) {
    return {
      answer,
      updatedMemory,
      inferredFrom: resolved.inferredFrom,
      contextConfidence: resolved.confidence,
    };
  }

  return answer;
}
