/**
 * SOI Intelligence Core — Confidence Scoring
 *
 * Deterministic confidence model for recovery recommendations.
 * Scores are computed from observable operational evidence only.
 * No external AI. No probabilistic claims. Clamped to 0–95.
 *
 * All functions are pure and replay-safe.
 */

import type { SoiEvent, Severity } from '@/lib/soi-types';
import type { Incident } from '@/lib/lifecycle-types';
import type { RecoveryAction } from '@/lib/lifecycle-types';

export interface ConfidenceFactors {
  relatedIncidentsInZone: number;
  equipmentImplicated: boolean;
  severityLevel: Severity;
  incidentAgeMinutes: number;
  matchingRecoveryExists: boolean;
  dataCompleteness: 'full' | 'partial' | 'sparse';
  historicalPatternMatch: boolean;
  workforcePressureHigh: boolean;
}

export interface ConfidenceResult {
  score: number;
  label: 'low' | 'moderate' | 'high' | 'very_high';
  factors: string[];
}

const AGE_THRESHOLD_MINUTES = 30;

export function computeConfidence(factors: ConfidenceFactors): ConfidenceResult {
  let score = 30; // baseline
  const applied: string[] = [];

  if (factors.relatedIncidentsInZone >= 2) {
    score += 20;
    applied.push(`${factors.relatedIncidentsInZone} related incidents in zone`);
  }

  if (factors.equipmentImplicated) {
    score += 20;
    applied.push('equipment clearly implicated');
  }

  if (factors.severityLevel === 'CRITICAL' || factors.severityLevel === 'HIGH') {
    score += 15;
    applied.push(`${factors.severityLevel.toLowerCase()} severity`);
  }

  if (factors.incidentAgeMinutes > AGE_THRESHOLD_MINUTES) {
    score += 15;
    applied.push(`unresolved for ${Math.round(factors.incidentAgeMinutes)}m`);
  }

  if (factors.matchingRecoveryExists) {
    score += 10;
    applied.push('matching recovery action already in progress');
  }

  if (factors.historicalPatternMatch) {
    score += 10;
    applied.push('matches historical operational pattern');
  }

  if (factors.workforcePressureHigh) {
    score += 5;
    applied.push('workforce under elevated pressure');
  }

  if (factors.dataCompleteness === 'sparse') {
    score -= 10;
    applied.push('limited data available');
  } else if (factors.dataCompleteness === 'partial') {
    score -= 5;
    applied.push('some data gaps');
  }

  score = Math.max(0, Math.min(95, score));

  const label: ConfidenceResult['label'] =
    score >= 80 ? 'very_high' :
    score >= 60 ? 'high' :
    score >= 40 ? 'moderate' : 'low';

  return { score, label, factors: applied };
}

/**
 * Assess data completeness for a set of incidents/events.
 */
export function assessDataCompleteness(
  incidents: readonly Incident[],
  events: readonly SoiEvent[],
  zoneId: string | null,
): 'full' | 'partial' | 'sparse' {
  if (incidents.length === 0 && events.length === 0) return 'sparse';

  const zoneEvents = zoneId
    ? events.filter(e => e.zone_id === zoneId)
    : events;

  if (zoneEvents.length < 3) return 'sparse';
  if (zoneEvents.length < 8) return 'partial';
  return 'full';
}
