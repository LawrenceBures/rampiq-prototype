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

GATE MODEL — Eagle has 9 individual gates. There are NO zones. Only gates.
52A (Alpha), 52B (Bravo), 52C (Charlie), 52D (Delta), 52E (Echo), 52F (Foxtrot), 52G (Golf), 52H (Hotel), 52I (India)

When operators say "Alpha through Charlie" or "52A-C", they mean gates 52A + 52B + 52C as a group, not a separate entity.

NATO PHONETIC: "Alpha" = 52A, "Bravo" = 52B, "Charlie" = 52C, "Delta" = 52D, "Echo" = 52E, "Foxtrot" = 52F, "Golf" = 52G, "Hotel" = 52H, "India" = 52I

VALID INTENTS:
- briefing: status overview ("brief me", "what's going on", "sitrep", "what's the play", "how are we doing", "what needs my attention", "catch me up", "what's up", "fill me in", "where do we stand", "update me", "talk to me", "give me the truth", "what are you seeing", "what's the situation")
- focus_gate: view a gate ("show me Delta", "pull up 52E", "what about Charlie", "52D")
- focus_zone: view a gate group ("show Alpha through Charlie", "focus on the Delta gates")
- explain_gate: what's happening at a gate ("what's happening at Delta", "status of 52D", "what's holding up Bravo", "what's broken at 52A", "why is Delta red")
- explain_zone: what's happening at a gate group ("what's going on at Alpha through Charlie")
- stabilize_zone: fix a gate or gate group ("stabilize Delta", "fix 52C", "get Echo under control", "handle it")
- stabilize_worst: fix the worst gate ("fix the worst gate", "handle the hottest area", "what's most urgent")
- recovery_plan: best action ("what's the play", "what should we do", "best move", "what would you do", "what do you recommend", "what's next", "next steps")
- risk_assessment: risks ("what should I worry about", "where are we exposed", "biggest risk", "what worries you", "where's the danger", "why are we critical")
- approval_dispatch: approve/confirm ("approve", "do it", "confirmed", "go", "yes", "send them", "make it happen", "green light", "roger")
- cancel_action: cancel ("cancel", "abort", "nevermind", "scratch that", "belay that", "cancel that")
- plan_status: execution progress ("where are we on recovery", "what step are we on")
- weather_query: weather ("weather", "wind", "is weather affecting us")
- workforce_query: staffing ("who's available", "how many agents", "show staffing", "crew status", "who do I have", "who can I send", "headcount")
- assign_team: assign crew to gate ("assign a team to Delta", "send agents to 52C", "get me a team for Echo", "move support to Delta", "need help at Bravo", "who can I send to Delta")
- workforce_status: specific crew ("where is RA14", "who is overloaded", "is Martinez busy")
- select_agents: picking agents from list ("1 2 and 4", "numbers 1 and 3", "Jackson and Reed")
- flight_query: flight status ("what about AA2847", "which flights are at risk")
- forecast: predictive ("what happens if we do nothing", "forecast", "where's pressure moving")
- repeat_last: repeat previous answer ("say that again", "repeat that", "what did you say", "come again")
- followup_who: asking who ("who?", "who exactly", "which agents", "who did you mean")
- followup_why: asking why ("why?", "why them", "why that", "explain", "reasoning")

RULES:
- Return JSON: { intent, gate?, zone?, resource?, action?, confidence, needsConfirmation, reasoning }
- If you identify a gate, include it ("Delta" → gate: "52D")
- needsConfirmation = true for dispatch/assignment/execution
- NEVER use "unknown" — always find the most likely operational interpretation
- For ambiguous input, pick the best guess and explain in reasoning
- Short inputs ("Delta?", "who?", "why?") are valid — map to the most likely intent
- Single words are fine: "staffing" → workforce_query, "weather" → weather_query

Your reasoning should show understanding: "Operator asking about Delta status" not "Unable to determine"

Return ONLY JSON. No markdown.`;

// ============================================================
// HANDLER
// ============================================================

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key', intent: null }, { status: 200 });
  }

  let body: { text: string; history?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.length > 500) {
    return NextResponse.json({ error: 'invalid_text' }, { status: 400 });
  }

  // Build user message with conversation history for follow-up context
  const userContent = body.history
    ? `RECENT CONVERSATION:\n${body.history}\n\nCURRENT MESSAGE: ${body.text}`
    : body.text;

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
          { role: 'user', content: userContent },
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
      'repeat_last', 'followup_who', 'followup_why',
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
