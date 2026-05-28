/**
 * SOI LLM Voice Layer — Response Safety
 *
 * Validates LLM responses against grounding contract.
 * Rejects responses that fabricate operational data.
 */

import type { GroundedData } from './grounding-contract';

// ============================================================
// TYPES
// ============================================================

export interface SafetyCheckResult {
  safe: boolean;
  violations: string[];
}

// ============================================================
// SAFETY CHECKS
// ============================================================

/**
 * Validate an LLM response against grounded data.
 * Returns safe=true if no violations detected.
 */
export function validateResponse(
  response: string,
  groundedData: GroundedData,
): SafetyCheckResult {
  const violations: string[] = [];
  const lower = response.toLowerCase();

  // Check for fabricated certainty
  const certaintyPhrases = [
    'i guarantee', 'i promise', 'absolutely certain', 'definitely will',
    '100% confident', 'guaranteed to', 'will certainly', 'without doubt',
  ];
  for (const phrase of certaintyPhrases) {
    if (lower.includes(phrase)) {
      violations.push(`Fabricated certainty: "${phrase}"`);
    }
  }

  // Check for fabricated execution authority
  const authorityPhrases = [
    'i have authorized', 'i am executing', 'i will dispatch',
    'i\'m sending', 'i\'ve approved', 'executing now',
  ];
  for (const phrase of authorityPhrases) {
    if (lower.includes(phrase)) {
      violations.push(`Fabricated authority: "${phrase}"`);
    }
  }

  // Check for nonsensical pressure values
  const pressureMatch = response.match(/pressure\s+(?:of\s+|at\s+|is\s+)?(\d+)/gi);
  if (pressureMatch) {
    for (const match of pressureMatch) {
      const num = parseInt(match.replace(/\D/g, ''));
      if (num > 100) {
        violations.push(`Invalid pressure value: ${num} (max 100)`);
      }
    }
  }

  // Check response length — too long suggests hallucination
  if (response.length > 2000) {
    violations.push('Response exceeds safe length (2000 chars) — possible hallucination');
  }

  // Check for sci-fi / marketing language
  const sciFiPhrases = [
    'quantum', 'neural network', 'machine learning', 'ai-powered',
    'revolutionary', 'cutting-edge', 'next-generation', 'game-changing',
  ];
  for (const phrase of sciFiPhrases) {
    if (lower.includes(phrase)) {
      violations.push(`Marketing/sci-fi language: "${phrase}"`);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Sanitize a response by removing unsafe content.
 * Falls back to the deterministic answer if too many violations.
 */
export function sanitizeOrFallback(
  llmResponse: string,
  deterministicFallback: string,
  groundedData: GroundedData,
): { text: string; wasLLM: boolean } {
  const check = validateResponse(llmResponse, groundedData);

  if (!check.safe && check.violations.length >= 2) {
    // Too many violations — fall back entirely
    return { text: deterministicFallback, wasLLM: false };
  }

  if (!check.safe) {
    // Minor violation — use LLM response with disclaimer
    return { text: llmResponse, wasLLM: true };
  }

  return { text: llmResponse, wasLLM: true };
}
