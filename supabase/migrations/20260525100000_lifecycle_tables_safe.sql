-- RampIQ — Lifecycle Persistence Foundation (SAFE VERSION)
-- Idempotent, split into independent statements.
-- Run each block separately in the SQL Editor if needed.

-- ============================================================
-- BLOCK 1: CREATE INCIDENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS rampiq_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  category          TEXT,
  severity          TEXT NOT NULL DEFAULT 'HIGH',
  status            TEXT NOT NULL DEFAULT 'DETECTED',
  station           TEXT NOT NULL DEFAULT 'LAX',
  zone_id           TEXT,
  gate_id           TEXT,
  flight_id         TEXT,
  affected_gate_ids TEXT[] NOT NULL DEFAULT '{}',
  affected_equipment_ids TEXT[] NOT NULL DEFAULT '{}',
  created_by        TEXT NOT NULL,
  assigned_to       TEXT,
  acknowledged_by   TEXT,
  description       TEXT,
  details_json      JSONB,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  recovering_at     TIMESTAMPTZ,
  stabilized_at     TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_event_id   UUID,
  correlation_id    UUID NOT NULL DEFAULT gen_random_uuid()
);

-- ============================================================
-- BLOCK 2: INCIDENTS INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_incidents_status ON rampiq_incidents (status) WHERE status NOT IN ('RESOLVED', 'CLOSED');
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON rampiq_incidents (severity, status);
CREATE INDEX IF NOT EXISTS idx_incidents_zone ON rampiq_incidents (zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_gate ON rampiq_incidents (gate_id) WHERE gate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_station ON rampiq_incidents (station, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_correlation ON rampiq_incidents (correlation_id);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON rampiq_incidents (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_created ON rampiq_incidents (created_at DESC);

-- ============================================================
-- BLOCK 3: INCIDENTS RLS
-- ============================================================

ALTER TABLE rampiq_incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rampiq_incidents' AND policyname = 'anon_read_incidents') THEN
    CREATE POLICY "anon_read_incidents" ON rampiq_incidents FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rampiq_incidents' AND policyname = 'anon_insert_incidents') THEN
    CREATE POLICY "anon_insert_incidents" ON rampiq_incidents FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rampiq_incidents' AND policyname = 'anon_update_incidents') THEN
    CREATE POLICY "anon_update_incidents" ON rampiq_incidents FOR UPDATE USING (true);
  END IF;
END $$;

-- ============================================================
-- BLOCK 4: INCIDENTS REALTIME (safe — catch duplicate)
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_incidents;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- BLOCK 5: CREATE RECOVERY ACTIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS rampiq_recovery_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID NOT NULL REFERENCES rampiq_incidents(id),
  title             TEXT NOT NULL,
  action_type       TEXT,
  severity          TEXT NOT NULL DEFAULT 'MEDIUM',
  status            TEXT NOT NULL DEFAULT 'PROPOSED',
  proposed_by       TEXT NOT NULL,
  assigned_to       TEXT,
  acknowledged_by   TEXT,
  station           TEXT NOT NULL DEFAULT 'LAX',
  zone_id           TEXT,
  gate_id           TEXT,
  description       TEXT,
  details_json      JSONB,
  eta_at            TIMESTAMPTZ,
  proposed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  blocked_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_event_id   UUID,
  correlation_id    UUID
);

-- ============================================================
-- BLOCK 6: RECOVERY ACTIONS INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_recovery_actions_incident ON rampiq_recovery_actions (incident_id, status);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_status ON rampiq_recovery_actions (status) WHERE status NOT IN ('COMPLETE', 'ESCALATED', 'WITHDRAWN');
CREATE INDEX IF NOT EXISTS idx_recovery_actions_assigned ON rampiq_recovery_actions (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_actions_zone ON rampiq_recovery_actions (zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_actions_gate ON rampiq_recovery_actions (gate_id) WHERE gate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_actions_correlation ON rampiq_recovery_actions (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_actions_created ON rampiq_recovery_actions (created_at DESC);

-- ============================================================
-- BLOCK 7: RECOVERY ACTIONS RLS
-- ============================================================

ALTER TABLE rampiq_recovery_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rampiq_recovery_actions' AND policyname = 'anon_read_recovery_actions') THEN
    CREATE POLICY "anon_read_recovery_actions" ON rampiq_recovery_actions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rampiq_recovery_actions' AND policyname = 'anon_insert_recovery_actions') THEN
    CREATE POLICY "anon_insert_recovery_actions" ON rampiq_recovery_actions FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rampiq_recovery_actions' AND policyname = 'anon_update_recovery_actions') THEN
    CREATE POLICY "anon_update_recovery_actions" ON rampiq_recovery_actions FOR UPDATE USING (true);
  END IF;
END $$;

-- ============================================================
-- BLOCK 8: RECOVERY ACTIONS REALTIME (safe — catch duplicate)
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_recovery_actions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================
-- BLOCK 9: UPDATED_AT TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- BLOCK 10: TRIGGERS (idempotent — drop if exists first)
-- ============================================================

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON rampiq_incidents;
CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON rampiq_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_recovery_actions_updated_at ON rampiq_recovery_actions;
CREATE TRIGGER trg_recovery_actions_updated_at
  BEFORE UPDATE ON rampiq_recovery_actions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- BLOCK 11: RELOAD POSTGREST SCHEMA CACHE
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFY
-- ============================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'rampiq_%'
ORDER BY table_name;
