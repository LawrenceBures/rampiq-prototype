// SOI — Production Resilience Layer
// Phase 17: Durability under degraded conditions.
//
// RULES:
//   1. Fail calmly and transparently — never silently
//   2. Preserve operational continuity during degradation
//   3. Detect stale state and surface it
//   4. No data loss under network failure
//   5. Reconnect without corrupting operational truth
//
// Handles: network degradation, stale sync, reconnect storms,
// long-duration memory integrity, session continuity.

import { getSupabase } from './supabase';

// ============================================================
// TYPES
// ============================================================

export interface ConnectionHealth {
  /** Current connection state */
  state: 'connected' | 'degraded' | 'disconnected' | 'reconnecting';
  /** Last successful data sync */
  lastSync: Date | null;
  /** Seconds since last sync */
  staleSeconds: number;
  /** Whether data should be considered potentially stale */
  isStale: boolean;
  /** Human-readable status */
  statusText: string;
}

export interface DurabilityReport {
  /** Connection health */
  connection: ConnectionHealth;
  /** Operational memory integrity */
  memoryIntegrity: {
    eventsLoaded: number;
    incidentsLoaded: number;
    oldestEventAge: number; // hours
    newestEventAge: number; // seconds
    gapDetected: boolean;
  };
  /** Session continuity */
  session: {
    operatorId: string;
    sessionDuration: number; // minutes
    reconnectCount: number;
  };
}

// ============================================================
// CONNECTION HEALTH
// ============================================================

const STALE_THRESHOLD_SECONDS = 30;
const DEGRADED_THRESHOLD_SECONDS = 15;

/**
 * Derive connection health from last sync timestamps.
 * Pure function — no side effects.
 */
export function deriveConnectionHealth(
  lastEventSync: Date | null,
  lastIncidentSync: Date | null,
  asOf?: Date,
): ConnectionHealth {
  const now = asOf ?? new Date();

  if (!lastEventSync && !lastIncidentSync) {
    return {
      state: 'disconnected',
      lastSync: null,
      staleSeconds: Infinity,
      isStale: true,
      statusText: 'No data received',
    };
  }

  const latestSync = lastEventSync && lastIncidentSync
    ? new Date(Math.max(lastEventSync.getTime(), lastIncidentSync.getTime()))
    : lastEventSync ?? lastIncidentSync;

  const staleSec = latestSync ? Math.round((now.getTime() - latestSync.getTime()) / 1000) : Infinity;
  const isStale = staleSec > STALE_THRESHOLD_SECONDS;

  const state: ConnectionHealth['state'] =
    staleSec > STALE_THRESHOLD_SECONDS ? 'degraded' :
    staleSec > DEGRADED_THRESHOLD_SECONDS ? 'degraded' :
    'connected';

  const statusText = state === 'connected'
    ? `Live · ${staleSec}s ago`
    : state === 'degraded'
    ? `Degraded · last sync ${staleSec}s ago`
    : 'Disconnected';

  return { state, lastSync: latestSync, staleSeconds: staleSec, isStale, statusText };
}

/**
 * Derive memory integrity from operational data.
 * Detects gaps, stale data, and continuity issues.
 */
export function deriveMemoryIntegrity(
  events: readonly { created_at: string }[],
  incidents: readonly { created_at: string }[],
  operatorId: string,
  sessionStartTime: Date,
  reconnectCount: number,
  asOf?: Date,
): DurabilityReport {
  const now = asOf ?? new Date();

  const eventTimes = events.map(e => new Date(e.created_at).getTime()).filter(t => t > 0);
  const oldestEvent = eventTimes.length > 0 ? Math.min(...eventTimes) : now.getTime();
  const newestEvent = eventTimes.length > 0 ? Math.max(...eventTimes) : now.getTime();

  // Gap detection: look for unexpected gaps > 15 min in event timeline
  const sortedTimes = [...eventTimes].sort((a, b) => a - b);
  let gapDetected = false;
  for (let i = 1; i < sortedTimes.length; i++) {
    if (sortedTimes[i] - sortedTimes[i - 1] > 15 * 60_000) {
      gapDetected = true;
      break;
    }
  }

  return {
    connection: deriveConnectionHealth(
      eventTimes.length > 0 ? new Date(newestEvent) : null,
      incidents.length > 0 ? new Date(Math.max(...incidents.map(i => new Date(i.created_at).getTime()))) : null,
      now,
    ),
    memoryIntegrity: {
      eventsLoaded: events.length,
      incidentsLoaded: incidents.length,
      oldestEventAge: Math.round((now.getTime() - oldestEvent) / 3600_000),
      newestEventAge: Math.round((now.getTime() - newestEvent) / 1000),
      gapDetected,
    },
    session: {
      operatorId,
      sessionDuration: Math.round((now.getTime() - sessionStartTime.getTime()) / 60_000),
      reconnectCount,
    },
  };
}

// ============================================================
// SUPABASE HEALTH CHECK
// ============================================================

/**
 * Lightweight health check against Supabase.
 * Returns true if the connection is functional.
 */
export async function checkSupabaseHealth(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb.from('rampiq_events').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
