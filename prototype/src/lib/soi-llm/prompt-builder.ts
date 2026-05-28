/**
 * SOI LLM Voice Layer — Prompt Builder
 *
 * Constructs grounded prompts from structured SOI data.
 * The prompt always includes the raw operational data so
 * the LLM can only reference real facts.
 */

import type { GroundedData } from './grounding-contract';

// ============================================================
// PROMPT CONSTRUCTION
// ============================================================

/**
 * Build a user prompt from the operator's question and grounded SOI data.
 */
export function buildVoicePrompt(
  operatorQuestion: string,
  data: GroundedData,
): string {
  const parts: string[] = [];

  parts.push(`OPERATOR QUESTION: "${operatorQuestion}"`);
  parts.push(`OPERATOR: ${data.operatorName} (${data.operatorRole})`);
  parts.push('');

  // SOI structured answer
  parts.push('SOI DETERMINISTIC ANSWER:');
  parts.push(`Title: ${data.answer.title}`);
  parts.push(`Content: ${data.answer.content}`);
  parts.push(`Confidence: ${data.answer.confidence}`);
  if (data.answer.bullets.length > 0) {
    parts.push(`Key facts: ${data.answer.bullets.join('; ')}`);
  }
  if (data.answer.assumptions.length > 0) {
    parts.push(`Assumptions: ${data.answer.assumptions.join('; ')}`);
  }
  if (data.answer.recommendedAction) {
    parts.push(`Recommended action: ${data.answer.recommendedAction}`);
  }
  parts.push('');

  // Operational state
  parts.push('CURRENT OPERATIONAL STATE:');
  parts.push(`Global pressure: ${data.operationalState.globalPressure}/100 (${data.operationalState.globalStability})`);
  parts.push(`Active incidents: ${data.operationalState.activeIncidents}`);
  parts.push(`Active recoveries: ${data.operationalState.activeRecoveries}`);
  if (data.operationalState.zoneStates.length > 0) {
    for (const z of data.operationalState.zoneStates) {
      parts.push(`  ${z.zone}: pressure ${z.pressure}/100 (${z.stability}), ${z.unresolved} unresolved`);
    }
  }

  // Execution context
  if (data.executionContext) {
    parts.push('');
    parts.push('ACTIVE EXECUTION:');
    parts.push(`Objective: ${data.executionContext.objective}`);
    parts.push(`Phase: ${data.executionContext.phase}`);
    parts.push(`Progress: ${data.executionContext.stepsCompleted}/${data.executionContext.stepsTotal} steps`);
    parts.push(`Estimated: ${data.executionContext.estimatedMinutes}m`);
  }

  parts.push('');
  parts.push('INSTRUCTION: Rewrite the SOI deterministic answer into natural operational language. Stay grounded in the data above. Do not add facts not present. Keep it under 120 words.');

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
    'Keep it under 120 words.',
    'This is a briefing request. Be thorough but concise — aim for 150-200 words. Structure as a command-center briefing: situation, key drivers, active recovery, recommendation.'
  );
}
