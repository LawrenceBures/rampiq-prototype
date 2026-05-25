// RampIQ — Derived Operational State
// Phase 1 Step 4: Pure functions that interpret operational events.
//
// RULES:
//   1. Pure functions only — no React, no hooks, no side effects
//   2. No Date.now() without explicit asOf fallback
//   3. No fetches, no subscriptions, no mutations of input arrays
//   4. All functions return new objects/arrays (immutable inputs)
//   5. Replay-safe: every time-dependent function accepts optional asOf
//   6. Imports canonical language from operational-states.ts
//
// This module defines HOW operational state is interpreted.
// It does NOT define WHAT states exist (that's operational-states.ts).
// It does NOT render anything (that's components/).
// It does NOT fetch data (that's store.ts).

import type { RampiqEvent, Severity, OperationalStatus } from './rampiq-types';
import {
  SEVERITY_RANK,
  elapsedSeconds,
  classifyAge,
  replayTimestamp,
  type AgeClass,
} from './operational-states';

// ============================================================
// CORE PREDICATES
// ============================================================

/** Event is operationally open (not terminal). */
export function isOpen(e: RampiqEvent): boolean {
  return e.operational_status !== 'RESOLVED' && e.operational_status !== 'CANCELLED';
}

/** Event is resolved. */
export function isResolved(e: RampiqEvent): boolean {
  return e.operational_status === 'RESOLVED';
}

/** Event is terminal (resolved or cancelled). */
export function isTerminal(e: RampiqEvent): boolean {
  return e.operational_status === 'RESOLVED' || e.operational_status === 'CANCELLED';
}

// ============================================================
// EVENT SUMMARIES
// ============================================================

export interface SeverityBreakdown {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
}

export interface StatusBreakdown {
  OPEN: number;
  ACKNOWLEDGED: number;
  IN_PROGRESS: number;
  RESOLVED: number;
  CANCELLED: number;
}

export interface ResolutionLatency {
  avg: number | null;
  p50: number | null;
  p90: number | null;
  sampleCount: number;
}

export interface EventSummary {
  total: number;
  openCount: number;
  resolvedCount: number;
  critHighCount: number;
  severity: SeverityBreakdown;
  status: StatusBreakdown;
  oldestOpen: RampiqEvent | null;
  resolutionLatency: ResolutionLatency;
}

/** Compute summary statistics from an event list. */
export function summarizeEvents(events: readonly RampiqEvent[]): EventSummary {
  const severity: SeverityBreakdown = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const status: StatusBreakdown = { OPEN: 0, ACKNOWLEDGED: 0, IN_PROGRESS: 0, RESOLVED: 0, CANCELLED: 0 };
  let oldestOpen: RampiqEvent | null = null;
  const resTimes: number[] = [];

  for (const e of events) {
    // Status counts
    if (e.operational_status in status) {
      status[e.operational_status as keyof StatusBreakdown]++;
    }

    // Severity counts for open events
    if (isOpen(e) && e.severity in severity) {
      severity[e.severity as keyof SeverityBreakdown]++;
    }

    // Oldest open
    if (isOpen(e)) {
      if (!oldestOpen || e.created_at < oldestOpen.created_at) {
        oldestOpen = e;
      }
    }

    // Resolution times
    if (isResolved(e) && e.event_duration_seconds != null && e.event_duration_seconds > 0) {
      resTimes.push(e.event_duration_seconds);
    }
  }

  const openCount = status.OPEN + status.ACKNOWLEDGED + status.IN_PROGRESS;

  return {
    total: events.length,
    openCount,
    resolvedCount: status.RESOLVED,
    critHighCount: severity.CRITICAL + severity.HIGH,
    severity,
    status,
    oldestOpen,
    resolutionLatency: computeLatency(resTimes),
  };
}

function computeLatency(times: number[]): ResolutionLatency {
  if (times.length === 0) {
    return { avg: null, p50: null, p90: null, sampleCount: 0 };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    avg: Math.round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    sampleCount: sorted.length,
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================================
// EVENT FILTERING
// ============================================================

export interface EventFilters {
  severity?: string;
  status?: string;
  gate?: string;
  equipment?: string;
  shift?: string;
}

/** Apply filters to an event list. Returns a new array. */
export function filterEvents(
  events: readonly RampiqEvent[],
  filters: EventFilters,
): RampiqEvent[] {
  let out = [...events];
  if (filters.severity && filters.severity !== 'ALL') {
    out = out.filter(e => e.severity === filters.severity);
  }
  if (filters.status && filters.status !== 'ALL') {
    out = out.filter(e => e.operational_status === filters.status);
  }
  if (filters.gate && filters.gate !== 'ALL') {
    out = out.filter(e => e.gate_id === filters.gate);
  }
  if (filters.equipment && filters.equipment !== 'ALL') {
    out = out.filter(e => e.equipment_id === filters.equipment);
  }
  if (filters.shift && filters.shift !== 'ALL') {
    out = out.filter(e => e.shift_window === filters.shift);
  }
  return out;
}

/** Count how many filters are active (not 'ALL'). */
export function activeFilterCount(filters: EventFilters): number {
  return Object.values(filters).filter(v => v && v !== 'ALL').length;
}

/** Extract unique values for filter chip options. */
export function extractFilterOptions(events: readonly RampiqEvent[]): {
  gates: string[];
  equipment: string[];
  shifts: string[];
} {
  const gates = new Set<string>();
  const equipment = new Set<string>();
  const shifts = new Set<string>();

  for (const e of events) {
    if (e.gate_id) gates.add(e.gate_id);
    if (e.equipment_id) equipment.add(e.equipment_id);
    shifts.add(e.shift_window);
  }

  return {
    gates: Array.from(gates),
    equipment: Array.from(equipment),
    shifts: Array.from(shifts),
  };
}

// ============================================================
// SORTING
// ============================================================

/** Sort events by severity (most severe first), then by age (oldest first within same severity). */
export function sortBySeverityThenAge(events: readonly RampiqEvent[]): RampiqEvent[] {
  return [...events].sort((a, b) => {
    const sd = (SEVERITY_RANK[a.severity as Severity] ?? 99) - (SEVERITY_RANK[b.severity as Severity] ?? 99);
    if (sd !== 0) return sd;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** Sort events by replay-safe timestamp (chronological). */
export function sortByReplayOrder(events: readonly RampiqEvent[]): RampiqEvent[] {
  return [...events].sort((a, b) => {
    const ta = replayTimestamp(a);
    const tb = replayTimestamp(b);
    return ta.localeCompare(tb);
  });
}

// ============================================================
// AGING & ESCALATION
// ============================================================

/** Aging CSS class for an event card. Replay-safe. */
export function agingClass(e: RampiqEvent, asOf?: Date): string {
  if (isTerminal(e)) return '';
  const age = classifyAge(e.created_at, asOf);
  const map: Record<AgeClass, string> = {
    fresh: '',
    warm: 'aging-warm',
    hot: 'aging-hot',
    stale: 'aging-stale',
  };
  return map[age];
}

/** Age in minutes. Replay-safe. */
export function ageMinutes(createdAt: string, asOf?: Date): number {
  const now = asOf ?? new Date();
  return Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000);
}

/** Whether an event's age exceeds an urgency threshold. */
export function isAgeUrgent(createdAt: string, thresholdMins: number, asOf?: Date): boolean {
  return ageMinutes(createdAt, asOf) > thresholdMins;
}

export interface AgingGroup<T> {
  label: string;
  cssClass: string;
  events: T[];
}

/** Group events by aging band. Replay-safe. */
export function groupByAging(
  events: readonly RampiqEvent[],
  asOf?: Date,
): AgingGroup<RampiqEvent>[] {
  const stale: RampiqEvent[] = [];
  const hot: RampiqEvent[] = [];
  const warm: RampiqEvent[] = [];
  const fresh: RampiqEvent[] = [];

  for (const e of events) {
    const mins = ageMinutes(e.created_at, asOf);
    if (mins > 30) stale.push(e);
    else if (mins > 15) hot.push(e);
    else if (mins > 5) warm.push(e);
    else fresh.push(e);
  }

  const groups: AgingGroup<RampiqEvent>[] = [];
  if (stale.length > 0) groups.push({ label: `Stale > 30 min (${stale.length})`, cssClass: 'ag-stale', events: stale });
  if (hot.length > 0) groups.push({ label: `Aging 15\u201330 min (${hot.length})`, cssClass: 'ag-hot', events: hot });
  if (warm.length > 0) groups.push({ label: `Active 5\u201315 min (${warm.length})`, cssClass: 'ag-warm', events: warm });
  if (fresh.length > 0) groups.push({ label: `Just reported < 5 min (${fresh.length})`, cssClass: 'ag-fresh', events: fresh });

  return groups;
}

// ============================================================
// GROUPING
// ============================================================

/** Group events by a key function. Returns entries sorted by count descending. */
export function groupEventsBy(
  events: readonly RampiqEvent[],
  keyFn: (e: RampiqEvent) => string | null,
): { key: string; count: number; events: RampiqEvent[] }[] {
  const map = new Map<string, RampiqEvent[]>();

  for (const e of events) {
    const key = keyFn(e);
    if (key == null) continue;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }

  return Array.from(map.entries())
    .map(([key, evts]) => ({ key, count: evts.length, events: evts }))
    .sort((a, b) => b.count - a.count);
}

/** Group events by entity (entity_type:entity_id). */
export function groupByEntity(events: readonly RampiqEvent[]) {
  return groupEventsBy(events, e =>
    e.entity_type && e.entity_id ? `${e.entity_type}:${e.entity_id}` : null,
  );
}

/** Group events by zone. */
export function groupByZone(events: readonly RampiqEvent[]) {
  return groupEventsBy(events, e => e.zone_id ?? null);
}

// ============================================================
// PRESSURE DERIVATION
// ============================================================

/**
 * Derive pressure for a set of events scoped to a zone or gate.
 * Pressure is a 0-100 value based on:
 * - Open event count (weight: base)
 * - Max severity of open events (weight: severity multiplier)
 * - Age of oldest unresolved event (weight: urgency)
 *
 * Replay-safe via asOf parameter.
 */
export function derivePressure(
  events: readonly RampiqEvent[],
  asOf?: Date,
): number {
  const openEvents = events.filter(isOpen);
  if (openEvents.length === 0) return 0;

  // Base: event count contribution (max 40 points)
  const countScore = Math.min(openEvents.length * 10, 40);

  // Severity: weighted by rank (max 35 points)
  let severityScore = 0;
  for (const e of openEvents) {
    const rank = SEVERITY_RANK[e.severity as Severity] ?? 3;
    // CRITICAL=15, HIGH=10, MEDIUM=5, LOW=2
    severityScore += [15, 10, 5, 2][rank] ?? 2;
  }
  severityScore = Math.min(severityScore, 35);

  // Age: oldest unresolved event urgency (max 25 points)
  const oldest = openEvents.reduce((o, e) => e.created_at < o.created_at ? e : o);
  const oldestMins = ageMinutes(oldest.created_at, asOf);
  const ageScore = Math.min(Math.floor(oldestMins / 2), 25);

  return Math.min(countScore + severityScore + ageScore, 100);
}

/**
 * Derive pressure per gate from a set of events.
 * Returns a map of gate_id → pressure value.
 */
export function deriveGatePressures(
  events: readonly RampiqEvent[],
  asOf?: Date,
): Map<string, number> {
  const byGate = new Map<string, RampiqEvent[]>();
  for (const e of events) {
    if (!e.gate_id) continue;
    const arr = byGate.get(e.gate_id);
    if (arr) arr.push(e);
    else byGate.set(e.gate_id, [e]);
  }

  const pressures = new Map<string, number>();
  byGate.forEach((gateEvents, gateId) => {
    pressures.set(gateId, derivePressure(gateEvents, asOf));
  });
  return pressures;
}

/**
 * Derive pressure per zone from a set of events.
 * Returns a map of zone_id → pressure value.
 */
export function deriveZonePressures(
  events: readonly RampiqEvent[],
  asOf?: Date,
): Map<string, number> {
  const byZone = new Map<string, RampiqEvent[]>();
  for (const e of events) {
    if (!e.zone_id) continue;
    const arr = byZone.get(e.zone_id);
    if (arr) arr.push(e);
    else byZone.set(e.zone_id, [e]);
  }

  const pressures = new Map<string, number>();
  byZone.forEach((zoneEvents, zoneId) => {
    pressures.set(zoneId, derivePressure(zoneEvents, asOf));
  });
  return pressures;
}

// ============================================================
// PATTERNS / DISTRIBUTION
// ============================================================

export interface DistributionEntry {
  key: string;
  count: number;
  /** Proportion relative to max count (0-1). For bar chart rendering. */
  proportion: number;
  /** Average resolution time in seconds, if applicable. */
  avgResolution: number | null;
}

/** Compute distribution by a key function with resolution time averages. */
export function computeDistribution(
  events: readonly RampiqEvent[],
  keyFn: (e: RampiqEvent) => string | null,
): DistributionEntry[] {
  const counts = new Map<string, number>();
  const resTotals = new Map<string, { total: number; count: number }>();

  for (const e of events) {
    const key = keyFn(e);
    if (key == null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);

    if (isResolved(e) && e.event_duration_seconds != null && e.event_duration_seconds > 0) {
      const existing = resTotals.get(key) ?? { total: 0, count: 0 };
      existing.total += e.event_duration_seconds;
      existing.count++;
      resTotals.set(key, existing);
    }
  }

  const entries = Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const maxCount = Math.max(...entries.map(e => e.count), 1);

  return entries.map(({ key, count }) => {
    const res = resTotals.get(key);
    return {
      key,
      count,
      proportion: count / maxCount,
      avgResolution: res ? Math.round(res.total / res.count) : null,
    };
  });
}

// ============================================================
// DASHBOARD VIEW MODEL
// ============================================================

export interface DashboardState {
  /** Summary statistics. */
  summary: EventSummary;

  /** Available filter options extracted from events. */
  filterOptions: {
    gates: string[];
    equipment: string[];
    shifts: string[];
  };

  /** Events grouped by aging band (for unresolved view). */
  unresolvedByAging: AgingGroup<RampiqEvent>[];

  /** Pattern distributions. */
  patterns: {
    byType: DistributionEntry[];
    byGate: DistributionEntry[];
    byEquipment: DistributionEntry[];
    byShift: DistributionEntry[];
  };

  /** Attention events (CRITICAL + HIGH, sorted by severity). */
  attentionEvents: RampiqEvent[];
}

/**
 * Derive the complete dashboard view model from raw events.
 *
 * This is the single function that replaces all inline computation
 * currently scattered in the dashboard page component.
 *
 * Replay-safe via asOf parameter.
 */
export function deriveDashboardState(
  events: readonly RampiqEvent[],
  asOf?: Date,
): DashboardState {
  const summary = summarizeEvents(events);
  const filterOptions = extractFilterOptions(events);

  // Unresolved events sorted by severity then age, grouped by aging band
  const openEvents = events.filter(isOpen);
  const sortedOpen = sortBySeverityThenAge(openEvents);
  const unresolvedByAging = groupByAging(sortedOpen, asOf);

  // Pattern distributions
  const byType = computeDistribution(events, e => e.event_type);
  const byGate = computeDistribution(events, e => e.gate_id);
  const byEquipment = computeDistribution(events, e => e.equipment_id);
  const byShift = computeDistribution(events, e => e.shift_window);

  // Attention: top 3 critical/high open events
  const attentionEvents = sortBySeverityThenAge(
    openEvents.filter(e => e.severity === 'CRITICAL' || e.severity === 'HIGH'),
  ).slice(0, 3);

  return {
    summary,
    filterOptions,
    unresolvedByAging,
    patterns: { byType, byGate, byEquipment, byShift },
    attentionEvents,
  };
}
