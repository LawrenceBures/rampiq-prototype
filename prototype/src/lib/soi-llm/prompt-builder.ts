/**
 * SOI LLM Voice Layer — Prompt Builder
 *
 * Constructs grounded prompts from structured SOI data.
 * Includes conversation history for multi-turn context.
 */

import type { GroundedData } from './grounding-contract';

// ============================================================
// PROMPT CONSTRUCTION
// ============================================================

/**
 * Build a user prompt from the operator's question and grounded SOI data.
 * Includes conversation history for follow-up context.
 */
export function buildVoicePrompt(
  operatorQuestion: string,
  data: GroundedData,
): string {
  const parts: string[] = [];

  // Conversation history (if available) — enables follow-ups
  if (data.conversationHistory) {
    parts.push('RECENT CONVERSATION:');
    parts.push(data.conversationHistory);
    parts.push('');
  }

  parts.push(`OPERATOR: ${data.operatorName} (${data.operatorRole})`);
  parts.push(`OPERATOR SAYS: "${operatorQuestion}"`);
  parts.push('');

  // SOI structured answer
  parts.push('SOI ENGINE ANSWER:');
  parts.push(`${data.answer.title}: ${data.answer.content}`);
  if (data.answer.bullets.length > 0) {
    parts.push(`Key facts: ${data.answer.bullets.join('; ')}`);
  }
  if (data.answer.recommendedAction) {
    parts.push(`Recommended action: ${data.answer.recommendedAction}`);
  }
  parts.push('');

  // Operational state
  parts.push('LIVE OPERATIONAL STATE:');
  parts.push(`Pressure: ${data.operationalState.globalPressure}/100 (${data.operationalState.globalStability})`);
  parts.push(`Incidents: ${data.operationalState.activeIncidents} active`);
  parts.push(`Recoveries: ${data.operationalState.activeRecoveries} active`);
  if (data.operationalState.zoneStates.length > 0) {
    for (const z of data.operationalState.zoneStates) {
      parts.push(`  ${z.zone}: ${z.pressure} (${z.stability}), ${z.unresolved} unresolved`);
    }
  }

  // Execution context
  if (data.executionContext) {
    parts.push('');
    parts.push(`ACTIVE EXECUTION: ${data.executionContext.objective} — ${data.executionContext.phase}, ${data.executionContext.stepsCompleted}/${data.executionContext.stepsTotal} steps, ~${data.executionContext.estimatedMinutes}m`);
  }

  parts.push('');
  parts.push('INSTRUCTION: Rewrite the engine answer into natural spoken language. You are SOI speaking directly to the operator. Stay grounded in the data. Under 120 words.');

  return parts.join('\n');
}

/**
 * Build a briefing prompt for a more detailed response.
 */
export function buildBriefingPrompt(
  operatorQuestion: string,
  data: GroundedData,
): string {
  const base = buildVoicePrompt(operatorQuestion, data);
  return base.replace(
    'Under 120 words.',
    'This is a briefing. Be thorough but concise — 150-200 words. Structure: situation, key drivers, active recovery, recommendation, outlook.'
  );
}
