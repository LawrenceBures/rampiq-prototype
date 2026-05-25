-- RampIQ — Operational Spine Hardening
-- Phase 1 Step 0: Replay-compatible event architecture
--
-- This migration is ADDITIVE ONLY. No columns are dropped, no tables are
-- removed, no existing behavior is changed. Every new column is nullable
-- so existing INSERT paths continue to work without modification.
--
-- What this enables:
--   1. Entity-level event tracking (what was affected)
--   2. State transition recording (before → after)
--   3. Event causality chains (what caused this event)
--   4. Correlation grouping (events that belong together)
--   5. Replay ordering (deterministic reconstruction from events)
--   6. Event contract versioning (safe schema evolution)

-- ============================================================
-- REPLAY-COMPATIBLE EVENT COLUMNS
-- ============================================================

-- Entity tracking: what operational entity was affected by this event?
-- Examples: entity_type='gate', entity_id='52A'
--           entity_type='equipment', entity_id='TUG-042'
--           entity_type='support_request', entity_id='SR-001'
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- State transition: what changed?
-- For lifecycle events (status changes), captures the before/after state.
-- Example: state_before='OPEN', state_after='ACKNOWLEDGED'
-- For creation events: state_before is NULL, state_after is the initial state.
-- For read-only events (scans, check-ins): both are NULL.
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS state_before TEXT;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS state_after TEXT;

-- Causality: what event triggered this one?
-- Example: equipment failure event → cascade of gate state change events.
-- Self-referencing FK. NULL for root-cause or standalone events.
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS causation_event_id UUID;

-- Correlation: group related events that form a single operational episode.
-- Example: all events from a single incident share a correlation_id.
-- This is NOT the incident ID — it's a grouping mechanism for replay.
-- Generated client-side as UUID when an episode begins.
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS correlation_id UUID;

-- Zone context: which zone does this event belong to?
-- Denormalized from gate → zone lookup for subscription scoping.
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS zone_id TEXT;

-- Event version: contract version for safe schema evolution.
-- All existing events are implicitly version 1.
-- When the event contract changes, increment this.
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS event_version INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- INDEXES FOR REPLAY & ENTITY QUERIES
-- ============================================================

-- Replay ordering: deterministic event sequence.
-- Uses offline_created_at when available (offline events created earlier
-- than their sync time), falls back to created_at.
CREATE INDEX IF NOT EXISTS idx_events_replay_order
  ON rampiq_events (COALESCE(offline_created_at, created_at));

-- Entity lookup: find all events for a specific entity.
-- Used by replay to reconstruct entity history.
CREATE INDEX IF NOT EXISTS idx_events_entity
  ON rampiq_events (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

-- Causality lookup: find downstream events triggered by a root cause.
CREATE INDEX IF NOT EXISTS idx_events_causation
  ON rampiq_events (causation_event_id)
  WHERE causation_event_id IS NOT NULL;

-- Correlation lookup: find all events in an operational episode.
CREATE INDEX IF NOT EXISTS idx_events_correlation
  ON rampiq_events (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Zone-scoped queries: filter events by zone for chief subscriptions.
CREATE INDEX IF NOT EXISTS idx_events_zone
  ON rampiq_events (zone_id, created_at DESC)
  WHERE zone_id IS NOT NULL;

-- ============================================================
-- BACKFILL entity_type / entity_id FROM EXISTING COLUMNS
-- ============================================================
-- Existing events already have gate_id, equipment_id, flight_id.
-- Populate entity_type/entity_id from the most specific context.

UPDATE rampiq_events
SET entity_type = 'equipment', entity_id = equipment_id
WHERE entity_type IS NULL AND equipment_id IS NOT NULL;

UPDATE rampiq_events
SET entity_type = 'gate', entity_id = gate_id
WHERE entity_type IS NULL AND gate_id IS NOT NULL;

UPDATE rampiq_events
SET entity_type = 'flight', entity_id = flight_id
WHERE entity_type IS NULL AND flight_id IS NOT NULL;

-- ============================================================
-- BACKFILL zone_id FROM GATE → ZONE MAPPING
-- ============================================================
-- Populate zone_id for gate-related events using the zones table.

UPDATE rampiq_events e
SET zone_id = z.id
FROM zones z
WHERE e.zone_id IS NULL
  AND e.gate_id IS NOT NULL
  AND e.gate_id = ANY(z.gate_ids);

-- ============================================================
-- COMMENT: ARCHITECTURAL NOTES
-- ============================================================
--
-- APPEND-ONLY PRINCIPLE (transition path):
--   The operational_status column on rampiq_events is currently mutable
--   (OPEN → ACKNOWLEDGED → RESOLVED). This violates append-only semantics.
--
--   We do NOT change this behavior in this migration because:
--   1. The existing dashboard depends on mutable status.
--   2. Changing it requires updating all status-reading code first.
--
--   The transition plan:
--   - New lifecycle entities (incidents, support_requests, recovery_actions)
--     will use append-only events from day one.
--   - The state_before/state_after columns capture transitions even on
--     mutable events, so replay can reconstruct the sequence.
--   - Phase 2 will move operational_status to a materialized view,
--     leaving rampiq_events as the immutable source of truth.
--
-- EVENT DURATION COMPUTATION:
--   event_duration_seconds is GENERATED ALWAYS from (resolved_at - created_at).
--   The TypeScript code also computes this client-side for localStorage.
--   This is fine: Supabase uses the generated column, localStorage uses
--   the client computation. No conflict — they produce the same value.
--
-- SYNC STATUS SEMANTICS:
--   sync_status defaults to 'SYNCED' and is never updated to 'PENDING'
--   or 'FAILED' in current code. The offline queue uses IndexedDB instead.
--   This is acceptable for Phase 1. When offline events sync, they arrive
--   with offline_created_at set, which is the true offline indicator.
--   Phase 2 will implement proper sync_status lifecycle.
