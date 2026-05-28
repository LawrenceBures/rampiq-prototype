/**
 * SOI Context — Workforce Model
 *
 * Demo workforce state derived from event/identity data.
 * Provides staffing answers for conversational SOI.
 */

import type { SoiEvent } from '@/lib/soi-types';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';

// ============================================================
// DEMO WORKFORCE ROSTER
// ============================================================

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  shift: string;
  status: 'available' | 'assigned' | 'recovering' | 'break' | 'off_shift';
  currentGate?: string;
  currentZone?: string;
  workload: number; // 0-3
}

const BASE_ROSTER: CrewMember[] = [
  { id: 'RA14', name: 'Okafor D.', role: 'Ramp Agent', shift: 'AM', status: 'available', currentZone: 'GATES-52ABC', workload: 0 },
  { id: 'RA03', name: 'Singh P.', role: 'Ramp Agent', shift: 'AM', status: 'available', currentZone: 'GATES-52DEF', workload: 0 },
  { id: 'RA08', name: 'Torres L.', role: 'Ramp Agent', shift: 'AM', status: 'available', currentZone: 'GATES-52GHI', workload: 0 },
  { id: 'RA22', name: 'Chen W.', role: 'Ramp Agent', shift: 'AM', status: 'available', currentZone: 'GATES-52ABC', workload: 0 },
  { id: 'RA11', name: 'Jackson M.', role: 'Ramp Agent', shift: 'AM', status: 'available', currentZone: 'GATES-52DEF', workload: 0 },
  { id: 'RA17', name: 'Park J.', role: 'Ramp Agent', shift: 'PM', status: 'off_shift', workload: 0 },
  { id: 'LT02', name: 'Rivera A.', role: 'LT Runner', shift: 'AM', status: 'available', currentZone: 'GATES-52ABC', workload: 0 },
  { id: 'LT05', name: 'Adams T.', role: 'LT Runner', shift: 'AM', status: 'available', currentZone: 'GATES-52GHI', workload: 0 },
  { id: 'CC01', name: 'Martinez J.', role: 'Crew Chief', shift: 'AM', status: 'assigned', currentZone: 'GATES-52ABC', workload: 2 },
  { id: 'CC02', name: 'Reyes M.', role: 'Crew Chief', shift: 'AM', status: 'assigned', currentZone: 'GATES-52DEF', workload: 2 },
];

// ============================================================
// WORKFORCE STATE COMPUTATION
// ============================================================

export interface WorkforceState {
  totalOnShift: number;
  rampAgentsOnShift: number;
  available: CrewMember[];
  assigned: CrewMember[];
  recovering: CrewMember[];
  offShift: CrewMember[];
  roster: CrewMember[];
  isDemo: boolean;
}

export function computeWorkforceState(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
): WorkforceState {
  const roster = BASE_ROSTER.map(m => ({ ...m }));

  // Update status based on active recovery actions
  const activeRAs = recoveryActions.filter(ra =>
    ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED' || ra.status === 'PROPOSED'
  );

  // Mark agents involved in recovery
  for (const ra of activeRAs) {
    if (ra.assigned_to) {
      const member = roster.find(m => m.id === ra.assigned_to);
      if (member && member.status !== 'off_shift') {
        member.status = 'recovering';
        if (ra.gate_id) member.currentGate = ra.gate_id;
        member.workload = Math.min(3, member.workload + 1);
      }
    }
  }

  // Mark agents with active event reports as assigned
  const recentReporters = new Set(
    events.filter(e => e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED')
      .map(e => e.reported_by)
  );
  for (const member of roster) {
    if (member.status === 'available' && recentReporters.has(member.id)) {
      member.status = 'assigned';
      member.workload = Math.min(3, member.workload + 1);
    }
  }

  const onShift = roster.filter(m => m.status !== 'off_shift');
  const rampAgents = onShift.filter(m => m.role === 'Ramp Agent');

  return {
    totalOnShift: onShift.length,
    rampAgentsOnShift: rampAgents.length,
    available: roster.filter(m => m.status === 'available'),
    assigned: roster.filter(m => m.status === 'assigned'),
    recovering: roster.filter(m => m.status === 'recovering'),
    offShift: roster.filter(m => m.status === 'off_shift'),
    roster,
    isDemo: true,
  };
}

/**
 * Find best available agents for a gate assignment.
 */
export function recommendTeamForGate(
  workforce: WorkforceState,
  gateId: string,
  count: number = 2,
): { members: CrewMember[]; reasoning: string } {
  const zoneMap: Record<string, string> = {
    '52A': 'GATES-52ABC', '52B': 'GATES-52ABC', '52C': 'GATES-52ABC',
    '52D': 'GATES-52DEF', '52E': 'GATES-52DEF', '52F': 'GATES-52DEF',
    '52G': 'GATES-52GHI', '52H': 'GATES-52GHI', '52I': 'GATES-52GHI',
  };
  const targetZone = zoneMap[gateId];

  // Prefer available agents in the same zone, then adjacent, then any
  const sorted = [...workforce.available]
    .filter(m => m.role === 'Ramp Agent' || m.role === 'LT Runner')
    .sort((a, b) => {
      const aZone = a.currentZone === targetZone ? 0 : 1;
      const bZone = b.currentZone === targetZone ? 0 : 1;
      if (aZone !== bZone) return aZone - bZone;
      return a.workload - b.workload;
    });

  const members = sorted.slice(0, count);
  const reasoning = members.length >= count
    ? `${members.map(m => m.name).join(' and ')} are available${members.some(m => m.currentZone === targetZone) ? ' in the target zone' : ''}.`
    : members.length > 0
    ? `Only ${members.length} agent${members.length > 1 ? 's' : ''} available. Additional staffing may be needed.`
    : 'No agents currently available. Consider overtime extension or cross-zone redeployment.';

  return { members, reasoning };
}
