/**
 * SOI Intelligence Core — Operational Reasoning
 *
 * Deterministic analysis of operational state.
 * Identifies pressure sources, explains instability,
 * and synthesizes zone/gate condition assessments.
 *
 * All functions are pure and replay-safe (accept optional asOf).
 */

import type { SoiEvent, Severity } from '@/lib/soi-types';
import type { Zone } from '@/lib/soi-types';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';

// ============================================================
// TYPES
// ============================================================

export interface PressureSource {
  type: 'unresolved_incidents' | 'equipment_recurrence' | 'aged_incident' | 'critical_cluster' | 'workforce_gap' | 'stalled_recovery';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedGates: string[];
  contributingIds: string[];
  weight: number;
}

export interface ZoneAssessment {
  zoneId: string;
  zoneLabel: string;
  pressure: number;
  stability: 'stable' | 'degrading' | 'unstable' | 'critical';
  pressureSources: PressureSource[];
  explanation: string[];
  unresolvedCount: number;
  criticalCount: number;
  oldestUnresolvedMinutes: number;
  activeRecoveryCount: number;
}

export interface OperationalAssessment {
  timestamp: string;
  zoneAssessments: ZoneAssessment[];
  globalPressure: number;
  globalStability: 'stable' | 'degrading' | 'unstable' | 'critical';
  summary: string;
  topPressureSources: PressureSource[];
}

// ============================================================
// SEVERITY WEIGHTS
// ============================================================

const SEV_WEIGHT: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function sevWeight(s: string): number {
  return SEV_WEIGHT[s as Severity] ?? 1;
}

// ============================================================
// CORE REASONING
// ============================================================

export function assessOperation(
  events: readonly SoiEvent[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  zones: readonly Zone[],
  asOf?: Date,
): OperationalAssessment {
  const now = asOf ?? new Date();
  const nowMs = now.getTime();

  const activeIncidents = incidents.filter(i =>
    i.status !== 'RESOLVED' && i.status !== 'CLOSED'
  );

  const zoneAssessments = zones.filter(z => z.active).map(zone =>
    assessZone(zone, events, activeIncidents, recoveryActions, nowMs)
  );

  const globalPressure = zoneAssessments.length > 0
    ? Math.round(zoneAssessments.reduce((sum, z) => sum + z.pressure, 0) / zoneAssessments.length)
    : 0;

  const allSources = zoneAssessments.flatMap(z => z.pressureSources);
  const topPressureSources = allSources
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const globalStability = pressureToStability(globalPressure);

  const critZones = zoneAssessments.filter(z => z.stability === 'critical' || z.stability === 'unstable');
  const summary = critZones.length === 0
    ? `Operation is ${globalStability}. ${activeIncidents.length} active incidents across ${zoneAssessments.length} zones.`
    : `${critZones.length} zone${critZones.length > 1 ? 's' : ''} under pressure: ${critZones.map(z => z.zoneLabel).join(', ')}. ${activeIncidents.length} active incidents. ${topPressureSources.length > 0 ? topPressureSources[0].description : ''}`;

  return {
    timestamp: now.toISOString(),
    zoneAssessments,
    globalPressure,
    globalStability,
    summary,
    topPressureSources,
  };
}

export function assessZone(
  zone: Zone,
  events: readonly SoiEvent[],
  activeIncidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  nowMs: number,
): ZoneAssessment {
  const zoneIncidents = activeIncidents.filter(i =>
    i.zone_id === zone.id || (i.gate_id && zone.gate_ids.includes(i.gate_id))
  );

  const zoneEvents = events.filter(e =>
    e.zone_id === zone.id || (e.gate_id && zone.gate_ids.includes(e.gate_id))
  );

  const zoneRecoveryActions = recoveryActions.filter(ra =>
    ra.zone_id === zone.id || (ra.gate_id && zone.gate_ids.includes(ra.gate_id))
  );

  const openEvents = zoneEvents.filter(e =>
    e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED'
  );

  const pressureSources: PressureSource[] = [];
  const explanation: string[] = [];

  // --- Unresolved incident pressure ---
  if (zoneIncidents.length >= 2) {
    pressureSources.push({
      type: 'unresolved_incidents',
      severity: zoneIncidents.length >= 4 ? 'critical' : zoneIncidents.length >= 3 ? 'high' : 'medium',
      description: `${zoneIncidents.length} unresolved incidents in ${zone.label}`,
      affectedGates: [...new Set(zoneIncidents.map(i => i.gate_id).filter(Boolean) as string[])],
      contributingIds: zoneIncidents.map(i => i.id),
      weight: zoneIncidents.length * 10,
    });
    explanation.push(`${zoneIncidents.length} unresolved incidents creating sustained pressure`);
  }

  // --- Critical/high severity cluster ---
  const critHigh = zoneIncidents.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  if (critHigh.length >= 2) {
    pressureSources.push({
      type: 'critical_cluster',
      severity: 'critical',
      description: `${critHigh.length} critical/high incidents clustered in ${zone.label}`,
      affectedGates: [...new Set(critHigh.map(i => i.gate_id).filter(Boolean) as string[])],
      contributingIds: critHigh.map(i => i.id),
      weight: critHigh.length * 15,
    });
    explanation.push(`Critical/high severity cluster: ${critHigh.length} incidents require coordinated response`);
  }

  // --- Aged incidents ---
  const aged = zoneIncidents.filter(i => {
    const ageMin = (nowMs - new Date(i.opened_at).getTime()) / 60000;
    return ageMin > 30;
  });
  if (aged.length > 0) {
    const oldestAge = Math.max(...aged.map(i => (nowMs - new Date(i.opened_at).getTime()) / 60000));
    pressureSources.push({
      type: 'aged_incident',
      severity: oldestAge > 60 ? 'critical' : 'high',
      description: `${aged.length} incident${aged.length > 1 ? 's' : ''} unresolved for ${Math.round(oldestAge)}+ minutes`,
      affectedGates: [...new Set(aged.map(i => i.gate_id).filter(Boolean) as string[])],
      contributingIds: aged.map(i => i.id),
      weight: Math.round(oldestAge / 5) * aged.length,
    });
    explanation.push(`Aging pressure: oldest incident unresolved for ${Math.round(oldestAge)} minutes`);
  }

  // --- Equipment recurrence ---
  const equipEvents = openEvents.filter(e => e.equipment_id);
  const equipCounts = new Map<string, SoiEvent[]>();
  for (const e of equipEvents) {
    const key = e.equipment_id!;
    if (!equipCounts.has(key)) equipCounts.set(key, []);
    equipCounts.get(key)!.push(e);
  }
  for (const [equipId, eqEvents] of equipCounts) {
    if (eqEvents.length >= 2) {
      pressureSources.push({
        type: 'equipment_recurrence',
        severity: eqEvents.length >= 3 ? 'high' : 'medium',
        description: `Equipment ${equipId} flagged ${eqEvents.length} times`,
        affectedGates: [...new Set(eqEvents.map(e => e.gate_id).filter(Boolean) as string[])],
        contributingIds: eqEvents.map(e => e.id),
        weight: eqEvents.length * 8,
      });
      explanation.push(`Equipment ${equipId} is a recurring issue (${eqEvents.length} events)`);
    }
  }

  // --- Stalled recovery actions ---
  const activeRAs = zoneRecoveryActions.filter(ra =>
    ra.status === 'PROPOSED' || ra.status === 'ACKNOWLEDGED' || ra.status === 'ACTIVE' || ra.status === 'BLOCKED'
  );
  const stalledRAs = activeRAs.filter(ra => {
    const age = (nowMs - new Date(ra.created_at).getTime()) / 60000;
    return age > 20 && (ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
  });
  if (stalledRAs.length > 0) {
    pressureSources.push({
      type: 'stalled_recovery',
      severity: 'high',
      description: `${stalledRAs.length} recovery action${stalledRAs.length > 1 ? 's' : ''} stalled (proposed/blocked >20m)`,
      affectedGates: [...new Set(stalledRAs.map(ra => ra.gate_id).filter(Boolean) as string[])],
      contributingIds: stalledRAs.map(ra => ra.id),
      weight: stalledRAs.length * 12,
    });
    explanation.push(`${stalledRAs.length} recovery actions stalled — need acknowledgement or unblocking`);
  }

  // --- Compute pressure score ---
  const severityPressure = zoneIncidents.reduce((sum, i) => sum + sevWeight(i.severity) * 12, 0);
  const agePressure = zoneIncidents.reduce((sum, i) => {
    const ageMin = (nowMs - new Date(i.opened_at).getTime()) / 60000;
    return sum + Math.min(ageMin / 3, 20);
  }, 0);
  const recoveryRelief = activeRAs.filter(ra => ra.status === 'ACTIVE' || ra.status === 'COMPLETE').length * 8;

  const rawPressure = severityPressure + agePressure - recoveryRelief;
  const pressure = Math.max(0, Math.min(100, Math.round(rawPressure)));

  const oldestUnresolvedMinutes = zoneIncidents.length > 0
    ? Math.max(...zoneIncidents.map(i => (nowMs - new Date(i.opened_at).getTime()) / 60000))
    : 0;

  if (explanation.length === 0) {
    explanation.push(zoneIncidents.length === 0 ? 'No active incidents. Zone is stable.' : `${zoneIncidents.length} active incident${zoneIncidents.length > 1 ? 's' : ''} under management.`);
  }

  return {
    zoneId: zone.id,
    zoneLabel: zone.label,
    pressure,
    stability: pressureToStability(pressure),
    pressureSources,
    explanation,
    unresolvedCount: zoneIncidents.length,
    criticalCount: critHigh.length,
    oldestUnresolvedMinutes: Math.round(oldestUnresolvedMinutes),
    activeRecoveryCount: activeRAs.length,
  };
}

export function explainInstability(
  zoneId: string,
  zones: readonly Zone[],
  events: readonly SoiEvent[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  asOf?: Date,
): string[] {
  const zone = zones.find(z => z.id === zoneId);
  if (!zone) return [`Zone ${zoneId} not found.`];

  const activeIncidents = incidents.filter(i =>
    i.status !== 'RESOLVED' && i.status !== 'CLOSED'
  );
  const nowMs = (asOf ?? new Date()).getTime();
  const assessment = assessZone(zone, events, activeIncidents, recoveryActions, nowMs);

  if (assessment.pressureSources.length === 0) {
    return [`${zone.label} is currently stable with no significant pressure sources.`];
  }

  return [
    `${zone.label} is ${assessment.stability} (pressure: ${assessment.pressure}/100).`,
    ...assessment.explanation,
  ];
}

function pressureToStability(pressure: number): ZoneAssessment['stability'] {
  if (pressure >= 80) return 'critical';
  if (pressure >= 55) return 'unstable';
  if (pressure >= 30) return 'degrading';
  return 'stable';
}
