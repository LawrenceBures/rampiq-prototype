'use client';

// RampIQ Phase 1 — Event store.
// Primary: Supabase. Fallback: localStorage (single-device, no realtime).

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from './supabase';
import type {
  RampiqEvent,
  QrTarget,
  EventType,
  UserLite,
  EventSubmission,
  OperationalStatus,
} from './rampiq-types';

// ============================================================
// EVENTS — CRUD
// ============================================================

const LS_KEY = 'rampiq_events_v2';

function lsRead(): RampiqEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function lsWrite(events: RampiqEvent[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(events)); } catch { /* */ }
}

export async function fetchEvents(filters?: {
  station?: string;
  status?: OperationalStatus;
  severity?: string;
  event_type?: string;
}): Promise<RampiqEvent[]> {
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
      return data as RampiqEvent[];
    }
  }
  // Fallback
  let events = lsRead();
  if (filters?.status) events = events.filter(e => e.operational_status === filters.status);
  if (filters?.severity) events = events.filter(e => e.severity === filters.severity);
  if (filters?.event_type) events = events.filter(e => e.event_type === filters.event_type);
  return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function postEvent(submission: EventSubmission): Promise<RampiqEvent> {
  const sb = getSupabase();
  const row = {
    ...submission,
    operational_status: 'OPEN',
    sync_status: 'SYNCED',
  };

  if (sb) {
    const { data, error } = await sb.from('rampiq_events').insert(row).select().single();
    if (error) {
      console.error('[store] insert error:', error.message);
      throw new Error(`Event save failed: ${error.message}`);
    }
    return data as RampiqEvent;
  }

  // localStorage fallback
  const full: RampiqEvent = {
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
): Promise<RampiqEvent | null> {
  const updates: Record<string, unknown> = { operational_status: status };
  if (status === 'RESOLVED') {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = resolvedBy || 'manager';
  }

  const sb = getSupabase();
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
    return data as RampiqEvent;
  }

  // localStorage fallback
  const events = lsRead();
  const idx = events.findIndex(e => e.id === eventId);
  if (idx === -1) return null;
  events[idx] = { ...events[idx], ...updates } as RampiqEvent;
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

const LS_QR_TARGETS = 'rampiq_qr_targets';

// Fallback QR targets for localStorage mode
const FALLBACK_QR_TARGETS: QrTarget[] = [
  { id: 'LAX-GATE-G42B', target_type: 'GATE', station: 'LAX', gate_id: 'G42B', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate G42B', active: true, created_at: '' },
  { id: 'LAX-GATE-G47A', target_type: 'GATE', station: 'LAX', gate_id: 'G47A', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate G47A', active: true, created_at: '' },
  { id: 'LAX-GATE-G50', target_type: 'GATE', station: 'LAX', gate_id: 'G50', equipment_id: null, equipment_kind: null, flight_id: null, label: 'Gate G50', active: true, created_at: '' },
  { id: 'LAX-EQUIP-TUG-042', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'TUG-042', equipment_kind: 'TUG', flight_id: null, label: 'Tug #42', active: true, created_at: '' },
  { id: 'LAX-EQUIP-BELT-007', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'BELT-007', equipment_kind: 'BELT_LOADER', flight_id: null, label: 'Belt Loader #7', active: true, created_at: '' },
  { id: 'LAX-EQUIP-GPU-031', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'GPU-031', equipment_kind: 'GPU', flight_id: null, label: 'GPU #31', active: true, created_at: '' },
  { id: 'LAX-EQUIP-LAV-003', target_type: 'EQUIPMENT', station: 'LAX', gate_id: null, equipment_id: 'LAV-003', equipment_kind: 'LAV_TRUCK', flight_id: null, label: 'Lav Truck #3', active: true, created_at: '' },
  { id: 'LAX-CHECK-RAMPCTL', target_type: 'CHECKPOINT', station: 'LAX', gate_id: null, equipment_id: null, equipment_kind: null, flight_id: null, label: 'Ramp Control', active: true, created_at: '' },
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
  { id: 'CM', display_name: 'Cortez M.', role_type: 'SUPERVISOR', default_shift: 'AM', station: 'LAX', active: true },
  { id: 'TC12', display_name: 'Tug Crew 12', role_type: 'TUG_CREW', default_shift: 'AM', station: 'LAX', active: true },
  { id: 'TC14', display_name: 'Tug Crew 14', role_type: 'TUG_CREW', default_shift: 'PM', station: 'LAX', active: true },
  { id: 'BR01', display_name: 'Bag Runner 1', role_type: 'BAG_RUNNER', default_shift: 'AM', station: 'LAX', active: true },
  { id: 'LD03', display_name: 'Lead 3', role_type: 'LEAD', default_shift: 'AM', station: 'LAX', active: true },
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
  events: RampiqEvent[];
  loading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
} {
  const [events, setEvents] = useState<RampiqEvent[]>([]);
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
        .channel('rampiq_events_live')
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

export function useUsers(): UserLite[] {
  const [users, setUsers] = useState<UserLite[]>([]);
  useEffect(() => { fetchUsers().then(setUsers); }, []);
  return users;
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
} from './rampiq-types';

// ---- Fallback data ----

const FALLBACK_CERT_TYPES: CertificationType[] = [
  { code: 'RAMP_SAFETY', label: 'Ramp Safety', category: 'SAFETY', required_for: ['TUG_CREW','BAG_RUNNER','LEAD','SUPERVISOR','CABIN_CLEANER','FUELER','RAMP_AGENT'], renewal_months: 12, active: true, display_order: 1 },
  { code: 'FOD_AWARENESS', label: 'FOD Prevention', category: 'SAFETY', required_for: ['TUG_CREW','BAG_RUNNER','LEAD','SUPERVISOR','RAMP_AGENT'], renewal_months: 12, active: true, display_order: 2 },
  { code: 'TUG_OPERATION', label: 'Tug Operation', category: 'EQUIPMENT', required_for: ['TUG_CREW'], renewal_months: 24, active: true, display_order: 3 },
  { code: 'PUSHBACK_CERT', label: 'Pushback Certified', category: 'EQUIPMENT', required_for: ['TUG_CREW'], renewal_months: 24, active: true, display_order: 4 },
  { code: 'BELT_LOADER_OP', label: 'Belt Loader Operation', category: 'EQUIPMENT', required_for: ['BAG_RUNNER','RAMP_AGENT'], renewal_months: 24, active: true, display_order: 5 },
  { code: 'HAZMAT_BASIC', label: 'Hazmat Awareness', category: 'HAZMAT', required_for: ['TUG_CREW','BAG_RUNNER','LEAD','SUPERVISOR','FUELER','RAMP_AGENT'], renewal_months: 12, active: true, display_order: 6 },
  { code: 'WING_WALKER', label: 'Wing Walker', category: 'PROCEDURE', required_for: ['TUG_CREW','LEAD'], renewal_months: 12, active: true, display_order: 7 },
  { code: 'DEICING_BASIC', label: 'Basic Deicing', category: 'PROCEDURE', required_for: ['RAMP_AGENT','LEAD'], renewal_months: 12, active: true, display_order: 8 },
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
  { id: 'ALPHA-AM', label: 'Alpha Team', shift: 'AM', station: 'LAX', lead_user_id: 'LD03', active: true },
  { id: 'BRAVO-PM', label: 'Bravo Team', shift: 'PM', station: 'LAX', lead_user_id: 'TC14', active: true },
];

const FALLBACK_TEAM_MEMBERS: TeamMember[] = [
  { team_id: 'ALPHA-AM', user_id: 'CM' },
  { team_id: 'ALPHA-AM', user_id: 'TC12' },
  { team_id: 'ALPHA-AM', user_id: 'BR01' },
  { team_id: 'ALPHA-AM', user_id: 'LD03' },
  { team_id: 'BRAVO-PM', user_id: 'TC14' },
];

const FALLBACK_ZONES: Zone[] = [
  { id: 'T7-NORTH', label: 'Terminal 7 North', station: 'LAX', gate_ids: ['G42B', 'G47A'], active: true },
  { id: 'T7-SOUTH', label: 'Terminal 7 South', station: 'LAX', gate_ids: ['G50'], active: true },
  { id: 'TBIT-WEST', label: 'TBIT West', station: 'LAX', gate_ids: [], active: true },
];

const FALLBACK_SHIFT_STATUSES: ShiftStatusRecord[] = [
  { user_id: 'CM', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'TC12', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'BR01', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'LD03', on_shift: true, shift_start: new Date(Date.now() - 7200000).toISOString(), shift_window: 'AM', updated_at: new Date().toISOString() },
  { user_id: 'TC14', on_shift: false, shift_start: null, shift_window: 'PM', updated_at: new Date().toISOString() },
];

const FALLBACK_LEARNING_MODULES: LearningModule[] = [
  { code: 'FOD_AWARENESS', label: 'FOD Awareness', category: 'SAFETY', required_for: ['TUG_CREW','BAG_RUNNER','LEAD','SUPERVISOR','RAMP_AGENT'], display_order: 1, active: true },
  { code: 'PUSHBACK_PROC', label: 'Pushback Procedures', category: 'PROCEDURE', required_for: ['TUG_CREW','LEAD'], display_order: 2, active: true },
  { code: 'SAFETY_BRIEFING', label: 'Daily Safety Briefing', category: 'SAFETY', required_for: ['TUG_CREW','BAG_RUNNER','LEAD','SUPERVISOR','CABIN_CLEANER','FUELER','RAMP_AGENT'], display_order: 3, active: true },
  { code: 'EQUIP_INSPECTION', label: 'Equipment Pre-Use Inspection', category: 'EQUIPMENT', required_for: ['TUG_CREW','BAG_RUNNER','RAMP_AGENT'], display_order: 4, active: true },
  { code: 'HAZMAT_HANDLING', label: 'Hazmat Handling Basics', category: 'COMPLIANCE', required_for: ['TUG_CREW','BAG_RUNNER','LEAD','SUPERVISOR','FUELER','RAMP_AGENT'], display_order: 5, active: true },
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
  let events: RampiqEvent[] = [];

  if (sb) {
    const { data, error } = await sb
      .from('rampiq_events')
      .select('*')
      .eq('reported_by', userId)
      .order('created_at', { ascending: false });
    if (!error && data) events = data as RampiqEvent[];
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
// CREW ASSIGNMENTS
// ============================================================

import type {
  CrewAssignment,
  AssignmentOutcome,
  AssignmentStatus,
} from './rampiq-types';

const FALLBACK_CREW_ASSIGNMENTS: CrewAssignment[] = [
  {
    id: 'seed-alpha-am', created_at: new Date(Date.now() - 7200000).toISOString(),
    team_id: 'ALPHA-AM', assigned_user_ids: ['CM','TC12','BR01','LD03'],
    zone_id: 'T7-NORTH', gate_ids: ['G42B','G47A'], equipment_ids: ['TUG-042','BELT-007'],
    assigned_by: 'LD03', shift_window: 'AM',
    recommendation_id: null, recommended_team_id: null, recommendation_reason: null,
    override_used: false, override_reason: null, override_by: null,
    status: 'ACTIVE', completed_at: null, completed_by: null,
    notes: 'Standard AM assignment — Alpha covers Terminal 7 North gates',
    team_label: 'Alpha Team', zone_label: 'Terminal 7 North', assigned_by_name: 'Lead 3',
  },
  {
    id: 'seed-bravo-pm', created_at: new Date(Date.now() - 3600000).toISOString(),
    team_id: 'BRAVO-PM', assigned_user_ids: ['TC14'],
    zone_id: 'T7-SOUTH', gate_ids: ['G50'], equipment_ids: ['GPU-031'],
    assigned_by: 'TC14', shift_window: 'PM',
    recommendation_id: null, recommended_team_id: null, recommendation_reason: null,
    override_used: false, override_reason: null, override_by: null,
    status: 'ACTIVE', completed_at: null, completed_by: null,
    notes: 'Standard PM assignment — Bravo covers Terminal 7 South',
    team_label: 'Bravo Team', zone_label: 'Terminal 7 South', assigned_by_name: 'Tug Crew 14',
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
    status: 'ACTIVE',
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
  const updates = { status: 'COMPLETED', completed_at: new Date().toISOString(), completed_by: completedBy };
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
  let events: RampiqEvent[] = [];

  if (sb) {
    // Find events overlapping with this assignment's time window and gates
    let query = sb.from('rampiq_events').select('*')
      .gte('created_at', assignment.created_at);
    if (assignment.completed_at) query = query.lte('created_at', assignment.completed_at);
    const { data } = await query;
    if (data) {
      // Filter to events matching this assignment's gates or zone
      events = (data as RampiqEvent[]).filter(e =>
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
