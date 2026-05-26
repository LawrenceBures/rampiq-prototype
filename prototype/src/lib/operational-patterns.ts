// RampIQ — Operational Pattern Engine
// Phase 6: Deterministic intelligence from operational memory.
//
// RULES:
//   1. Pure functions only — no React, no hooks, no side effects
//   2. Replay-safe: every time-dependent function accepts optional asOf
//   3. No AI, no ML, no external services
//   4. All insights are explainable — contributing events are attached
//   5. All computations use existing data only
//   6. Imports types, never fetches data
//
// This module detects operational patterns from:
//   - rampiq_events (operational memory)
//   - Incident objects (lifecycle current state)
//   - RecoveryAction objects (recovery current state)

import type { RampiqEvent, Severity } from './rampiq-types';
import type { Incident, RecoveryAction } from './lifecycle-types';
import { SEVERITY_RANK, replayTimestamp } from './operational-states';

// ============================================================
// THRESHOLDS (tunable constants)
// ============================================================

const THRESHOLDS = {
  /** Gate incident recurrence window (ms) */
  GATE_RECURRENCE_WINDOW: 3 * 60 * 60_000, // 3 hours
  /** Minimum incidents at a gate to flag */
  GATE_RECURRENCE_MIN: 2,
  /** Equipment event count to flag */
  EQUIPMENT_EVENT_MIN: 2,
  /** Recovery friction: minimum failed/withdrawn actions */
  RECOVERY_FRICTION_MIN: 1,
  /** Slow recovery: minutes before flagging */
  SLOW_RECOVERY_MINUTES: 20,
  /** Zone sustained pressure: minutes of continuous unresolved */
  ZONE_PRESSURE_SUSTAINED_MIN: 30,
  /** Severity weight multipliers for scoring */
  SEVERITY_WEIGHT: { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 } as Record<string, number>,
} as const;

// ============================================================
// INSIGHT TYPES
// ============================================================

export type InsightCategory = 'gate_pattern' | 'equipment_risk' | 'recovery_friction' | 'zone_instability';

export interface PatternInsight {
  /** Unique insight category */
  category: InsightCategory;
  /** Visual urgency */
  severity: 'info' | 'watch' | 'alert';
  /** Short headline */
  title: string;
  /** Explanation of why this triggered */
  explanation: string;
  /** Numeric score for ranking (higher = more urgent) */
  score: number;
  /** Contributing event IDs for drill-down */
  contributingEventIds: string[];
  /** Contributing incident IDs */
  contributingIncidentIds: string[];
  /** Affected gate */
  gate?: string;
  /** Affected equipment */
  equipment?: string;
  /** Affected zone */
  zoneId?: string;
}

// ============================================================
// TREND DATA STRUCTURES
// ============================================================

export interface TrendPoint {
  /** Bucket label (e.g., "0-15m", "15-30m") */
  label: string;
  /** Event/incident count in this bucket */
  count: number;
  /** Severity-weighted score */
  weightedScore: number;
}

export type PressureState = 'rising' | 'stable' | 'falling' | 'sustained_high' | 'volatile' | 'stabilizing' | 'deteriorating';

export interface OperationalTrends {
  /** Incident volume over time (15-min buckets, last 2 hours) */
  incidentVolume: TrendPoint[];
  /** Pressure direction: rising, stable, falling */
  pressureDirection: 'rising' | 'stable' | 'falling';
  /** Pressure state with momentum context */
  pressureState: PressureState;
  /** Pressure momentum label for display */
  pressureLabel: string;
  /** Recovery completion rate (completed / total finished) */
  recoveryCompletionRate: number | null;
  /** Escalation count in current window */
  escalationCount: number;
  /** Max weighted score in any single bucket */
  peakBucketScore: number;
  /** Duration of sustained high pressure (minutes), 0 if not sustained */
  sustainedHighMinutes: number;
}

// ============================================================
// PATTERN ENGINE
// ============================================================

export interface PatternEngineOutput {
  insights: PatternInsight[];
  trends: OperationalTrends;
}

/**
 * Run the full pattern engine against operational data.
 * Pure function — no side effects, replay-safe.
 */
export function analyzeOperationalPatterns(
  events: readonly RampiqEvent[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  asOf?: Date,
): PatternEngineOutput {
  const now = asOf ?? new Date();
  const insights: PatternInsight[] = [];

  // ── Gate Pattern Detection ──
  insights.push(...detectGatePatterns(events, incidents, now));

  // ── Equipment Risk Detection ──
  insights.push(...detectEquipmentRisk(events, incidents, now));

  // ── Recovery Friction Detection ──
  insights.push(...detectRecoveryFriction(incidents, recoveryActions, now));

  // ── Zone Instability ──
  insights.push(...detectZoneInstability(events, incidents, now));

  // Sort by score descending
  insights.sort((a, b) => b.score - a.score);

  // ── Trends ──
  const trends = computeTrends(events, incidents, recoveryActions, now);

  return { insights, trends };
}

// ============================================================
// GATE PATTERNS
// ============================================================

function detectGatePatterns(
  events: readonly RampiqEvent[],
  incidents: readonly Incident[],
  now: Date,
): PatternInsight[] {
  const results: PatternInsight[] = [];
  const windowStart = now.getTime() - THRESHOLDS.GATE_RECURRENCE_WINDOW;

  // Group incidents by gate within the window
  const gateIncidents = new Map<string, Incident[]>();
  for (const inc of incidents) {
    if (inc.gate_id && new Date(inc.opened_at).getTime() >= windowStart) {
      const existing = gateIncidents.get(inc.gate_id) ?? [];
      existing.push(inc);
      gateIncidents.set(inc.gate_id, existing);
    }
  }

  for (const [gate, incs] of gateIncidents) {
    if (incs.length >= THRESHOLDS.GATE_RECURRENCE_MIN) {
      const severityScore = incs.reduce((sum, i) => sum + (THRESHOLDS.SEVERITY_WEIGHT[i.severity] ?? 1), 0);
      const unresolvedCount = incs.filter(i => !i.resolved_at).length;

      // Check for common event types at this gate
      const gateEvents = events.filter(e => e.gate_id === gate && new Date(replayTimestamp(e)).getTime() >= windowStart);
      const typeCounts = new Map<string, number>();
      for (const e of gateEvents) {
        typeCounts.set(e.event_type, (typeCounts.get(e.event_type) ?? 0) + 1);
      }
      const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const typeNote = dominantType && dominantType[1] >= 2
        ? ` Most frequent: ${dominantType[0].replace(/_/g, ' ')} (${dominantType[1]}x).`
        : '';

      results.push({
        category: 'gate_pattern',
        severity: unresolvedCount >= 2 ? 'alert' : severityScore >= 6 ? 'alert' : 'watch',
        title: `Gate ${gate}: ${incs.length} incidents in ${Math.round(THRESHOLDS.GATE_RECURRENCE_WINDOW / 3600_000)}h`,
        explanation: `${unresolvedCount} unresolved. Severity-weighted score: ${severityScore}.${typeNote} Repeated incidents at the same gate may indicate systemic equipment, staffing, or procedural issues.`,
        score: severityScore * 10 + unresolvedCount * 5,
        contributingEventIds: gateEvents.map(e => e.id),
        contributingIncidentIds: incs.map(i => i.id),
        gate,
      });
    }
  }

  return results;
}

// ============================================================
// EQUIPMENT RISK
// ============================================================

function detectEquipmentRisk(
  events: readonly RampiqEvent[],
  incidents: readonly Incident[],
  now: Date,
): PatternInsight[] {
  const results: PatternInsight[] = [];

  // Equipment referenced in events
  const equipEvents = new Map<string, RampiqEvent[]>();
  for (const e of events) {
    if (e.equipment_id) {
      const existing = equipEvents.get(e.equipment_id) ?? [];
      existing.push(e);
      equipEvents.set(e.equipment_id, existing);
    }
  }

  // Equipment referenced in incidents
  const equipIncidents = new Map<string, Incident[]>();
  for (const inc of incidents) {
    for (const eid of inc.affected_equipment_ids ?? []) {
      const existing = equipIncidents.get(eid) ?? [];
      existing.push(inc);
      equipIncidents.set(eid, existing);
    }
  }

  // Union all equipment IDs
  const allEquip = new Set([...equipEvents.keys(), ...equipIncidents.keys()]);

  for (const equip of allEquip) {
    const evts = equipEvents.get(equip) ?? [];
    const incs = equipIncidents.get(equip) ?? [];
    const totalMentions = evts.length + incs.length;

    if (totalMentions >= THRESHOLDS.EQUIPMENT_EVENT_MIN) {
      const openEvents = evts.filter(e => e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED');
      const unresolvedIncs = incs.filter(i => !i.resolved_at);
      const severityScore = evts.reduce((s, e) => s + (THRESHOLDS.SEVERITY_WEIGHT[e.severity] ?? 1), 0)
        + incs.reduce((s, i) => s + (THRESHOLDS.SEVERITY_WEIGHT[i.severity] ?? 1), 0);

      results.push({
        category: 'equipment_risk',
        severity: unresolvedIncs.length >= 1 || openEvents.length >= 2 ? 'alert' : 'watch',
        title: `${equip}: ${totalMentions} mentions (${openEvents.length + unresolvedIncs.length} unresolved)`,
        explanation: `Equipment appears in ${evts.length} events and ${incs.length} incidents. ${openEvents.length} open events, ${unresolvedIncs.length} unresolved incidents. Consider maintenance review or replacement.`,
        score: severityScore * 8 + (openEvents.length + unresolvedIncs.length) * 10,
        contributingEventIds: evts.map(e => e.id),
        contributingIncidentIds: incs.map(i => i.id),
        equipment: equip,
      });
    }
  }

  return results;
}

// ============================================================
// RECOVERY FRICTION
// ============================================================

function detectRecoveryFriction(
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  now: Date,
): PatternInsight[] {
  const results: PatternInsight[] = [];

  // Group recovery actions by incident
  const incActions = new Map<string, RecoveryAction[]>();
  for (const ra of recoveryActions) {
    const existing = incActions.get(ra.incident_id) ?? [];
    existing.push(ra);
    incActions.set(ra.incident_id, existing);
  }

  for (const inc of incidents) {
    const actions = incActions.get(inc.id) ?? [];
    if (actions.length === 0) continue;

    const failed = actions.filter(a => a.status === 'WITHDRAWN' || a.status === 'ESCALATED' || a.status === 'BLOCKED');
    const active = actions.filter(a => !['COMPLETE', 'WITHDRAWN', 'ESCALATED'].includes(a.status));

    // Check for friction: failed/blocked actions
    if (failed.length >= THRESHOLDS.RECOVERY_FRICTION_MIN) {
      results.push({
        category: 'recovery_friction',
        severity: failed.length >= 2 ? 'alert' : 'watch',
        title: `${inc.title.slice(0, 30)}: ${failed.length} failed/blocked actions`,
        explanation: `${actions.length} total recovery actions, ${failed.length} withdrawn/escalated/blocked. Recovery coordination may need different approach or additional resources.`,
        score: failed.length * 15 + (THRESHOLDS.SEVERITY_WEIGHT[inc.severity] ?? 1) * 5,
        contributingEventIds: [],
        contributingIncidentIds: [inc.id],
      });
    }

    // Check for slow recovery: incident recovering for too long
    if (inc.recovering_at && !inc.resolved_at) {
      const recoveringMin = Math.round((now.getTime() - new Date(inc.recovering_at).getTime()) / 60_000);
      if (recoveringMin >= THRESHOLDS.SLOW_RECOVERY_MINUTES) {
        results.push({
          category: 'recovery_friction',
          severity: recoveringMin >= 45 ? 'alert' : 'watch',
          title: `${inc.title.slice(0, 30)}: recovering for ${recoveringMin}m`,
          explanation: `Incident has been in RECOVERING status for ${recoveringMin} minutes with ${active.length} active recovery actions. Consider escalation or alternative recovery strategy.`,
          score: recoveringMin + (THRESHOLDS.SEVERITY_WEIGHT[inc.severity] ?? 1) * 8,
          contributingEventIds: [],
          contributingIncidentIds: [inc.id],
        });
      }
    }
  }

  return results;
}

// ============================================================
// ZONE INSTABILITY
// ============================================================

function detectZoneInstability(
  events: readonly RampiqEvent[],
  incidents: readonly Incident[],
  now: Date,
): PatternInsight[] {
  const results: PatternInsight[] = [];

  // Group incidents by zone
  const zoneIncidents = new Map<string, Incident[]>();
  for (const inc of incidents) {
    if (inc.zone_id) {
      const existing = zoneIncidents.get(inc.zone_id) ?? [];
      existing.push(inc);
      zoneIncidents.set(inc.zone_id, existing);
    }
  }

  for (const [zoneId, incs] of zoneIncidents) {
    const unresolved = incs.filter(i => !i.resolved_at);
    const critHigh = unresolved.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');

    // Sustained pressure: multiple unresolved incidents
    if (unresolved.length >= 2) {
      const oldestUnresolved = unresolved.reduce((a, b) =>
        new Date(a.opened_at).getTime() < new Date(b.opened_at).getTime() ? a : b
      );
      const pressureMin = Math.round((now.getTime() - new Date(oldestUnresolved.opened_at).getTime()) / 60_000);

      if (pressureMin >= THRESHOLDS.ZONE_PRESSURE_SUSTAINED_MIN) {
        results.push({
          category: 'zone_instability',
          severity: critHigh.length >= 2 ? 'alert' : pressureMin >= 60 ? 'alert' : 'watch',
          title: `${zoneId}: ${unresolved.length} unresolved for ${pressureMin}m`,
          explanation: `Zone has sustained operational pressure for ${pressureMin} minutes. ${critHigh.length} critical/high incidents active. ${unresolved.length} total unresolved incidents. Zone may need staffing reinforcement or incident command escalation.`,
          score: pressureMin + critHigh.length * 20 + unresolved.length * 10,
          contributingEventIds: [],
          contributingIncidentIds: unresolved.map(i => i.id),
          zoneId,
        });
      }
    }

    // Simultaneous high-severity
    if (critHigh.length >= 2) {
      results.push({
        category: 'zone_instability',
        severity: critHigh.length >= 3 ? 'alert' : 'watch',
        title: `${zoneId}: ${critHigh.length} HIGH+ incidents simultaneous`,
        explanation: `Multiple high-severity incidents active in the same zone. Operational capacity likely exceeded. Consider diverting resources from lower-pressure zones.`,
        score: critHigh.length * 25,
        contributingEventIds: [],
        contributingIncidentIds: critHigh.map(i => i.id),
        zoneId,
      });
    }
  }

  return results;
}

// ============================================================
// OPERATIONAL TRENDS
// ============================================================

function computeTrends(
  events: readonly RampiqEvent[],
  incidents: readonly Incident[],
  recoveryActions: readonly RecoveryAction[],
  now: Date,
): OperationalTrends {
  // ── Incident volume in 15-minute buckets (last 2 hours) ──
  const bucketSize = 15 * 60_000;
  const windowMs = 2 * 60 * 60_000;
  const bucketCount = Math.ceil(windowMs / bucketSize);
  const incidentVolume: TrendPoint[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketEnd = now.getTime() - i * bucketSize;
    const bucketStart = bucketEnd - bucketSize;
    const label = `${i * 15}-${(i + 1) * 15}m ago`;

    const bucketIncidents = incidents.filter(inc => {
      const t = new Date(inc.opened_at).getTime();
      return t >= bucketStart && t < bucketEnd;
    });

    const weightedScore = bucketIncidents.reduce(
      (sum, inc) => sum + (THRESHOLDS.SEVERITY_WEIGHT[inc.severity] ?? 1), 0
    );

    incidentVolume.push({ label, count: bucketIncidents.length, weightedScore });
  }

  // ── Pressure direction ──
  const halfPoint = Math.floor(bucketCount / 2);
  const recentScore = incidentVolume.slice(0, halfPoint).reduce((s, t) => s + t.weightedScore, 0);
  const olderScore = incidentVolume.slice(halfPoint).reduce((s, t) => s + t.weightedScore, 0);
  const pressureDirection: 'rising' | 'stable' | 'falling' =
    recentScore > olderScore * 1.3 ? 'rising' :
    recentScore < olderScore * 0.7 ? 'falling' : 'stable';

  // ── Pressure momentum (finer grain) ──
  const peakBucketScore = Math.max(...incidentVolume.map(t => t.weightedScore), 0);
  const totalScore = incidentVolume.reduce((s, t) => s + t.weightedScore, 0);
  const q1Score = incidentVolume.slice(0, 2).reduce((s, t) => s + t.weightedScore, 0); // most recent 30min
  const q2Score = incidentVolume.slice(2, 4).reduce((s, t) => s + t.weightedScore, 0); // 30-60min ago

  // Sustained high: multiple consecutive high-score buckets
  let sustainedHighMinutes = 0;
  for (const t of incidentVolume) {
    if (t.weightedScore >= 4) sustainedHighMinutes += 15;
    else break;
  }

  // Determine pressure state
  let pressureState: PressureState;
  let pressureLabel: string;

  if (sustainedHighMinutes >= 60 && pressureDirection !== 'falling') {
    pressureState = 'sustained_high';
    pressureLabel = `sustained high pressure ${sustainedHighMinutes}m`;
  } else if (pressureDirection === 'rising' && q1Score > q2Score * 1.5) {
    pressureState = 'deteriorating';
    pressureLabel = 'pressure deteriorating';
  } else if (pressureDirection === 'falling' && q1Score > 0) {
    pressureState = 'stabilizing';
    pressureLabel = 'pressure stabilizing';
  } else if (pressureDirection === 'falling' && q1Score === 0) {
    pressureState = 'falling';
    pressureLabel = 'pressure falling';
  } else if (pressureDirection === 'rising') {
    pressureState = 'rising';
    pressureLabel = 'pressure rising';
  } else if (totalScore > 0 && peakBucketScore >= 6) {
    // High variance across buckets
    const variance = incidentVolume.reduce((s, t) => s + Math.pow(t.weightedScore - totalScore / bucketCount, 2), 0) / bucketCount;
    if (variance > 4) {
      pressureState = 'volatile';
      pressureLabel = 'pressure volatile';
    } else {
      pressureState = 'stable';
      pressureLabel = '';
    }
  } else {
    pressureState = 'stable';
    pressureLabel = '';
  }

  // ── Recovery completion rate ──
  const terminalStatuses = ['COMPLETE', 'WITHDRAWN', 'ESCALATED'];
  const completedActions = recoveryActions.filter(a => a.status === 'COMPLETE').length;
  const totalFinished = recoveryActions.filter(a => terminalStatuses.includes(a.status)).length;
  const recoveryCompletionRate = totalFinished > 0 ? completedActions / totalFinished : null;

  // ── Escalation count ──
  const escalationCount = recoveryActions.filter(a => a.status === 'ESCALATED').length
    + incidents.filter(i => i.severity === 'CRITICAL').length;

  return {
    incidentVolume, pressureDirection, pressureState, pressureLabel,
    recoveryCompletionRate, escalationCount, peakBucketScore, sustainedHighMinutes,
  };
}
