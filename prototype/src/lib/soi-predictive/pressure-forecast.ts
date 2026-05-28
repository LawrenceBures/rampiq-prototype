/**
 * SOI Predictive — Pressure Forecast Engine
 *
 * Projects future pressure at +15m and +30m based on:
 * incident trends, recovery velocity, staffing, and equipment state.
 * All deterministic. No ML.
 */

import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';

// ============================================================
// TYPES
// ============================================================

export type ForecastConfidence = 'high' | 'moderate' | 'low';

export interface ZoneForecast {
  zoneId: string;
  zoneLabel: string;
  currentPressure: number;
  pressure15m: number;
  pressure30m: number;
  trend: 'rising' | 'stable' | 'falling';
  confidence: ForecastConfidence;
  drivers: string[];
}

export interface GateForecast {
  gateId: string;
  currentPressure: number;
  pressure15m: number;
  trend: 'rising' | 'stable' | 'falling';
}

export interface OperationalForecast {
  zones: ZoneForecast[];
  gates: Map<string, GateForecast>;
  globalTrend: 'rising' | 'stable' | 'falling';
  globalConfidence: ForecastConfidence;
  summary: string;
}

// ============================================================
// FORECAST ENGINE
// ============================================================

export function forecastPressure(
  assessment: OperationalAssessment,
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  gatePressures: Map<string, number>,
): OperationalForecast {
  const now = Date.now();
  const zoneFc: ZoneForecast[] = [];

  for (const za of assessment.zoneAssessments) {
    const zoneInc = incidents.filter(i =>
      (i.zone_id === za.zoneId || (i.gate_id && za.pressureSources.some(ps => ps.affectedGates.includes(i.gate_id!)))) &&
      i.status !== 'RESOLVED' && i.status !== 'CLOSED'
    );
    const zoneRAs = recoveryActions.filter(ra =>
      (ra.zone_id === za.zoneId) &&
      ra.status !== 'COMPLETE' && ra.status !== 'WITHDRAWN' && ra.status !== 'ESCALATED'
    );

    const drivers: string[] = [];

    // Aging pressure: incidents get worse over time
    const agingRate = zoneInc.reduce((s, i) => {
      const ageMin = (now - new Date(i.opened_at).getTime()) / 60000;
      const sevW = { CRITICAL: 1.5, HIGH: 1.2, MEDIUM: 0.8, LOW: 0.3 }[i.severity] ?? 0.5;
      return s + sevW * (ageMin > 30 ? 1.5 : ageMin > 15 ? 1.0 : 0.5);
    }, 0);

    if (agingRate > 3) drivers.push('Incident aging accelerating pressure');

    // Recovery relief: active recoveries reduce future pressure
    const activeRAs = zoneRAs.filter(ra => ra.status === 'ACTIVE' || ra.status === 'ACKNOWLEDGED');
    const stalledRAs = zoneRAs.filter(ra => ra.status === 'PROPOSED' || ra.status === 'BLOCKED');
    const recoveryRate = activeRAs.length * 3 - stalledRAs.length * 2;

    if (stalledRAs.length > 0) drivers.push(`${stalledRAs.length} stalled recovery${stalledRAs.length > 1 ? ' actions' : ''}`);
    if (activeRAs.length > 0) drivers.push(`${activeRAs.length} active recovery reducing pressure`);

    // Adjacent pressure influence
    const adjacentPressure = assessment.zoneAssessments
      .filter(z => z.zoneId !== za.zoneId && z.pressure >= 60)
      .reduce((s, z) => s + z.pressure * 0.08, 0);

    if (adjacentPressure > 5) drivers.push('Adjacent zone pressure contributing');

    // New incident likelihood (based on current rate)
    const recentInc = zoneInc.filter(i => (now - new Date(i.opened_at).getTime()) < 30 * 60000);
    const incidentVelocity = recentInc.length / 2; // incidents per 15 min

    if (incidentVelocity > 1) drivers.push(`Incident rate: ${incidentVelocity.toFixed(1)} per 15m`);

    // Forecast calculation
    const delta15 = Math.round(agingRate + adjacentPressure + incidentVelocity * 5 - recoveryRate);
    const delta30 = Math.round(delta15 * 1.6);

    const p15 = Math.max(0, Math.min(100, za.pressure + delta15));
    const p30 = Math.max(0, Math.min(100, za.pressure + delta30));

    const trend: ZoneForecast['trend'] = delta15 > 3 ? 'rising' : delta15 < -3 ? 'falling' : 'stable';

    // Confidence
    const dataPoints = zoneInc.length + zoneRAs.length + recentInc.length;
    const confidence: ForecastConfidence = dataPoints >= 5 ? 'high' : dataPoints >= 2 ? 'moderate' : 'low';

    if (drivers.length === 0) drivers.push('Stable operational trajectory');

    zoneFc.push({
      zoneId: za.zoneId,
      zoneLabel: za.zoneLabel,
      currentPressure: za.pressure,
      pressure15m: p15,
      pressure30m: p30,
      trend,
      confidence,
      drivers,
    });
  }

  // Gate-level forecasts
  const gateFc = new Map<string, GateForecast>();
  for (const [gateId, pressure] of gatePressures) {
    const matchedZone = zoneFc.find(z => {
      const zoneGates = assessment.zoneAssessments.find(za => za.zoneId === z.zoneId)?.pressureSources.flatMap(ps => ps.affectedGates) ?? [];
      return zoneGates.includes(gateId);
    });
    const zoneDelta = matchedZone ? matchedZone.pressure15m - matchedZone.currentPressure : 0;
    const p15 = Math.max(0, Math.min(100, pressure + Math.round(zoneDelta * 0.6)));
    gateFc.set(gateId, {
      gateId,
      currentPressure: pressure,
      pressure15m: p15,
      trend: p15 > pressure + 3 ? 'rising' : p15 < pressure - 3 ? 'falling' : 'stable',
    });
  }

  // Global
  const rising = zoneFc.filter(z => z.trend === 'rising').length;
  const falling = zoneFc.filter(z => z.trend === 'falling').length;
  const globalTrend: OperationalForecast['globalTrend'] = rising > falling ? 'rising' : falling > rising ? 'falling' : 'stable';
  const globalConfidence: ForecastConfidence = zoneFc.every(z => z.confidence === 'high') ? 'high' : zoneFc.some(z => z.confidence === 'low') ? 'low' : 'moderate';

  const worstFc = [...zoneFc].sort((a, b) => b.pressure15m - a.pressure15m)[0];
  const summary = globalTrend === 'rising'
    ? `Pressure projected to increase. ${worstFc?.zoneLabel ?? 'Primary zone'} forecast: ${worstFc?.currentPressure ?? 0} → ${worstFc?.pressure15m ?? 0} (+15m).`
    : globalTrend === 'falling'
    ? `Pressure projected to decrease. Recovery trajectory favorable.`
    : `Pressure projected stable. Monitor for changes.`;

  return { zones: zoneFc, gates: gateFc, globalTrend, globalConfidence, summary };
}
