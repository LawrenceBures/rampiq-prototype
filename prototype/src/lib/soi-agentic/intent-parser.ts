/**
 * SOI Agentic — Intent Parser
 *
 * Classifies high-level operational commands into executable intent types.
 * Extends the copilot question router with action-oriented intents.
 *
 * No LLM. Deterministic pattern matching.
 */

import { resolveZonePattern, normalizeNatoGates } from '@/lib/soi-intelligence/soi-command-parser';

// ============================================================
// TYPES
// ============================================================

export type AgenticIntent =
  | 'stabilize_zone'
  | 'prevent_escalation'
  | 'reduce_pressure'
  | 'minimize_disruption'
  | 'dispatch_recovery'
  | 'optimize_staffing'
  | 'protect_outbound_push'
  | 'resolve_criticals'
  | 'contain_cascade'
  | 'execute_plan'
  | 'cancel_plan'
  | 'show_plan_status'
  | 'show_alternatives'
  | 'continue_recovery';

export interface ParsedAgenticIntent {
  intent: AgenticIntent | null;
  targetZone?: string;
  targetGate?: string;
  targetResource?: string;
  constraint?: string;
  raw: string;
}

// ============================================================
// PATTERN SETS
// ============================================================

const STABILIZE_PATTERNS = [
  /\bstabilize\b/,
  /\bbring.*(?:stable|under control)\b/,
  /\brestore\s+(?:stability|operations|normal)\b/,
  /\bcalm.*(?:down|things|this|zone|gate)\b/,
  /\bget.*(?:stable|under control|back to normal)\b/,
  /\bfix\s+\d/,
  /\brecover\s+\d/,
  /\bhandle\s+\d/,
  /\bsolve\s+(?:this|it|the|that|\d)/,
  /\bget\s+this.*(?:control|stable|fixed)/,
  /\bstabilize\s+(?:the\s+)?(?:worst|highest|most)/,
  /\bfix\s+(?:the\s+)?(?:worst|highest|most)/,
];

const PREVENT_ESCALATION_PATTERNS = [
  /\b(?:prevent|stop|keep|avoid).*(?:escalat|critical|worse|cascad|spreading)\b/,
  /\bdon'?t\s+let.*(?:go critical|escalate|cascade|spread)\b/,
  /\bhold.*(?:line|position|stable)\b/,
  /\bcontain\b/,
];

const REDUCE_PRESSURE_PATTERNS = [
  /\breduce.*(?:pressure|load|backlog)\b/,
  /\brelieve.*(?:pressure|strain)\b/,
  /\blower.*(?:pressure|risk)\b/,
  /\btake.*(?:pressure|load)\s+off\b/,
];

const MINIMIZE_DISRUPTION_PATTERNS = [
  /\bminim(?:ize|um|al).*(?:disrupt|impact|damage|risk)\b/,
  /\bleast.*(?:disrupt|impact|damage)\b/,
  /\bgentle|careful|conservative\b/,
  /\bwith\s+(?:minimum|least|minimal)\b/,
];

const DISPATCH_PATTERNS = [
  /\bdispatch\b/,
  /\bsend.*(?:agent|team|support|help)\b/,
  /\bdeploy\b/,
  /\bassign.*(?:to|at)\b/,
];

const OPTIMIZE_STAFFING_PATTERNS = [
  /\boptimize.*staff/,
  /\brebalance.*(?:staff|crew|team|resource)\b/,
  /\bstaff.*(?:optim|better|smarter)\b/,
  /\bredistribute\b/,
];

const PROTECT_OUTBOUND_PATTERNS = [
  /\bprotect.*(?:outbound|departure|push|schedule)\b/,
  /\bkeep.*(?:departure|outbound|push)\s+(?:on\s+time|going|moving)\b/,
  /\boutbound\s+(?:first|priority)\b/,
  /\bbefore.*(?:push|departure)\b/,
];

const RESOLVE_CRITICALS_PATTERNS = [
  /\bresolve.*(?:critical|highest|worst|urgent)\b/,
  /\bfix.*(?:critical|worst|urgent|biggest)\b/,
  /\baddress.*(?:critical|highest|worst)\b/,
  /\bclear.*(?:critical|urgent|backlog)\b/,
];

const EXECUTE_PATTERNS = [
  /^(?:execute|approve|do\s+it|go|proceed|run\s+it|let'?s?\s+go|approve\s+it|send\s+it|dispatch\s+it|confirm|confirmed|yes\s+proceed|yes|affirmative)$/,
  /\bexecute\s+(?:the\s+)?plan\b/,
  /\bapprove\s+(?:the\s+)?(?:plan|execution|recovery|recommendation)\b/,
  /\brun\s+(?:the\s+)?plan\b/,
  /\bdispatch\s+(?:the\s+)?(?:plan|recovery|it)\b/,
  /\brecommendations?\s+approved\b/,
  /\bapprove\s+and\s+dispatch\b/,
];

const CANCEL_PATTERNS = [
  /^(?:cancel|abort|stop|nevermind|never\s+mind)$/,
  /\bcancel\s+(?:the\s+)?(?:plan|execution|recovery)\b/,
  /\babort\b/,
  /\bscrub\b/,
];

const STATUS_PATTERNS = [
  /\b(?:show|what'?s?)\s+(?:the\s+)?(?:plan|execution|recovery)\s+status\b/,
  /\bshow\s+active\s+recover/,
  /\bexecution\s+status\b/,
  /\bwhere\s+are\s+we\s+(?:on|with)\s+(?:the\s+)?(?:plan|recovery)\b/,
];

const ALTERNATIVE_PATTERNS = [
  /\b(?:another|different|alternative)\s+(?:path|plan|option|approach|way)\b/,
  /\bshow\s+(?:me\s+)?(?:another|other|alternative)\b/,
  /\bwhat\s+(?:else|other)\b/,
  /\bplan\s+b\b/i,
];

const CONTINUE_PATTERNS = [
  /\bcontinue\s+(?:the\s+)?recovery\b/,
  /\bkeep\s+going\b/,
  /\bnext\s+step\b/,
  /\bproceed\b/,
];

// ============================================================
// PARSER
// ============================================================

export function parseAgenticIntent(
  input: string,
  zones?: readonly { id: string; gate_ids: string[] }[],
): ParsedAgenticIntent {
  const raw = normalizeNatoGates(input.trim());
  const lower = raw.toLowerCase();

  // Extract targets
  let targetZone: string | undefined;
  let targetGate: string | undefined;
  let targetResource: string | undefined;

  const zoneRef = lower.match(/(?:zone\s+)?(\d+[a-z](?:-[a-z])?|gates?-\d+[a-z]+)/i);
  if (zoneRef && zones) {
    const resolved = resolveZonePattern(zoneRef[1], zones);
    if (resolved) targetZone = resolved;
    const singleGate = zoneRef[1].match(/^(\d+[a-z])$/i);
    if (singleGate) targetGate = singleGate[1].toUpperCase();
  }

  const resRef = lower.match(/\b(ra\d+|bl-\d+|cc\d+|lt\d+|ops\d+)/i);
  if (resRef) targetResource = resRef[1].toUpperCase();

  // Extract constraints
  let constraint: string | undefined;
  if (/minim(?:ize|um|al)\s+(?:disrupt|impact|staff)/i.test(lower)) constraint = 'minimize_disruption';
  else if (/protect.*outbound/i.test(lower)) constraint = 'protect_outbound';
  else if (/fast(?:est)?|quick(?:est)?|urgent/i.test(lower)) constraint = 'fastest';
  else if (/safe(?:st)?|conservative/i.test(lower)) constraint = 'safest';

  // Match intent
  if (matchesAny(lower, EXECUTE_PATTERNS)) return { intent: 'execute_plan', raw };
  if (matchesAny(lower, CANCEL_PATTERNS)) return { intent: 'cancel_plan', raw };
  if (matchesAny(lower, STATUS_PATTERNS)) return { intent: 'show_plan_status', raw };
  if (matchesAny(lower, ALTERNATIVE_PATTERNS)) return { intent: 'show_alternatives', targetZone, raw };
  if (matchesAny(lower, CONTINUE_PATTERNS)) return { intent: 'continue_recovery', raw };

  if (matchesAny(lower, STABILIZE_PATTERNS)) return { intent: 'stabilize_zone', targetZone, targetGate, constraint, raw };
  if (matchesAny(lower, PREVENT_ESCALATION_PATTERNS)) return { intent: 'prevent_escalation', targetZone, targetGate, constraint, raw };
  if (matchesAny(lower, PROTECT_OUTBOUND_PATTERNS)) return { intent: 'protect_outbound_push', targetZone, constraint, raw };
  if (matchesAny(lower, RESOLVE_CRITICALS_PATTERNS)) return { intent: 'resolve_criticals', targetZone, constraint, raw };
  if (matchesAny(lower, MINIMIZE_DISRUPTION_PATTERNS)) return { intent: 'minimize_disruption', targetZone, constraint, raw };
  if (matchesAny(lower, REDUCE_PRESSURE_PATTERNS)) return { intent: 'reduce_pressure', targetZone, constraint, raw };
  if (matchesAny(lower, DISPATCH_PATTERNS)) return { intent: 'dispatch_recovery', targetZone, targetGate, targetResource, constraint, raw };
  if (matchesAny(lower, OPTIMIZE_STAFFING_PATTERNS)) return { intent: 'optimize_staffing', targetZone, constraint, raw };

  // Fuzzy: action verb + zone/gate target → stabilize
  if (/\b(?:stabilize|recover|fix|handle|resolve|solve|address)\b/.test(lower) && (targetZone || targetGate)) {
    return { intent: 'stabilize_zone', targetZone, targetGate, constraint, raw };
  }

  // Fuzzy: action verb without target → stabilize worst zone
  if (/\b(?:stabilize|solve\s+this|fix\s+this|handle\s+this)\b/.test(lower)) {
    return { intent: 'stabilize_zone', targetZone, targetGate, constraint, raw };
  }

  // Fuzzy: "build the plan" / "make a plan"
  if (/\b(?:build|make|create)\s+(?:a\s+|the\s+)?(?:plan|recovery)\b/.test(lower)) {
    return { intent: 'stabilize_zone', targetZone, constraint, raw };
  }

  return { intent: null, raw };
}

function matchesAny(input: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(input));
}
