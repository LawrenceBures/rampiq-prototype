// RampIQ — Sustained Operational Stress Simulation
// Phase 16: Multi-hour operational timeline with cascading pressure.
//
// RULES:
//   1. Uses lifecycle commands exclusively — same pipeline as everything
//   2. Time-offsets for realistic temporal evolution
//   3. Exercises: incidents, recovery, escalation, reassignment, blockage
//   4. Concurrent multi-zone pressure
//   5. Shift overlap + inherited debt
//   6. Recovery failure loops
//   7. Escalation saturation
//
// This is NOT a test suite — it's an operational realism generator
// that stresses every cognition layer simultaneously.

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

async function backdate(table: string, id: string, field: string, min: number) {
  const sb = getSupabase(); if (!sb) return;
  await sb.from(table).update({ [field]: ago(min) }).eq('id', id);
}

async function backdateEvent(entityId: string, eventType: string, min: number) {
  const sb = getSupabase(); if (!sb) return;
  await sb.from('rampiq_events').update({ created_at: ago(min) }).eq('entity_id', entityId).eq('event_type', eventType);
}

/**
 * Clear all operational data for stress simulation.
 */
export async function clearStressData(): Promise<void> {
  const sb = getSupabase(); if (!sb) return;
  await sb.from('rampiq_recovery_actions').delete().neq('id', '');
  await sb.from('rampiq_incidents').delete().neq('id', '');
  await sb.from('rampiq_events').delete().neq('id', '');
  console.log('[stress] cleared all data');
}

/**
 * Generate a sustained 6-hour operational timeline.
 * Exercises every cognition layer under multi-domain pressure.
 *
 * Timeline:
 *   T-360m  Shift start — calm baseline
 *   T-300m  First equipment issue (resolved quickly)
 *   T-240m  Baggage congestion begins
 *   T-180m  Multi-zone pressure emergence
 *   T-150m  Escalation storm begins
 *   T-120m  Recovery failure loop
 *   T-90m   Shift overlap — inherited debt
 *   T-60m   Concurrent incident storm
 *   T-30m   Cascading destabilization
 *   T-0     Current operational state
 */
export async function runStressSimulation(): Promise<{
  incidentsCreated: number;
  actionsCreated: number;
  escalations: number;
  reassignments: number;
  errors: string[];
}> {
  const sb = getSupabase();
  if (!sb) return { incidentsCreated: 0, actionsCreated: 0, escalations: 0, reassignments: 0, errors: ['No Supabase'] };

  const stats = { incidentsCreated: 0, actionsCreated: 0, escalations: 0, reassignments: 0, errors: [] as string[] };
  console.log('[stress] starting 6-hour operational simulation...');

  // Helper to create + backdate an incident
  async function inc(title: string, sev: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW', zone: string, gate: string, desc: string, by: string, minAgo: number) {
    const i = await createIncident({ title, severity: sev, station: 'LAX', zone_id: zone, gate_id: gate, description: desc, created_by: by });
    if (i) {
      await backdate('rampiq_incidents', i.id, 'created_at', minAgo);
      await backdate('rampiq_incidents', i.id, 'opened_at', minAgo);
      await backdateEvent(i.id, 'incident.detected', minAgo);
      stats.incidentsCreated++;
    }
    return i;
  }

  // ── T-300m: Early resolved issue (establishes history) ──
  const i1 = await inc('GPU cable damage — Gate 52C', 'LOW', 'GATES-52ABC', '52C', 'GPU power cable frayed. Backup GPU deployed.', 'CC01', 300);
  if (i1) {
    await DELAY(80);
    await transitionIncident({ incident_id: i1.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i1.id, 'incident.confirmed', 295);
    await transitionIncident({ incident_id: i1.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i1.id, 'incident.recovering', 290);
    await transitionIncident({ incident_id: i1.id, new_status: 'RESOLVED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i1.id, 'incident.resolved', 270);
  }

  // ── T-240m: Baggage congestion begins ──
  const i2 = await inc('Baggage belt slowdown — Gate 52A', 'MEDIUM', 'GATES-52ABC', '52A', 'Belt speed reduced. Bags accumulating on ramp.', 'CC01', 240);
  if (i2) {
    await DELAY(80);
    await transitionIncident({ incident_id: i2.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i2.id, 'incident.confirmed', 235);
    await transitionIncident({ incident_id: i2.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i2.id, 'incident.recovering', 230);

    const r2a = await createRecoveryAction({ incident_id: i2.id, title: 'Manual belt assist', action_type: 'PERSONNEL', proposed_by: 'CC01', assigned_to: 'RAMP_AGENT', description: '2 agents assisting belt feed.' });
    if (r2a) { await backdate('rampiq_recovery_actions', r2a.id, 'created_at', 228); stats.actionsCreated++; }
  }

  // ── T-180m: Multi-zone pressure ──
  const i3 = await inc('Late inbound UA445 — Gate 52D', 'HIGH', 'GATES-52DEF', '52D', 'UA445 40 min late. Gate occupied by prior departure.', 'CC02', 180);
  if (i3) {
    await DELAY(80);
    await transitionIncident({ incident_id: i3.id, new_status: 'CONFIRMED', actor_id: 'CC02', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i3.id, 'incident.confirmed', 175);
    await transitionIncident({ incident_id: i3.id, new_status: 'RECOVERING', actor_id: 'CC02', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i3.id, 'incident.recovering', 170);

    const r3a = await createRecoveryAction({ incident_id: i3.id, title: 'Request pushback tug', action_type: 'EQUIPMENT_SWAP', proposed_by: 'CC02', assigned_to: 'RAMP_AGENT' });
    if (r3a) {
      await DELAY(60);
      await transitionRecoveryAction({ action_id: r3a.id, new_status: 'ACKNOWLEDGED', actor_id: 'RA14', actor_role: 'RAMP_AGENT' });
      await transitionRecoveryAction({ action_id: r3a.id, new_status: 'BLOCKED', actor_id: 'RA14', actor_role: 'RAMP_AGENT', notes: 'All tugs committed' });
      await backdate('rampiq_recovery_actions', r3a.id, 'created_at', 168);
      stats.actionsCreated++;
    }
  }

  // ── T-150m: Escalation storm ──
  const i4 = await inc('Staffing gap — 3 agents called out', 'HIGH', 'GATES-52ABC', '52B', 'Short-staffed for next 3 inbounds.', 'CC01', 150);
  if (i4) {
    await DELAY(80);
    await transitionIncident({ incident_id: i4.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i4.id, 'incident.confirmed', 145);

    // Escalation
    await emitEscalationAction({ incident_id: i4.id, action: 'escalate_to_manager', actor_id: 'CC01', actor_role: 'CREW_CHIEF', reason: 'Cannot cover 3 inbounds with current staffing' });
    await backdateEvent(i4.id, 'escalation.requested', 140);
    stats.escalations++;

    // Recovery attempts
    const r4a = await createRecoveryAction({ incident_id: i4.id, title: 'Pull agent from 52F', action_type: 'PERSONNEL', proposed_by: 'CC01', assigned_to: 'OPS' });
    if (r4a) {
      await DELAY(60);
      await transitionRecoveryAction({ action_id: r4a.id, new_status: 'WITHDRAWN', actor_id: 'OPS01', actor_role: 'OPS', notes: '52F also short-staffed' });
      await backdate('rampiq_recovery_actions', r4a.id, 'created_at', 138);
      stats.actionsCreated++;
    }
    const r4b = await createRecoveryAction({ incident_id: i4.id, title: 'Request overtime approval', action_type: 'PERSONNEL', proposed_by: 'CC01', assigned_to: 'OPS' });
    if (r4b) {
      await DELAY(60);
      await transitionRecoveryAction({ action_id: r4b.id, new_status: 'BLOCKED', actor_id: 'OPS01', actor_role: 'OPS', notes: 'Supervisor unavailable' });
      await backdate('rampiq_recovery_actions', r4b.id, 'created_at', 130);
      stats.actionsCreated++;
    }
  }

  // ── T-120m: Recovery failure loop ──
  const i5 = await inc('Belt loader BL-042 failure', 'HIGH', 'GATES-52ABC', '52A', 'BL-042 conveyor seized during DL1847 loading.', 'CC01', 120);
  if (i5) {
    await DELAY(80);
    await transitionIncident({ incident_id: i5.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i5.id, 'incident.confirmed', 115);
    await transitionIncident({ incident_id: i5.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await backdateEvent(i5.id, 'incident.recovering', 112);

    // Reassignment: CC01 overwhelmed
    await reassignEntity({ entity_type: 'incident', entity_id: i5.id, new_assigned_to: 'CC02', actor_id: 'CC01', actor_role: 'CREW_CHIEF', reason: 'CC01 at capacity with staffing + baggage' });
    await backdateEvent(i5.id, 'incident.reassigned', 108);
    stats.reassignments++;

    // Multiple recovery failures
    for (let j = 0; j < 3; j++) {
      const rFail = await createRecoveryAction({ incident_id: i5.id, title: `Equipment swap attempt ${j + 1}`, action_type: 'EQUIPMENT_SWAP', proposed_by: 'CC02', assigned_to: 'RAMP_AGENT' });
      if (rFail) {
        await DELAY(50);
        await transitionRecoveryAction({ action_id: rFail.id, new_status: 'WITHDRAWN', actor_id: 'RA14', actor_role: 'RAMP_AGENT', notes: 'No replacement available' });
        await backdate('rampiq_recovery_actions', rFail.id, 'created_at', 105 - j * 10);
        stats.actionsCreated++;
      }
    }

    // Escalation
    await emitEscalationAction({ incident_id: i5.id, action: 'escalate_to_manager', actor_id: 'CC02', actor_role: 'CREW_CHIEF', reason: '3 recovery attempts failed, no equipment available' });
    await backdateEvent(i5.id, 'escalation.requested', 75);
    stats.escalations++;
  }

  // ── T-60m: Concurrent incident storm ──
  const stormIncidents = [
    { title: 'FOD on taxiway near 52E', sev: 'CRITICAL' as const, zone: 'GATES-52DEF', gate: '52E', by: 'CC02' },
    { title: 'Fuel truck delay — Gate 52G', sev: 'MEDIUM' as const, zone: 'GATES-52GHI', gate: '52G', by: 'OPS01' },
    { title: 'Crew no-show — DL892 at 52B', sev: 'HIGH' as const, zone: 'GATES-52ABC', gate: '52B', by: 'CC01' },
  ];

  for (let j = 0; j < stormIncidents.length; j++) {
    const s = stormIncidents[j];
    const si = await inc(s.title, s.sev, s.zone, s.gate, '', s.by, 60 - j * 5);
    if (si) {
      await DELAY(60);
      await transitionIncident({ incident_id: si.id, new_status: 'CONFIRMED', actor_id: s.by, actor_role: 'CREW_CHIEF' });
      await backdateEvent(si.id, 'incident.confirmed', 55 - j * 5);

      if (s.sev === 'CRITICAL') {
        await emitEscalationAction({ incident_id: si.id, action: 'escalate_to_manager', actor_id: s.by, actor_role: 'CREW_CHIEF', reason: 'CRITICAL FOD incident requires ops director visibility' });
        await backdateEvent(si.id, 'escalation.requested', 52 - j * 5);
        stats.escalations++;
      }
    }
  }

  // ── T-30m: Cascading destabilization ──
  const i8 = await inc('Ground stop — weather hold all departures', 'CRITICAL', 'GATES-52DEF', '52D', 'FAA weather hold. All departures frozen. Gates blocked.', 'OPS01', 30);
  if (i8) {
    await DELAY(80);
    await transitionIncident({ incident_id: i8.id, new_status: 'CONFIRMED', actor_id: 'OPS01', actor_role: 'OPS' });
    await backdateEvent(i8.id, 'incident.confirmed', 28);

    await emitEscalationAction({ incident_id: i8.id, action: 'escalate_to_manager', actor_id: 'OPS01', actor_role: 'OPS', reason: 'Station-wide weather hold — all zones affected' });
    await backdateEvent(i8.id, 'escalation.requested', 25);
    stats.escalations++;
  }

  // ── Feed events for texture ──
  const feedEvents = [
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52A', reported_by: 'RA14', mins_ago: 305 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52D', reported_by: 'RA03', mins_ago: 185 },
    { event_type: 'EQUIPMENT_FAILURE', severity: 'HIGH', gate_id: '52A', equipment_id: 'BL-042', reported_by: 'RA14', mins_ago: 122 },
    { event_type: 'service.started', severity: 'LOW', gate_id: '52B', reported_by: 'RA07', mins_ago: 65 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52E', reported_by: 'RA08', mins_ago: 58 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52G', reported_by: 'RA12', mins_ago: 42 },
  ];

  for (const ev of feedEvents) {
    await sb.from('rampiq_events').insert({
      event_type: ev.event_type, severity: ev.severity, station: 'LAX',
      gate_id: ev.gate_id, equipment_id: (ev as Record<string, unknown>).equipment_id ?? undefined,
      qr_target_type: 'GATE', qr_target_id: `LAX-GATE-${ev.gate_id}`,
      reported_by: ev.reported_by, role_type: 'RAMP_AGENT', shift_window: 'AM',
      device_id: `MOB-${ev.reported_by}`, source_platform: 'MOBILE',
      notes: null, operational_status: 'RESOLVED', sync_status: 'SYNCED',
      created_at: ago(ev.mins_ago),
    });
  }

  console.log(`[stress] simulation complete: ${stats.incidentsCreated} incidents, ${stats.actionsCreated} actions, ${stats.escalations} escalations, ${stats.reassignments} reassignments`);
  return stats;
}
