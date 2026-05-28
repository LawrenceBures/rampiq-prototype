/**
 * SOI Predictive — Cascade Forecast Engine
 *
 * Predicts where instability is likely to spread next.
 * Identifies vulnerable zones and estimates propagation timing.
 */

import type { OperationalAssessment, ZoneAssessment } from '@/lib/soi-intelligence/operational-reasoning';
import type { ZoneForecast, ForecastConfidence } from './pressure-forecast';

// ============================================================
// TYPES
// ============================================================

export interface CascadeRisk {
  sourceZone: string;
  sourceLabel: string;
  targetZone: string;
  targetLabel: string;
  transferLikelihood: number; // 0-100
  estimatedMinutes: number;
  direction: string;
  confidence: ForecastConfidence;
  reason: string;
}

// ============================================================
// ADJACENCY
// ============================================================

const ZONE_ADJACENCY: Record<string, string[]> = {
  'GATES-52ABC': ['GATES-52DEF'],
  'GATES-52DEF': ['GATES-52ABC', 'GATES-52GHI'],
  'GATES-52GHI': ['GATES-52DEF'],
};

// ============================================================
// ENGINE
// ============================================================

export function forecastCascades(
  assessment: OperationalAssessment,
  zoneForecast: readonly ZoneForecast[],
): CascadeRisk[] {
  const risks: CascadeRisk[] = [];
  const fcMap = new Map(zoneForecast.map(z => [z.zoneId, z]));

  for (const za of assessment.zoneAssessments) {
    if (za.pressure < 40) continue;
    const adjacent = ZONE_ADJACENCY[za.zoneId] ?? [];

    for (const adjId of adjacent) {
      const adjZa = assessment.zoneAssessments.find(z => z.zoneId === adjId);
      if (!adjZa) continue;

      const pressureDiff = za.pressure - adjZa.pressure;
      if (pressureDiff < 15) continue; // need significant differential

      const srcFc = fcMap.get(za.zoneId);
      const srcRising = srcFc?.trend === 'rising';

      // Transfer likelihood
      let likelihood = Math.min(95, pressureDiff * 1.2);
      if (srcRising) likelihood += 15;
      if (za.criticalCount > 0) likelihood += 10;
      if (adjZa.pressure > 30) likelihood -= 10; // already pressured = less marginal impact
      likelihood = Math.max(5, Math.min(95, Math.round(likelihood)));

      // Estimated propagation time
      const baseTime = Math.round(30 - (pressureDiff * 0.3));
      const estMin = Math.max(5, Math.min(45, baseTime));

      const confidence: ForecastConfidence = pressureDiff > 40 ? 'high' : pressureDiff > 25 ? 'moderate' : 'low';

      const reason = srcRising
        ? `${za.zoneLabel} pressure rising (${za.pressure} → ${srcFc?.pressure15m ?? za.pressure}), differential to ${adjZa.zoneLabel} at ${pressureDiff}`
        : `${za.zoneLabel} sustained pressure (${za.pressure}) with ${pressureDiff}-point differential to ${adjZa.zoneLabel}`;

      risks.push({
        sourceZone: za.zoneId,
        sourceLabel: za.zoneLabel,
        targetZone: adjId,
        targetLabel: adjZa.zoneLabel,
        transferLikelihood: likelihood,
        estimatedMinutes: estMin,
        direction: `${za.zoneLabel} → ${adjZa.zoneLabel}`,
        confidence,
        reason,
      });
    }
  }

  return risks.sort((a, b) => b.transferLikelihood - a.transferLikelihood);
}
