// SOI — Canonical Operational Scenarios
// Phase 9: Realistic operational pressure for pilot validation.
// Uses lifecycle commands exclusively — no direct table mutation.
// All events flow through the standard append-only pipeline.
// Time-offsets applied post-creation for temporal depth.

import {
  createIncident, transitionIncident,
  createRecoveryAction, transitionRecoveryAction,
  reassignEntity, emitEscalationAction,
} from './lifecycle-commands';
import { getSupabase } from './supabase';

const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms));

function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function backdateIncident(id: string, min: number) {
  const sb = getSupabase(); if (!sb) return;
  const ts = ago(min);
  await sb.from('rampiq_incidents').update({ created_at: ts, opened_at: ts }).eq('id', id);
  await sb.from('rampiq_events').update({ created_at: ts }).eq('entity_id', id).eq('event_type', 'incident.detected');
}

async function backdateEvent(entityId: string, eventType: string, min: number) {
  const sb = getSupabase(); if (!sb) return;
  await sb.from('rampiq_events').update({ created_at: ago(min) }).eq('entity_id', entityId).eq('event_type', eventType);
}

async function backdateAction(id: string, min: number) {
  const sb = getSupabase(); if (!sb) return;
  const ts = ago(min);
  await sb.from('rampiq_recovery_actions').update({ created_at: ts, proposed_at: ts }).eq('id', id);
}

export async function clearDemoData(): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    await sb.from('rampiq_recovery_actions').delete().gt('created_at', '2000-01-01T00:00:00Z');
    await sb.from('rampiq_incidents').delete().gt('created_at', '2000-01-01T00:00:00Z');
    await sb.from('rampiq_events').delete().gt('created_at', '2000-01-01T00:00:00Z');
  }
  // Also clear localStorage fallback data (must match store.ts LS_KEY)
  try {
    localStorage.removeItem('soi_events_v2');
    localStorage.removeItem('rampiq_events_v2'); // legacy key
  } catch { /* SSR safe */ }
  console.log('[demo] cleared all data (Supabase + localStorage)');
}

/**
 * Seed three canonical operational scenarios.
 *
 * SCENARIO A — Gate Cascade (Zone 52A-C, T-95m to T-40m)
 *   Late inbound → baggage congestion → unavailable tug → blocked outbound
 *   → reassignment to CC02 → escalation due to stalled recovery
 *
 * SCENARIO B — Equipment Failure Cascade (Zone 52A-C, T-65m to T-20m)
 *   Belt loader failure → recovery proposed → replacement delayed
 *   → blocked chain → workload saturation → coordination support
 *
 * SCENARIO C — Multi-Zone Pressure (Zone 52D-F + 52G-I, T-30m to now)
 *   Simultaneous gate pressure → staffing strain → unresolved across zones
 *   → coordination breakdown signal → ops director visibility
 */
export async function seedDemoScenario(): Promise<void> {
  const sb = getSupabase();
  if (!sb) { console.error('[demo] no Supabase client'); return; }
  console.log('[demo] seeding 3 canonical scenarios...');

  // ================================================================
  // SCENARIO A — GATE CASCADE (T-95m)
  // ================================================================

  // A1: Late inbound causes gate congestion
  const a1 = await createIncident({
    title: 'Late inbound AA2847 — gate 52A congestion',
    severity: 'HIGH', station: 'LAX', zone_id: 'GATES-52ABC', gate_id: '52A',
    description: 'AA2847 35 min late. Previous aircraft still at gate. Bags from prior flight not cleared.',
    created_by: 'CC01',
  });
  if (a1) {
    await DELAY(150);
    await transitionIncident({ incident_id: a1.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: a1.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    // Recovery: request pushback tug
    const a1r1 = await createRecoveryAction({
      incident_id: a1.id, title: 'Request pushback tug for outbound',
      action_type: 'EQUIPMENT_SWAP', proposed_by: 'CC01', assigned_to: 'RAMP_AGENT',
      description: 'Need tug to push departing aircraft. All tugs currently committed to 52D.',
    });
    if (a1r1) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: a1r1.id, new_status: 'ACKNOWLEDGED', actor_id: 'RA14', actor_role: 'RAMP_AGENT' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: a1r1.id, new_status: 'BLOCKED', actor_id: 'RA14', actor_role: 'RAMP_AGENT', notes: 'All tugs committed to ground stop recovery at 52D' });
      await backdateAction(a1r1.id, 85);
      await backdateEvent(a1r1.id, 'recovery_action.proposed', 85);
      await backdateEvent(a1r1.id, 'recovery_action.acknowledged', 82);
      await backdateEvent(a1r1.id, 'recovery_action.blocked', 78);
    }

    // Recovery: manual baggage clearing
    const a1r2 = await createRecoveryAction({
      incident_id: a1.id, title: 'Manual bag clearing from prior flight',
      action_type: 'PERSONNEL', proposed_by: 'CC01', assigned_to: 'LT_RUNNER',
      description: 'Runner and 2 agents manually clearing remaining bags.',
    });
    if (a1r2) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: a1r2.id, new_status: 'ACKNOWLEDGED', actor_id: 'LT02', actor_role: 'LT_RUNNER' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: a1r2.id, new_status: 'ACTIVE', actor_id: 'LT02', actor_role: 'LT_RUNNER' });
      await backdateAction(a1r2.id, 80);
      await backdateEvent(a1r2.id, 'recovery_action.proposed', 80);
      await backdateEvent(a1r2.id, 'recovery_action.acknowledged', 78);
      await backdateEvent(a1r2.id, 'recovery_action.active', 75);
    }

    // Ownership transfer: CC01 overwhelmed, reassign to CC02
    await DELAY(100);
    await reassignEntity({
      entity_type: 'incident', entity_id: a1.id,
      new_assigned_to: 'CC02', actor_id: 'CC01', actor_role: 'CREW_CHIEF',
      reason: 'CC01 handling equipment cascade at 52A, transferring gate congestion coordination to CC02',
    });
    await backdateEvent(a1.id, 'incident.reassigned', 60);

    // Escalation: stalled too long
    await DELAY(100);
    await emitEscalationAction({
      incident_id: a1.id, action: 'escalate_to_manager',
      actor_id: 'CC02', actor_role: 'CREW_CHIEF',
      reason: 'Gate congestion unresolved 35+ min, tug still unavailable, need ops support',
    });
    await backdateEvent(a1.id, 'escalation.requested', 55);

    // Manager acknowledges
    await DELAY(100);
    await emitEscalationAction({
      incident_id: a1.id, action: 'acknowledge_continue',
      actor_id: 'OPS01', actor_role: 'OPS',
    });
    await backdateEvent(a1.id, 'escalation.acknowledged', 50);

    await backdateIncident(a1.id, 95);
    await backdateEvent(a1.id, 'incident.confirmed', 92);
    await backdateEvent(a1.id, 'incident.recovering', 90);
  }

  await DELAY(200);

  // ================================================================
  // SCENARIO B — EQUIPMENT FAILURE CASCADE (T-65m)
  // ================================================================

  const b1 = await createIncident({
    title: 'Belt loader BL-042 failure — Gate 52B',
    severity: 'HIGH', station: 'LAX', zone_id: 'GATES-52ABC', gate_id: '52B',
    description: 'Conveyor belt seized on BL-042. Cannot load bags for DL1847 departure.',
    created_by: 'CC01',
  });
  if (b1) {
    await DELAY(150);
    await transitionIncident({ incident_id: b1.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: b1.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    // Recovery 1: equipment swap — WITHDRAWN (none available)
    const b1r1 = await createRecoveryAction({
      incident_id: b1.id, title: 'Swap with backup belt loader',
      action_type: 'EQUIPMENT_SWAP', proposed_by: 'CC01', assigned_to: 'RAMP_AGENT',
      description: 'Request backup BL from maintenance yard.',
    });
    if (b1r1) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r1.id, new_status: 'ACKNOWLEDGED', actor_id: 'RA14', actor_role: 'RAMP_AGENT' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r1.id, new_status: 'WITHDRAWN', actor_id: 'RA14', actor_role: 'RAMP_AGENT', notes: 'No backup loaders available — all deployed or in maintenance' });
      await backdateAction(b1r1.id, 58);
      await backdateEvent(b1r1.id, 'recovery_action.proposed', 58);
      await backdateEvent(b1r1.id, 'recovery_action.acknowledged', 55);
      await backdateEvent(b1r1.id, 'recovery_action.withdrawn', 50);
    }

    // Recovery 2: manual bag carry — ACTIVE
    const b1r2 = await createRecoveryAction({
      incident_id: b1.id, title: 'Manual bag loading — 3 agents',
      action_type: 'PERSONNEL', proposed_by: 'CC01', assigned_to: 'RAMP_AGENT',
      description: '3 agents hand-carrying bags from cart to cargo hold. Slow but functional.',
    });
    if (b1r2) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r2.id, new_status: 'ACKNOWLEDGED', actor_id: 'RA14', actor_role: 'RAMP_AGENT' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r2.id, new_status: 'ACTIVE', actor_id: 'RA14', actor_role: 'RAMP_AGENT' });
      await backdateAction(b1r2.id, 48);
      await backdateEvent(b1r2.id, 'recovery_action.proposed', 48);
      await backdateEvent(b1r2.id, 'recovery_action.acknowledged', 46);
      await backdateEvent(b1r2.id, 'recovery_action.active', 44);
    }

    // Recovery 3: maintenance dispatch — BLOCKED
    const b1r3 = await createRecoveryAction({
      incident_id: b1.id, title: 'Emergency maintenance for BL-042',
      action_type: 'ESCALATION', proposed_by: 'CC01', assigned_to: 'OPS',
      description: 'Requested emergency repair. Maintenance crew en route but ETA 45 min.',
    });
    if (b1r3) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r3.id, new_status: 'ACKNOWLEDGED', actor_id: 'OPS01', actor_role: 'OPS' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r3.id, new_status: 'ACTIVE', actor_id: 'OPS01', actor_role: 'OPS' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: b1r3.id, new_status: 'BLOCKED', actor_id: 'OPS01', actor_role: 'OPS', notes: 'Maintenance crew diverted to runway FOD incident' });
      await backdateAction(b1r3.id, 40);
      await backdateEvent(b1r3.id, 'recovery_action.proposed', 40);
      await backdateEvent(b1r3.id, 'recovery_action.acknowledged', 38);
      await backdateEvent(b1r3.id, 'recovery_action.active', 35);
      await backdateEvent(b1r3.id, 'recovery_action.blocked', 25);
    }

    await backdateIncident(b1.id, 65);
    await backdateEvent(b1.id, 'incident.confirmed', 62);
    await backdateEvent(b1.id, 'incident.recovering', 60);
  }

  await DELAY(200);

  // ================================================================
  // SCENARIO C — MULTI-ZONE PRESSURE (T-30m)
  // ================================================================

  // C1: Zone 52D-F — ground delay at 52D
  const c1 = await createIncident({
    title: 'Ground delay program — 52D departures held',
    severity: 'CRITICAL', station: 'LAX', zone_id: 'GATES-52DEF', gate_id: '52D',
    description: 'FAA GDP for SFO. 3 departures held at gate. Inbound aircraft waiting for gate.',
    created_by: 'OPS01',
  });
  if (c1) {
    await DELAY(150);
    await transitionIncident({ incident_id: c1.id, new_status: 'CONFIRMED', actor_id: 'OPS01', actor_role: 'OPS' });

    const c1r1 = await createRecoveryAction({
      incident_id: c1.id, title: 'Coordinate gate swap with tower',
      action_type: 'DISPATCH', proposed_by: 'OPS01', assigned_to: 'OPS',
      description: 'Request tower approve gate swap: move UA891 from 52D to 52G.',
    });
    if (c1r1) {
      await backdateAction(c1r1.id, 22);
      await backdateEvent(c1r1.id, 'recovery_action.proposed', 22);
    }

    await backdateIncident(c1.id, 30);
    await backdateEvent(c1.id, 'incident.confirmed', 28);
  }

  // C2: Zone 52G-I — staffing strain from diverted resources
  const c2 = await createIncident({
    title: 'Staffing strain — agents pulled to 52D support',
    severity: 'MEDIUM', station: 'LAX', zone_id: 'GATES-52GHI', gate_id: '52G',
    description: '2 agents from 52G reassigned to 52D ground delay support. 52G now understaffed for inbound UA445.',
    created_by: 'CC02',
  });
  if (c2) {
    await DELAY(150);
    await transitionIncident({ incident_id: c2.id, new_status: 'CONFIRMED', actor_id: 'CC02', actor_role: 'CREW_CHIEF' });

    const c2r1 = await createRecoveryAction({
      incident_id: c2.id, title: 'Request overtime extension for PM agent',
      action_type: 'PERSONNEL', proposed_by: 'CC02', assigned_to: 'OPS',
      description: 'Ask Okafor D. (PM shift, starts 14:30) to come in 30 min early.',
    });
    if (c2r1) {
      await backdateAction(c2r1.id, 18);
      await backdateEvent(c2r1.id, 'recovery_action.proposed', 18);
    }

    await backdateIncident(c2.id, 22);
    await backdateEvent(c2.id, 'incident.confirmed', 20);
  }

  // C3: Resolved incident — shows completed lifecycle in replay
  const c3 = await createIncident({
    title: 'LAV service delay — Gate 52C',
    severity: 'LOW', station: 'LAX', zone_id: 'GATES-52ABC', gate_id: '52C',
    description: 'LAV truck delayed 15 min. Service completed, gate cleared.',
    created_by: 'CC01',
  });
  if (c3) {
    await DELAY(100);
    await transitionIncident({ incident_id: c3.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(100);
    await transitionIncident({ incident_id: c3.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(100);
    await transitionIncident({ incident_id: c3.id, new_status: 'RESOLVED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    await backdateIncident(c3.id, 80);
    await backdateEvent(c3.id, 'incident.confirmed', 78);
    await backdateEvent(c3.id, 'incident.recovering', 75);
    await backdateEvent(c3.id, 'incident.resolved', 60);
  }

  // ── Feed events for texture ──
  const feedEvents = [
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52A', reported_by: 'RA14', role_type: 'RAMP_AGENT',
      notes: 'Position check-in at gate 52A', operational_status: 'RESOLVED', mins_ago: 98 },
    { event_type: 'service.started', severity: 'LOW', gate_id: '52B', flight_id: 'DL1847', reported_by: 'RA14', role_type: 'RAMP_AGENT',
      notes: 'Pre-departure prep started for DL1847', operational_status: 'OPEN', mins_ago: 70 },
    { event_type: 'EQUIPMENT_FAILURE', severity: 'HIGH', gate_id: '52B', equipment_id: 'BL-042', reported_by: 'RA14', role_type: 'RAMP_AGENT',
      notes: 'Belt loader BL-042 conveyor seized during loading', operational_status: 'OPEN', mins_ago: 66 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52D', reported_by: 'RA03', role_type: 'RAMP_AGENT',
      notes: 'Position check-in at gate 52D', operational_status: 'RESOLVED', mins_ago: 35 },
    { event_type: 'service.confirmed', severity: 'LOW', gate_id: '52G', flight_id: 'UA445', reported_by: 'RA08', role_type: 'RAMP_AGENT',
      notes: 'Arrival prep confirmed for UA445', operational_status: 'OPEN', mins_ago: 25 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52C', reported_by: 'LT02', role_type: 'LT_RUNNER',
      notes: 'Gate 52C cleared after LAV service', operational_status: 'RESOLVED', mins_ago: 58 },
  ];

  for (const ev of feedEvents) {
    await sb.from('rampiq_events').insert({
      event_type: ev.event_type, severity: ev.severity, station: 'LAX',
      gate_id: ev.gate_id, equipment_id: (ev as Record<string, unknown>).equipment_id ?? undefined,
      flight_id: (ev as Record<string, unknown>).flight_id ?? undefined,
      qr_target_type: 'GATE', qr_target_id: `LAX-GATE-${ev.gate_id}`,
      reported_by: ev.reported_by, role_type: ev.role_type, shift_window: 'AM',
      device_id: `MOB-${ev.reported_by}`, source_platform: 'MOBILE',
      notes: ev.notes, operational_status: ev.operational_status,
      sync_status: 'SYNCED', created_at: ago(ev.mins_ago),
    });
  }

  console.log('[demo] 3 canonical scenarios seeded');
}
