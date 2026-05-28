/**
 * SOI Intelligence Core — Command Parser
 *
 * Typed command parser for the SOI command input.
 * Returns structured intents from natural-language-like typed commands.
 * No LLM. Pattern matching only.
 */

// ============================================================
// TYPES
// ============================================================

export type CommandIntent =
  | { type: 'show_zone'; zonePattern: string }
  | { type: 'explain_instability'; target: string }
  | { type: 'recommend_recovery'; target?: string }
  | { type: 'what_if'; action: string; target: string }
  | { type: 'summarize_operation' }
  | { type: 'show_cascades' }
  | { type: 'show_recommendations' }
  | { type: 'unknown'; raw: string };

// ============================================================
// NATO PHONETIC → GATE NORMALIZER
// ============================================================

const NATO_TO_LETTER: Record<string, string> = {
  alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D',
  echo: 'E', foxtrot: 'F', golf: 'G', hotel: 'H', india: 'I',
};

/** Normalize NATO phonetic gate references to gate IDs.
 *  "52 alpha" → "52A", "52 bravo" → "52B", "gate 52 charlie" → "gate 52C"
 *  Also handles "52-alpha", "52alpha". */
export function normalizeNatoGates(input: string): string {
  return input.replace(
    /\b(\d{2})\s*[-]?\s*(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india)\b/gi,
    (_, num, nato) => `${num}${NATO_TO_LETTER[nato.toLowerCase()]}`,
  );
}

// ============================================================
// PARSER
// ============================================================

export function parseCommand(input: string): CommandIntent {
  const raw = normalizeNatoGates(input.trim());
  const lower = raw.toLowerCase();

  // "show zone 52A-C" / "show zone GATES-52ABC" / "show 52A"
  const showZoneMatch = lower.match(/^show\s+(?:zone\s+)?(.+)$/);
  if (showZoneMatch) {
    const zonePattern = showZoneMatch[1].trim().toUpperCase();
    // Ensure this doesn't match other commands
    if (!lower.includes('cascade') && !lower.includes('recommend') && !lower.includes('active')) {
      return { type: 'show_zone', zonePattern };
    }
  }

  // "why is 52E unstable" / "explain 52E" / "why is GATES-52DEF unstable"
  const whyMatch = lower.match(/^(?:why\s+is|explain)\s+(.+?)(?:\s+(?:unstable|degrading|critical|under pressure))?$/);
  if (whyMatch) {
    return { type: 'explain_instability', target: whyMatch[1].trim().toUpperCase() };
  }

  // "recommend recovery" / "recommend recovery for 52E" / "recommend"
  const recMatch = lower.match(/^recommend(?:\s+recovery)?(?:\s+for\s+(.+))?$/);
  if (recMatch) {
    return { type: 'recommend_recovery', target: recMatch[1]?.trim().toUpperCase() };
  }

  // "what if dispatch RA14 to 52E" / "what if send agent to 52A"
  const whatIfMatch = lower.match(/^what\s+if\s+(.+?)\s+(?:to|at|for)\s+(.+)$/);
  if (whatIfMatch) {
    return { type: 'what_if', action: whatIfMatch[1].trim(), target: whatIfMatch[2].trim().toUpperCase() };
  }

  // "summarize operation" / "summarize" / "summary" / "status"
  if (/^(?:summarize(?:\s+operation)?|summary|status|overview)$/.test(lower)) {
    return { type: 'summarize_operation' };
  }

  // "show active cascades" / "cascades" / "show cascades"
  if (/^(?:show\s+)?(?:active\s+)?cascades?$/.test(lower)) {
    return { type: 'show_cascades' };
  }

  // "show recommendations" / "recommendations"
  if (/^(?:show\s+)?recommendations?$/.test(lower)) {
    return { type: 'show_recommendations' };
  }

  return { type: 'unknown', raw };
}

/**
 * Resolve a zone pattern to a zone ID.
 * Handles:
 *   "52A-C" → "GATES-52ABC"
 *   "52D-F" → "GATES-52DEF"
 *   "GATES-52ABC" → "GATES-52ABC"
 *   "52A" → looks up which zone contains gate 52A
 */
export function resolveZonePattern(
  pattern: string,
  zones: readonly { id: string; gate_ids: string[] }[],
): string | null {
  const upper = pattern.toUpperCase().trim();

  // Direct zone ID match
  const direct = zones.find(z => z.id.toUpperCase() === upper);
  if (direct) return direct.id;

  // Range pattern: "52A-C" → gates 52A, 52B, 52C
  const rangeMatch = upper.match(/^(\d+)([A-Z])-([A-Z])$/);
  if (rangeMatch) {
    const prefix = rangeMatch[1];
    const start = rangeMatch[2].charCodeAt(0);
    const end = rangeMatch[3].charCodeAt(0);
    const gates: string[] = [];
    for (let c = start; c <= end; c++) {
      gates.push(`${prefix}${String.fromCharCode(c)}`);
    }
    // Find zone containing all these gates
    const zone = zones.find(z => gates.every(g => z.gate_ids.includes(g)));
    if (zone) return zone.id;
  }

  // Single gate: find which zone contains it
  const gate = zones.find(z => z.gate_ids.some(g => g.toUpperCase() === upper));
  if (gate) return gate.id;

  return null;
}
