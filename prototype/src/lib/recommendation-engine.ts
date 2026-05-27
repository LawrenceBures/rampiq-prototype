// SOI — Recommendation Intelligence Engine
// Phase 10.1: First intelligence layer — operational memory surfacing itself.
//
// RULES:
//   1. Every recommendation is traceable to specific operational history
//   2. Every recommendation is an event (replayable, auditable)
//   3. Override is always available and never penalized
//   4. Coordinator-first surfacing
//   5. No black-box scores, no "AI predicts", no opaque confidence
//   6. No per-operator recommendation metrics
//   7. Deterministic — same inputs always produce same recommendations
//   8. Replay-safe — accepts asOf
//
// TWO RECOMMENDATION TYPES (safest first):
//   A. Historical incident similarity — "you've seen this before"
//   B. Zone pressure balancing — zone-level, no individual comparison

import type { Incident, RecoveryAction } from './lifecycle-types';
import type { SoiEvent } from '@/lib/soi-types';
import type { RecoveryEffectiveness } from './outcome-measurement';
import { deriveOperationalOutcomes } from './outcome-measurement';
import { getSupabase } from './supabase';

// ============================================================
// TYPES
// ============================================================

export interface Recommendation {
  id: string;
  type: 'historical_similarity' | 'zone_pressure_balance';
  /** The incident this recommendation relates to */
  incidentId: string;
  /** Human-readable recommendation */
  title: string;
  /** Detailed explanation with evidence */
  explanation: string;
  /** Source evidence — prior incident IDs that informed this */
  evidenceIncidentIds: string[];
  /** Confidence framing (not a score — a narrative) */
  confidenceNarrative: string;
  /** Suggested recovery actions */
  suggestedActions: string[];
  /** When this recommendation was generated */
  generatedAt: string;
}

export interface RecommendationOverride {
  recommendationId: string;
  action: 'accepted' | 'modified' | 'rejected' | 'ignored';
  actualAction?: string;
  reason?: string;
}

// ============================================================
// SIMILARITY MATCHING
// ============================================================

interface SimilarityFactors {
  gateMatch: boolean;
  zoneMatch: boolean;
  severityMatch: boolean;
  typeMatch: boolean;
  recoveryPattern: string[];
  outcome: RecoveryEffectiveness | null;
}

/**
 * Find historically similar incidents and derive recommendations.
 * Pure function — deterministic, replay-safe.
 *
 * "This incident resembles N prior incidents.
 *  In those cases, [recovery pathway] stabilized in [M] minutes."
 */
export function deriveRecommendations(
  currentIncidents: readonly Incident[],
  historicalIncidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  events: readonly SoiEvent[],
  asOf?: Date,
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const outcomes = deriveOperationalOutcomes(historicalIncidents, recoveryActions, events, asOf);

  for (const current of currentIncidents) {
    if (current.resolved_at || current.closed_at) continue;

    // Find similar resolved incidents
    const similar = findSimilarIncidents(current, historicalIncidents, recoveryActions, outcomes.recoveryEffectiveness);
    if (similar.length >= 2) {
      recommendations.push(buildSimilarityRecommendation(current, similar, recoveryActions, outcomes.recoveryEffectiveness));
    }
  }

  // Zone pressure balancing
  const zoneRec = deriveZonePressureRecommendation(currentIncidents, asOf);
  if (zoneRec) recommendations.push(zoneRec);

  return recommendations;
}

function findSimilarIncidents(
  current: Incident,
  historical: readonly Incident[],
  actions: readonly RecoveryAction[],
  outcomes: readonly RecoveryEffectiveness[],
): { incident: Incident; factors: SimilarityFactors }[] {
  const matches: { incident: Incident; factors: SimilarityFactors; score: number }[] = [];

  for (const hist of historical) {
    if (hist.id === current.id) continue;
    if (!hist.resolved_at) continue; // only learn from resolved incidents

    let score = 0;
    const gateMatch = hist.gate_id === current.gate_id && !!current.gate_id;
    const zoneMatch = hist.zone_id === current.zone_id && !!current.zone_id;
    const severityMatch = hist.severity === current.severity;

    // Type similarity: compare title keywords
    const currentWords = new Set(current.title.toLowerCase().split(/\s+/));
    const histWords = new Set(hist.title.toLowerCase().split(/\s+/));
    const commonWords = [...currentWords].filter(w => histWords.has(w) && w.length > 3);
    const typeMatch = commonWords.length >= 2;

    if (gateMatch) score += 3;
    if (zoneMatch) score += 2;
    if (severityMatch) score += 2;
    if (typeMatch) score += 3;

    if (score >= 4) {
      const incActions = actions.filter(a => a.incident_id === hist.id);
      const outcome = outcomes.find(o => o.incidentId === hist.id) ?? null;

      matches.push({
        incident: hist,
        factors: {
          gateMatch, zoneMatch, severityMatch, typeMatch,
          recoveryPattern: incActions.filter(a => a.status === 'COMPLETE').map(a => a.title),
          outcome,
        },
        score,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

function buildSimilarityRecommendation(
  current: Incident,
  similar: { incident: Incident; factors: SimilarityFactors }[],
  actions: readonly RecoveryAction[],
  outcomes: readonly RecoveryEffectiveness[],
): Recommendation {
  const resolvedSimilar = similar.filter(s => s.factors.outcome?.totalResolutionTime != null);
  const avgResolution = resolvedSimilar.length > 0
    ? Math.round(resolvedSimilar.reduce((sum, s) => sum + s.factors.outcome!.totalResolutionTime!, 0) / resolvedSimilar.length)
    : null;

  // Collect successful recovery patterns
  const successfulActions = similar.flatMap(s => s.factors.recoveryPattern);
  const actionCounts = new Map<string, number>();
  for (const a of successfulActions) {
    actionCounts.set(a, (actionCounts.get(a) ?? 0) + 1);
  }
  const topActions = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action, count]) => `${action} (used in ${count} of ${similar.length} cases)`);

  const matchReasons = [];
  if (similar.some(s => s.factors.gateMatch)) matchReasons.push('same gate');
  if (similar.some(s => s.factors.zoneMatch)) matchReasons.push('same zone');
  if (similar.some(s => s.factors.severityMatch)) matchReasons.push('same severity');
  if (similar.some(s => s.factors.typeMatch)) matchReasons.push('similar type');

  return {
    id: `rec-sim-${current.id.slice(0, 8)}`,
    type: 'historical_similarity',
    incidentId: current.id,
    title: `Similar to ${similar.length} prior incidents`,
    explanation: `This incident matches ${similar.length} previously resolved incidents (${matchReasons.join(', ')}).${avgResolution ? ` Average resolution time: ${avgResolution} minutes.` : ''} Recovery patterns from prior incidents are listed below.`,
    evidenceIncidentIds: similar.map(s => s.incident.id),
    confidenceNarrative: buildConfidenceNarrative(similar, resolvedSimilar, avgResolution),
    suggestedActions: topActions.length > 0 ? topActions : ['No completed recovery patterns found in similar incidents'],
    generatedAt: new Date().toISOString(),
  };
}

function buildConfidenceNarrative(
  similar: { incident: Incident; factors: SimilarityFactors }[],
  resolvedSimilar: { incident: Incident; factors: SimilarityFactors }[],
  avgResolution: number | null,
): string {
  const parts: string[] = [];
  parts.push(`Based on ${similar.length} resolved incidents with matching characteristics.`);

  if (resolvedSimilar.length > 0) {
    parts.push(`${resolvedSimilar.length} had measured outcomes.`);

    if (avgResolution !== null) {
      // Outcome variability
      const times = resolvedSimilar.map(s => s.factors.outcome?.totalResolutionTime).filter((t): t is number => t != null);
      if (times.length >= 2) {
        const min = Math.min(...times);
        const max = Math.max(...times);
        if (max - min <= 10) {
          parts.push(`Resolution time consistent: ${min}–${max}m.`);
        } else {
          parts.push(`Resolution time varied: ${min}–${max}m (avg ${avgResolution}m). Conditions may differ.`);
        }
      }

      // Escalation correlation
      const escalated = resolvedSimilar.filter(s => s.factors.outcome?.escalated);
      const nonEscalated = resolvedSimilar.filter(s => !s.factors.outcome?.escalated);
      if (escalated.length > 0 && nonEscalated.length > 0) {
        const escAvg = escalated.reduce((s, e) => s + (e.factors.outcome?.totalResolutionTime ?? 0), 0) / escalated.length;
        const nonEscAvg = nonEscalated.reduce((s, e) => s + (e.factors.outcome?.totalResolutionTime ?? 0), 0) / nonEscalated.length;
        if (escAvg < nonEscAvg * 0.8) {
          parts.push(`Early escalation correlated with faster stabilization in prior incidents.`);
        }
      }
    }
  } else {
    parts.push('No measured outcomes available — pattern based on incident similarity only.');
  }

  // Confidence limitation
  if (similar.length < 5) {
    parts.push(`Small sample size — confidence limited.`);
  }

  return parts.join(' ');
}

function deriveZonePressureRecommendation(
  incidents: readonly Incident[],
  asOf?: Date,
): Recommendation | null {
  const now = asOf ?? new Date();
  const zoneLoad = new Map<string, number>();

  for (const inc of incidents) {
    if (inc.resolved_at || inc.closed_at || !inc.zone_id) continue;
    const sevWeight: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 2, LOW: 1 };
    zoneLoad.set(inc.zone_id, (zoneLoad.get(inc.zone_id) ?? 0) + (sevWeight[inc.severity] ?? 1));
  }

  if (zoneLoad.size < 2) return null;

  const sorted = [...zoneLoad.entries()].sort((a, b) => b[1] - a[1]);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  if (highest[1] <= lowest[1] * 1.5) return null; // not imbalanced enough

  return {
    id: `rec-zone-${Date.now()}`,
    type: 'zone_pressure_balance',
    incidentId: '',
    title: `Zone pressure imbalance: ${highest[0]} vs ${lowest[0]}`,
    explanation: `${highest[0]} has severity-weighted load of ${highest[1]} while ${lowest[0]} has load of ${lowest[1]}. Consider temporary coordination redistribution to balance operational pressure.`,
    evidenceIncidentIds: incidents.filter(i => i.zone_id === highest[0] && !i.resolved_at).map(i => i.id),
    confidenceNarrative: `Based on ${zoneLoad.size} active zones. Pressure ratio: ${(highest[1] / Math.max(1, lowest[1])).toFixed(1)}x.`,
    suggestedActions: [`Review coordination capacity in ${highest[0]}`, `Consider temporary support from ${lowest[0]} resources`],
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// OVERRIDE INSTRUMENTATION
// ============================================================

/**
 * Emit recommendation override event to operational memory.
 * Append-only — joins the same event pipeline as everything else.
 */
export async function emitRecommendationOverride(
  override: RecommendationOverride & { actorId: string; actorRole: string },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  await sb.from('rampiq_events').insert({
    event_type: `recommendation.${override.action}`,
    severity: 'LOW',
    station: 'LAX',
    qr_target_type: 'SYSTEM',
    qr_target_id: 'RECOMMENDATION',
    reported_by: override.actorId,
    role_type: override.actorRole,
    shift_window: 'AM',
    device_id: `DESKTOP-${override.actorId}`,
    source_platform: 'DESKTOP',
    notes: override.reason ?? null,
    operational_status: 'RESOLVED',
    sync_status: 'SYNCED',
    entity_type: 'recommendation',
    entity_id: override.recommendationId,
    state_before: 'generated',
    state_after: override.action,
    event_version: 2,
    details_json: {
      recommendation_id: override.recommendationId,
      action: override.action,
      actual_action: override.actualAction,
      reason: override.reason,
    },
  });
}
