/**
 * SOI LLM Voice Layer
 *
 * Rewrites structured SOI answers into natural operational language.
 * Calls Anthropic Claude API (preferred) or falls back to deterministic
 * templates when no API key is available.
 *
 * The LLM is the voice. SOI's deterministic engine is the brain.
 */

import { SOI_SYSTEM_PROMPT, type GroundedData, isGroundedDataValid } from './grounding-contract';
import { buildVoicePrompt, buildBriefingPrompt } from './prompt-builder';
import { sanitizeOrFallback } from './response-safety';

// ============================================================
// TYPES
// ============================================================

export interface VoiceResult {
  text: string;
  source: 'llm' | 'deterministic';
  model?: string;
  latencyMs?: number;
}

// ============================================================
// API CALL
// ============================================================

/**
 * Rewrite a structured SOI answer using LLM voice.
 * Falls back to deterministic answer when:
 * - No API key configured
 * - API call fails
 * - Response fails safety check
 */
export async function voiceRewrite(
  operatorQuestion: string,
  groundedData: GroundedData,
  options?: { briefingMode?: boolean },
): Promise<VoiceResult> {
  // Validate grounded data
  if (!isGroundedDataValid(groundedData)) {
    return {
      text: groundedData.answer.content,
      source: 'deterministic',
    };
  }

  // Check for API key
  const anthropicKey = getAnthropicKey();
  if (!anthropicKey) {
    return {
      text: groundedData.answer.content,
      source: 'deterministic',
    };
  }

  const prompt = options?.briefingMode
    ? buildBriefingPrompt(operatorQuestion, groundedData)
    : buildVoicePrompt(operatorQuestion, groundedData);

  const start = Date.now();

  try {
    const response = await callAnthropic(anthropicKey, prompt);
    const latencyMs = Date.now() - start;

    const { text, wasLLM } = sanitizeOrFallback(
      response,
      groundedData.answer.content,
      groundedData,
    );

    return {
      text,
      source: wasLLM ? 'llm' : 'deterministic',
      model: 'claude-sonnet-4-20250514',
      latencyMs,
    };
  } catch (err) {
    console.error('[SOI LLM] voice rewrite failed:', err);
    return {
      text: groundedData.answer.content,
      source: 'deterministic',
    };
  }
}

// ============================================================
// ANTHROPIC API
// ============================================================

async function callAnthropic(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SOI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error('Empty response from Anthropic');
  return content;
}

// ============================================================
// KEY MANAGEMENT
// ============================================================

function getAnthropicKey(): string | null {
  // Server-side: check env
  if (typeof process !== 'undefined' && process.env?.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  // Client-side: check localStorage for dev/demo
  if (typeof window !== 'undefined') {
    return localStorage.getItem('soi_anthropic_key');
  }
  return null;
}

/**
 * Check whether LLM voice is available.
 */
export function isVoiceAvailable(): boolean {
  return getAnthropicKey() !== null;
}

/**
 * Set an API key in localStorage for client-side dev/demo.
 */
export function setVoiceKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('soi_anthropic_key', key);
  }
}

/**
 * Clear the stored API key.
 */
export function clearVoiceKey(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('soi_anthropic_key');
  }
}
