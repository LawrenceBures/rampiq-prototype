// SOI — Governance Audit Layer
// Phase 9: Replay access logging as enforceable infrastructure.
//
// Every invocation of individual accountability replay, cross-zone
// replay, or ops_director replay access emits an append-only audit
// event to rampiq_events.
//
// "Who reviewed whose accountability timeline and when?"
//
// RULES:
//   1. Audit events are append-only (same as all operational events)
//   2. Audit events are replayable (governance becomes auditable)
//   3. No separate audit store — uses existing rampiq_events table
//   4. No blocking — audit emission is fire-and-forget
//   5. Viewer identity is always recorded

import { getSupabase } from './supabase';
import { EVENT_TYPES } from './operational-states';

export interface ReplayAuditInput {
  /** Who is viewing */
  viewerId: string;
  /** Viewer's role */
  viewerRole: string;
  /** Type of replay access */
  accessType: 'individual' | 'cross_zone' | 'accountability_review';
  /** Target operator(s) being reviewed (for individual/accountability) */
  targetOperators?: string[];
  /** Zone scope (for cross_zone) */
  zoneScope?: string;
  /** Replay timestamp being viewed */
  replayTimestamp: string;
  /** Optional context/reason */
  reason?: string;
}

/**
 * Emit a governance audit event for replay access.
 * Fire-and-forget — does not block the replay operation.
 */
/**
 * Emit a governance audit event. Returns true on success, false on failure.
 * Callers MUST await this and fail-closed if it returns false.
 */
export async function emitReplayAudit(input: ReplayAuditInput): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) { console.error('[governance] AUDIT FAILED — no Supabase client'); return false; }

  const eventTypeMap: Record<string, string> = {
    individual: EVENT_TYPES.REPLAY_INDIVIDUAL_ACCESSED,
    cross_zone: EVENT_TYPES.REPLAY_CROSS_ZONE_ACCESSED,
    accountability_review: EVENT_TYPES.REPLAY_ACCOUNTABILITY_REVIEWED,
  };

  const { error } = await sb.from('rampiq_events').insert({
    event_type: eventTypeMap[input.accessType] ?? 'replay.accessed',
    severity: 'LOW',
    station: 'LAX',
    qr_target_type: 'SYSTEM',
    qr_target_id: 'GOVERNANCE-AUDIT',
    reported_by: input.viewerId,
    role_type: input.viewerRole,
    shift_window: 'AM',
    device_id: `DESKTOP-${input.viewerId}`,
    source_platform: 'DESKTOP',
    notes: input.reason ?? null,
    operational_status: 'RESOLVED',
    sync_status: 'SYNCED',
    entity_type: 'governance',
    entity_id: input.viewerId,
    state_before: null,
    state_after: input.accessType,
    correlation_id: null,
    causation_event_id: null,
    zone_id: input.zoneScope ?? null,
    event_version: 2,
    details_json: {
      access_type: input.accessType,
      viewer_id: input.viewerId,
      viewer_role: input.viewerRole,
      target_operators: input.targetOperators ?? [],
      replay_timestamp: input.replayTimestamp,
      reason: input.reason,
    },
  });

  if (error) {
    console.error('[governance] AUDIT FAILED — replay access NOT logged:', error.message);
    return false;
  }
  console.log('[governance] replay access logged:', input.accessType, 'by', input.viewerId);
  return true;
}

// ============================================================
// WORKFORCE INTELLIGENCE AUDIT
// ============================================================

export interface WorkforceAuditInput {
  viewerId: string;
  viewerRole: string;
  accessType: 'analytics_accessed' | 'individual_context_opened' | 'pattern_reviewed';
  targetOperator?: string;
  reason?: string;
}

/**
 * Emit workforce intelligence access audit event.
 * Fail-closed — returns false on failure.
 */
export async function emitWorkforceAudit(input: WorkforceAuditInput): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) { console.error('[governance] WORKFORCE AUDIT FAILED — no Supabase'); return false; }

  const eventTypeMap: Record<string, string> = {
    analytics_accessed: EVENT_TYPES.WORKFORCE_ANALYTICS_ACCESSED,
    individual_context_opened: EVENT_TYPES.WORKFORCE_INDIVIDUAL_OPENED,
    pattern_reviewed: EVENT_TYPES.WORKFORCE_PATTERN_REVIEWED,
  };

  const { error } = await sb.from('rampiq_events').insert({
    event_type: eventTypeMap[input.accessType] ?? 'workforce.accessed',
    severity: 'LOW', station: 'LAX',
    qr_target_type: 'SYSTEM', qr_target_id: 'GOVERNANCE-WORKFORCE',
    reported_by: input.viewerId, role_type: input.viewerRole,
    shift_window: 'AM', device_id: `DESKTOP-${input.viewerId}`,
    source_platform: 'DESKTOP', notes: input.reason ?? null,
    operational_status: 'RESOLVED', sync_status: 'SYNCED',
    entity_type: 'governance', entity_id: input.targetOperator ?? input.viewerId,
    state_before: null, state_after: input.accessType,
    event_version: 2,
    details_json: {
      access_type: input.accessType, viewer_id: input.viewerId,
      viewer_role: input.viewerRole, target_operator: input.targetOperator,
      reason: input.reason,
    },
  });

  if (error) {
    console.error('[governance] WORKFORCE AUDIT FAILED:', error.message);
    return false;
  }
  console.log('[governance] workforce access logged:', input.accessType, 'by', input.viewerId);
  return true;
}
