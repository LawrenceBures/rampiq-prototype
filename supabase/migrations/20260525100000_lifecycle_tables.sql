-- RampIQ — Lifecycle Persistence Foundation
-- Phase 2 Step 1: Incidents + Recovery Actions
--
-- Architecture:
--   Lifecycle tables own CURRENT operational state (projection).
--   rampiq_events records IMMUTABLE operational history (event log).
--   Every lifecycle mutation appends a corresponding event.
--
-- This migration is ADDITIVE. No existing tables are modified.

-- ============================================================
-- INCIDENTS
-- ============================================================
-- An incident is a confirmed operational disruption requiring
-- coordinated response. Lifecycle: DETECTED → CONFIRMED →
-- RECOVERING → STABILIZED → RESOLVED → CLOSED.
--
-- Source of truth for: current incident status, ownership, timing.
-- Allowed mutations: status transitions per operational-states.ts.
-- Must never mutate without emitting rampiq_events row.

CREATE TABLE rampiq_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  title             TEXT NOT NULL,
  category          TEXT,                               -- e.g., 'EQ_FAILURE', 'CREW_SHORT', 'GATE_CONFLICT'
  severity          TEXT NOT NULL DEFAULT 'HIGH',        -- LOW, MEDIUM, HIGH, CRITICAL
  status            TEXT NOT NULL DEFAULT 'DETECTED',    -- DETECTED, CONFIRMED, RECOVERING, STABILIZED, RESOLVED, CLOSED

  -- Location context
  station           TEXT NOT NULL DEFAULT 'LAX',
  zone_id           TEXT,
  gate_id           TEXT,
  flight_id         TEXT,

  -- Affected scope
  affected_gate_ids TEXT[] NOT NULL DEFAULT '{}',        -- cascade targets
  affected_equipment_ids TEXT[] NOT NULL DEFAULT '{}',

  -- Ownership
  created_by        TEXT NOT NULL,                       -- user who detected/reported
  assigned_to       TEXT,                                -- chief/manager who owns response
  acknowledged_by   TEXT,

  -- Detail
  description       TEXT,
  details_json      JSONB,

  -- Timing
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  recovering_at     TIMESTAMPTZ,
  stabilized_at     TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Event linkage
  source_event_id   UUID,                                -- the rampiq_events row that triggered this incident
  correlation_id    UUID NOT NULL DEFAULT gen_random_uuid() -- groups all related events
);

-- Operational query indexes
CREATE INDEX idx_incidents_status ON rampiq_incidents (status) WHERE status NOT IN ('RESOLVED', 'CLOSED');
CREATE INDEX idx_incidents_severity ON rampiq_incidents (severity, status);
CREATE INDEX idx_incidents_zone ON rampiq_incidents (zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX idx_incidents_gate ON rampiq_incidents (gate_id) WHERE gate_id IS NOT NULL;
CREATE INDEX idx_incidents_station ON rampiq_incidents (station, created_at DESC);
CREATE INDEX idx_incidents_correlation ON rampiq_incidents (correlation_id);
CREATE INDEX idx_incidents_assigned ON rampiq_incidents (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_incidents_created ON rampiq_incidents (created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_incidents;

-- RLS (demo-grade)
ALTER TABLE rampiq_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_incidents" ON rampiq_incidents FOR SELECT USING (true);
CREATE POLICY "anon_insert_incidents" ON rampiq_incidents FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_incidents" ON rampiq_incidents FOR UPDATE USING (true);

-- ============================================================
-- RECOVERY ACTIONS
-- ============================================================
-- A recovery action is a discrete task within an incident response.
-- Lifecycle: PROPOSED → ACKNOWLEDGED → ACTIVE → COMPLETE
-- (or BLOCKED, ESCALATED, WITHDRAWN).
--
-- Source of truth for: current action status, assignment, timing.
-- Allowed mutations: status transitions per operational-states.ts.
-- Must never mutate without emitting rampiq_events row.

CREATE TABLE rampiq_recovery_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent incident
  incident_id       UUID NOT NULL REFERENCES rampiq_incidents(id),

  -- Classification
  title             TEXT NOT NULL,
  action_type       TEXT,                                -- e.g., 'DEPLOY_EQUIPMENT', 'REASSIGN_CREW', 'HOLD_PUSH', 'ESCALATE'
  severity          TEXT NOT NULL DEFAULT 'MEDIUM',       -- priority: LOW, MEDIUM, HIGH, CRITICAL
  status            TEXT NOT NULL DEFAULT 'PROPOSED',     -- PROPOSED, ACKNOWLEDGED, ACTIVE, BLOCKED, COMPLETE, ESCALATED, WITHDRAWN

  -- Assignment
  proposed_by       TEXT NOT NULL,                        -- who proposed this action
  assigned_to       TEXT,                                 -- who will execute
  acknowledged_by   TEXT,

  -- Location context (inherited from incident, can be overridden)
  station           TEXT NOT NULL DEFAULT 'LAX',
  zone_id           TEXT,
  gate_id           TEXT,

  -- Detail
  description       TEXT,
  details_json      JSONB,

  -- Timing
  eta_at            TIMESTAMPTZ,                         -- estimated completion
  proposed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  blocked_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Event linkage
  source_event_id   UUID,                                -- the event that prompted this action
  correlation_id    UUID                                  -- inherited from parent incident
);

-- Operational query indexes
CREATE INDEX idx_recovery_actions_incident ON rampiq_recovery_actions (incident_id, status);
CREATE INDEX idx_recovery_actions_status ON rampiq_recovery_actions (status) WHERE status NOT IN ('COMPLETE', 'ESCALATED', 'WITHDRAWN');
CREATE INDEX idx_recovery_actions_assigned ON rampiq_recovery_actions (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_recovery_actions_zone ON rampiq_recovery_actions (zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX idx_recovery_actions_gate ON rampiq_recovery_actions (gate_id) WHERE gate_id IS NOT NULL;
CREATE INDEX idx_recovery_actions_correlation ON rampiq_recovery_actions (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_recovery_actions_created ON rampiq_recovery_actions (created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_recovery_actions;

-- RLS (demo-grade)
ALTER TABLE rampiq_recovery_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_recovery_actions" ON rampiq_recovery_actions FOR SELECT USING (true);
CREATE POLICY "anon_insert_recovery_actions" ON rampiq_recovery_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_recovery_actions" ON rampiq_recovery_actions FOR UPDATE USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
-- Automatically set updated_at on every UPDATE.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON rampiq_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recovery_actions_updated_at
  BEFORE UPDATE ON rampiq_recovery_actions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
