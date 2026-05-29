/**
 * SOI Intelligence Core — Command Parser
 *
 * Intent-first command parser for SOI.
 * Interprets natural operational language before rejecting.
 * Supports NATO phonetic, shorthand, slang, partial sentences.
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
  | { type: 'show_staffing' }
  | { type: 'show_risk' }
  | { type: 'unknown'; raw: string };

// ============================================================
// NATO PHONETIC → GATE NORMALIZER
// ============================================================

const NATO_TO_LETTER: Record<string, string> = {
  alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D',
  echo: 'E', foxtrot: 'F', golf: 'G', hotel: 'H', india: 'I',
};

// Also support standalone NATO words as gate references
// Standalone NATO words preceded by operational context words
// "at delta" → "at 52D", "to echo" → "to 52E", "gate alpha" → "gate 52A"
// But NOT "delta airlines", "echo chamber", "hotel room"
const CONTEXTUAL_NATO = /\b(?:at|to|from|gate|show|focus|stabilize|fix|assign|check|explain|about|near|toward|for)\s+(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india)\b/gi;

// Standalone NATO at end of sentence (common in voice: "what about delta")
const TRAILING_NATO = /\b(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india)\s*[?.!]?\s*$/gi;

/** Normalize NATO phonetic gate references to gate IDs.
 *  "52 alpha" → "52A", "52 bravo" → "52B", "gate 52 charlie" → "gate 52C"
 *  "at delta" → "at 52D", "to echo" → "to 52E"
 *  Standalone NATO only converts with operational context, not in arbitrary text. */
export function normalizeNatoGates(input: string): string {
  // First: "52 alpha" style (always safe — number prefix is unambiguous)
  let result = input.replace(
    /\b(\d{2})\s*[-]?\s*(alpha|bravo|charlie|delta|echo|foxtrot|golf|hotel|india)\b/gi,
    (_, num, nato) => `${num}${NATO_TO_LETTER[nato.toLowerCase()]}`,
  );

  // Second: NATO words with operational context prefix
  // "assign a team to delta" → "assign a team to 52D"
  result = result.replace(CONTEXTUAL_NATO, (match, nato) => {
    const letter = NATO_TO_LETTER[nato.toLowerCase()];
    if (!letter) return match;
    return match.replace(new RegExp(nato, 'i'), `52${letter}`);
  });

  // Third: trailing NATO word (end of input, common in voice)
  // "what about delta" → "what about 52D"
  // Only if no 52X already present (avoid double-converting)
  if (!/52[A-I]/i.test(result)) {
    result = result.replace(TRAILING_NATO, (match, nato) => {
      const letter = NATO_TO_LETTER[nato.toLowerCase()];
      if (!letter) return match;
      return match.replace(new RegExp(nato, 'i'), `52${letter}`);
    });
  }

  return result;
}

// ============================================================
// GATE EXTRACTION
// ============================================================

/** Extract a gate reference from natural text. Returns uppercase gate ID or null. */
export function extractGateRef(input: string): string | null {
  const normalized = normalizeNatoGates(input);
  const m = normalized.match(/\b(52[A-I])\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ============================================================
// PARSER — INTENT-FIRST
// ============================================================

export function parseCommand(input: string): CommandIntent {
  const raw = normalizeNatoGates(input.trim());
  const lower = raw.toLowerCase();

  // ── BRIEFING / STATUS (highest priority conversational) ──
  if (/^(?:brief\s*(?:me|us)?|sitrep|sit\s*rep|what'?s?\s+(?:going\s+on|happening|the\s+(?:play|move|situation|deal|status|word))|bring\s+me\s+up|how\s+(?:are\s+we|we\s+doing|is\s+it|things)|where\s+(?:are\s+we|do\s+we\s+stand)|give\s+me\s+(?:a\s+)?(?:brief|rundown|summary|update|overview)|update\s*(?:me)?|what\s+needs?\s+(?:my\s+)?attention|catch\s+me\s+up|fill\s+me\s+in|overview|summary|summarize(?:\s+operation)?|status|what'?s?\s+up)$/i.test(lower)) {
    return { type: 'summarize_operation' };
  }

  // ── RISK / CONCERN ──
  if (/\b(?:what(?:'s|\s+is)\s+(?:our|the|my)\s+(?:biggest|main|worst|highest)\s+risk|where\s+(?:are\s+we|am\s+i)\s+exposed|what\s+(?:should\s+i|worries?\s+(?:you|me))|what\s+(?:could|might)\s+go\s+wrong|where'?s?\s+the\s+(?:risk|danger|problem|weakness|exposure)|biggest\s+(?:risk|threat|concern|problem)|what'?s?\s+(?:broken|failing|wrong|bad))/i.test(lower)) {
    return { type: 'show_risk' };
  }

  // ── STAFFING / WORKFORCE ──
  if (/\b(?:who(?:'s|is)\s+available|how\s+many\s+(?:agents?|crew|people|staff)|show\s+(?:me\s+)?staff(?:ing)?|staffing\s+(?:level|status|report)|who\s+(?:can\s+(?:i|we)\s+send|do\s+(?:i|we)\s+have|is\s+(?:free|on\s+shift|available|ready))|crew\s+(?:status|count|available|ready)|available\s+(?:agents?|crew|staff|people)|manpower|head\s*count)/i.test(lower)) {
    return { type: 'show_staffing' };
  }

  // ── SHOW / FOCUS on gate or zone ──
  // "show me delta" / "pull up 52E" / "what about 52C" / "show 52A" / "focus on 52D"
  const showMatch = lower.match(/^(?:show\s+(?:me\s+)?|pull\s+up\s+|focus\s+(?:on\s+)?|zoom\s+(?:in\s+)?(?:on\s+)?|look\s+at\s+|check\s+(?:on\s+)?|open\s+)(?:gate\s+|zone\s+)?(.+)$/);
  if (showMatch) {
    const target = showMatch[1].trim().toUpperCase();
    if (!lower.includes('cascade') && !lower.includes('recommend') && !lower.includes('staff') && !lower.includes('active') && !lower.includes('weather')) {
      return { type: 'show_zone', zonePattern: target };
    }
  }

  // ── EXPLAIN / WHAT'S HAPPENING AT ──
  // "why is 52E unstable" / "explain 52E" / "what's happening at delta" / "what's holding up bravo"
  const explainMatch = lower.match(/(?:why\s+is|explain|what'?s?\s+(?:happening|going\s+on|wrong|the\s+(?:issue|problem|deal|situation|status|story))(?:\s+(?:at|with|on|over\s+at|over\s+there\s+at))?\s+|what'?s?\s+(?:up\s+with|holding\s+up|blocking|the\s+matter\s+(?:with|at))\s+|(?:status|condition|state)\s+(?:of|at|for)\s+)(?:gate\s+)?(.+?)(?:\s+(?:unstable|degrading|critical|under\s+pressure|red|bad|down))?$/i);
  if (explainMatch) {
    const target = explainMatch[1].trim().toUpperCase();
    if (/\d+[A-I]/.test(target) || /GATES-/.test(target)) {
      return { type: 'explain_instability', target };
    }
  }

  // ── Bare gate reference: "52D" / "52E?" ──
  if (/^(?:gate\s+)?52[A-I]\??$/i.test(lower.trim())) {
    const gate = lower.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return { type: 'show_zone', zonePattern: gate };
  }

  // ── RECOMMEND ──
  if (/\b(?:recommend|what(?:'s|\s+is)\s+(?:the\s+)?(?:best\s+move|play|right\s+(?:call|move))|what\s+(?:should|would|do)\s+(?:we|i|you)\s+(?:do|recommend|suggest)|what'?s?\s+your\s+(?:call|recommendation|take|read)|best\s+(?:course|option|action|move)|what\s+(?:would\s+you|do\s+you)\s+(?:do|recommend|suggest))/i.test(lower)) {
    const gateRef = extractGateRef(raw);
    return { type: 'recommend_recovery', target: gateRef ?? undefined };
  }

  // ── WHAT IF ──
  const whatIfMatch = lower.match(/^what\s+(?:if|happens?\s+if)\s+(.+?)\s+(?:to|at|for)\s+(.+)$/);
  if (whatIfMatch) {
    return { type: 'what_if', action: whatIfMatch[1].trim(), target: whatIfMatch[2].trim().toUpperCase() };
  }
  // "what happens if we do nothing"
  if (/\bwhat\s+(?:happens?\s+if|if)\s+(?:we\s+)?(?:do\s+nothing|wait|don'?t|sit\s+tight|leave\s+it)/i.test(lower)) {
    return { type: 'what_if', action: 'do nothing', target: 'ALL' };
  }

  // ── CASCADES ──
  if (/\b(?:cascade|cascading|spreading|chain\s+reaction|domino)\b/i.test(lower)) {
    return { type: 'show_cascades' };
  }

  // ── RECOMMENDATIONS ──
  if (/^(?:show\s+)?recommendations?$/i.test(lower)) {
    return { type: 'show_recommendations' };
  }

  return { type: 'unknown', raw };
}

// ============================================================
// ZONE RESOLVER
// ============================================================

/**
 * Resolve a zone/gate pattern to a zone ID.
 * Handles:
 *   "52A-C" → "GATES-52ABC" (range as gate collection)
 *   "GATES-52ABC" → "GATES-52ABC"
 *   "52A" → looks up which zone contains gate 52A
 */
export function resolveZonePattern(
  pattern: string,
  zones: readonly { id: string; gate_ids: string[] }[],
): string | null {
  const upper = normalizeNatoGates(pattern).toUpperCase().trim();

  // Direct zone ID match
  const direct = zones.find(z => z.id.toUpperCase() === upper);
  if (direct) return direct.id;

  // Range pattern: "52A-C" → gates 52A, 52B, 52C (spatial collection)
  const rangeMatch = upper.match(/^(\d+)([A-Z])-([A-Z])$/);
  if (rangeMatch) {
    const prefix = rangeMatch[1];
    const start = rangeMatch[2].charCodeAt(0);
    const end = rangeMatch[3].charCodeAt(0);
    const gates: string[] = [];
    for (let c = start; c <= end; c++) {
      gates.push(`${prefix}${String.fromCharCode(c)}`);
    }
    const zone = zones.find(z => gates.every(g => z.gate_ids.includes(g)));
    if (zone) return zone.id;
  }

  // Single gate: find which zone contains it
  const gate = zones.find(z => z.gate_ids.some(g => g.toUpperCase() === upper));
  if (gate) return gate.id;

  return null;
}
