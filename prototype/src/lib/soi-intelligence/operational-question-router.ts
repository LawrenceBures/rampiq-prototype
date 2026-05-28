/**
 * SOI Intelligence Core — Operational Question Router
 *
 * Parses natural language operational questions into intent categories.
 * Uses keyword/phrase matching with fuzzy fallbacks.
 * No LLM. Deterministic pattern matching only.
 */

import { resolveZonePattern } from './soi-command-parser';

// ============================================================
// TYPES
// ============================================================

export type QuestionIntent =
  | 'stability_timing'
  | 'cause_explanation'
  | 'risk_assessment'
  | 'recovery_plan'
  | 'resource_question'
  | 'summary'
  | 'unknown';

export interface RoutedQuestion {
  intent: QuestionIntent;
  targetZone?: string;
  targetGate?: string;
  resourceId?: string;
  raw: string;
}

// ============================================================
// PATTERN SETS
// ============================================================

const STABILITY_PATTERNS = [
  /how\s+long\s+until.*stab/,
  /when.*(?:stable|stability|recover|clear|normal)/,
  /time\s+to\s+stab/,
  /eta.*(?:stab|recover|clear)/,
  /when\s+(?:will|does|do)\s+(?:this|it|we|zone|gate).*(?:clear|recover|stabilize)/,
  /how\s+long.*(?:clear|recover|take)/,
  /stabilization\s+(?:time|estimate|eta)/,
  /when\s+are\s+we\s+(?:stable|clear|good|ok)/,
];

const CAUSE_PATTERNS = [
  /why.*(?:unstable|pressure|red|degrading|critical|down|bad)/,
  /what(?:'s|\s+is)\s+(?:causing|driving|behind)/,
  /cause\s+(?:of|for)/,
  /root\s+cause/,
  /what\s+(?:happened|went\s+wrong)/,
  /explain.*(?:pressure|instability|cascade|issue)/,
  /why\s+(?:is|are)\s+(?:we|things|it|this)/,
  /what(?:'s|\s+is)\s+(?:the\s+)?(?:problem|issue|matter)/,
];

const RISK_PATTERNS = [
  /(?:biggest|highest|top|main|greatest|worst)\s+risk/,
  /what\s+(?:breaks|fails|goes)\s+next/,
  /(?:most|where)\s+(?:fragile|vulnerable|at\s+risk|exposed)/,
  /where\s+will\s+pressure\s+(?:move|go|shift|spread)/,
  /where\s+(?:is|are)\s+we\s+exposed/,
  /what\s+(?:could|might|will)\s+(?:go\s+wrong|break|fail)/,
  /risk\s+(?:assessment|analysis|report)/,
  /what\s+(?:should\s+(?:we|I)\s+)?worry\s+about/,
  /what\s+needs\s+(?:my|our)\s+attention/,
  /what\s+(?:is|are)\s+(?:the\s+)?danger/,
  /what\s+(?:is\s+)?(?:going\s+to|gonna)\s+break/,
  /vulnerable/,
  /cascade\s+risk/,
];

const RECOVERY_PATTERNS = [
  /what\s+should\s+(?:we|I)\s+do/,
  /what\s+would\s+you\s+(?:do|recommend|suggest)/,
  /(?:fastest|best|optimal|quickest|safest)\s+(?:recovery|fix|path|plan|action|move|course)/,
  /(?:least|minimum)\s+(?:damage|disrupt)/,
  /how\s+(?:do\s+(?:we|I)\s+)?(?:fix|recover|stabilize|resolve)/,
  /stabilization\s+plan/,
  /optimize\s+recovery/,
  /recovery\s+(?:plan|path|strategy|options|recommendation)/,
  /what(?:'s|\s+is)\s+the\s+(?:play|plan|move|best\s+(?:move|course|action|path))/,
  /(?:give|tell)\s+(?:me|us)\s+the\s+best\s+(?:move|action|plan)/,
  /best\s+course\s+of\s+action/,
  /next\s+(?:step|action|move)/,
];

const RESOURCE_PATTERNS = [
  /(?:can|could)\s+(?:we|I)\s+(?:move|redeploy|reassign|shift|send|spare)/,
  /what\s+(?:happens|would\s+happen)\s+if\s+(?:we|I)\s+(?:move|redeploy|reassign|pull)/,
  /who\s+(?:can\s+we|is)\s+(?:spare|available|free)/,
  /what\s+(?:equipment|resource|agent|person)\s+(?:is|are)\s+(?:causing|available|free)/,
  /(?:reassign|redeploy|move)\s+\w+/,
  /spare\s+(?:agent|resource|crew|personnel)/,
  /equipment.*(?:causing|issue|problem|broken|down)/,
];

const SUMMARY_PATTERNS = [
  /^(?:summarize|summary|status|overview|sitrep|sit\s+rep)$/,
  /(?:give|tell)\s+(?:me|us)\s+(?:the\s+)?(?:situation|status|summary|overview|sitrep)/,
  /what(?:'s|\s+is)\s+(?:happening|going\s+on|the\s+(?:situation|status|state))/,
  /(?:current|operational)\s+(?:state|status|situation)/,
  /bring\s+(?:me|us)\s+up\s+to\s+speed/,
  /talk\s+to\s+me/,
  /what\s+changed/,
  /is\s+recovery\s+working/,
  /brief\s+(?:me|us)/,
  /where\s+(?:do\s+we|are\s+we)\s+stand/,
  /how\s+(?:are\s+we|(?:are|is)\s+(?:things|it))\s+(?:doing|looking|going)/,
];

// ============================================================
// ROUTER
// ============================================================

export function routeQuestion(
  input: string,
  zones?: readonly { id: string; gate_ids: string[] }[],
): RoutedQuestion {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  // Extract zone/gate targets from the input
  let targetZone: string | undefined;
  let targetGate: string | undefined;
  let resourceId: string | undefined;

  // Look for zone references: "52A-C", "GATES-52DEF", "52E", "zone 52D-F"
  const zoneRef = lower.match(/(?:zone\s+)?(\d+[a-z](?:-[a-z])?|gates?-\d+[a-z]+)/i);
  if (zoneRef && zones) {
    const resolved = resolveZonePattern(zoneRef[1], zones);
    if (resolved) targetZone = resolved;
    // If it's a single gate, also set targetGate
    const singleGate = zoneRef[1].match(/^(\d+[a-z])$/i);
    if (singleGate) targetGate = singleGate[1].toUpperCase();
  }

  // Look for resource IDs: "RA14", "BL-042", "CC01"
  const resRef = lower.match(/\b(ra\d+|bl-\d+|cc\d+|lt\d+|ops\d+)/i);
  if (resRef) resourceId = resRef[1].toUpperCase();

  // Match intent by pattern priority
  if (matchesAny(lower, STABILITY_PATTERNS)) {
    return { intent: 'stability_timing', targetZone, targetGate, raw };
  }

  if (matchesAny(lower, RISK_PATTERNS)) {
    return { intent: 'risk_assessment', targetZone, targetGate, raw };
  }

  if (matchesAny(lower, RECOVERY_PATTERNS)) {
    return { intent: 'recovery_plan', targetZone, targetGate, raw };
  }

  if (matchesAny(lower, RESOURCE_PATTERNS)) {
    return { intent: 'resource_question', targetZone, targetGate, resourceId, raw };
  }

  if (matchesAny(lower, CAUSE_PATTERNS)) {
    return { intent: 'cause_explanation', targetZone, targetGate, raw };
  }

  if (matchesAny(lower, SUMMARY_PATTERNS)) {
    return { intent: 'summary', raw };
  }

  // Fuzzy fallback: check for key operational words
  if (/\b(?:stab|recover|clear|eta|timeline)\b/.test(lower)) {
    return { intent: 'stability_timing', targetZone, targetGate, raw };
  }
  if (/\b(?:risk|fragile|vulnerable|break|cascade)\b/.test(lower)) {
    return { intent: 'risk_assessment', targetZone, targetGate, raw };
  }
  if (/\b(?:fix|do|plan|action|step|next)\b/.test(lower)) {
    return { intent: 'recovery_plan', targetZone, targetGate, raw };
  }
  if (/\b(?:why|cause|reason|explain|driving)\b/.test(lower)) {
    return { intent: 'cause_explanation', targetZone, targetGate, raw };
  }

  return { intent: 'unknown', raw };
}

function matchesAny(input: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(input));
}
