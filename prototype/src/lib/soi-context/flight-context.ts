/**
 * SOI Context — Flight Intelligence
 *
 * Derives flight-centered operational state from gate definitions,
 * incidents, events, and recovery actions. Computes departure risk
 * and turnaround timing.
 */

import { GATE_DEFS } from '@/lib/demo-data';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';

// ============================================================
// TYPES
// ============================================================

export type DepartureRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TurnPhase = 'pre_arrival' | 'arrival' | 'servicing' | 'boarding' | 'push_ready' | 'delayed' | 'recovery';

export interface FlightWorld {
  gateId: string;
  flightNumber: string;
  carrier: string;
  aircraft: string;
  route: string;
  turnPhase: TurnPhase;
  scheduledDepartureMin: number;  // minutes from now (derived)
  departureRisk: DepartureRisk;
  riskFactors: string[];
  minutesToDeparture: number;
  isOverdue: boolean;
  hasActiveRecovery: boolean;
  incidentCount: number;
  equipmentBlocked: boolean;
  staffingGap: boolean;
}

// ============================================================
// COMPUTATION
// ============================================================

/**
 * Compute flight world state for all gates.
 * Departure times are derived from incident pressure and events
 * since we don't have a real flight schedule feed.
 */
export function computeFlightWorld(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
): Map<string, FlightWorld> {
  const map = new Map<string, FlightWorld>();
  const now = Date.now();

  for (const def of GATE_DEFS) {
    const gateId = def.id;
    const gi = incidents.filter(i => i.gate_id === gateId && i.status !== 'RESOLVED' && i.status !== 'CLOSED');
    const ge = events.filter(e => e.gate_id === gateId);
    const gr = recoveryActions.filter(ra =>
      (ra.gate_id === gateId) && ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED'
    );

    // Derive scheduled departure: base 45min from oldest gate event, or 30min from now
    const gateEventTimes = ge.map(e => new Date(e.created_at).getTime()).filter(t => t > 0);
    const earliestEvent = gateEventTimes.length > 0 ? Math.min(...gateEventTimes) : now - 20 * 60000;
    const baseDeparture = earliestEvent + 45 * 60000;
    const minutesToDep = Math.round((baseDeparture - now) / 60000);

    // Turn phase
    const hasService = ge.some(e => (e.event_type === 'service.started' || e.event_type === 'service.confirmed') && e.operational_status !== 'RESOLVED');
    const hasScan = ge.some(e => e.event_type === 'gate.scanned');
    const hasRecovery = gr.length > 0;
    const hasCritical = gi.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');

    // Default: aircraft at gate (servicing) — every gate has an assigned flight
    let turnPhase: TurnPhase = 'servicing';
    if (hasRecovery && gi.length > 0) turnPhase = 'recovery';
    else if (hasCritical) turnPhase = 'delayed';
    else if (minutesToDep <= 5 && minutesToDep > 0 && !hasCritical) turnPhase = 'push_ready';
    else if (hasService) turnPhase = 'servicing';
    else if (hasScan) turnPhase = 'arrival';
    else if (gi.length > 0) turnPhase = 'delayed';

    // Equipment blocked
    const equipBlocked = ge.some(e => e.equipment_id && e.severity !== 'LOW' && e.operational_status !== 'RESOLVED');

    // Staffing gap: if incidents exist but few reporters
    const reporters = new Set(ge.filter(e => e.operational_status !== 'RESOLVED').map(e => e.reported_by));
    const staffGap = gi.length > 1 && reporters.size < 2;

    // Departure risk
    const riskFactors: string[] = [];
    let riskScore = 0;

    if (gi.some(i => i.severity === 'CRITICAL')) { riskScore += 40; riskFactors.push('Critical incident at gate'); }
    if (gi.some(i => i.severity === 'HIGH')) { riskScore += 25; riskFactors.push('High severity incident'); }
    if (gi.length >= 2) { riskScore += 15; riskFactors.push(`${gi.length} unresolved incidents`); }
    if (equipBlocked) { riskScore += 20; riskFactors.push('Equipment failure'); }
    if (staffGap) { riskScore += 10; riskFactors.push('Staffing gap'); }
    if (minutesToDep < 15 && gi.length > 0) { riskScore += 15; riskFactors.push('Departure window compressing'); }
    if (hasRecovery && minutesToDep < 20) { riskScore += 10; riskFactors.push('Active recovery near departure'); }
    if (gr.some(ra => ra.status === 'BLOCKED' || ra.status === 'PROPOSED')) { riskScore += 10; riskFactors.push('Stalled recovery action'); }

    const departureRisk: DepartureRisk = riskScore >= 60 ? 'CRITICAL' : riskScore >= 35 ? 'HIGH' : riskScore >= 15 ? 'MEDIUM' : 'LOW';

    const carrier = def.flight.replace(/\d+/g, '');

    map.set(gateId, {
      gateId,
      flightNumber: def.flight,
      carrier,
      aircraft: def.aircraft,
      route: def.route,
      turnPhase,
      scheduledDepartureMin: minutesToDep,
      departureRisk,
      riskFactors,
      minutesToDeparture: minutesToDep,
      isOverdue: minutesToDep < 0,
      hasActiveRecovery: hasRecovery,
      incidentCount: gi.length,
      equipmentBlocked: equipBlocked,
      staffingGap: staffGap,
    });
  }

  return map;
}

/**
 * Get flights sorted by departure risk (highest first).
 */
export function getAtRiskFlights(flightWorld: Map<string, FlightWorld>): FlightWorld[] {
  return [...flightWorld.values()]
    .filter(f => f.departureRisk !== 'LOW')
    .sort((a, b) => {
      const riskOrder: Record<DepartureRisk, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return riskOrder[a.departureRisk] - riskOrder[b.departureRisk];
    });
}

/**
 * Find a flight by number (case-insensitive).
 */
export function findFlight(flightWorld: Map<string, FlightWorld>, query: string): FlightWorld | null {
  const upper = query.toUpperCase().replace(/\s/g, '');
  for (const fw of flightWorld.values()) {
    if (fw.flightNumber.toUpperCase() === upper) return fw;
  }
  return null;
}
