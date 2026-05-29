import { NextRequest, NextResponse } from 'next/server';

/**
 * SOI TTS API — OpenAI Text-to-Speech
 *
 * Server-side OpenAI TTS call. Returns audio/mpeg blob.
 * Falls back with error if no API key configured.
 */

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 200 });
  }

  let body: { text: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!body.text || typeof body.text !== 'string' || body.text.length > 2000) {
    return NextResponse.json({ error: 'invalid_text' }, { status: 400 });
  }

  const voice = body.voice ?? 'ash'; // warm, confident, professional

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: body.text,
        voice,
        response_format: 'mp3',
        speed: 1.05,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[SOI TTS] OpenAI error:', res.status, errText);
      return NextResponse.json({ error: 'openai_error' }, { status: 200 });
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[SOI TTS] error:', err);
    return NextResponse.json({ error: 'tts_error' }, { status: 200 });
  }
}
