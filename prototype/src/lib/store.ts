'use client';

// SOI Phase 1 — Event store.
// Primary: Supabase. Fallback: localStorage (single-device, no realtime).

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from './supabase';
import type {
  SoiEvent,
  QrTarget,
  EventType,
  UserLite,
  EventSubmission,
  OperationalStatus,
} from '@/lib/soi-types';

// ============================================================
// SUPABASE TABLE NAMES (legacy internal names retained for data continuity)
// These table names predate the SOI rebrand. Production Supabase tables
// remain: rampiq_events, rampiq_incidents, rampiq_recovery_actions.
// A future database migration will rename them to soi_* equivalents.
// ============================================================

// ============================================================
// EVENTS — CRUD
// ============================================================

// Storage key migrated: rampiq_events_v2 → soi_events_v2
const LS_KEY = 'soi_events_v2';
const LEGACY_LS_KEY = 'rampiq_events_v2';

function lsRead(): SoiEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) { raw = localStorage.getItem(LEGACY_LS_KEY); if (raw) localStorage.setItem(LS_KEY, raw); }
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function lsWrite(events: SoiEvent[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(events)); } catch { /* */ }
}

export async function fetchEvents(filters?: {
  station?: string;
  status?: OperationalStatus;
  severity?: string;
  event_type?: string;
}): Promise<SoiEvent[]> {
  const sb = getSupabase();
  if (sb) {
    let query = sb.from('rampiq_events').select('*').order('created_at', { ascending: false });
    if (filters?.station) query = query.eq('station', filters.station);
    if (filters?.status) query = query.eq('operational_status', filters.status);
    if (filters?.severity) query = query.eq('severity', filters.severity);
    if (filters?.event_type) query = query.eq('event_type', filters.event_type);
    const { data, error } = await query;
    if (error) {
      console.error('[store] fetch error:', error.message);
    } else {
      return data as SoiEvent[];
    }
  }
  // Fallback
  let events = lsRead();
  if (filters?.status) events = events.filter(e => e.operational_status === filters.status);
  if (filters?.severity) events = events.filter(e => e.severity === filters.severity);
  if (filters?.event_type) events = events.filter(e => e.event_type === filters.event_type);
  return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---- Spine hardening: entity + zone resolution ----

/**
 * Derive entity_type and entity_id from existing submission fields.
 * Priority: equipment > gate > flight (most specific wins).
 * Callers can override by setting entity_type/entity_id explicitly.
 */
function deriveEntityContext(submission: EventSubmission): {
  entity_type: string | null;
  entity_id: string | null;
} {
  if (submission.entity_type && submission.entity_id) {
    return { entity_type: submission.entity_type, entity_id: submission.entity_id };
  }
  if (submission.equipment_id) {
    return { entity_type: 'equipment', entity_id: submission.equipment_id };
  }
  if (submission.gate_id) {
    return { entity_type: 'gate', entity_id: submission.gate_id };
  }
  if (submission.flight_id) {
    return { entity_type: 'flight', entity_id: submission.flight_id };
  }
  return { entity_type: null, entity_id: null };
}

/**
 * Cached zone lookup: gate_id → zone_id.
 * Loaded once per session, then reused. Avoids repeated Supabase calls
 * on every postEvent(). Cache invalidated on page reload.
 */
let _zoneCache: Map<string, string> | null = null;
let _zoneCachePromise: Promise<Map<string, string>> | null = null;

async function getGateToZoneMap(): Promise<Map<string, string>> {
  if (_zoneCache) return _zoneCache;
  if (_zoneCachePromise) return _zoneCachePromise;

  _zoneCachePromise = (async () => {
    const zones = await fetchZones();
    const map = new Map<string, string>();
    for (const zone of zones) {
      for (const gateId of zone.gate_ids) {
        map.set(gateId, zone.id);
      }
    }
    _zoneCache = map;
    return map;
  })();

  return _zoneCachePromise;
}

/**
 * Resolve zone_id for a submission. Uses explicit zone_id if provided,
 * otherwise looks up from gate_id via cached zone mapping.
 */
async function resolveZoneId(submission: EventSubmission): Promise<string | null> {
  if (submission.zone_id) return submission.zone_id;
  if (!submission.gate_id) return null;
  try {
    const map = await getGateToZoneMap();
    return map.get(submission.gate_id) ?? null;
  } catch {
    return null;
  }
}

export async function postEvent(submission: EventSubmission): Promise<SoiEvent> {
  const sb = getSupabase();

  // Derive replay-compatible fields
  const { entity_type, entity_id } = deriveEntityContext(submission);
  const zone_id = await resolveZoneId(submission);

  const row = {
    ...submission,
    operational_status: 'OPEN',
    sync_status: 'SYNCED',
    // Spine hardening fields
    entity_type,
    entity_id,
    state_before: submission.state_before || null,
    state_after: submission.state_after || 'OPEN',
    causation_event_id: submission.causation_event_id || null,
    correlation_id: submission.correlation_id || null,
    zone_id,
    event_version: 1,
  };

  if (sb) {
    const { data, error } = await sb.from('rampiq_events').insert(row).select().single();
    if (error) {
      console.error('[store] insert error:', error.message);
      throw new Error(`Event save failed: ${error.message}`);
    }
    return data as SoiEvent;
  }

  // localStorage fallback
  const full: SoiEvent = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    offline_created_at: submission.offline_created_at || null,
    event_type: submission.event_type,
    event_subtype: submission.event_subtype || null,
    severity: submission.severity,
    station: submission.station,
    gate_id: submission.gate_id || null,
    flight_id: submission.flight_id || null,
    equipment_id: submission.equipment_id || null,
    qr_target_type: submission.qr_target_type,
    qr_target_id: submission.qr_target_id,
    notes: submission.notes || null,
    operational_status: 'OPEN',
    reported_by: submission.reported_by,
    role_type: submission.role_type,
    shift_window: submission.shift_window,
    device_id: submission.device_id,
    source_platform: submission.source_platform,
    resolved_at: null,
    resolved_by: null,
    event_duration_seconds: null,
    sync_status: 'SYNCED',
    details_json: submission.details_json || null,
    // Spine hardening fields
    entity_type,
    entity_id,
    state_before: submission.state_before || null,
    state_after: submission.state_after || 'OPEN',
    causation_event_id: submission.causation_event_id || null,
    correlation_id: submission.correlation_id || null,
    zone_id,
    event_version: 1,
  };
  const events = lsRead();
  events.push(full);
  lsWrite(events);
  return full;
}

export async function updateEventStatus(
  eventId: string,
  status: OperationalStatus,
  resolvedBy?: string,
): Promise<SoiEvent | null> {
  const sb = getSupabase();

  // Fetch current state for state_before tracking
  let stateBefore: string | null = null;
  if (sb) {
    const { data: current } = await sb
      .from('rampiq_events')
      .select('operational_status')
      .eq('id', eventId)
      .single();
    stateBefore = current?.operational_status ?? null;
  }

  const updates: Record<string, unknown> = {
    operational_status: status,
    // Spine hardening: record the transition
    state_before: stateBefore,
    state_after: status,
  };
  if (status === 'RESOLVED') {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = resolvedBy || 'manager';
  }

  if (sb) {
    const { data, error } = await sb
      .from('rampiq_events')
      .update(updates)
      .eq('id', eventId)
      .select()
      .single();
    if (error) {
      console.error('[store] update error:', error.message);
      return null;
    }
    return data as SoiEvent;
  }

  // localStorage fallback
  const events = lsRead();
  const idx = events.findIndex(e => e.id === eventId);
  if (idx === -1) return null;
  // Capture state_before from localStorage
  updates.state_before = events[idx].operational_status;
  events[idx] = { ...events[idx], ...updates } as SoiEvent;
  if (status === 'RESOLVED') {
    const created = new Date(events[idx].created_at).getTime();
    const resolved = new Date(updates.resolved_at as string).getTime();
    events[idx].event_duration_seconds = Math.floor((resolved - created) / 1000);
  }
  lsWrite(events);
  return events[idx];
}

export async function resetEvents(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const { error } = await sb.from('rampiq_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.error('[store] delete error:', error.message);
  }
  lsWrite([]);
}

// ============================================================
// QR TARGETS
// ============================================================

// Storage key migrated: rampiq_qr_targets → soi_qr_targets
const LS_QR_TARGETS = 'soi_qr_targets';

// Fallback QR targets for localStorage mode
const FALLBACK_QR_TARGETS: QrTarget[] = [
  { id: 'LAX-GATE-52A', target_type: 'GATE', station: 'LAX', gate_id: '52A', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52A · Alpha', active: true, created_at: '' },
  { id: 'LAX-GATE-52B', target_type: 'GATE', station: 'LAX', gate_id: '52B', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52B · Bravo', active: true, created_at: '' },
  { id: 'LAX-GATE-52C', target_type: 'GATE', station: 'LAX', gate_id: '52C', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52C · Charlie', active: true, created_at: '' },
  { id: 'LAX-GATE-52D', target_type: 'GATE', station: 'LAX', gate_id: '52D', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52D · Delta', active: true, created_at: '' },
  { id: 'LAX-GATE-52E', target_type: 'GATE', station: 'LAX', gate_id: '52E', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52E · Echo', active: true, created_at: '' },
  { id: 'LAX-GATE-52F', target_type: 'GATE', station: 'LAX', gate_id: '52F', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52F · Foxtrot', active: true, created_at: '' },
  { id: 'LAX-GATE-52G', target_type: 'GATE', station: 'LAX', gate_id: '52G', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52G · Golf', active: true, created_at: '' },
  { id: 'LAX-GATE-52H', target_type: 'GATE', station: 'LAX', gate_id: '52H', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52H · Hotel', active: true, created_at: '' },
  { id: 'LAX-GATE-52I', target_type: 'GATE', station: 'LAX', gate_id: '52I', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate 52I · India', active: true, created_at: '' },
  { id: 'LAX-EQUIP-TUG-042', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'TUG-042', equipment_kind: 'TUG', flight_id: null, label: 'Tug #42', active: true, created_at: '' },
  { id: 'LAX-EQUIP-BELT-007', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'BELT-007', equipment_kind: 'BELT_LOADER', flight_id: null, label: 'Belt Loader #7', active: true, created_at: '' },
  { id: 'LAX-EQUIP-GPU-031', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'GPU-031', equipment_kind: 'GPU', flight_id: null, label: 'GPU #31', active: true, created_at: '' },
  { id: 'LAX-EQUIP-LAV-003', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'LAV-003', equipment_kind: 'LAV_TRUCK', flight_id: null, label: 'Lav Truck #3', active: true, created_at: '' },
  { id: 'LAX-CHECK-RAMPCTL', target_type: 'CHECKPOINT', station: 'LAX', gate_id: null, equipment_id: null, equipment_kind: null, flight_id: null, label: 'Ramp Control', active: true, created_at: '' },
  { id: 'LAX-DISPATCH-BAGROOM', target_type: 'DISPATCH', station: 'LAX', gate_id: null, equipment_id: null, equipment_kind: null, flight_id: null, label: 'Bag Room Dispatch', active: true, created_at: '' },
];

export async function fetchQrTargets(): Promise<QrTarget[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('qr_targets')
      .select('*')
      .eq('active', true)
      .order('target_type');
    if (error) {
      console.error('[store] qr_targets fetch error:', error.message);
    } else {
      return data as QrTarget[];
    }
  }
  return FALLBACK_QR_TARGETS;
}

export async function resolveQrTarget(qrValue: string): Promise<QrTarget | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('qr_targets')
      .select('*')
      .eq('id', qrValue)
      .eq('active', true)
      .single();
    if (error || !data) return null;
    return data as QrTarget;
  }
  return FALLBACK_QR_TARGETS.find(t => t.id === qrValue) || null;
}

// ============================================================
// EVENT TYPES
// ============================================================

const FALLBACK_EVENT_TYPES: EventType[] = [
  { code: 'BAG_DELAY', label: 'Bag delay', default_severity: 'MEDIUM', applicable_targets: ['GATE', 'FLIGHT', 'CHECKPOINT'], active: true, display_order: 1 },
  { code: 'EQUIPMENT_FAILURE', label: 'Equipment failure', default_severity: 'HIGH', applicable_targets: ['EQUIPMENT'], active: true, display_order: 2 },
  { code: 'GATE_BLOCKED', label: 'Gate blocked', default_severity: 'HIGH', applicable_targets: ['GATE'], active: true, display_order: 3 },
  { code: 'PUSHBACK_DELAY', label: 'Pushback delay', default_severity: 'HIGH', applicable_targets: ['GATE', 'FLIGHT'], active: true, display_order: 4 },
  { code: 'RUNNER_REQUESTED', label: 'Runner requested', default_severity: 'MEDIUM', applicable_targets: ['GATE', 'FLIGHT', 'CHECKPOINT'], active: true, display_order: 5 },
  { code: 'LAV_SERVICE_DELAY', label: 'Lav service delay', default_severity: 'LOW', applicable_targets: ['GATE', 'EQUIPMENT'], active: true, display_order: 6 },
  { code: 'CARGO_HOLD', label: 'Cargo hold', default_severity: 'MEDIUM', applicable_targets: ['FLIGHT', 'GATE'], active: true, display_order: 7 },
  { code: 'FUEL_DELAY', label: 'Fuel delay', default_severity: 'MEDIUM', applicable_targets: ['GATE', 'FLIGHT'], active: true, display_order: 8 },
  { code: 'EQUIP_STATUS', label: 'Equipment status', default_severity: 'MEDIUM', applicable_targets: ['EQUIPMENT'], active: true, display_order: 9 },
  { code: 'GATE_READINESS', label: 'Gate readiness', default_severity: 'LOW', applicable_targets: ['GATE'], active: true, display_order: 10 },
  { code: 'LT_DISPATCH', label: 'LT dispatched', default_severity: 'LOW', applicable_targets: ['DISPATCH'], active: true, display_order: 11 },
  { code: 'LT_ARRIVAL', label: 'LT arrived', default_severity: 'LOW', applicable_targets: ['GATE'], active: true, display_order: 12 },
];

export async function fetchEventTypes(): Promise<EventType[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('event_types')
      .select('*')
      .eq('active', true)
      .order('display_order');
    if (error) {
      console.error('[store] event_types fetch error:', error.message);
    } else {
      return data as EventType[];
    }
  }
  return FALLBACK_EVENT_TYPES;
}

export function getEventTypesForTarget(
  eventTypes: EventType[],
  targetType: string,
): EventType[] {
  return eventTypes.filter(et =>
    et.applicable_targets.includes(targetType as QrTarget['target_type'])
  );
}

// ============================================================
// USERS
// ============================================================

const FALLBACK_USERS: UserLite[] = [
  { id: 'CC01', display_name: 'Martinez J.', role_type: 'CREW_CHIEF', default_shift: 'AM', station: 'LAX', active: true, shift_end: '14:30', lunch_start: '10:00', lunch_end: '10:30', break_start: '12:30', break_end: '12:45', extension_eligible: true, pushback_certified: true, pushback_recert_date: '2026-11-15' },
  { id: 'RA14', display_name: 'Santos R.', role_type: 'RAMP_AGENT', default_shift: 'AM', station: 'LAX', active: true, shift_end: '14:30', lunch_start: '10:15', lunch_end: '10:45', break_start: '12:45', break_end: '13:00', extension_eligible: true, pushback_certified: true, pushback_recert_date: '2026-08-01' },
  { id: 'RA22', display_name: 'Okafor D.', role_type: 'RAMP_AGENT', default_shift: 'PM', station: 'LAX', active: true, shift_end: '22:30', lunch_start: '18:00', lunch_end: '18:30', break_start: '20:15', break_end: '20:30', extension_eligible: false, pushback_certified: true, pushback_recert_date: '2027-02-01' },
  { id: 'LT02', display_name: 'Nguyen T.', role_type: 'LT_RUNNER', default_shift: 'AM', station: 'LAX', active: true, shift_end: '14:30', lunch_start: '10:30', lunch_end: '11:00', break_start: '13:00', break_end: '13:15', extension_eligible: true, pushback_certified: false, pushback_recert_date: null },
  { id: 'RC05', display_name: 'Park S.', role_type: 'REGIONAL_CABIN', default_shift: 'AM', station: 'LAX', active: true, shift_end: '14:30', lunch_start: '10:00', lunch_end: '10:30', break_start: '12:30', break_end: '12:45', extension_eligible: true, pushback_certified: false, pushback_recert_date: null },
];

export async function fetchUsers(): Promise<UserLite[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('users_lite')
      .select('*')
      .eq('active', true)
      .order('role_type');
    if (error) {
      console.error('[store] users fetch error:', error.message);
    } else {
      return data as UserLite[];
    }
  }
  return FALLBACK_USERS;
}

// ============================================================
// REACT HOOKS
// ============================================================

export function useLiveEvents(intervalMs = 3000): {
  events: SoiEvent[];
  loading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
} {
  const [events, setEvents] = useState<SoiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    fetchEvents().then(data => {
      if (mountedRef.current) {
        setEvents(data);
        setLoading(false);
        setLastUpdated(new Date());
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Polling
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const data = await fetchEvents();
        if (mountedRef.current) {
          setEvents(data);
          setLoading(false);
          setLastUpdated(new Date());
        }
      } catch { /* silent */ }
      if (mountedRef.current) {
        timer = setTimeout(poll, intervalMs);
      }
    }
    poll();

    // Supabase Realtime
    const sb = getSupabase();
    type Channel = ReturnType<NonNullable<typeof sb>['channel']>;
    let channel: Channel | null = null;

    if (sb) {
      channel = sb
        .channel('soi_events_live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rampiq_events' }, () => {
          fetchEvents().then(data => {
            if (mountedRef.current) { setEvents(data); setLastUpdated(new Date()); }
          }).catch(() => {});
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rampiq_events' }, () => {
          fetchEvents().then(data => {
            if (mountedRef.current) { setEvents(data); setLastUpdated(new Date()); }
          }).catch(() => {});
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rampiq_events' }, () => {
          fetchEvents().then(data => {
            if (mountedRef.current) { setEvents(data); setLastUpdated(new Date()); }
          }).catch(() => {});
        })
        .subscribe();
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      if (channel) channel.unsubscribe();
    };
  }, [intervalMs]);

  return { events, loading, lastUpdated, refresh };
}

// ============================================================
// REALTIME INCIDENTS — Phase 2 Step 3
// ============================================================
// Subscribes to rampiq_events for entity_type='incident' changes.
// On any incident lifecycle event, refetches the canonical incident
// list from rampiq_incidents (lifecycle table = current truth).
//
// Why rampiq_events not rampiq_incidents?
//   rampiq_incidents is not in supabase_realtime publication.
//   Every lifecycle command already appends to rampiq_events with
//   entity_type='incident', so we piggyback on the existing channel.

import { fetchActiveIncidents, fetchRecoveryActions } from './lifecycle-commands';
import type { Incident, RecoveryAction } from './lifecycle-types';

export function useRealtimeIncidents(station = 'LAX'): {
  incidents: Incident[];
  loading: boolean;
  lastSync: Date | null;
  refresh: () => void;
} {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    fetchActiveIncidents(station).then(data => {
      if (mountedRef.current) {
        setIncidents(data);
        setLoading(false);
        setLastSync(new Date());
      }
    }).catch(() => {});
  }, [station]);

  // Debounced refetch — collapses bursts (create emits 2 writes: incident + event)
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refresh();
    }, 300);
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    refresh();

    // Supabase Realtime — listen for incident lifecycle events
    const sb = getSupabase();
    type Channel = ReturnType<NonNullable<typeof sb>['channel']>;
    let channel: Channel | null = null;

    if (sb) {
      channel = sb
        .channel('soi_incidents_sync')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'rampiq_events' },
          (payload) => {
            const row = payload.new as Record<string, unknown> | undefined;
            if (row?.entity_type === 'incident') {
              console.log('[realtime] incident event received:', row.event_type, row.entity_id);
              debouncedRefresh();
            }
          })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[realtime] incidents channel subscribed');
          }
        });
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channel) channel.unsubscribe();
    };
  }, [station, refresh, debouncedRefresh]);

  return { incidents, loading, lastSync, refresh };
}

// ============================================================
// REALTIME RECOVERY ACTIONS — Phase 4 Step 1
// ============================================================
// Fetches recovery actions for a specific incident.
// Subscribes to rampiq_events for entity_type='recovery_action'.
// Refetches when a recovery action event matches the incident's
// correlation_id chain (recovery actions inherit the parent
// incident's correlation_id).

export function useRecoveryActions(incidentId: string | null): {
  actions: RecoveryAction[];
  loading: boolean;
  refresh: () => void;
} {
  const [actions, setActions] = useState<RecoveryAction[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incidentIdRef = useRef(incidentId);
  incidentIdRef.current = incidentId;

  const refresh = useCallback(() => {
    const id = incidentIdRef.current;
    if (!id) { setActions([]); setLoading(false); return; }
    fetchRecoveryActions(id).then(data => {
      if (mountedRef.current) {
        setActions(data);
        setLoading(false);
      }
    }).catch(() => {});
  }, []);

  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refresh(), 300);
  }, [refresh]);

  // Refetch when selected incident changes
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [incidentId, refresh]);

  // Realtime subscription
  useEffect(() => {
    mountedRef.current = true;

    const sb = getSupabase();
    type Channel = ReturnType<NonNullable<typeof sb>['channel']>;
    let channel: Channel | null = null;

    if (sb) {
      channel = sb
        .channel('soi_recovery_sync')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'rampiq_events' },
          (payload) => {
            const row = payload.new as Record<string, unknown> | undefined;
            if (row?.entity_type === 'recovery_action' && incidentIdRef.current) {
              console.log('[realtime] recovery event received:', row.event_type, row.entity_id);
              debouncedRefresh();
            }
          })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[realtime] recovery actions channel subscribed');
          }
        });
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channel) channel.unsubscribe();
    };
  }, [debouncedRefresh]);

  return { actions, loading, refresh };
}

export function useEventTypes(): EventType[] {
  const [types, setTypes] = useState<EventType[]>([]);
  useEffect(() => { fetchEventTypes().then(setTypes); }, []);
  return types;
}

export function useQrTargets(): QrTarget[] {
  const [targets, setTargets] = useState<QrTarget[]>([]);
  useEffect(() => { fetchQrTargets().then(setTargets); }, []);
  return targets;
}

export function useUsers(): {
  users: UserLite[];
  loading: boolean;
  error: string | null;
  usingFallback: boolean;
  timedOut: boolean;
  retry: () => void;
} {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTimedOut(false);

    const sb = getSupabase();
    if (!sb) {
      setUsers(FALLBACK_USERS);
      setUsingFallback(true);
      setLoading(false);
      return;
    }

    // Race Supabase query against 5s timeout
    let done = false;
    const timeout = new Promise<'TIMEOUT'>(r => setTimeout(() => { if (!done) r('TIMEOUT'); }, 5000));

    const query = (async () => {
      try {
        const { data, error: sbErr } = await sb
          .from('users_lite').select('*').eq('active', true).order('role_type');
        if (done) return 'LATE';
        if (sbErr) return { error: `Supabase: ${sbErr.message}` };
        return { data: data as UserLite[] };
      } catch (err) {
        if (done) return 'LATE';
        return { error: `Network: ${err instanceof Error ? err.message : String(err)}` };
      }
    })();

    const result = await Promise.race([query, timeout]);
    done = true;

    if (result === 'TIMEOUT') {
      setTimedOut(true);
      setError('Supabase fetch timed out after 5s');
      setUsers(FALLBACK_USERS);
      setUsingFallback(true);
    } else if (result === 'LATE') {
      // ignore
    } else if ('error' in result) {
      setError(result.error || 'Unknown error');
      setUsers(FALLBACK_USERS);
      setUsingFallback(true);
    } else {
      setUsers(result.data);
      setUsingFallback(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { doFetch(); }, [doFetch]);

  return { users, loading, error, usingFallback, timedOut, retry: doFetch };
}

// ============================================================
// WORKFORCE READINESS — FETCH FUNCTIONS
// ============================================================

import type {
  CertificationType,
  UserCertification,
  EquipmentQualType,
  UserEquipmentQual,
  Team,
  TeamMember,
  Zone,
  UserZoneAssignment,
  ShiftStatusRecord,
  LearningModule,
  UserLearningProgress,
  AgentProfile,
  OperationalMetrics,
  OperationalReadiness,
  TeamReadiness,
  CertGap,
  EquipCoverage,
  CertCategory,
  ShiftWindow,
  RoleType,
} from '@/lib/soi-types';

// ---- Fallback data ----

const FALLBACK_CERT_TYPES: CertificationType[] = [
  { code: 'RAMP_SAFETY', label: 'Ramp Safety', category: 'SAFETY', required_for: ['RAMP_AGENT','LT_RUNNER','CREW_CHIEF','REGIONAL_CABIN','LAV_TECH','BAG_ROOM'], renewal_months: 12, active: true, display_order: 1 },
  { code: 'FOD_AWARENESS', label: 'FOD Prevention', category: 'SAFETY', required_for: ['RAMP_AGENT','LT_RUNNER','CREW_CHIEF','REGIONAL_CABIN'], renewal_months: 12, active: true, display_order: 2 },
  { code: 'TUG_OPERATION', label: 'Tug Operation', category: 'EQUIPMENT', required_for: ['RAMP_AGENT'], renewal_months: 24, active: true, display_order: 3 },
  { code: 'PUSHBACK_CERT', label: 'Pushback Certified', category: 'EQUIPMENT', required_for: ['RAMP_AGENT'], renewal_months: 24, active: true, display_order: 4 },
  { code: 'BELT_LOADER_OP', label: 'Belt Loader Operation', category: 'EQUIPMENT', required_for: ['LT_RUNNER','RAMP_AGENT'], renewal_months: 24, active: true, display_order: 5 },
  { code: 'HAZMAT_BASIC', label: 'Hazmat Awareness', category: 'HAZMAT', required_for: ['RAMP_AGENT','LT_RUNNER','CREW_CHIEF','LAV_TECH'], renewal_months: 12, active: true, display_order: 6 },
  { code: 'WING_WALKER', label: 'Wing Walker', category: 'PROCEDURE', required_for: ['RAMP_AGENT','CREW_CHIEF'], renewal_months: 12, active: true, display_order: 7 },
  { code: 'DEICING_BASIC', label: 'Basic Deicing', category: 'PROCEDURE', required_for: ['RAMP_AGENT','CREW_CHIEF'], renewal_months: 12, active: true, display_order: 8 },
];

const FALLBACK_EQUIP_QUAL_TYPES: EquipmentQualType[] = [
  { code: 'TUG', label: 'Tug', category: 'GSE', active: true, display_order: 1 },
  { code: 'BELT_LOADER', label: 'Belt Loader', category: 'GSE', active: true, display_order: 2 },
  { code: 'GPU', label: 'Ground Power Unit', category: 'GSE', active: true, display_order: 3 },
  { code: 'LAV_TRUCK', label: 'Lav Truck', category: 'GSE', active: true, display_order: 4 },
  { code: 'BAG_CART', label: 'Bag Cart', category: 'GSE', active: true, display_order: 5 },
  { code: 'AIR_START', label: 'Air Start Unit', category: 'GSE', active: true, display_order: 6 },
  { code: 'PUSHBACK_TUG', label: 'Pushback Tug', category: 'GSE', active: true, display_order: 7 },
];

const FALLBACK_TEAMS: Team[] = [
  { id: 'RAMP-AM', label: 'Ramp AM', shift: 'AM', station: 'LAX', lead_user_id: 'CC01', active: true },
  { id: 'RAMP-PM', label: 'Ramp PM', shift: 'PM', station: 'LAX', lead_user_id: 'RA22', active: true },
];

const FALLBACK_TEAM_MEMBERS: TeamMember[] = [
  { team_id: 'RAMP-AM', user_id: 'CC01' },
  { team_id: 'RAMP-AM', user_id: 'RA14' },
  { team_id: 'RAMP-AM', user_id: 'LT02' },
  { team_id: 'RAMP-AM', user_id: 'RC05' },
  { team_id: 'RAMP-PM', user_id: 'RA22' },
];

const FALLBACK_ZONES: Zone[] = [
  { id: 'GATES-52ABC', label: 'Alpha–Charlie Block', station: 'LAX', gate_ids: ['52A', '52B', '52C'], active: true },
  { id: 'GATES-52DEF', label: 'Delta–Foxtrot Block', station: 'LAX', gate_ids: ['52D', '52E', '52F'], active: true },
  { id: 'GATES-52GHI', label: 'Golf–India Block', station: 'LAX', gate_ids: ['52G', '52H', '52I'], active: true },
];

const FALLBACK_SHIFT_STATUSES: ShiftStatusRecord[] = [
  { user_id: 'CC01', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'RA14', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'LT02', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'RC05', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'RA22', on_shift: false, shift_start: null, shift_window: 'PM', updated_at: new Date().toISOString() },
];

const FALLBACK_LEARNING_MODULES: LearningModule[] = [
  { code: 'FOD_AWARENESS', label: 'FOD Awareness', category: 'SAFETY', required_for: ['RAMP_AGENT','LT_RUNNER','CREW_CHIEF','REGIONAL_CABIN'], display_order: 1, active: true },
  { code: 'PUSHBACK_PROC', label: 'Pushback Procedures', category: 'PROCEDURE', required_for: ['RAMP_AGENT','CREW_CHIEF'], display_order: 2, active: true },
  { code: 'SAFETY_BRIEFING', label: 'Daily Safety Briefing', category: 'SAFETY', required_for: ['RAMP_AGENT','LT_RUNNER','CREW_CHIEF','REGIONAL_CABIN','LAV_TECH','BAG_ROOM'], display_order: 3, active: true },
  { code: 'EQUIP_INSPECTION', label: 'Equipment Pre-Use Inspection', category: 'EQUIPMENT', required_for: ['RAMP_AGENT','LT_RUNNER'], display_order: 4, active: true },
  { code: 'HAZMAT_HANDLING', label: 'Hazmat Handling Basics', category: 'COMPLIANCE', required_for: ['RAMP_AGENT','LT_RUNNER','CREW_CHIEF','LAV_TECH'], display_order: 5, active: true },
];

// ---- Fetch functions ----

export async function fetchCertificationTypes(): Promise<CertificationType[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('certification_types').select('*').eq('active', true).order('display_order');
    if (!error && data) return data as CertificationType[];
    console.error('[store] cert_types fetch error:', error?.message);
  }
  return FALLBACK_CERT_TYPES;
}

export async function fetchUserCertifications(userId: string): Promise<UserCertification[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('user_certifications').select('*').eq('user_id', userId);
    if (!error && data) {
      // Join cert labels
      const types = await fetchCertificationTypes();
      return (data as UserCertification[]).map(c => {
        const t = types.find(ct => ct.code === c.cert_code);
        return { ...c, cert_label: t?.label, cert_category: t?.category as CertCategory | undefined };
      });
    }
    console.error('[store] user_certs fetch error:', error?.message);
  }
  return [];
}

export async function fetchEquipmentQualTypes(): Promise<EquipmentQualType[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('equipment_qual_types').select('*').eq('active', true).order('display_order');
    if (!error && data) return data as EquipmentQualType[];
    console.error('[store] equip_qual_types fetch error:', error?.message);
  }
  return FALLBACK_EQUIP_QUAL_TYPES;
}

export async function fetchUserEquipmentQuals(userId: string): Promise<UserEquipmentQual[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('user_equipment_quals').select('*').eq('user_id', userId);
    if (!error && data) {
      const types = await fetchEquipmentQualTypes();
      return (data as UserEquipmentQual[]).map(q => {
        const t = types.find(et => et.code === q.equip_code);
        return { ...q, equip_label: t?.label };
      });
    }
    console.error('[store] user_equip_quals fetch error:', error?.message);
  }
  return [];
}

export async function fetchTeams(station?: string): Promise<Team[]> {
  const sb = getSupabase();
  if (sb) {
    let query = sb.from('teams').select('*').eq('active', true);
    if (station) query = query.eq('station', station);
    const { data, error } = await query;
    if (!error && data) return data as Team[];
    console.error('[store] teams fetch error:', error?.message);
  }
  return station ? FALLBACK_TEAMS.filter(t => t.station === station) : FALLBACK_TEAMS;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('team_members').select('*').eq('team_id', teamId);
    if (!error && data) return data as TeamMember[];
    console.error('[store] team_members fetch error:', error?.message);
  }
  return FALLBACK_TEAM_MEMBERS.filter(m => m.team_id === teamId);
}

export async function fetchZones(station?: string): Promise<Zone[]> {
  const sb = getSupabase();
  if (sb) {
    let query = sb.from('zones').select('*').eq('active', true);
    if (station) query = query.eq('station', station);
    const { data, error } = await query;
    if (!error && data) return data as Zone[];
    console.error('[store] zones fetch error:', error?.message);
  }
  return station ? FALLBACK_ZONES.filter(z => z.station === station) : FALLBACK_ZONES;
}

export async function fetchUserZoneAssignments(userId: string): Promise<UserZoneAssignment[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('user_zone_assignments').select('*').eq('user_id', userId);
    if (!error && data) {
      const zones = await fetchZones();
      return (data as UserZoneAssignment[]).map(a => {
        const z = zones.find(zn => zn.id === a.zone_id);
        return { ...a, zone_label: z?.label };
      });
    }
    console.error('[store] zone_assignments fetch error:', error?.message);
  }
  return [];
}

export async function fetchShiftStatus(userId: string): Promise<ShiftStatusRecord | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('shift_status').select('*').eq('user_id', userId).single();
    if (!error && data) return data as ShiftStatusRecord;
    if (error && error.code !== 'PGRST116') console.error('[store] shift_status fetch error:', error?.message);
  }
  return FALLBACK_SHIFT_STATUSES.find(s => s.user_id === userId) || null;
}

export async function fetchAllShiftStatuses(): Promise<ShiftStatusRecord[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('shift_status').select('*');
    if (!error && data) return data as ShiftStatusRecord[];
    console.error('[store] all shift_status fetch error:', error?.message);
  }
  return FALLBACK_SHIFT_STATUSES;
}

export async function updateShiftStatus(
  userId: string,
  onShift: boolean,
  shiftWindow?: ShiftWindow,
): Promise<ShiftStatusRecord | null> {
  const updates: Record<string, unknown> = {
    on_shift: onShift,
    updated_at: new Date().toISOString(),
  };
  if (onShift) {
    updates.shift_start = new Date().toISOString();
    if (shiftWindow) updates.shift_window = shiftWindow;
  } else {
    updates.shift_start = null;
  }

  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('shift_status')
      .upsert({ user_id: userId, ...updates })
      .select()
      .single();
    if (error) {
      console.error('[store] shift_status update error:', error.message);
      return null;
    }
    return data as ShiftStatusRecord;
  }
  return { user_id: userId, on_shift: onShift, shift_start: onShift ? new Date().toISOString() : null, shift_window: shiftWindow || null, updated_at: new Date().toISOString() };
}

export async function fetchLearningModules(): Promise<LearningModule[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('learning_modules').select('*').eq('active', true).order('display_order');
    if (!error && data) return data as LearningModule[];
    console.error('[store] learning_modules fetch error:', error?.message);
  }
  return FALLBACK_LEARNING_MODULES;
}

export async function fetchUserLearningProgress(userId: string): Promise<UserLearningProgress[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('user_learning_progress').select('*').eq('user_id', userId);
    if (!error && data) {
      const modules = await fetchLearningModules();
      return (data as UserLearningProgress[]).map(p => {
        const m = modules.find(mod => mod.code === p.module_code);
        return { ...p, module_label: m?.label };
      });
    }
    console.error('[store] user_learning fetch error:', error?.message);
  }
  return [];
}

// ---- Composite fetches ----

export async function fetchAgentProfile(userId: string): Promise<AgentProfile | null> {
  const users = await fetchUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return null;

  const [certifications, equipmentQuals, teams, zoneAssignments, shiftStatus, learningProgress] =
    await Promise.all([
      fetchUserCertifications(userId),
      fetchUserEquipmentQuals(userId),
      fetchTeams(user.station),
      fetchUserZoneAssignments(userId),
      fetchShiftStatus(userId),
      fetchUserLearningProgress(userId),
    ]);

  // Find this user's team
  const allMembers = await Promise.all(teams.map(t => fetchTeamMembers(t.id)));
  let team: Team | null = null;
  for (let i = 0; i < teams.length; i++) {
    if (allMembers[i].some(m => m.user_id === userId)) {
      team = teams[i];
      break;
    }
  }

  return { user, certifications, equipmentQuals, team, zoneAssignments, shiftStatus, learningProgress };
}

export async function computeOperationalMetrics(userId: string): Promise<OperationalMetrics> {
  const sb = getSupabase();
  let events: SoiEvent[] = [];

  if (sb) {
    const { data, error } = await sb
      .from('rampiq_events')
      .select('*')
      .eq('reported_by', userId)
      .order('created_at', { ascending: false });
    if (!error && data) events = data as SoiEvent[];
  } else {
    const all = lsRead();
    events = all.filter(e => e.reported_by === userId);
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const events7d = events.filter(e => new Date(e.created_at).getTime() > sevenDaysAgo);
  const resolved = events.filter(e => e.operational_status === 'RESOLVED');
  const resTimes = resolved.map(e => e.event_duration_seconds).filter((d): d is number => d != null && d > 0);
  const avgRes = resTimes.length > 0 ? Math.round(resTimes.reduce((s, v) => s + v, 0) / resTimes.length) : null;
  const responseRate = events.length > 0 ? Math.round((resolved.length / events.length) * 100) : 0;

  const eventsByType: Record<string, number> = {};
  events.forEach(e => { eventsByType[e.event_type] = (eventsByType[e.event_type] || 0) + 1; });

  return {
    user_id: userId,
    total_events: events.length,
    events_last_7d: events7d.length,
    avg_resolution_seconds: avgRes,
    response_rate: responseRate,
    events_by_type: eventsByType,
  };
}

export async function fetchOperationalReadiness(station: string, shift: ShiftWindow): Promise<OperationalReadiness> {
  const [users, allShifts, teams, certTypes, equipTypes] = await Promise.all([
    fetchUsers(),
    fetchAllShiftStatuses(),
    fetchTeams(station),
    fetchCertificationTypes(),
    fetchEquipmentQualTypes(),
  ]);

  const stationUsers = users.filter(u => u.station === station);
  const shiftMap = new Map(allShifts.map(s => [s.user_id, s]));

  const onShift = stationUsers.filter(u => shiftMap.get(u.id)?.on_shift);
  const offShift = stationUsers.filter(u => !shiftMap.get(u.id)?.on_shift);

  // Team readiness
  const teamReadiness: TeamReadiness[] = await Promise.all(
    teams.filter(t => t.shift === shift).map(async (team) => {
      const members = await fetchTeamMembers(team.id);
      const memberUsers = members
        .map(m => {
          const u = stationUsers.find(su => su.id === m.user_id);
          if (!u) return null;
          return { ...u, on_shift: shiftMap.get(u.id)?.on_shift ?? false };
        })
        .filter((u): u is NonNullable<typeof u> => u != null);

      // Cert compliance: check each member has all certs required for their role
      let totalRequired = 0;
      let totalHeld = 0;
      for (const mu of memberUsers) {
        const required = certTypes.filter(ct => ct.required_for.includes(mu.role_type as RoleType));
        totalRequired += required.length;
        const certs = await fetchUserCertifications(mu.id);
        const activeCodes = new Set(certs.filter(c => c.status === 'ACTIVE').map(c => c.cert_code));
        totalHeld += required.filter(r => activeCodes.has(r.code)).length;
      }
      const cert_compliance = totalRequired > 0 ? Math.round((totalHeld / totalRequired) * 100) : 100;

      return { team, members: memberUsers, cert_compliance };
    })
  );

  // Cert gaps
  const certGaps: CertGap[] = [];
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  for (const ct of certTypes) {
    const requiredUsers = stationUsers.filter(u => ct.required_for.includes(u.role_type as RoleType));
    if (requiredUsers.length === 0) continue;

    let activeCount = 0;
    let expiringSoon = 0;
    for (const u of requiredUsers) {
      const certs = await fetchUserCertifications(u.id);
      const cert = certs.find(c => c.cert_code === ct.code);
      if (cert?.status === 'ACTIVE') {
        activeCount++;
        if (cert.expires_at && new Date(cert.expires_at).getTime() - now < thirtyDays) {
          expiringSoon++;
        }
      }
    }

    if (activeCount < requiredUsers.length || expiringSoon > 0) {
      certGaps.push({
        cert_code: ct.code,
        cert_label: ct.label,
        required_count: requiredUsers.length,
        active_count: activeCount,
        expiring_soon: expiringSoon,
      });
    }
  }

  // Equipment coverage
  const equipCoverage: EquipCoverage[] = [];
  for (const et of equipTypes) {
    const sb = getSupabase();
    let qualifiedUserIds: string[] = [];
    if (sb) {
      const { data } = await sb.from('user_equipment_quals').select('user_id').eq('equip_code', et.code).eq('status', 'ACTIVE');
      if (data) qualifiedUserIds = data.map((d: { user_id: string }) => d.user_id);
    }
    const qualifiedTotal = qualifiedUserIds.length;
    const qualifiedOnShift = qualifiedUserIds.filter(uid => shiftMap.get(uid)?.on_shift).length;
    equipCoverage.push({
      equip_code: et.code,
      equip_label: et.label,
      qualified_on_shift: qualifiedOnShift,
      qualified_total: qualifiedTotal,
    });
  }

  return {
    total_on_shift: onShift.length,
    total_off_shift: offShift.length,
    teams: teamReadiness,
    cert_gaps: certGaps,
    equip_coverage: equipCoverage,
  };
}

// ---- React hooks ----

export function useAgentProfile(userId: string | null): AgentProfile | null {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetchAgentProfile(userId).then(setProfile);
  }, [userId]);
  return profile;
}

export function useOperationalMetrics(userId: string | null): OperationalMetrics | null {
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null);
  useEffect(() => {
    if (!userId) return;
    computeOperationalMetrics(userId).then(setMetrics);
  }, [userId]);
  return metrics;
}

export function useOperationalReadiness(station: string, shift: ShiftWindow): OperationalReadiness | null {
  const [readiness, setReadiness] = useState<OperationalReadiness | null>(null);
  useEffect(() => {
    fetchOperationalReadiness(station, shift).then(setReadiness);
  }, [station, shift]);
  return readiness;
}

// ============================================================
// ============================================================
// FLIGHTS
// ============================================================

import type { Flight } from '@/lib/soi-types';

function makeFallbackFlights(): Flight[] {
  const now = Date.now();
  return [
    { id: 'AA1318', gate_id: '52A', aircraft: 'B737', route: 'ORD → LAX', arrival_time: new Date(now + 45 * 60000).toISOString(), departure_time: new Date(now + 135 * 60000).toISOString(), turn_type: 'THROUGH', status: 'INBOUND', active: true },
    { id: 'AA1350', gate_id: '52B', aircraft: 'A321', route: 'SFO → LAX', arrival_time: new Date(now - 20 * 60000).toISOString(), departure_time: new Date(now + 55 * 60000).toISOString(), turn_type: 'THROUGH', status: 'ON_GATE', active: true },
    { id: 'WN1334', gate_id: '52C', aircraft: 'B738', route: 'DEN → LAX', arrival_time: new Date(now + 60 * 60000).toISOString(), departure_time: new Date(now + 150 * 60000).toISOString(), turn_type: 'THROUGH', status: 'SCHEDULED', active: true },
    { id: 'AA2201', gate_id: '52D', aircraft: 'B739', route: 'SEA → LAX', arrival_time: new Date(now - 45 * 60000).toISOString(), departure_time: new Date(now + 30 * 60000).toISOString(), turn_type: 'THROUGH', status: 'BOARDING', active: true },
    { id: 'UA0418', gate_id: '52E', aircraft: 'A319', route: 'EWR → LAX', arrival_time: new Date(now + 120 * 60000).toISOString(), departure_time: new Date(now + 225 * 60000).toISOString(), turn_type: 'ARRIVAL', status: 'SCHEDULED', active: true },
    { id: 'AA0917', gate_id: '52F', aircraft: 'B738', route: 'MIA → LAX', arrival_time: new Date(now + 30 * 60000).toISOString(), departure_time: new Date(now + 110 * 60000).toISOString(), turn_type: 'THROUGH', status: 'INBOUND', active: true },
    { id: 'DL1144', gate_id: '52G', aircraft: 'A321', route: 'ATL → LAX', arrival_time: new Date(now - 60 * 60000).toISOString(), departure_time: new Date(now + 15 * 60000).toISOString(), turn_type: 'DEPARTURE', status: 'BOARDING', active: true },
    { id: 'WN2280', gate_id: '52H', aircraft: 'B737', route: 'PHX → LAX', arrival_time: new Date(now + 180 * 60000).toISOString(), departure_time: new Date(now + 270 * 60000).toISOString(), turn_type: 'THROUGH', status: 'SCHEDULED', active: true },
    { id: 'AA1042', gate_id: '52I', aircraft: 'B738', route: 'HNL → LAX', arrival_time: new Date(now + 90 * 60000).toISOString(), departure_time: new Date(now + 180 * 60000).toISOString(), turn_type: 'THROUGH', status: 'INBOUND', active: true },
  ];
}

export interface FlightsResult {
  flights: Flight[];
  loading: boolean;
  source: 'supabase' | 'fallback' | 'loading';
  error: string | null;
  rawCount: number;
}

export async function fetchFlights(): Promise<{ data: Flight[]; error: string | null; source: 'supabase' | 'fallback' }> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.from('flights').select('*').eq('active', true).order('arrival_time');
      if (error) {
        return { data: makeFallbackFlights(), error: `Supabase: ${error.message}`, source: 'fallback' };
      }
      if (!data || data.length === 0) {
        return { data: makeFallbackFlights(), error: 'Supabase returned 0 rows', source: 'fallback' };
      }
      return { data: data as Flight[], error: null, source: 'supabase' };
    } catch (err) {
      return { data: makeFallbackFlights(), error: `Exception: ${err instanceof Error ? err.message : String(err)}`, source: 'fallback' };
    }
  }
  return { data: makeFallbackFlights(), error: 'No Supabase client', source: 'fallback' };
}

export function useFlights(): FlightsResult {
  const [result, setResult] = useState<FlightsResult>({ flights: [], loading: true, source: 'loading', error: null, rawCount: 0 });
  useEffect(() => {
    fetchFlights().then(({ data, error, source }) => {
      setResult({ flights: data, loading: false, source, error, rawCount: data.length });
    }).catch((err) => {
      const fb = makeFallbackFlights();
      setResult({ flights: fb, loading: false, source: 'fallback', error: `Hook error: ${err}`, rawCount: fb.length });
    });
  }, []);
  return result;
}

// ---- Assignment lifecycle ----

export async function acknowledgeAssignment(id: string, userId: string): Promise<CrewAssignment | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('crew_assignments')
      .update({ status: 'ACKNOWLEDGED', acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('[store] acknowledge error:', error.message); return null; }
    return data as CrewAssignment;
  }
  return null;
}

export async function updateAssignmentStatus(id: string, status: string): Promise<CrewAssignment | null> {
  const sb = getSupabase();
  const updates: Record<string, unknown> = { status };
  if (status === 'COMPLETE') {
    updates.completed_at = new Date().toISOString();
  }
  if (sb) {
    const { data, error } = await sb
      .from('crew_assignments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('[store] status update error:', error.message); return null; }
    return data as CrewAssignment;
  }
  return null;
}

export async function fetchAgentTasks(userId: string): Promise<CrewAssignment[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('crew_assignments')
      .select('*')
      .contains('assigned_user_ids', [userId])
      .not('status', 'in', '("COMPLETE","CANCELLED")')
      .order('created_at', { ascending: false });
    if (!error && data) {
      const [teams, zones] = await Promise.all([fetchTeams(), fetchZones()]);
      return (data as CrewAssignment[]).map(a => ({
        ...a,
        team_label: teams.find(t => t.id === a.team_id)?.label,
        zone_label: a.zone_id ? zones.find(z => z.id === a.zone_id)?.label : undefined,
      }));
    }
    console.error('[store] agent tasks fetch error:', error?.message);
  }
  // Fallback: filter from FALLBACK_CREW_ASSIGNMENTS
  return FALLBACK_CREW_ASSIGNMENTS.filter(a =>
    a.assigned_user_ids.includes(userId) && a.status !== 'COMPLETE' && a.status !== 'CANCELLED'
  );
}

// LT DISPATCH — find active dispatch for a user (no matching arrival yet)
// ============================================================

export async function fetchActiveDispatch(userId: string): Promise<SoiEvent | null> {
  const sb = getSupabase();
  if (sb) {
    // Find most recent LT_DISPATCH by this user
    const { data: dispatches } = await sb
      .from('rampiq_events')
      .select('*')
      .eq('reported_by', userId)
      .eq('event_type', 'LT_DISPATCH')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!dispatches || dispatches.length === 0) return null;
    const dispatch = dispatches[0] as SoiEvent;

    // Check if there's a matching LT_ARRIVAL
    const { data: arrivals } = await sb
      .from('rampiq_events')
      .select('id')
      .eq('event_type', 'LT_ARRIVAL')
      .eq('reported_by', userId)
      .gte('created_at', dispatch.created_at)
      .limit(1);

    if (arrivals && arrivals.length > 0) return null; // already arrived
    return dispatch;
  }
  return null; // no fallback for active dispatch
}

// ============================================================
// CREW ASSIGNMENTS
// ============================================================

import type {
  CrewAssignment,
  AssignmentOutcome,
  AssignmentStatus,
} from '@/lib/soi-types';

const FALLBACK_CREW_ASSIGNMENTS: CrewAssignment[] = [
  {
    id: 'seed-ramp-am', created_at: new Date(Date.now() - 7200000).toISOString(),
    team_id: 'RAMP-AM', assigned_user_ids: ['CC01','RA14','LT02','RC05'],
    zone_id: 'GATES-52ABC', gate_ids: ['52A','52B','52C'], equipment_ids: ['TUG-042','BELT-007'],
    assigned_by: 'CC01', shift_window: 'AM',
    recommendation_id: null, recommended_team_id: null, recommendation_reason: null,
    override_used: false, override_reason: null, override_by: null,
    status: 'ASSIGNED', acknowledged_at: null, acknowledged_by: null, completed_at: null, completed_by: null,
    notes: 'AM ramp crew covering Alpha through Charlie',
    team_label: 'Ramp AM', zone_label: 'Alpha–Charlie Block', assigned_by_name: 'Martinez J.',
  },
  {
    id: 'seed-ramp-pm', created_at: new Date(Date.now() - 3600000).toISOString(),
    team_id: 'RAMP-PM', assigned_user_ids: ['RA22'],
    zone_id: 'GATES-52GHI', gate_ids: ['52G','52H','52I'], equipment_ids: ['GPU-031'],
    assigned_by: 'RA22', shift_window: 'PM',
    recommendation_id: null, recommended_team_id: null, recommendation_reason: null,
    override_used: false, override_reason: null, override_by: null,
    status: 'ASSIGNED', acknowledged_at: null, acknowledged_by: null, completed_at: null, completed_by: null,
    notes: 'PM ramp crew covering Golf through India',
    team_label: 'Ramp PM', zone_label: 'Golf–India Block', assigned_by_name: 'Okafor D.',
  },
];

export async function fetchCrewAssignments(filters?: {
  status?: AssignmentStatus;
  shift?: ShiftWindow;
  team_id?: string;
}): Promise<CrewAssignment[]> {
  const sb = getSupabase();
  if (sb) {
    let query = sb.from('crew_assignments').select('*').order('created_at', { ascending: false });
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.shift) query = query.eq('shift_window', filters.shift);
    if (filters?.team_id) query = query.eq('team_id', filters.team_id);
    const { data, error } = await query;
    if (!error && data) {
      // Join labels
      const [teams, zones, users] = await Promise.all([fetchTeams(), fetchZones(), fetchUsers()]);
      return (data as CrewAssignment[]).map(a => ({
        ...a,
        team_label: teams.find(t => t.id === a.team_id)?.label,
        zone_label: a.zone_id ? zones.find(z => z.id === a.zone_id)?.label : undefined,
        assigned_by_name: users.find(u => u.id === a.assigned_by)?.display_name || a.assigned_by,
      }));
    }
    console.error('[store] crew_assignments fetch error:', error?.message);
  }
  let result = FALLBACK_CREW_ASSIGNMENTS;
  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.shift) result = result.filter(a => a.shift_window === filters.shift);
  if (filters?.team_id) result = result.filter(a => a.team_id === filters.team_id);
  return result;
}

export async function createCrewAssignment(assignment: {
  team_id: string;
  assigned_user_ids: string[];
  zone_id?: string;
  gate_ids?: string[];
  equipment_ids?: string[];
  assigned_by: string;
  shift_window: ShiftWindow;
  recommendation_id?: string;
  recommended_team_id?: string;
  recommendation_reason?: string;
  override_used?: boolean;
  override_reason?: string;
  override_by?: string;
  notes?: string;
}): Promise<CrewAssignment | null> {
  const sb = getSupabase();
  const row = {
    team_id: assignment.team_id,
    assigned_user_ids: assignment.assigned_user_ids,
    zone_id: assignment.zone_id || null,
    gate_ids: assignment.gate_ids || [],
    equipment_ids: assignment.equipment_ids || [],
    assigned_by: assignment.assigned_by,
    shift_window: assignment.shift_window,
    recommendation_id: assignment.recommendation_id || null,
    recommended_team_id: assignment.recommended_team_id || null,
    recommendation_reason: assignment.recommendation_reason || null,
    override_used: assignment.override_used || false,
    override_reason: assignment.override_reason || null,
    override_by: assignment.override_by || null,
    notes: assignment.notes || null,
    status: 'ASSIGNED',
  };

  if (sb) {
    const { data, error } = await sb.from('crew_assignments').insert(row).select().single();
    if (error) {
      console.error('[store] crew_assignment create error:', error.message);
      return null;
    }
    return data as CrewAssignment;
  }
  return { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row, completed_at: null, completed_by: null } as CrewAssignment;
}

export async function completeCrewAssignment(id: string, completedBy: string): Promise<CrewAssignment | null> {
  const sb = getSupabase();
  const updates = { status: 'COMPLETE', completed_at: new Date().toISOString(), completed_by: completedBy };
  if (sb) {
    const { data, error } = await sb.from('crew_assignments').update(updates).eq('id', id).select().single();
    if (error) { console.error('[store] crew_assignment complete error:', error.message); return null; }
    return data as CrewAssignment;
  }
  return null;
}

export async function cancelCrewAssignment(id: string): Promise<CrewAssignment | null> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from('crew_assignments').update({ status: 'CANCELLED' }).eq('id', id).select().single();
    if (error) { console.error('[store] crew_assignment cancel error:', error.message); return null; }
    return data as CrewAssignment;
  }
  return null;
}

export async function computeAssignmentOutcome(assignment: CrewAssignment): Promise<AssignmentOutcome> {
  const sb = getSupabase();
  let events: SoiEvent[] = [];

  if (sb) {
    // Find events overlapping with this assignment's time window and gates
    let query = sb.from('rampiq_events').select('*')
      .gte('created_at', assignment.created_at);
    if (assignment.completed_at) query = query.lte('created_at', assignment.completed_at);
    const { data } = await query;
    if (data) {
      // Filter to events matching this assignment's gates or zone
      events = (data as SoiEvent[]).filter(e =>
        (e.gate_id && assignment.gate_ids.includes(e.gate_id)) ||
        (e.equipment_id && assignment.equipment_ids.includes(e.equipment_id))
      );
    }
  }

  const resolved = events.filter(e => e.operational_status === 'RESOLVED');
  const highSev = events.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH');
  const resTimes = resolved.map(e => e.event_duration_seconds).filter((d): d is number => d != null && d > 0);
  const avgRes = resTimes.length > 0 ? Math.round(resTimes.reduce((s, v) => s + v, 0) / resTimes.length) : null;

  return {
    assignment_id: assignment.id,
    events_during: events.length,
    avg_resolution_seconds: avgRes,
    high_severity_count: highSev.length,
    resolved_count: resolved.length,
  };
}

// ---- Assignment pressure (live, from events) ----

import type {
  AssignmentPressure,
  OperationalSuggestion,
  AssignmentTransition,
  TransitionType,
} from '@/lib/soi-types';
import { eventAge } from '@/lib/soi-types';

export function computeAssignmentPressure(
  assignment: CrewAssignment,
  events: SoiEvent[],
): AssignmentPressure {
  const zoneEvents = events.filter(e => {
    const isOpen = e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED';
    const matchGate = e.gate_id && assignment.gate_ids.includes(e.gate_id);
    const matchEquip = e.equipment_id && assignment.equipment_ids.includes(e.equipment_id);
    return isOpen && (matchGate || matchEquip);
  });

  const critHigh = zoneEvents.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH');
  const oldest = zoneEvents.length > 0
    ? zoneEvents.reduce((o, e) => e.created_at < o.created_at ? e : o)
    : null;

  return {
    assignment_id: assignment.id,
    open_events: zoneEvents.length,
    critical_high_count: critHigh.length,
    oldest_unresolved_age: oldest ? eventAge(oldest.created_at) : null,
    time_since_assignment: eventAge(assignment.created_at),
  };
}

// ---- Explainable suggestion engine (no ML) ----

export async function computeSuggestion(
  zoneId: string,
  shift: ShiftWindow,
  liveEvents: SoiEvent[],
): Promise<OperationalSuggestion | null> {
  const [teams, allShifts, zones] = await Promise.all([
    fetchTeams(),
    fetchAllShiftStatuses(),
    fetchZones(),
  ]);

  const zone = zones.find(z => z.id === zoneId);
  if (!zone) return null;

  const shiftTeams = teams.filter(t => t.shift === shift);
  if (shiftTeams.length === 0) return null;

  const shiftMap = new Map(allShifts.map(s => [s.user_id, s]));

  // Score each team
  const scored = await Promise.all(shiftTeams.map(async (team) => {
    const members = await fetchTeamMembers(team.id);
    const memberIds = members.map(m => m.user_id);
    const total = memberIds.length || 1;

    // Availability: how many are on shift
    const onShiftCount = memberIds.filter(uid => shiftMap.get(uid)?.on_shift).length;
    const availability = Math.round((onShiftCount / total) * 100);

    // Zone familiarity: how many have prior zone assignments here
    let familiarCount = 0;
    for (const uid of memberIds) {
      const assignments = await fetchUserZoneAssignments(uid);
      if (assignments.some(a => a.zone_id === zoneId)) familiarCount++;
    }
    const zone_familiarity = Math.round((familiarCount / total) * 100);

    // Equipment coverage: how many zone equipment types are covered
    const zoneEquipTypes = new Set<string>();
    // Infer equipment types from zone's gate equipment assignments
    const activeAssignments = await fetchCrewAssignments({ status: 'ASSIGNED' });
    activeAssignments.forEach(a => {
      if (a.zone_id === zoneId) a.equipment_ids.forEach(eq => zoneEquipTypes.add(eq.split('-')[0]));
    });
    const equipTypesNeeded = zoneEquipTypes.size || 1;
    let coveredTypes = 0;
    for (const uid of memberIds) {
      const quals = await fetchUserEquipmentQuals(uid);
      quals.forEach(q => { if (q.status === 'ACTIVE') zoneEquipTypes.delete(q.equip_code); });
    }
    coveredTypes = equipTypesNeeded - zoneEquipTypes.size;
    const equip_coverage = Math.round((coveredTypes / equipTypesNeeded) * 100);

    // Cert match: how many members have certs matching zone needs
    let certMatchCount = 0;
    for (const uid of memberIds) {
      const certs = await fetchUserCertifications(uid);
      const activeCerts = certs.filter(c => c.status === 'ACTIVE').length;
      if (activeCerts >= 3) certMatchCount++; // simplified: 3+ active certs = qualified
    }
    const cert_match = Math.round((certMatchCount / total) * 100);

    // Workload: inverse of open events currently assigned to this team
    const teamAssignments = activeAssignments.filter(a => a.team_id === team.id);
    let teamOpenEvents = 0;
    teamAssignments.forEach(a => {
      liveEvents.forEach(e => {
        const isOpen = e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED';
        if (isOpen && ((e.gate_id && a.gate_ids.includes(e.gate_id)) || (e.equipment_id && a.equipment_ids.includes(e.equipment_id)))) {
          teamOpenEvents++;
        }
      });
    });
    const workload = Math.max(0, 100 - teamOpenEvents * 20);

    return { team, availability, zone_familiarity, equip_coverage, cert_match, workload, onShiftCount, familiarCount, certMatchCount, total };
  }));

  // Pick best team by sum of factors
  const best = scored.reduce((a, b) => {
    const aScore = a.availability + a.zone_familiarity + a.equip_coverage + a.cert_match + a.workload;
    const bScore = b.availability + b.zone_familiarity + b.equip_coverage + b.cert_match + b.workload;
    return bScore > aScore ? b : a;
  });

  // Build human-readable reasons
  const reasons: string[] = [];
  if (best.availability >= 75) reasons.push(`${best.onShiftCount}/${best.total} members on shift`);
  if (best.cert_match >= 75) reasons.push(`${best.certMatchCount}/${best.total} members cert-qualified`);
  if (best.zone_familiarity > 0) reasons.push(`${best.familiarCount}/${best.total} familiar with zone`);
  if (best.workload >= 80) reasons.push('lowest active workload');
  if (best.equip_coverage >= 50) reasons.push('equipment coverage');
  if (reasons.length === 0) reasons.push('best available match');

  return {
    suggested_team_id: best.team.id,
    suggested_team_label: best.team.label,
    reasons,
    confidence_factors: {
      cert_match: best.cert_match,
      zone_familiarity: best.zone_familiarity,
      availability: best.availability,
      equip_coverage: best.equip_coverage,
      workload: best.workload,
    },
  };
}

// ---- Reassignment (immutable history) ----

export async function reassignCrew(
  fromAssignmentId: string,
  newAssignment: Parameters<typeof createCrewAssignment>[0],
  reason: string,
  initiatedBy: string,
  transitionType: TransitionType = 'REASSIGN',
): Promise<{ newAssignment: CrewAssignment; transition: AssignmentTransition } | null> {
  // Complete old assignment
  await completeCrewAssignment(fromAssignmentId, initiatedBy);

  // Create new assignment
  const created = await createCrewAssignment(newAssignment);
  if (!created) return null;

  // Log transition
  const sb = getSupabase();
  const transRow = {
    from_assignment_id: fromAssignmentId,
    to_assignment_id: created.id,
    transition_type: transitionType,
    reason,
    initiated_by: initiatedBy,
  };

  let transition: AssignmentTransition;
  if (sb) {
    const { data, error } = await sb.from('assignment_transitions').insert(transRow).select().single();
    if (error) {
      console.error('[store] transition log error:', error.message);
      transition = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...transRow };
    } else {
      transition = data as AssignmentTransition;
    }
  } else {
    transition = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...transRow };
  }

  return { newAssignment: created, transition };
}

export async function fetchTransitions(assignmentId: string): Promise<AssignmentTransition[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from('assignment_transitions')
      .select('*')
      .or(`from_assignment_id.eq.${assignmentId},to_assignment_id.eq.${assignmentId}`)
      .order('created_at', { ascending: false });
    if (!error && data) return data as AssignmentTransition[];
    console.error('[store] transitions fetch error:', error?.message);
  }
  return [];
}

// ---- Crew assignment hooks ----

export function useCrewAssignments(shift: ShiftWindow): { assignments: CrewAssignment[]; loading: boolean; refresh: () => void } {
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetchCrewAssignments({ shift }).then(data => {
      setAssignments(data);
      setLoading(false);
    });
  }, [shift]);

  useEffect(() => { refresh(); }, [refresh]);

  return { assignments, loading, refresh };
}
