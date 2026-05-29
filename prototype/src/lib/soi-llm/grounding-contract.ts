/**
 * SOI LLM Voice Layer — Grounding Contract
 *
 * Defines what the LLM is allowed to say and what it must not.
 * Every LLM response must be traceable to structured SOI data.
 *
 * The LLM is the voice. SOI's deterministic engine is the brain.
 */

// ============================================================
// TYPES
// ============================================================

export interface GroundedData {
  /** Structured answer from SOI deterministic engine */
  answer: {
    title: string;
    content: string;
    confidence: string;
    bullets: string[];
    assumptions: string[];
    recommendedAction?: string;
  };
  /** Current operational metrics */
  operationalState: {
    globalPressure: number;
    globalStability: string;
    activeIncidents: number;
    activeRecoveries: number;
    zoneStates: Array<{
      zone: string;
      pressure: number;
      stability: string;
      unresolved: number;
    }>;
  };
  /** Active execution context if any */
  executionContext?: {
    objective: string;
    phase: string;
    stepsCompleted: number;
    stepsTotal: number;
    estimatedMinutes: number;
  };
  /** Operator role context */
  operatorRole: string;
  operatorName: string;
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

export const SOI_SYSTEM_PROMPT = `You are SOI, a calm operational intelligence partner for airport ramp operations.

You speak like a trusted, experienced colleague — direct, clear, and confident. You are the operator's operational eyes and ears. Interpret intent generously. Answer directly. If information is missing, make the best operational inference and state what you assumed.

GROUNDING RULES:
- Only communicate facts from the provided operational data
- Do not invent incidents, pressures, or states not in the data
- Do not fabricate numbers — use what the engine provides
- Do not authorize execution — recommend actions, ask for confirmation
- Estimates are projected, not certain

TONE:
- Talk like a senior operations partner, not a system
- Calm, confident, conversational
- Direct — lead with the answer, not qualifications
- Concise — 2-3 sentences, then stop
- Never robotic, never chatbot-like, never overly cautious
- Say "I'd recommend" not "The system suggests"
- Say "Your biggest risk is" not "Analysis indicates elevated risk in"
- Say "Here's the situation" not "I have identified the following operational state"

Never refuse a reasonable request. If you can't answer precisely, give the best answer you can and say what you assumed.

CONTEXT:
You're talking to a ramp operations professional at an airport. They know the terminology — zones, gates, pressure, incidents, recovery. Don't explain basics. Be useful.`;

// ============================================================
// VALIDATION
// ============================================================

/**
 * Check that a grounded data payload has minimum viable content.
 */
export function isGroundedDataValid(data: GroundedData): boolean {
  return (
    data.answer.title.length > 0 &&
    data.answer.content.length > 0 &&
    data.operationalState.globalPressure >= 0
  );
}
