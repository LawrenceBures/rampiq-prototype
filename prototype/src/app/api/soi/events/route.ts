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
  // Spine hardening fields
  entity_type: string | null;
  entity_id: string | null;
  state_before: string | null;
  state_after: string | null;
  causation_event_id: string | null;
  correlation_id: string | null;
  zone_id: string | null;
  event_version: number;
}

const memoryStore: MemoryEvent[] = [];
let nextId = 1;

// GET /api/soi/events
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

// POST /api/soi/events
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
    // Spine hardening fields (pass through from client)
    entity_type: body.entity_type || null,
    entity_id: body.entity_id || null,
    state_before: body.state_before || null,
    state_after: body.state_after || 'OPEN',
    causation_event_id: body.causation_event_id || null,
    correlation_id: body.correlation_id || null,
    zone_id: body.zone_id || null,
    event_version: body.event_version || 1,
  };
  memoryStore.push(event);
  return NextResponse.json(event, { status: 201 });
}

// PATCH /api/soi/events?id=<uuid>
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

// DELETE /api/soi/events — wipe all operational data (dev/prototype)
export async function DELETE() {
  const sb = getSupabase();
  if (sb) {
    // Delete in dependency order: recovery_actions → incidents → events
    // Use gt filter on created_at to match all rows (more reliable than neq on UUID)
    const epoch = '2000-01-01T00:00:00Z';
    const r1 = await sb.from('rampiq_recovery_actions').delete().gt('created_at', epoch);
    const r2 = await sb.from('rampiq_incidents').delete().gt('created_at', epoch);
    const r3 = await sb.from('rampiq_events').delete().gt('created_at', epoch);
    const errors = [r1.error, r2.error, r3.error].filter(Boolean);
    if (errors.length > 0) {
      console.error('[api/events DELETE] errors:', errors.map(e => e?.message));
    }
    return NextResponse.json({ ok: true, errors: errors.length });
  }
  memoryStore.length = 0;
  nextId = 1;
  return NextResponse.json({ ok: true });
}
