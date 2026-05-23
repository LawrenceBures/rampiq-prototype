-- RampIQ Phase 1 — Crew Assignments & Recommendation Infrastructure
-- Run after 003_workforce_readiness.sql
-- Captures the operational decision trail: who assigned what crew where,
-- whether a recommendation was followed or overridden, and links to outcomes.

-- ============================================================
-- CREW ASSIGNMENTS
-- One row = one operational decision: this team was assigned to
-- this zone/gate/equipment by this person at this time.
-- ============================================================
CREATE TABLE crew_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Who was assigned (snapshot at assignment time)
  team_id               text NOT NULL REFERENCES teams(id),
  assigned_user_ids     text[] NOT NULL DEFAULT '{}',

  -- Where / what
  zone_id               text REFERENCES zones(id),
  gate_ids              text[] NOT NULL DEFAULT '{}',
  equipment_ids         text[] NOT NULL DEFAULT '{}',

  -- Who made the assignment
  assigned_by           text NOT NULL,
  shift_window          text NOT NULL,                       -- AM, PM, OVERNIGHT

  -- Recommendation linkage (nullable — manual assignments are valid)
  recommendation_id     uuid REFERENCES recommendation_log(id),
  recommended_team_id   text,
  recommendation_reason text,

  -- Override tracking
  override_used         boolean NOT NULL DEFAULT false,
  override_reason       text,
  override_by           text,

  -- Lifecycle
  status                text NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE, COMPLETED, CANCELLED
  completed_at          timestamptz,
  completed_by          text,
  notes                 text
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_crew_assign_team ON crew_assignments (team_id, created_at DESC);
CREATE INDEX idx_crew_assign_zone ON crew_assignments (zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX idx_crew_assign_status ON crew_assignments (status, shift_window);
CREATE INDEX idx_crew_assign_by ON crew_assignments (assigned_by, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (demo-grade)
-- ============================================================
ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_assignments" ON crew_assignments FOR SELECT USING (true);
CREATE POLICY "anon_insert_assignments" ON crew_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_assignments" ON crew_assignments FOR UPDATE USING (true);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE crew_assignments;

-- ============================================================
-- SEED: Initial crew assignments matching existing teams → zones
-- ============================================================
INSERT INTO crew_assignments (
  team_id, assigned_user_ids, zone_id, gate_ids, equipment_ids,
  assigned_by, shift_window, status, notes
) VALUES
  (
    'ALPHA-AM',
    '{CM,TC12,BR01,LD03}',
    'T7-NORTH',
    '{G42B,G47A}',
    '{TUG-042,BELT-007}',
    'LD03',
    'AM',
    'ACTIVE',
    'Standard AM assignment — Alpha covers Terminal 7 North gates'
  ),
  (
    'BRAVO-PM',
    '{TC14}',
    'T7-SOUTH',
    '{G50}',
    '{GPU-031}',
    'TC14',
    'PM',
    'ACTIVE',
    'Standard PM assignment — Bravo covers Terminal 7 South'
  );
