// RampIQ — Demo scenario seeder.
// Creates believable operational pressure for demonstration.
// Uses lifecycle commands — no direct table mutation.
// All events flow through the standard append-only pipeline.
// Time-offsets are applied post-creation for temporal depth.

import { createIncident, transitionIncident, createRecoveryAction, transitionRecoveryAction } from './lifecycle-commands';
import { getSupabase } from './supabase';

const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Offset a timestamp backwards by minutes */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Back-date an incident and its events for temporal realism */
async function backdateIncident(incidentId: string, minutesAgo: number) {
  const sb = getSupabase();
  if (!sb) return;
  const ts = ago(minutesAgo);
  await sb.from('rampiq_incidents').update({ created_at: ts, opened_at: ts }).eq('id', incidentId);
  // Back-date the detection event
  await sb.from('rampiq_events').update({ created_at: ts })
    .eq('entity_id', incidentId).eq('event_type', 'incident.detected');
}

/** Back-date a transition event */
async function backdateEvent(entityId: string, eventType: string, minutesAgo: number) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('rampiq_events').update({ created_at: ago(minutesAgo) })
    .eq('entity_id', entityId).eq('event_type', eventType);
}

/** Back-date a recovery action */
async function backdateAction(actionId: string, minutesAgo: number) {
  const sb = getSupabase();
  if (!sb) return;
  const ts = ago(minutesAgo);
  await sb.from('rampiq_recovery_actions').update({ created_at: ts, proposed_at: ts }).eq('id', actionId);
}

/**
 * Clear all demo/test data from incidents, recovery actions, and events.
 * Preserves table structure. For demo reset only.
 */
export async function clearDemoData(): Promise<void> {
  const sb = getSupabase();
  if (!sb) { console.error('[demo] no Supabase client'); return; }

  await sb.from('rampiq_recovery_actions').delete().neq('id', '');
  await sb.from('rampiq_incidents').delete().neq('id', '');
  await sb.from('rampiq_events').delete().neq('id', '');
  console.log('[demo] cleared all data');
}

/**
 * Seed a coherent operational scenario at LAX.
 * Timeline spans ~2 hours of realistic AM shift pressure.
 *
 * Narrative:
 *   T-105m  LAV spill at 52C (resolved by T-85m)
 *   T-55m   Belt loader jam at 52A (recovering, crew dispatched)
 *   T-35m   Staffing shortage at 52B (confirmed, awaiting ops)
 *   T-18m   Ground stop — 3 flights holding at 52D (recovering, re-gate + crew staged)
 */
export async function seedDemoScenario(): Promise<void> {
  const sb = getSupabase();
  if (!sb) { console.error('[demo] no Supabase client'); return; }

  console.log('[demo] seeding operational scenario...');

  // ── Scenario 1: LAV spill at 52C — RESOLVED (T-105m) ──
  const inc1 = await createIncident({
    title: 'LAV cart spill — Gate 52C apron',
    severity: 'HIGH',
    station: 'LAX',
    zone_id: 'GATES-52ABC',
    gate_id: '52C',
    description: 'LAV cart hose disconnected during service. Spill contained to drain area.',
    created_by: 'LT05',
  });
  if (inc1) {
    await DELAY(150);
    await transitionIncident({ incident_id: inc1.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: inc1.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    const ra1 = await createRecoveryAction({
      incident_id: inc1.id,
      title: 'Hazmat cleanup crew',
      action_type: 'ESCALATION',
      proposed_by: 'CC01',
      assigned_to: 'LAV_TECH',
      description: 'LAV team dispatched for spill containment and hose repair.',
    });
    if (ra1) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra1.id, new_status: 'ACKNOWLEDGED', actor_id: 'LV02', actor_role: 'LAV_TECH' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra1.id, new_status: 'ACTIVE', actor_id: 'LV02', actor_role: 'LAV_TECH' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra1.id, new_status: 'COMPLETE', actor_id: 'LV02', actor_role: 'LAV_TECH' });
      await backdateAction(ra1.id, 100);
      await backdateEvent(ra1.id, 'recovery_action.proposed', 100);
      await backdateEvent(ra1.id, 'recovery_action.acknowledged', 97);
      await backdateEvent(ra1.id, 'recovery_action.active', 95);
      await backdateEvent(ra1.id, 'recovery_action.complete', 85);
    }
    await DELAY(150);
    await transitionIncident({ incident_id: inc1.id, new_status: 'STABILIZED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: inc1.id, new_status: 'RESOLVED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    // Back-date the incident timeline
    await backdateIncident(inc1.id, 105);
    await backdateEvent(inc1.id, 'incident.confirmed', 103);
    await backdateEvent(inc1.id, 'incident.recovering', 101);
    await backdateEvent(inc1.id, 'incident.stabilized', 88);
    await backdateEvent(inc1.id, 'incident.resolved', 85);
  }

  await DELAY(200);

  // ── Scenario 2: Belt loader failure at 52A (T-55m, RECOVERING) ──
  const inc2 = await createIncident({
    title: 'Belt loader jam — Gate 52A',
    severity: 'HIGH',
    station: 'LAX',
    zone_id: 'GATES-52ABC',
    gate_id: '52A',
    description: 'Conveyor belt seized on loader unit BL-042. Bags backing up on ramp.',
    created_by: 'CC01',
  });
  if (inc2) {
    await DELAY(150);
    await transitionIncident({ incident_id: inc2.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: inc2.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    const ra2a = await createRecoveryAction({
      incident_id: inc2.id,
      title: 'Swap belt loader from 52D apron',
      action_type: 'EQUIPMENT_SWAP',
      proposed_by: 'CC01',
      assigned_to: 'RAMP_AGENT',
      description: 'Pull backup BL-088 from 52D. ETA 8 min.',
    });
    if (ra2a) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra2a.id, new_status: 'ACKNOWLEDGED', actor_id: 'RA03', actor_role: 'RAMP_AGENT' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra2a.id, new_status: 'ACTIVE', actor_id: 'RA03', actor_role: 'RAMP_AGENT' });
      await backdateAction(ra2a.id, 48);
      await backdateEvent(ra2a.id, 'recovery_action.proposed', 48);
      await backdateEvent(ra2a.id, 'recovery_action.acknowledged', 45);
      await backdateEvent(ra2a.id, 'recovery_action.active', 42);
    }

    const ra2b = await createRecoveryAction({
      incident_id: inc2.id,
      title: 'Manual bag carry for priority pax',
      action_type: 'PERSONNEL',
      proposed_by: 'CC01',
      assigned_to: 'LT_RUNNER',
      description: 'Runner handling 4 priority bags manually until swap complete.',
    });
    if (ra2b) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra2b.id, new_status: 'ACKNOWLEDGED', actor_id: 'LT02', actor_role: 'LT_RUNNER' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra2b.id, new_status: 'ACTIVE', actor_id: 'LT02', actor_role: 'LT_RUNNER' });
      await backdateAction(ra2b.id, 44);
      await backdateEvent(ra2b.id, 'recovery_action.proposed', 44);
      await backdateEvent(ra2b.id, 'recovery_action.acknowledged', 42);
      await backdateEvent(ra2b.id, 'recovery_action.active', 40);
    }

    await backdateIncident(inc2.id, 55);
    await backdateEvent(inc2.id, 'incident.confirmed', 52);
    await backdateEvent(inc2.id, 'incident.recovering', 50);
  }

  await DELAY(200);

  // ── Scenario 3: Staffing gap at 52B (T-35m, CONFIRMED) ──
  const inc3 = await createIncident({
    title: 'Staffing shortage — 2 agents out',
    severity: 'MEDIUM',
    station: 'LAX',
    zone_id: 'GATES-52ABC',
    gate_id: '52B',
    description: 'Martinez and Chen called out. Gate 52B inbound AA1247 in 22 min, need minimum 3 agents.',
    created_by: 'CC01',
  });
  if (inc3) {
    await DELAY(150);
    await transitionIncident({ incident_id: inc3.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    // First attempt: pull from 52F — WITHDRAWN (agent unavailable)
    const ra3a = await createRecoveryAction({
      incident_id: inc3.id,
      title: 'Pull agent from 52F (low-activity)',
      action_type: 'PERSONNEL',
      proposed_by: 'CC01',
      assigned_to: 'OPS',
      description: 'Request ops re-assign one agent from 52F apron. 52F next inbound not until 14:40.',
    });
    if (ra3a) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra3a.id, new_status: 'ACKNOWLEDGED', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra3a.id, new_status: 'WITHDRAWN', actor_id: 'OPS01', actor_role: 'CREW_CHIEF', notes: '52F agent already reassigned to 52D ground stop' });
      await backdateAction(ra3a.id, 32);
      await backdateEvent(ra3a.id, 'recovery_action.proposed', 32);
      await backdateEvent(ra3a.id, 'recovery_action.acknowledged', 30);
      await backdateEvent(ra3a.id, 'recovery_action.withdrawn', 28);
    }

    // Second attempt: request overtime extension — BLOCKED
    const ra3b = await createRecoveryAction({
      incident_id: inc3.id,
      title: 'Request overtime extension for PM agent',
      action_type: 'PERSONNEL',
      proposed_by: 'CC01',
      assigned_to: 'OPS',
      description: 'Ask Okafor D. (PM shift) to start 30 min early. Needs supervisor approval.',
    });
    if (ra3b) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra3b.id, new_status: 'ACKNOWLEDGED', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra3b.id, new_status: 'ACTIVE', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra3b.id, new_status: 'BLOCKED', actor_id: 'OPS01', actor_role: 'CREW_CHIEF', notes: 'Supervisor unavailable — on radio with tower re: ground stop' });
      await backdateAction(ra3b.id, 26);
      await backdateEvent(ra3b.id, 'recovery_action.proposed', 26);
      await backdateEvent(ra3b.id, 'recovery_action.acknowledged', 24);
      await backdateEvent(ra3b.id, 'recovery_action.active', 22);
      await backdateEvent(ra3b.id, 'recovery_action.blocked', 20);
    }

    // Third attempt: current — awaiting ops
    const ra3c = await createRecoveryAction({
      incident_id: inc3.id,
      title: 'Cross-train regional cabin agent for bag handling',
      action_type: 'PERSONNEL',
      proposed_by: 'CC01',
      assigned_to: 'CREW_CHIEF',
      description: 'Park S. (regional cabin) can cover basic bag handling. Needs 5-min briefing.',
    });
    if (ra3c) {
      await backdateAction(ra3c.id, 15);
      await backdateEvent(ra3c.id, 'recovery_action.proposed', 15);
    }

    await backdateIncident(inc3.id, 35);
    await backdateEvent(inc3.id, 'incident.confirmed', 33);
  }

  await DELAY(200);

  // ── Scenario 4: Ground stop — cascading gate pressure (T-18m, RECOVERING) ──
  const inc4 = await createIncident({
    title: 'Ground stop — 3 flights holding',
    severity: 'CRITICAL',
    station: 'LAX',
    zone_id: 'GATES-52DEF',
    gate_id: '52D',
    description: 'FAA ground stop SFO-LAX. UA891, AA445, DL320 holding. Gate 52D occupied past turn window.',
    created_by: 'OPS01',
  });
  if (inc4) {
    await DELAY(150);
    await transitionIncident({ incident_id: inc4.id, new_status: 'CONFIRMED', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: inc4.id, new_status: 'RECOVERING', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });

    const ra4a = await createRecoveryAction({
      incident_id: inc4.id,
      title: 'Re-gate UA891 to 52G',
      action_type: 'DISPATCH',
      proposed_by: 'OPS01',
      assigned_to: 'OPS',
      description: 'Coordinate with tower for gate swap. 52G empty and prepped.',
    });
    if (ra4a) {
      await backdateAction(ra4a.id, 12);
      await backdateEvent(ra4a.id, 'recovery_action.proposed', 12);
    }

    const ra4b = await createRecoveryAction({
      incident_id: inc4.id,
      title: 'Pre-position crew at 52E for quick turn',
      action_type: 'PERSONNEL',
      proposed_by: 'OPS01',
      assigned_to: 'CREW_CHIEF',
      description: '4-agent crew standing by for AA445 arrival. Target 18-min turn.',
    });
    if (ra4b) {
      await DELAY(100);
      await transitionRecoveryAction({ action_id: ra4b.id, new_status: 'ACKNOWLEDGED', actor_id: 'CC02', actor_role: 'CREW_CHIEF' });
      await backdateAction(ra4b.id, 10);
      await backdateEvent(ra4b.id, 'recovery_action.proposed', 10);
      await backdateEvent(ra4b.id, 'recovery_action.acknowledged', 8);
    }

    await backdateIncident(inc4.id, 18);
    await backdateEvent(inc4.id, 'incident.confirmed', 16);
    await backdateEvent(inc4.id, 'incident.recovering', 14);
  }

  // ── Operational events for feed texture ──
  const feedEvents = [
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52A', reported_by: 'RA03', role_type: 'RAMP_AGENT',
      notes: 'Position check-in at gate 52A', operational_status: 'RESOLVED', mins_ago: 58 },
    { event_type: 'EQUIPMENT_FAILURE', severity: 'HIGH', gate_id: '52A', equipment_id: 'BL-042', reported_by: 'RA03', role_type: 'RAMP_AGENT',
      notes: 'Belt loader BL-042 conveyor seized', operational_status: 'OPEN', mins_ago: 56 },
    { event_type: 'service.started', severity: 'LOW', gate_id: '52B', flight_id: 'AA1247', reported_by: 'RA07', role_type: 'RAMP_AGENT',
      notes: 'Pre-arrival prep started for AA1247', operational_status: 'OPEN', mins_ago: 38 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52D', reported_by: 'RA12', role_type: 'RAMP_AGENT',
      notes: 'Position check-in at gate 52D', operational_status: 'RESOLVED', mins_ago: 25 },
    { event_type: 'service.confirmed', severity: 'LOW', gate_id: '52E', flight_id: 'DL320', reported_by: 'RA15', role_type: 'RAMP_AGENT',
      notes: 'Pushback service confirmed for DL320', operational_status: 'RESOLVED', mins_ago: 22 },
    { event_type: 'gate.scanned', severity: 'LOW', gate_id: '52G', reported_by: 'RA08', role_type: 'RAMP_AGENT',
      notes: 'Gate 52G clear and prepped for re-gate', operational_status: 'RESOLVED', mins_ago: 10 },
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

  console.log('[demo] scenario seeded with time-offset timestamps');
}
