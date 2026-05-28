/**
 * SOI Voice — Spoken Briefing Generator
 *
 * Converts operational briefings into spoken-word format.
 * Optimized for speech synthesis: shorter sentences, natural pauses,
 * no abbreviations that TTS misreads.
 */

import type { OperationalBriefing } from '@/lib/soi-narrative/briefing-generator';

// ============================================================
// GENERATOR
// ============================================================

/**
 * Convert a visual briefing into spoken format.
 */
export function generateSpokenBriefing(briefing: OperationalBriefing): string {
  const parts: string[] = [];

  parts.push('SOI Operational Briefing.');
  parts.push('');

  for (const section of briefing.sections) {
    // Expand heading into natural speech
    const heading = expandHeading(section.heading);
    if (heading) parts.push(heading);

    // Clean content for speech
    const content = cleanForSpeech(section.content);
    parts.push(content);
    parts.push('');
  }

  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Expand section headings into natural lead-ins.
 */
function expandHeading(heading: string): string {
  switch (heading) {
    case 'Operational State':
      return 'Current operational state.';
    case 'Primary Destabilization Drivers':
      return 'Primary pressure drivers.';
    case 'Active Recovery':
      return 'Active recovery status.';
    case 'Recovery Status':
      return 'Recovery status.';
    case 'Priority Recommendation':
      return 'Top recommendation.';
    case 'Projected Stabilization':
      return 'Projected stabilization.';
    default:
      return `${heading}.`;
  }
}

/**
 * Clean text for speech synthesis.
 */
function cleanForSpeech(text: string): string {
  return text
    // Expand common abbreviations
    .replace(/\best\.\s*/gi, 'estimated ')
    .replace(/\bmin\b/gi, 'minutes')
    .replace(/\bm\b(?=\s|$|,)/g, ' minutes')
    // Clean up pressure scores
    .replace(/(\d+)\/100/g, '$1 out of 100')
    // Remove semicolons (TTS reads them awkwardly)
    .replace(/;\s*/g, '. ')
    // Ensure sentences end with periods
    .replace(/([^.!?])\s*$/, '$1.');
}
