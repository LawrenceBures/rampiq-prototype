/**
 * SOI Intelligence Core — Operational Copilot
 *
 * Public entry point for contextual operational conversation.
 * Routes natural language questions through intent recognition
 * and generates deterministic answers from operational state.
 *
 * No LLM. No hallucination. All modeled estimates are labeled
 * as deterministic, not live predictions.
 */

import { routeQuestion, type RoutedQuestion } from './operational-question-router';
import { generateAnswer, type CopilotAnswer, type OperationalContext } from './operational-answer-generator';
import type { Zone } from '@/lib/soi-types';

export type { CopilotAnswer, OperationalContext } from './operational-answer-generator';
export type { RoutedQuestion } from './operational-question-router';

/**
 * Answer an operational question using deterministic reasoning.
 *
 * Flow: input → route question → generate answer
 *
 * If data is insufficient, returns a clear "not enough data" response
 * rather than guessing.
 */
export function answerOperationalQuestion(
  input: string,
  ctx: OperationalContext,
  zones?: readonly Zone[],
): CopilotAnswer {
  const question = routeQuestion(input, zones);
  return generateAnswer(question, ctx);
}
