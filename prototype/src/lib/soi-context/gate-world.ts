/**
 * SOI Context — Gate World Model
 *
 * True gate-level operational state computation.
 * Pressure derives from gate incidents up to zone,
 * not zone down to gate. Includes turnaround state,
 * aircraft presence, equipment, staffing, recovery,
 * and neighboring influence.
 */

import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';
import type { FlightWorld } from './flight-context';

// ============================================================
// TYPES
// ============================================================

export type TurnState = 'empty' | 'inbound' | 'deplaning' | 'servicing' | 'boarding' | 'delayed' | 'push_ready' | 'departed' | 'recovery' | 'stabilized';

export interface GateWorld {
  gateId: string;
  pressure: number;
  incidents: number;
  criticalCount: number;
  highCount: number;
  turnState: TurnState;
  hasAircraft: boolean;
  equipmentIds: string[];
  hasEquipmentFailure: boolean;
  staffingLevel: number;
  activeRecoveries: number;
  stalledRecoveries: number;
  oldestIncidentMin: number;
  neighborInfluence: number;
  projectedPressure15m: number;
  recoveryActive: boolean;
  recoveryStalled: boolean;
}

// ============================================================
// ADJACENCY
// ============================================================

const GATE_NEIGHBORS: Record<string, string[]> = {
  '52A': ['52B', '52D'],
  '52B': ['52A', '52C', '52E'],
  '52C': ['52B', '52F'],
  '52D': ['52A', '52E', '52G'],
  '52E': ['52B', '52D', '52F', '52H'],
  '52F': ['52C', '52E', '52I'],
  '52G': ['52D', '52H'],
  '52H': ['52E', '52G', '52I'],
  '52I': ['52F', '52H'],
};

const SEV_W: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function gateZone(gateId: string): string | undefined {
  if (['52A', '52B', '52C'].includes(gateId)) return 'GATES-52ABC';
  if (['52D', '52E', '52F'].includes(gateId)) return 'GATES-52DEF';
  if (['52G', '52H', '52I'].includes(gateId)) return 'GATES-52GHI';
  return undefined;
}

// ============================================================
// COMPUTATION
// ============================================================

export function computeGateWorld(
  gates: string[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  assessment: OperationalAssessment,
  flightWorld?: Map<string, FlightWorld>,
): Map<string, GateWorld> {
  const map = new Map<string, GateWorld>();
  const now = Date.now();

  // First pass: compute base pressure per gate
  const basePressures = new Map<string, number>();

  for (const gateId of gates) {
    const gi = incidents.filter(i => i.gate_id === gateId && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
    const ge = events.filter(e => e.gate_id === gateId);
    const zoneId = gateZone(gateId);
    const gr = recoveryActions.filter(ra =>
      (ra.gate_id === gateId || (!ra.gate_id && ra.zone_id === zoneId)) &&
      ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED'
    );
    const fw = flightWorld?.get(gateId);

    // Incident pressure
    const incPressure = gi.reduce((s, i) => s + (SEV_W[i.severity] ?? 1) * 12, 0);
    const agePressure = gi.reduce((s, i) => s + Math.min((now - new Date(i.opened_at).getTime()) / 180000, 15), 0);

    // Turnaround compression
    const compressionPressure = fw && fw.minutesToDeparture < 15 && gi.length > 0 ? 10 : 0;

    // Equipment penalty
    const equipFail = ge.some(e => e.equipment_id && e.severity !== 'LOW' && e.operational_status !== 'RESOLVED');
    const equipPressure = equipFail ? 8 : 0;

    // Stalled recovery penalty
    const stalledRAs = gr.filter(ra => ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
    const recoveryPenalty = stalledRAs.length * 5;

    // Active recovery relief
    const activeRAs = gr.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED');
    const recoveryRelief = activeRAs.length * 6;

    const rawPressure = incPressure + agePressure + compressionPressure + equipPressure + recoveryPenalty - recoveryRelief;
    basePressures.set(gateId, rawPressure);

    // Turnaround state
    const hasService = ge.some(e => (e.event_type === 'service.started' || e.event_type === 'service.confirmed') && e.operational_status !== 'RESOLVED');
    const hasScan = ge.some(e => e.event_type === 'gate.scanned');
    const hasRecovery = gr.length > 0;
    const hasCritical = gi.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');

    let turnState: TurnState = 'empty';
    if (hasRecovery && gi.length > 0) turnState = 'recovery';
    else if (hasCritical) turnState = 'delayed';
    else if (activeRAs.length > 0 && gi.length === 0) turnState = 'stabilized';
    else if (fw && fw.minutesToDeparture <= 5 && fw.minutesToDeparture > 0 && !hasCritical) turnState = 'push_ready';
    else if (hasService && !hasCritical) turnState = fw && fw.minutesToDeparture < 20 ? 'boarding' : 'servicing';
    else if (hasScan && !hasService) turnState = gi.length > 0 ? 'deplaning' : 'inbound';

    // Equipment
    const equipIds = [...new Set(ge.filter(e => e.equipment_id && e.operational_status !== 'RESOLVED').map(e => e.equipment_id!))];

    // Staffing
    const reporters = new Set(ge.filter(e => e.operational_status !== 'RESOLVED').map(e => e.reported_by));
    const staffing = reporters.size >= 3 ? 3 : reporters.size >= 2 ? 2 : reporters.size >= 1 ? 1 : 0;

    const oldest = gi.length > 0 ? Math.max(...gi.map(i => (now - new Date(i.opened_at).getTime()) / 60000)) : 0;

    map.set(gateId, {
      gateId,
      pressure: 0, // set in second pass
      incidents: gi.length,
      criticalCount: gi.filter(i => i.severity === 'CRITICAL').length,
      highCount: gi.filter(i => i.severity === 'HIGH').length,
      turnState,
      hasAircraft: turnState !== 'empty' && (turnState as string) !== 'departed',
      equipmentIds: equipIds,
      hasEquipmentFailure: equipFail,
      staffingLevel: staffing,
      activeRecoveries: activeRAs.length,
      stalledRecoveries: stalledRAs.length,
      oldestIncidentMin: Math.round(oldest),
      neighborInfluence: 0,
      projectedPressure15m: 0,
      recoveryActive: activeRAs.length > 0,
      recoveryStalled: stalledRAs.length > 0,
    });
  }

  // Second pass: add neighbor influence and compute final pressure
  for (const gateId of gates) {
    const gw = map.get(gateId);
    if (!gw) continue;

    const neighbors = GATE_NEIGHBORS[gateId] ?? [];
    const neighborPressure = neighbors.reduce((s, nId) => s + (basePressures.get(nId) ?? 0), 0);
    const neighborInfluence = neighbors.length > 0 ? Math.round((neighborPressure / neighbors.length) * 0.12) : 0;

    const base = basePressures.get(gateId) ?? 0;
    const finalPressure = Math.max(0, Math.min(100, Math.round(base + neighborInfluence)));

    // Simple +15m projection
    const agingDelta = gw.incidents * 2;
    const recoveryDelta = gw.recoveryActive ? -4 : (gw.recoveryStalled ? 3 : 0);
    const projected = Math.max(0, Math.min(100, finalPressure + agingDelta + recoveryDelta + Math.round(neighborInfluence * 0.5)));

    gw.pressure = finalPressure;
    gw.neighborInfluence = neighborInfluence;
    gw.projectedPressure15m = projected;
  }

  return map;
}

/**
 * Get gate-to-gate cascade risks.
 */
export function getGateCascadeRisks(gateWorld: Map<string, GateWorld>): Array<{
  source: string; target: string; likelihood: number;
}> {
  const risks: Array<{ source: string; target: string; likelihood: number }> = [];

  for (const [gateId, gw] of gateWorld) {
    if (gw.pressure < 40) continue;
    const neighbors = GATE_NEIGHBORS[gateId] ?? [];
    for (const nId of neighbors) {
      const nw = gateWorld.get(nId);
      if (!nw) continue;
      const diff = gw.pressure - nw.pressure;
      if (diff < 15) continue;
      risks.push({ source: gateId, target: nId, likelihood: Math.min(95, Math.round(diff * 1.5)) });
    }
  }

  return risks.sort((a, b) => b.likelihood - a.likelihood);
}
