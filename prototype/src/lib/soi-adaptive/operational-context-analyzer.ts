/**
 * SOI Adaptive — Operational Context Analyzer
 *
 * Analyzes current operational composition to determine
 * which interventions are most effective in this specific context.
 */

import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';
import type { OperationalAssessment } from '@/lib/soi-intelligence/operational-reasoning';

// ============================================================
// TYPES
// ============================================================

export type PressureComposition =
  | 'equipment_driven'
  | 'staffing_driven'
  | 'incident_cluster'
  | 'cascade_propagation'
  | 'turnaround_compression'
  | 'mixed'
  | 'stable';

export interface OperationalProfile {
  composition: PressureComposition;
  equipmentFactor: number;   // 0-1
  staffingFactor: number;    // 0-1
  agingFactor: number;       // 0-1
  cascadeFactor: number;     // 0-1
  compressionFactor: number; // 0-1
  recoveryCongestion: number; // 0-1
  dominantDriver: string;
}

// ============================================================
// ANALYZER
// ============================================================

export function analyzeOperationalContext(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  assessment: OperationalAssessment,
  zoneId?: string,
): OperationalProfile {
  const now = Date.now();

  const active = incidents.filter(i =>
    i.status !== 'RESOLVED' && i.status !== 'CLOSED' &&
    (!zoneId || i.zone_id === zoneId)
  );
  const activeRAs = recoveryActions.filter(ra =>
    ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED' &&
    (!zoneId || ra.zone_id === zoneId)
  );
  const zoneEvents = zoneId ? events.filter(e => e.zone_id === zoneId) : events;

  if (active.length === 0) {
    return { composition: 'stable', equipmentFactor: 0, staffingFactor: 0, agingFactor: 0, cascadeFactor: 0, compressionFactor: 0, recoveryCongestion: 0, dominantDriver: 'None — stable operations' };
  }

  // Equipment factor
  const equipEvents = zoneEvents.filter(e => e.equipment_id && e.operational_status !== 'RESOLVED');
  const equipIncidents = active.filter(i => i.affected_equipment_ids && i.affected_equipment_ids.length > 0);
  const equipmentFactor = Math.min(1, (equipEvents.length * 0.15 + equipIncidents.length * 0.25));

  // Staffing factor: low reporter diversity + high incident count
  const reporters = new Set(zoneEvents.filter(e => e.operational_status !== 'RESOLVED').map(e => e.reported_by));
  const staffingFactor = active.length > 0 ? Math.min(1, Math.max(0, 1 - (reporters.size / (active.length * 1.5)))) : 0;

  // Aging factor
  const ages = active.map(i => (now - new Date(i.opened_at).getTime()) / 60000);
  const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  const agingFactor = Math.min(1, avgAge / 60);

  // Cascade factor
  const pressuredZones = assessment.zoneAssessments.filter(z => z.pressure >= 50);
  const cascadeFactor = Math.min(1, (pressuredZones.length - 1) * 0.35);

  // Turnaround compression
  const criticals = active.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  const compressionFactor = Math.min(1, criticals.length * 0.2 + (avgAge > 30 ? 0.3 : 0));

  // Recovery congestion
  const stalledRAs = activeRAs.filter(ra => ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
  const recoveryCongestion = activeRAs.length > 0 ? Math.min(1, stalledRAs.length / Math.max(1, activeRAs.length)) : 0;

  // Determine dominant composition
  const factors = [
    { name: 'equipment_driven' as PressureComposition, val: equipmentFactor, label: 'Equipment instability' },
    { name: 'staffing_driven' as PressureComposition, val: staffingFactor, label: 'Staffing insufficiency' },
    { name: 'incident_cluster' as PressureComposition, val: agingFactor, label: 'Aged incident cluster' },
    { name: 'cascade_propagation' as PressureComposition, val: cascadeFactor, label: 'Multi-zone cascade' },
    { name: 'turnaround_compression' as PressureComposition, val: compressionFactor, label: 'Turnaround compression' },
  ];

  const dominant = factors.sort((a, b) => b.val - a.val)[0];
  const composition: PressureComposition = dominant.val > 0.4 ? dominant.name : factors.filter(f => f.val > 0.2).length >= 3 ? 'mixed' : dominant.name;

  return {
    composition,
    equipmentFactor,
    staffingFactor,
    agingFactor,
    cascadeFactor,
    compressionFactor,
    recoveryCongestion,
    dominantDriver: dominant.label,
  };
}
