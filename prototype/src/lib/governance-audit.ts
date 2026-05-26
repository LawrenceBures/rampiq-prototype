// RampIQ — Governance Audit Layer
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
export async function emitReplayAudit(input: ReplayAuditInput): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

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
    console.error('[governance] audit emission error:', error.message);
  } else {
    console.log('[governance] replay access logged:', input.accessType, 'by', input.viewerId);
  }
}
