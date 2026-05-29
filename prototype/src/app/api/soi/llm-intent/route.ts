import { NextRequest, NextResponse } from 'next/server';

/**
 * SOI LLM Intent Interpreter
 *
 * Server-side OpenAI call to translate natural language into
 * structured SOI intents. Intent-first — always attempt interpretation.
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
// SYSTEM PROMPT — CONVERSATIONAL FREEDOM MODE
// ============================================================

const SYSTEM_PROMPT = `You are the SOI Intent Interpreter for airport ground operations at LAX Terminal 5.

PHILOSOPHY: SOI is an operational command system, not a chatbot.
Operators speak in shorthand, slang, partial sentences, and operational jargon.
Your job: ALWAYS interpret intent. NEVER reject. If ambiguous, pick the most likely interpretation.

GATE MODEL — Individual gates are primary entities:
52A (Alpha), 52B (Bravo), 52C (Charlie), 52D (Delta), 52E (Echo), 52F (Foxtrot), 52G (Golf), 52H (Hotel), 52I (India)

Gate groups are spatial collections, NOT primary entities:
52A-C = Alpha–Charlie block (gates 52A + 52B + 52C)
52D-F = Delta–Foxtrot block (gates 52D + 52E + 52F)
52G-I = Golf–India block (gates 52G + 52H + 52I)

NATO PHONETIC: "Alpha" = 52A, "Bravo" = 52B, "Charlie" = 52C, "Delta" = 52D, "Echo" = 52E, "Foxtrot" = 52F, "Golf" = 52G, "Hotel" = 52H, "India" = 52I

VALID INTENTS:
- briefing: status summary ("brief me", "what's going on", "sitrep", "what's the play", "how are we doing", "what needs my attention", "catch me up", "what's up", "fill me in", "where do we stand", "update me")
- focus_gate: view a specific gate ("show me Delta", "pull up 52E", "what about Charlie", "52D")
- focus_zone: view a gate group ("show Alpha through Charlie", "focus on the Delta block")
- explain_gate: what's happening at a gate ("what's happening at Delta", "status of 52D", "what's holding up Bravo", "what's the deal with Echo", "what's broken at 52A")
- explain_zone: what's happening in a zone ("what's going on in the Alpha block")
- stabilize_zone: fix a zone/gate ("stabilize Delta", "fix 52C", "get Echo under control", "handle Delta", "recover 52A")
- stabilize_worst: fix the worst area ("fix the worst zone", "handle the hottest area", "what's the most urgent thing")
- recovery_plan: ask for best action ("what's the play", "what should we do", "best move", "what would you do", "what do you recommend")
- risk_assessment: ask about risks ("what should I worry about", "where are we exposed", "biggest risk", "what could go wrong", "what worries you", "where's the danger")
- approval_dispatch: approve/confirm action ("approve", "do it", "confirmed", "go", "yes", "send them", "make it happen", "green light", "roger", "assign them")
- cancel_action: cancel ("cancel", "abort", "nevermind", "scratch that", "belay that")
- briefing: status summary
- plan_status: execution progress ("where are we on recovery", "what step are we on", "execution status")
- weather_query: weather ("weather", "wind", "is weather affecting us", "what's it like outside")
- workforce_query: staffing overview ("who's available", "how many agents", "show staffing", "crew status", "who do I have", "manpower", "headcount", "who can I send")
- assign_team: assign crew to gate ("assign a team to Delta", "send two agents to 52C", "get me a team for Echo", "move support to Delta", "need help at Bravo", "put someone on 52D", "can I get agents at Golf")
- workforce_status: specific crew member or workload ("where is RA14", "who is overloaded", "is Martinez busy")
- select_agents: operator selecting numbered agents from a list ("1 2 and 4", "numbers 1 and 3", "Jackson and Reed", "first and third")
- flight_query: flight status ("what about AA2847", "flight status", "which flights are at risk", "departure risk")
- forecast: predictive ("what happens if we do nothing", "forecast", "where's pressure moving", "predict")

RULES:
- ALWAYS return valid JSON: { intent, gate?, zone?, resource?, action?, confidence, needsConfirmation, reasoning }
- If you identify a gate, include it (e.g., "Delta" → gate: "52D")
- confidence should reflect certainty (0-1)
- needsConfirmation = true for dispatch/assignment/execution intents
- NEVER use intent "unknown" unless the input is truly unintelligible gibberish
- For ambiguous input, pick the MOST LIKELY operational interpretation
- "over there" with no context → briefing. "over there" after discussing Delta → explain_gate for Delta
- Short inputs like "Delta?" → explain_gate with gate 52D

ACKNOWLEDGEMENT: Your reasoning field should show you UNDERSTOOD the operator, e.g.:
- "Operator asking about gate 52D status" (not "Unable to determine intent")
- "Operator wants crew dispatched to Echo" (not "Unclear request")

Respond with ONLY the JSON object. No markdown.`;

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
        max_tokens: 250,
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
      'select_agents', 'flight_query', 'forecast',
      'unknown',
    ];
    if (!validIntents.includes(parsed.intent)) {
      // Map unrecognized intents to closest match rather than unknown
      parsed.intent = 'briefing';
      parsed.reasoning = `Interpreted as general briefing request: ${parsed.reasoning}`;
    }

    return NextResponse.json({ intent: parsed });
  } catch (err) {
    console.error('[SOI LLM Intent] error:', err);
    return NextResponse.json({ error: 'parse_error', intent: null }, { status: 200 });
  }
}
