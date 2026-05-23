import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// RampIQ Phase 1 — Event API route.
// Supabase primary, in-memory fallback for dev.

interface MemoryEvent {
  id: string;
  created_at: string;
  offline_created_at: string | null;
  event_type: string;
  event_subtype: string | null;
  severity: string;
  station: string;
  gate_id: string | null;
  flight_id: string | null;
  equipment_id: string | null;
  qr_target_type: string;
  qr_target_id: string;
  notes: string | null;
  operational_status: string;
  reported_by: string;
  role_type: string;
  shift_window: string;
  device_id: string;
  source_platform: string;
  resolved_at: string | null;
  resolved_by: string | null;
  event_duration_seconds: number | null;
  sync_status: string;
}

const memoryStore: MemoryEvent[] = [];
let nextId = 1;

// GET /api/rampiq/events
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const eventType = searchParams.get('event_type');

  const sb = getSupabase();
  if (sb) {
    let query = sb.from('rampiq_events').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('operational_status', status);
    if (severity) query = query.eq('severity', severity);
    if (eventType) query = query.eq('event_type', eventType);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  let events = [...memoryStore];
  if (status) events = events.filter(e => e.operational_status === status);
  if (severity) events = events.filter(e => e.severity === severity);
  if (eventType) events = events.filter(e => e.event_type === eventType);
  events.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json(events);
}

// POST /api/rampiq/events
export async function POST(req: NextRequest) {
  const body = await req.json();

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('rampiq_events').insert(body).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  const event: MemoryEvent = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    offline_created_at: body.offline_created_at || null,
    event_type: body.event_type || '',
    event_subtype: body.event_subtype || null,
    severity: body.severity || 'MEDIUM',
    station: body.station || 'LAX',
    gate_id: body.gate_id || null,
    flight_id: body.flight_id || null,
    equipment_id: body.equipment_id || null,
    qr_target_type: body.qr_target_type || 'GATE',
    qr_target_id: body.qr_target_id || '',
    notes: body.notes || null,
    operational_status: 'OPEN',
    reported_by: body.reported_by || '',
    role_type: body.role_type || '',
    shift_window: body.shift_window || 'AM',
    device_id: body.device_id || '',
    source_platform: body.source_platform || 'DESKTOP',
    resolved_at: null,
    resolved_by: null,
    event_duration_seconds: null,
    sync_status: 'SYNCED',
  };
  memoryStore.push(event);
  return NextResponse.json(event, { status: 201 });
}

// PATCH /api/rampiq/events?id=<uuid>
export async function PATCH(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('rampiq_events').update(body).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const idx = memoryStore.findIndex(e => e.id === id);
  if (idx === -1) return NextResponse.json({ error: 'not found' }, { status: 404 });
  Object.assign(memoryStore[idx], body);
  if (body.operational_status === 'RESOLVED' && !memoryStore[idx].resolved_at) {
    memoryStore[idx].resolved_at = new Date().toISOString();
    const created = new Date(memoryStore[idx].created_at).getTime();
    const resolved = new Date(memoryStore[idx].resolved_at!).getTime();
    memoryStore[idx].event_duration_seconds = Math.floor((resolved - created) / 1000);
  }
  return NextResponse.json(memoryStore[idx]);
}

// DELETE /api/rampiq/events — reset (dev only)
export async function DELETE() {
  const sb = getSupabase();
  if (sb) {
    await sb.from('rampiq_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return NextResponse.json({ ok: true });
  }
  memoryStore.length = 0;
  nextId = 1;
  return NextResponse.json({ ok: true });
}
