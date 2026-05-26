// RampIQ — Demo scenario seeder.
// Creates believable operational pressure for demonstration.
// Uses lifecycle commands — no direct table mutation.
// All events flow through the standard append-only pipeline.

import { createIncident, transitionIncident, createRecoveryAction, transitionRecoveryAction } from './lifecycle-commands';
import { getSupabase } from './supabase';

const DELAY = (ms: number) => new Promise(r => setTimeout(r, ms));

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
 * Creates incidents across zones with realistic recovery actions.
 */
export async function seedDemoScenario(): Promise<void> {
  const sb = getSupabase();
  if (!sb) { console.error('[demo] no Supabase client'); return; }

  console.log('[demo] seeding operational scenario...');

  // ── Scenario 1: Belt loader failure at 52A ──
  // Gate 52A has a jammed belt loader. Crew chief detected it,
  // confirmed, dispatched equipment swap. Runner en route.
  const inc1 = await createIncident({
    title: 'Belt loader jam — Gate 52A',
    severity: 'HIGH',
    station: 'LAX',
    zone_id: 'GATES-52ABC',
    gate_id: '52A',
    description: 'Conveyor belt seized on loader unit BL-042. Bags backing up on ramp.',
    created_by: 'CC01',
  });
  if (inc1) {
    await DELAY(200);
    await transitionIncident({ incident_id: inc1.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(200);
    await transitionIncident({ incident_id: inc1.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    const ra1 = await createRecoveryAction({
      incident_id: inc1.id,
      title: 'Swap belt loader from 52D apron',
      action_type: 'EQUIPMENT_SWAP',
      proposed_by: 'CC01',
      assigned_to: 'RAMP_AGENT',
      description: 'Pull backup BL-088 from 52D. ETA 8 min.',
    });
    if (ra1) {
      await DELAY(200);
      await transitionRecoveryAction({ action_id: ra1.id, new_status: 'ACKNOWLEDGED', actor_id: 'RA03', actor_role: 'RAMP_AGENT' });
      await DELAY(200);
      await transitionRecoveryAction({ action_id: ra1.id, new_status: 'ACTIVE', actor_id: 'RA03', actor_role: 'RAMP_AGENT' });
    }

    await createRecoveryAction({
      incident_id: inc1.id,
      title: 'Manual bag carry for priority pax',
      action_type: 'PERSONNEL',
      proposed_by: 'CC01',
      assigned_to: 'LT_RUNNER',
      description: 'Runner handling 4 priority bags manually until swap complete.',
    });
  }

  await DELAY(300);

  // ── Scenario 2: Staffing gap at 52B ──
  // Two agents called out. Crew chief short-staffed for inbound turn.
  const inc2 = await createIncident({
    title: 'Staffing shortage — 2 agents out',
    severity: 'MEDIUM',
    station: 'LAX',
    zone_id: 'GATES-52ABC',
    gate_id: '52B',
    description: 'Martinez and Chen called out. Gate 52B inbound AA1247 in 22 min, need minimum 3 agents.',
    created_by: 'CC01',
  });
  if (inc2) {
    await DELAY(200);
    await transitionIncident({ incident_id: inc2.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    await createRecoveryAction({
      incident_id: inc2.id,
      title: 'Pull agent from 52F (low-activity)',
      action_type: 'PERSONNEL',
      proposed_by: 'CC01',
      assigned_to: 'OPS',
      description: 'Request ops re-assign one agent from 52F apron. 52F next inbound not until 14:40.',
    });
  }

  await DELAY(300);

  // ── Scenario 3: Weather hold — cascading gate pressure ──
  // Ground stop causing 3 flights stacking. Zone D-F under pressure.
  const inc3 = await createIncident({
    title: 'Ground stop — 3 flights holding',
    severity: 'CRITICAL',
    station: 'LAX',
    zone_id: 'GATES-52DEF',
    gate_id: '52D',
    description: 'FAA ground stop SFO-LAX. UA891, AA445, DL320 holding. Gate 52D occupied past turn window.',
    created_by: 'OPS01',
  });
  if (inc3) {
    await DELAY(200);
    await transitionIncident({ incident_id: inc3.id, new_status: 'CONFIRMED', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });
    await DELAY(200);
    await transitionIncident({ incident_id: inc3.id, new_status: 'RECOVERING', actor_id: 'OPS01', actor_role: 'CREW_CHIEF' });

    await createRecoveryAction({
      incident_id: inc3.id,
      title: 'Re-gate UA891 to 52G',
      action_type: 'DISPATCH',
      proposed_by: 'OPS01',
      assigned_to: 'OPS',
      description: 'Coordinate with tower for gate swap. 52G empty and prepped.',
    });

    await createRecoveryAction({
      incident_id: inc3.id,
      title: 'Pre-position crew at 52E for quick turn',
      action_type: 'PERSONNEL',
      proposed_by: 'OPS01',
      assigned_to: 'CREW_CHIEF',
      description: '4-agent crew standing by for AA445 arrival. Target 18-min turn.',
    });
  }

  await DELAY(300);

  // ── Scenario 4: LAV spill at 52C (resolved) ──
  // Completed incident showing the full lifecycle.
  const inc4 = await createIncident({
    title: 'LAV cart spill — Gate 52C apron',
    severity: 'HIGH',
    station: 'LAX',
    zone_id: 'GATES-52ABC',
    gate_id: '52C',
    description: 'LAV cart hose disconnected during service. Spill contained to drain area.',
    created_by: 'LT05',
  });
  if (inc4) {
    await DELAY(150);
    await transitionIncident({ incident_id: inc4.id, new_status: 'CONFIRMED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: inc4.id, new_status: 'RECOVERING', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });

    const ra4 = await createRecoveryAction({
      incident_id: inc4.id,
      title: 'Hazmat cleanup crew',
      action_type: 'ESCALATION',
      proposed_by: 'CC01',
      assigned_to: 'LAV_TECH',
      description: 'LAV team dispatched for spill containment and hose repair.',
    });
    if (ra4) {
      await DELAY(150);
      await transitionRecoveryAction({ action_id: ra4.id, new_status: 'ACKNOWLEDGED', actor_id: 'LV02', actor_role: 'LAV_TECH' });
      await DELAY(150);
      await transitionRecoveryAction({ action_id: ra4.id, new_status: 'ACTIVE', actor_id: 'LV02', actor_role: 'LAV_TECH' });
      await DELAY(150);
      await transitionRecoveryAction({ action_id: ra4.id, new_status: 'COMPLETE', actor_id: 'LV02', actor_role: 'LAV_TECH' });
    }
    await DELAY(150);
    await transitionIncident({ incident_id: inc4.id, new_status: 'STABILIZED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
    await DELAY(150);
    await transitionIncident({ incident_id: inc4.id, new_status: 'RESOLVED', actor_id: 'CC01', actor_role: 'CREW_CHIEF' });
  }

  // ── Seed some operational events for the feed ──
  await sb.from('rampiq_events').insert([
    {
      event_type: 'gate.scanned', severity: 'LOW', station: 'LAX',
      gate_id: '52A', qr_target_type: 'GATE', qr_target_id: 'LAX-GATE-52A',
      reported_by: 'RA03', role_type: 'RAMP_AGENT', shift_window: 'AM',
      device_id: 'MOB-RA03', source_platform: 'MOBILE',
      notes: 'Position check-in at gate 52A', operational_status: 'RESOLVED',
      sync_status: 'SYNCED',
    },
    {
      event_type: 'EQUIPMENT_FAILURE', severity: 'HIGH', station: 'LAX',
      gate_id: '52A', equipment_id: 'BL-042', qr_target_type: 'EQUIPMENT',
      qr_target_id: 'LAX-EQUIP-BL042',
      reported_by: 'RA03', role_type: 'RAMP_AGENT', shift_window: 'AM',
      device_id: 'MOB-RA03', source_platform: 'MOBILE',
      notes: 'Belt loader BL-042 conveyor seized', operational_status: 'OPEN',
      sync_status: 'SYNCED',
    },
    {
      event_type: 'service.started', severity: 'LOW', station: 'LAX',
      gate_id: '52B', flight_id: 'AA1247', qr_target_type: 'GATE',
      qr_target_id: 'LAX-GATE-52B',
      reported_by: 'RA07', role_type: 'RAMP_AGENT', shift_window: 'AM',
      device_id: 'MOB-RA07', source_platform: 'MOBILE',
      notes: 'Pre-arrival prep started for AA1247', operational_status: 'OPEN',
      sync_status: 'SYNCED',
    },
    {
      event_type: 'gate.scanned', severity: 'LOW', station: 'LAX',
      gate_id: '52D', qr_target_type: 'GATE', qr_target_id: 'LAX-GATE-52D',
      reported_by: 'RA12', role_type: 'RAMP_AGENT', shift_window: 'AM',
      device_id: 'MOB-RA12', source_platform: 'MOBILE',
      notes: 'Position check-in at gate 52D', operational_status: 'RESOLVED',
      sync_status: 'SYNCED',
    },
    {
      event_type: 'service.confirmed', severity: 'LOW', station: 'LAX',
      gate_id: '52E', flight_id: 'DL320', qr_target_type: 'GATE',
      qr_target_id: 'LAX-GATE-52E',
      reported_by: 'RA15', role_type: 'RAMP_AGENT', shift_window: 'AM',
      device_id: 'MOB-RA15', source_platform: 'MOBILE',
      notes: 'Pushback service confirmed for DL320', operational_status: 'RESOLVED',
      sync_status: 'SYNCED',
    },
  ]);

  console.log('[demo] scenario seeded successfully');
}
