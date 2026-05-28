import { NextRequest, NextResponse } from 'next/server';

/**
 * SOI LLM Intent Interpreter
 *
 * Server-side OpenAI call to translate natural language into
 * structured SOI intents. The LLM interprets — SOI engines execute.
 *
 * Never exposes API keys to client. Never invents operational facts.
 */

// ============================================================
// TYPES
// ============================================================

interface LLMIntentResult {
  intent: string;
  gate?: string;
  zone?: string;
  resource?: string;
  action?: string;
  confidence: number;
  needsConfirmation: boolean;
  reasoning: string;
}

// ============================================================
// SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are the SOI Intent Interpreter for airport ground operations.

Your ONLY job: translate the operator's natural language into a structured JSON intent.

You do NOT have operational data. You do NOT know current pressure, incidents, or zone states.
You ONLY classify what the operator wants to do.

VALID INTENTS:
- focus_gate: operator wants to see/view a specific gate (e.g., "show me 52C", "pull up 52E", "what about 52C")
- focus_zone: operator wants to focus on a zone (e.g., "show zone 52A-C", "focus on gates 52D-F")
- explain_gate: operator asks what's happening at a gate (e.g., "what's happening at 52C", "status of 52D")
- explain_zone: operator asks about a zone's state (e.g., "why is 52D-F red", "what's wrong with zone A-C")
- stabilize_zone: operator wants to stabilize a zone/gate (e.g., "stabilize 52C", "fix this zone", "get 52D under control")
- stabilize_worst: operator wants to stabilize the worst area (e.g., "fix the worst zone", "handle the hottest area")
- recovery_plan: operator asks for best course of action (e.g., "what's the play", "best move", "what should I do", "what would you recommend")
- risk_assessment: operator asks about risks (e.g., "what should I worry about", "where are we exposed", "biggest risk")
- approval_dispatch: operator approves/confirms an action (e.g., "approve it", "do it", "confirmed", "yes", "go ahead")
- cancel_action: operator cancels (e.g., "cancel", "abort", "nevermind")
- briefing: operator wants a status summary (e.g., "brief me", "what's happening", "bring me up to speed", "sitrep")
- plan_status: operator asks about execution progress (e.g., "where are we on recovery", "what step are we on")
- weather_query: operator asks about weather (e.g., "what's the weather", "is wind affecting us")
- workforce_query: operator asks about staffing/crew (e.g., "how many ramp agents on shift", "who is available", "staffing levels", "who can I send")
- assign_team: operator wants to assign crew to a gate/zone (e.g., "assign a team to 52D", "send two agents to 52C", "dispatch crew to 52D", "move support to 52D")
- workforce_status: operator asks about specific crew member or workload (e.g., "where is RA14", "who is overloaded", "is anyone on break")

GATE PATTERNS: Gates are like "52A", "52B", "52C", "52D", "52E", "52F", "52G", "52H", "52I"
ZONE PATTERNS: Zones group gates: 52A-C, 52D-F, 52G-I
RESOURCE PATTERNS: Agent IDs like "RA14", equipment like "BL-042"

RULES:
- Always return valid JSON with: intent, gate (optional), zone (optional), resource (optional), action (optional), confidence (0-1), needsConfirmation (boolean), reasoning (short string)
- If you can identify a gate, include it
- If you can identify a zone from a gate (52C → zone 52A-C), include both
- confidence should reflect how certain you are about the intent
- needsConfirmation = true for execution/dispatch/approval intents
- If truly unintelligible, use intent: "unknown"

Respond with ONLY the JSON object. No markdown. No explanation outside the JSON.`;

// ============================================================
// HANDLER
// ============================================================

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key', intent: null }, { status: 200 });
  }

  let body: { text: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.length > 500) {
    return NextResponse.json({ error: 'invalid_text' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: body.text },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[SOI LLM Intent] OpenAI error:', res.status, errText);
      return NextResponse.json({ error: 'openai_error', intent: null }, { status: 200 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'empty_response', intent: null }, { status: 200 });
    }

    const parsed: LLMIntentResult = JSON.parse(content);

    // Safety: clamp confidence
    parsed.confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));

    // Safety: validate intent is known
    const validIntents = [
      'focus_gate', 'focus_zone', 'explain_gate', 'explain_zone',
      'stabilize_zone', 'stabilize_worst', 'recovery_plan', 'risk_assessment',
      'approval_dispatch', 'cancel_action', 'briefing', 'plan_status',
      'weather_query', 'workforce_query', 'assign_team', 'workforce_status',
      'unknown',
    ];
    if (!validIntents.includes(parsed.intent)) {
      parsed.intent = 'unknown';
    }

    return NextResponse.json({ intent: parsed });
  } catch (err) {
    console.error('[SOI LLM Intent] error:', err);
    return NextResponse.json({ error: 'parse_error', intent: null }, { status: 200 });
  }
}
