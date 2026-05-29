// SOI — Lifecycle Command Handlers
// Phase 2: Incidents + Recovery Actions
//
// COMMAND PATTERN:
//   1. Validate transition (using operational-states.ts validators)
//   2. Update lifecycle table (current state projection)
//   3. Append rampiq_events row (immutable history)
//
// Every command:
//   - Checks isValidTransition() before mutating
//   - Sets entity_type, entity_id, state_before, state_after
//   - Sets correlation_id, zone_id, causation_event_id where applicable
//   - Sets event_version: 2 (Phase 2 contract)
//
// Transaction note:
//   Supabase JS client does not support multi-table transactions.
//   Commands execute sequentially: lifecycle update → event append.
//   If the event append fails, the lifecycle table is already updated.
//   This is acceptable: the lifecycle table is the current-state authority,
//   and a missing event is a replay gap, not a state inconsistency.
//   Phase 3 may introduce Supabase RPC functions for atomic operations.

import { getSupabase } from './supabase';
import { isValidTransition, EVENT_TYPES } from './operational-states';
import type { IncidentStatus, RecoveryActionStatus, Severity } from './operational-states';
import type {
  Incident,
  RecoveryAction,
  CreateIncidentInput,
  TransitionIncidentInput,
  CreateRecoveryActionInput,
  TransitionRecoveryActionInput,
} from './lifecycle-types';

// ============================================================
// INCIDENT COMMANDS
// ============================================================

/**
 * Create a new incident and emit an incident.detected event.
 * Returns the created incident or null on failure.
 */
export async function createIncident(
  input: CreateIncidentInput,
): Promise<Incident | null> {
  const sb = getSupabase();
  if (!sb) {
    console.error('[lifecycle] createIncident: no Supabase client');
    return null;
  }

  // 1. Insert incident
  const { data: incident, error } = await sb
    .from('rampiq_incidents')
    .insert({
      title: input.title,
      category: input.category ?? null,
      severity: input.severity,
      status: 'DETECTED',
      station: input.station ?? 'LAX',
      zone_id: input.zone_id ?? null,
      gate_id: input.gate_id ?? null,
      flight_id: input.flight_id ?? null,
      affected_gate_ids: input.affected_gate_ids ?? [],
      affected_equipment_ids: input.affected_equipment_ids ?? [],
      created_by: input.created_by,
      assigned_to: input.assigned_to ?? null,
      description: input.description ?? null,
      details_json: input.details_json ?? null,
      source_event_id: input.source_event_id ?? null,
    })
    .select()
    .single();

  if (error || !incident) {
    console.error('[lifecycle] createIncident error:', error?.message);
    return null;
  }

  const inc = incident as Incident;

  // 2. Append event
  await appendLifecycleEvent(sb, {
    event_type: EVENT_TYPES.INCIDENT_DETECTED,
    entity_type: 'incident',
    entity_id: inc.id,
    state_before: null,
    state_after: 'DETECTED',
    severity: inc.severity,
    station: inc.station,
    zone_id: inc.zone_id,
    gate_id: inc.gate_id,
    flight_id: inc.flight_id,
    correlation_id: inc.correlation_id,
    causation_event_id: input.source_event_id ?? null,
    actor_id: input.created_by,
    actor_role: 'CREW_CHIEF',
    notes: input.description ?? null,
    details_json: { title: inc.title, category: inc.category, affected_gate_ids: inc.affected_gate_ids },
  });

  return inc;
}

/**
 * Transition an incident to a new status.
 * Validates the transition, updates the lifecycle table, appends an event.
 */
export async function transitionIncident(
  input: TransitionIncidentInput,
): Promise<Incident | null> {
  const sb = getSupabase();
  if (!sb) {
    console.error('[lifecycle] transitionIncident: no Supabase client');
    return null;
  }

  // Fetch current state
  const { data: current, error: fetchErr } = await sb
    .from('rampiq_incidents')
    .select('*')
    .eq('id', input.incident_id)
    .single();

  if (fetchErr || !current) {
    console.error('[lifecycle] transitionIncident fetch error:', fetchErr?.message);
    return null;
  }

  const inc = current as Incident;
  const stateBefore = inc.status;

  // Validate transition
  if (!isValidTransition('incident', stateBefore, input.new_status)) {
    console.error(`[lifecycle] invalid incident transition: ${stateBefore} → ${input.new_status}`);
    return null;
  }

  // Build update
  const updates: Record<string, unknown> = {
    status: input.new_status,
  };

  // Set timing fields based on target status
  const now = new Date().toISOString();
  switch (input.new_status) {
    case 'CONFIRMED':
      updates.acknowledged_at = now;
      updates.acknowledged_by = input.actor_id;
      if (input.assigned_to) updates.assigned_to = input.assigned_to;
      break;
    case 'RECOVERING':
      updates.recovering_at = now;
      break;
    case 'STABILIZED':
      updates.stabilized_at = now;
      break;
    case 'RESOLVED':
      updates.resolved_at = now;
      break;
    case 'CLOSED':
      updates.closed_at = now;
      break;
  }

  if (input.assigned_to) updates.assigned_to = input.assigned_to;
  if (input.details_json) updates.details_json = { ...(inc.details_json ?? {}), ...input.details_json };

  // Update lifecycle table
  const { data: updated, error: updateErr } = await sb
    .from('rampiq_incidents')
    .update(updates)
    .eq('id', input.incident_id)
    .select()
    .single();

  if (updateErr || !updated) {
    console.error('[lifecycle] transitionIncident update error:', updateErr?.message);
    return null;
  }

  const result = updated as Incident;

  // Map status to event type
  const eventType = INCIDENT_EVENT_MAP[input.new_status];

  // Append event
  await appendLifecycleEvent(sb, {
    event_type: eventType,
    entity_type: 'incident',
    entity_id: inc.id,
    state_before: stateBefore,
    state_after: input.new_status,
    severity: inc.severity,
    station: inc.station,
    zone_id: inc.zone_id,
    gate_id: inc.gate_id,
    flight_id: inc.flight_id,
    correlation_id: inc.correlation_id,
    causation_event_id: null,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    notes: input.notes ?? null,
    details_json: input.details_json ?? null,
  });

  return result;
}

const INCIDENT_EVENT_MAP: Record<IncidentStatus, string> = {
  DETECTED: EVENT_TYPES.INCIDENT_DETECTED,
  CONFIRMED: EVENT_TYPES.INCIDENT_CONFIRMED,
  RECOVERING: EVENT_TYPES.INCIDENT_RECOVERING,
  STABILIZED: EVENT_TYPES.INCIDENT_STABILIZED,
  RESOLVED: EVENT_TYPES.INCIDENT_RESOLVED,
  CLOSED: EVENT_TYPES.INCIDENT_CLOSED,
};

// ============================================================
// RECOVERY ACTION COMMANDS
// ============================================================

/**
 * Create a recovery action under an incident.
 * Inherits correlation_id from the parent incident.
 */
export async function createRecoveryAction(
  input: CreateRecoveryActionInput,
): Promise<RecoveryAction | null> {
  const sb = getSupabase();
  if (!sb) {
    console.error('[lifecycle] createRecoveryAction: no Supabase client');
    return null;
  }

  // Fetch parent incident for correlation_id and context
  const { data: incident, error: incErr } = await sb
    .from('rampiq_incidents')
    .select('correlation_id, station, zone_id, gate_id')
    .eq('id', input.incident_id)
    .single();

  if (incErr || !incident) {
    console.error('[lifecycle] createRecoveryAction: incident not found:', incErr?.message);
    return null;
  }

  const { data: action, error } = await sb
    .from('rampiq_recovery_actions')
    .insert({
      incident_id: input.incident_id,
      title: input.title,
      action_type: input.action_type ?? null,
      severity: input.severity ?? 'MEDIUM',
      status: 'PROPOSED',
      proposed_by: input.proposed_by,
      assigned_to: input.assigned_to ?? null,
      station: incident.station,
      zone_id: input.zone_id ?? incident.zone_id,
      gate_id: input.gate_id ?? incident.gate_id,
      description: input.description ?? null,
      details_json: input.details_json ?? null,
      eta_at: input.eta_at ?? null,
      source_event_id: input.source_event_id ?? null,
      correlation_id: incident.correlation_id,
    })
    .select()
    .single();

  if (error || !action) {
    console.error('[lifecycle] createRecoveryAction error:', error?.message);
    return null;
  }

  const ra = action as RecoveryAction;

  // Append event
  await appendLifecycleEvent(sb, {
    event_type: EVENT_TYPES.RECOVERY_PROPOSED,
    entity_type: 'recovery_action',
    entity_id: ra.id,
    state_before: null,
    state_after: 'PROPOSED',
    severity: ra.severity as Severity,
    station: ra.station,
    zone_id: ra.zone_id,
    gate_id: ra.gate_id,
    flight_id: null,
    correlation_id: incident.correlation_id,
    causation_event_id: input.source_event_id ?? null,
    actor_id: input.proposed_by,
    actor_role: 'CREW_CHIEF',
    notes: input.description ?? null,
    details_json: { title: ra.title, action_type: ra.action_type, incident_id: ra.incident_id },
  });

  return ra;
}

/**
 * Transition a recovery action to a new status.
 */
export async function transitionRecoveryAction(
  input: TransitionRecoveryActionInput,
): Promise<RecoveryAction | null> {
  const sb = getSupabase();
  if (!sb) {
    console.error('[lifecycle] transitionRecoveryAction: no Supabase client');
    return null;
  }

  // Fetch current state
  const { data: current, error: fetchErr } = await sb
    .from('rampiq_recovery_actions')
    .select('*')
    .eq('id', input.action_id)
    .single();

  if (fetchErr || !current) {
    console.error('[lifecycle] transitionRecoveryAction fetch error:', fetchErr?.message);
    return null;
  }

  const ra = current as RecoveryAction;
  const stateBefore = ra.status;

  // Validate transition
  if (!isValidTransition('recovery_action', stateBefore, input.new_status)) {
    console.error(`[lifecycle] invalid recovery_action transition: ${stateBefore} → ${input.new_status}`);
    return null;
  }

  // Build update
  const updates: Record<string, unknown> = {
    status: input.new_status,
  };

  const now = new Date().toISOString();
  switch (input.new_status) {
    case 'ACKNOWLEDGED':
      updates.acknowledged_at = now;
      updates.acknowledged_by = input.actor_id;
      if (input.assigned_to) updates.assigned_to = input.assigned_to;
      break;
    case 'ACTIVE':
      updates.started_at = now;
      break;
    case 'BLOCKED':
      updates.blocked_at = now;
      break;
    case 'COMPLETE':
      updates.completed_at = now;
      break;
    case 'ESCALATED':
      updates.completed_at = now;
      break;
    case 'WITHDRAWN':
      updates.completed_at = now;
      break;
  }

  if (input.assigned_to) updates.assigned_to = input.assigned_to;
  if (input.details_json) updates.details_json = { ...(ra.details_json ?? {}), ...input.details_json };

  // Update lifecycle table
  const { data: updated, error: updateErr } = await sb
    .from('rampiq_recovery_actions')
    .update(updates)
    .eq('id', input.action_id)
    .select()
    .single();

  if (updateErr || !updated) {
    console.error('[lifecycle] transitionRecoveryAction update error:', updateErr?.message);
    return null;
  }

  const result = updated as RecoveryAction;

  // Map status to event type
  const eventType = RECOVERY_EVENT_MAP[input.new_status];

  // Append event
  await appendLifecycleEvent(sb, {
    event_type: eventType,
    entity_type: 'recovery_action',
    entity_id: ra.id,
    state_before: stateBefore,
    state_after: input.new_status,
    severity: ra.severity as Severity,
    station: ra.station,
    zone_id: ra.zone_id,
    gate_id: ra.gate_id,
    flight_id: null,
    correlation_id: ra.correlation_id,
    causation_event_id: null,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    notes: input.notes ?? null,
    details_json: input.details_json ?? null,
  });

  return result;
}

const RECOVERY_EVENT_MAP: Record<RecoveryActionStatus, string> = {
  PROPOSED: EVENT_TYPES.RECOVERY_PROPOSED,
  ACKNOWLEDGED: EVENT_TYPES.RECOVERY_ACKNOWLEDGED,
  ACTIVE: EVENT_TYPES.RECOVERY_ACTIVE,
  BLOCKED: EVENT_TYPES.RECOVERY_BLOCKED,
  COMPLETE: EVENT_TYPES.RECOVERY_COMPLETE,
  ESCALATED: EVENT_TYPES.RECOVERY_ESCALATED,
  WITHDRAWN: EVENT_TYPES.RECOVERY_WITHDRAWN,
};

// ============================================================
// OWNERSHIP COMMANDS — Phase 8
// ============================================================

export interface ReassignInput {
  entity_type: 'incident' | 'recovery_action';
  entity_id: string;
  new_assigned_to: string;
  actor_id: string;
  actor_role: string;
  reason?: string;
}

/**
 * Reassign an incident or recovery action to a different operator.
 * Updates the lifecycle table and emits an ownership event.
 */
export async function reassignEntity(input: ReassignInput): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) { console.error('[lifecycle] reassign: no Supabase client'); return false; }

  const table = input.entity_type === 'incident' ? 'rampiq_incidents' : 'rampiq_recovery_actions';

  // Fetch current state
  const { data: current, error: fetchErr } = await sb
    .from(table).select('*').eq('id', input.entity_id).single();
  if (fetchErr || !current) {
    console.error('[lifecycle] reassign fetch error:', fetchErr?.message);
    return false;
  }

  const previousOwner = current.assigned_to;

  // Update assignment
  const { error: updateErr } = await sb
    .from(table).update({ assigned_to: input.new_assigned_to }).eq('id', input.entity_id);
  if (updateErr) {
    console.error('[lifecycle] reassign update error:', updateErr.message);
    return false;
  }

  // Emit ownership event
  const eventType = input.entity_type === 'incident'
    ? EVENT_TYPES.INCIDENT_REASSIGNED
    : EVENT_TYPES.RECOVERY_REASSIGNED;

  await appendLifecycleEvent(sb, {
    event_type: eventType,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    state_before: previousOwner ?? 'unassigned',
    state_after: input.new_assigned_to,
    severity: current.severity,
    station: current.station,
    zone_id: current.zone_id,
    gate_id: current.gate_id,
    flight_id: current.flight_id ?? null,
    correlation_id: current.correlation_id,
    causation_event_id: null,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    notes: input.reason ?? `Reassigned from ${previousOwner ?? 'unassigned'} to ${input.new_assigned_to}`,
    details_json: { previous_owner: previousOwner, new_owner: input.new_assigned_to, reason: input.reason },
  });

  return true;
}

// ============================================================
// ESCALATION ACTIONS — Phase 8.5
// ============================================================

export interface EscalationActionInput {
  incident_id: string;
  action: 'handoff_request' | 'escalate_to_manager' | 'acknowledge_continue' | 'dismiss';
  actor_id: string;
  actor_role: string;
  target_operator?: string;
  reason?: string;
}

/**
 * Emit an escalation action event. Does NOT change incident status —
 * escalation actions are coordination signals, not lifecycle transitions.
 * All actions are append-only and replay-safe.
 */
export async function emitEscalationAction(input: EscalationActionInput): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) { console.error('[lifecycle] escalation: no Supabase client'); return false; }

  const { data: inc, error: fetchErr } = await sb
    .from('rampiq_incidents').select('*').eq('id', input.incident_id).single();
  if (fetchErr || !inc) {
    console.error('[lifecycle] escalation fetch error:', fetchErr?.message);
    return false;
  }

  const eventTypeMap: Record<string, string> = {
    handoff_request: EVENT_TYPES.INCIDENT_HANDOFF_REQUESTED,
    escalate_to_manager: EVENT_TYPES.ESCALATION_REQUESTED,
    acknowledge_continue: EVENT_TYPES.ESCALATION_ACKNOWLEDGED,
    dismiss: EVENT_TYPES.ESCALATION_DISMISSED,
  };

  // For handoff: update assigned_to if target specified
  if (input.action === 'handoff_request' && input.target_operator) {
    await sb.from('rampiq_incidents').update({ assigned_to: input.target_operator }).eq('id', input.incident_id);
  }

  await appendLifecycleEvent(sb, {
    event_type: eventTypeMap[input.action] ?? 'escalation.unknown',
    entity_type: 'incident',
    entity_id: input.incident_id,
    state_before: inc.assigned_to ?? 'unassigned',
    state_after: input.target_operator ?? inc.assigned_to ?? 'unassigned',
    severity: inc.severity,
    station: inc.station,
    zone_id: inc.zone_id,
    gate_id: inc.gate_id,
    flight_id: inc.flight_id ?? null,
    correlation_id: inc.correlation_id,
    causation_event_id: null,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    notes: input.reason ?? null,
    details_json: { action: input.action, target: input.target_operator, reason: input.reason },
  });

  return true;
}

// ============================================================
// READ HELPERS
// ============================================================

/** Fetch active (non-terminal) incidents. */
export async function fetchActiveIncidents(station?: string): Promise<Incident[]> {
  const sb = getSupabase();
  if (!sb) return [];

  // Apply clear cutoff — ignore incidents before last "clear" action
  let cutoff: string | null = null;
  try { cutoff = typeof window !== 'undefined' ? localStorage.getItem('soi_clear_cutoff') : null; } catch { /* SSR */ }

  let query = sb
    .from('rampiq_incidents')
    .select('*')
    .not('status', 'in', '("RESOLVED","CLOSED")')
    .order('created_at', { ascending: false });

  if (cutoff) query = query.gt('created_at', cutoff);
  if (station) query = query.eq('station', station);

  const { data, error } = await query;
  if (error) {
    console.error('[lifecycle] fetchActiveIncidents error:', error.message);
    return [];
  }
  return (data ?? []) as Incident[];
}

/** Fetch a single incident by ID. */
export async function fetchIncident(id: string): Promise<Incident | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('rampiq_incidents')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as Incident;
}

/** Fetch recovery actions for an incident. */
export async function fetchRecoveryActions(incidentId: string): Promise<RecoveryAction[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let cutoff: string | null = null;
  try { cutoff = typeof window !== 'undefined' ? localStorage.getItem('soi_clear_cutoff') : null; } catch { /* SSR */ }

  let query = sb
    .from('rampiq_recovery_actions')
    .select('*')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: true });

  if (cutoff) query = query.gt('created_at', cutoff);

  const { data, error } = await query;

  if (error) {
    console.error('[lifecycle] fetchRecoveryActions error:', error.message);
    return [];
  }
  return (data ?? []) as RecoveryAction[];
}

/** Fetch active (non-terminal) recovery actions across all incidents. */
export async function fetchActiveRecoveryActions(station?: string): Promise<RecoveryAction[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from('rampiq_recovery_actions')
    .select('*')
    .not('status', 'in', '("COMPLETE","ESCALATED","WITHDRAWN")')
    .order('created_at', { ascending: false });

  if (station) query = query.eq('station', station);

  const { data, error } = await query;
  if (error) {
    console.error('[lifecycle] fetchActiveRecoveryActions error:', error.message);
    return [];
  }
  return (data ?? []) as RecoveryAction[];
}

// ============================================================
// EVENT APPEND (internal)
// ============================================================

interface LifecycleEventInput {
  event_type: string;
  entity_type: string;
  entity_id: string;
  state_before: string | null;
  state_after: string;
  severity: Severity;
  station: string;
  zone_id: string | null;
  gate_id: string | null;
  flight_id: string | null;
  correlation_id: string | null;
  causation_event_id: string | null;
  actor_id: string;
  actor_role: string;
  notes: string | null;
  details_json: Record<string, unknown> | null;
}

/**
 * Append an immutable event to rampiq_events for a lifecycle transition.
 * This is the historical record — the lifecycle table has already been updated.
 */
async function appendLifecycleEvent(
  sb: ReturnType<typeof getSupabase>,
  input: LifecycleEventInput,
): Promise<void> {
  if (!sb) return;

  const { error } = await sb.from('rampiq_events').insert({
    event_type: input.event_type,
    severity: input.severity,
    station: input.station,
    gate_id: input.gate_id ?? undefined,
    flight_id: input.flight_id ?? undefined,
    qr_target_type: 'GATE',
    qr_target_id: input.gate_id ? `LAX-GATE-${input.gate_id}` : 'SYSTEM',
    reported_by: input.actor_id,
    role_type: input.actor_role,
    shift_window: 'AM',
    device_id: `SYSTEM-${input.actor_id}`,
    source_platform: 'DESKTOP',
    notes: input.notes,
    operational_status: 'OPEN',
    sync_status: 'SYNCED',
    // Spine hardening fields
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    state_before: input.state_before,
    state_after: input.state_after,
    causation_event_id: input.causation_event_id,
    correlation_id: input.correlation_id,
    zone_id: input.zone_id,
    event_version: 2,
    details_json: input.details_json,
  });

  if (error) {
    console.error('[lifecycle] appendLifecycleEvent error:', error.message);
  }
}
