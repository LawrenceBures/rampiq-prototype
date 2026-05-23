-- RampIQ Phase 1 — Operational Identity & Workforce Readiness
-- Run after 002_phase1_schema.sql
-- Adds: certifications, equipment quals, teams, zones, learning hub,
--        shift status, recommendation audit trail foundation.

-- ============================================================
-- CERTIFICATION TYPES (reference)
-- ============================================================
CREATE TABLE certification_types (
  code           text PRIMARY KEY,
  label          text NOT NULL,
  category       text NOT NULL,                -- SAFETY, EQUIPMENT, PROCEDURE, HAZMAT
  required_for   text[] NOT NULL DEFAULT '{}',  -- role_types that require this cert
  renewal_months integer,                       -- NULL = no expiry
  active         boolean NOT NULL DEFAULT true,
  display_order  integer NOT NULL DEFAULT 0
);

-- ============================================================
-- USER CERTIFICATIONS (join)
-- ============================================================
CREATE TABLE user_certifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL REFERENCES users_lite(id),
  cert_code  text NOT NULL REFERENCES certification_types(code),
  earned_at  date NOT NULL DEFAULT CURRENT_DATE,
  expires_at date,
  status     text NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE, EXPIRED, REVOKED
  notes      text,
  UNIQUE(user_id, cert_code)
);

CREATE INDEX idx_user_certs_user ON user_certifications (user_id);

-- ============================================================
-- EQUIPMENT QUALIFICATION TYPES (reference)
-- ============================================================
CREATE TABLE equipment_qual_types (
  code          text PRIMARY KEY,
  label         text NOT NULL,
  category      text NOT NULL DEFAULT 'GSE',
  active        boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0
);

-- ============================================================
-- USER EQUIPMENT QUALS (join)
-- ============================================================
CREATE TABLE user_equipment_quals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES users_lite(id),
  equip_code   text NOT NULL REFERENCES equipment_qual_types(code),
  qualified_at date NOT NULL DEFAULT CURRENT_DATE,
  status       text NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, SUSPENDED, EXPIRED
  UNIQUE(user_id, equip_code)
);

CREATE INDEX idx_user_equip_user ON user_equipment_quals (user_id);
CREATE INDEX idx_user_equip_code ON user_equipment_quals (equip_code, status);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
  id           text PRIMARY KEY,
  label        text NOT NULL,
  shift        text NOT NULL,                    -- AM, PM, OVERNIGHT
  station      text NOT NULL,
  lead_user_id text REFERENCES users_lite(id),
  active       boolean NOT NULL DEFAULT true
);

-- ============================================================
-- TEAM MEMBERS (join)
-- ============================================================
CREATE TABLE team_members (
  team_id  text NOT NULL REFERENCES teams(id),
  user_id  text NOT NULL REFERENCES users_lite(id),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members (user_id);

-- ============================================================
-- ZONES (gate groups / concourse areas)
-- ============================================================
CREATE TABLE zones (
  id       text PRIMARY KEY,
  label    text NOT NULL,
  station  text NOT NULL,
  gate_ids text[] NOT NULL DEFAULT '{}',
  active   boolean NOT NULL DEFAULT true
);

-- ============================================================
-- USER ZONE ASSIGNMENTS
-- ============================================================
CREATE TABLE user_zone_assignments (
  user_id     text NOT NULL REFERENCES users_lite(id),
  zone_id     text NOT NULL REFERENCES zones(id),
  shift       text NOT NULL,                     -- AM, PM, OVERNIGHT
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, zone_id, shift)
);

-- ============================================================
-- SHIFT STATUS (mutable operational state)
-- ============================================================
CREATE TABLE shift_status (
  user_id      text PRIMARY KEY REFERENCES users_lite(id),
  on_shift     boolean NOT NULL DEFAULT false,
  shift_start  timestamptz,
  shift_window text,                             -- AM, PM, OVERNIGHT
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- LEARNING MODULES (reference)
-- ============================================================
CREATE TABLE learning_modules (
  code          text PRIMARY KEY,
  label         text NOT NULL,
  category      text NOT NULL,                   -- SAFETY, EQUIPMENT, PROCEDURE, COMPLIANCE
  required_for  text[] NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true
);

-- ============================================================
-- USER LEARNING PROGRESS (join)
-- ============================================================
CREATE TABLE user_learning_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text NOT NULL REFERENCES users_lite(id),
  module_code  text NOT NULL REFERENCES learning_modules(code),
  status       text NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, COMPLETED
  started_at   timestamptz,
  completed_at timestamptz,
  score        integer,                             -- percentage, optional
  UNIQUE(user_id, module_code)
);

CREATE INDEX idx_user_learning_user ON user_learning_progress (user_id);

-- ============================================================
-- RECOMMENDATION LOG (future-facing audit trail)
-- No AI engine writes to this yet. Structure exists so that
-- when recommendation systems arrive, the audit trail is ready.
-- Every future recommendation will be logged.
-- Every human override will be traceable.
-- ============================================================
CREATE TABLE recommendation_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  recommendation_type text NOT NULL,              -- CREW_ASSIGNMENT, EQUIPMENT_MATCH, ZONE_REBALANCE, etc.
  target_user_id     text REFERENCES users_lite(id),
  context_json       jsonb,                       -- recommendation context/input snapshot
  override_used      boolean NOT NULL DEFAULT false,
  override_reason    text,
  override_by        text,
  resolved_at        timestamptz
);

CREATE INDEX idx_rec_log_type ON recommendation_log (recommendation_type, created_at DESC);
CREATE INDEX idx_rec_log_user ON recommendation_log (target_user_id) WHERE target_user_id IS NOT NULL;

-- ============================================================
-- INDEX: agent activity queries on rampiq_events
-- ============================================================
CREATE INDEX idx_events_reported_by ON rampiq_events (reported_by, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (demo-grade)
-- ============================================================
ALTER TABLE certification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_qual_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_equipment_quals ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_zone_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_log ENABLE ROW LEVEL SECURITY;

-- All tables readable by anon
CREATE POLICY "anon_read" ON certification_types FOR SELECT USING (true);
CREATE POLICY "anon_read" ON user_certifications FOR SELECT USING (true);
CREATE POLICY "anon_read" ON equipment_qual_types FOR SELECT USING (true);
CREATE POLICY "anon_read" ON user_equipment_quals FOR SELECT USING (true);
CREATE POLICY "anon_read" ON teams FOR SELECT USING (true);
CREATE POLICY "anon_read" ON team_members FOR SELECT USING (true);
CREATE POLICY "anon_read" ON zones FOR SELECT USING (true);
CREATE POLICY "anon_read" ON user_zone_assignments FOR SELECT USING (true);
CREATE POLICY "anon_read" ON shift_status FOR SELECT USING (true);
CREATE POLICY "anon_read" ON learning_modules FOR SELECT USING (true);
CREATE POLICY "anon_read" ON user_learning_progress FOR SELECT USING (true);
CREATE POLICY "anon_read" ON recommendation_log FOR SELECT USING (true);

-- Shift status: agents can update their own shift
CREATE POLICY "anon_upsert_shift" ON shift_status FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_shift" ON shift_status FOR UPDATE USING (true);

-- Recommendation log: writable for future use
CREATE POLICY "anon_insert_rec" ON recommendation_log FOR INSERT WITH CHECK (true);

-- ============================================================
-- REALTIME: shift changes broadcast to workforce dashboard
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE shift_status;

-- ============================================================
-- SEED: CERTIFICATION TYPES
-- ============================================================
INSERT INTO certification_types (code, label, category, required_for, renewal_months, display_order) VALUES
  ('RAMP_SAFETY',     'Ramp Safety',           'SAFETY',    '{TUG_CREW,BAG_RUNNER,LEAD,SUPERVISOR,CABIN_CLEANER,FUELER,RAMP_AGENT}', 12, 1),
  ('FOD_AWARENESS',   'FOD Prevention',        'SAFETY',    '{TUG_CREW,BAG_RUNNER,LEAD,SUPERVISOR,RAMP_AGENT}', 12, 2),
  ('TUG_OPERATION',   'Tug Operation',         'EQUIPMENT', '{TUG_CREW}', 24, 3),
  ('PUSHBACK_CERT',   'Pushback Certified',    'EQUIPMENT', '{TUG_CREW}', 24, 4),
  ('BELT_LOADER_OP',  'Belt Loader Operation', 'EQUIPMENT', '{BAG_RUNNER,RAMP_AGENT}', 24, 5),
  ('HAZMAT_BASIC',    'Hazmat Awareness',      'HAZMAT',    '{TUG_CREW,BAG_RUNNER,LEAD,SUPERVISOR,FUELER,RAMP_AGENT}', 12, 6),
  ('WING_WALKER',     'Wing Walker',           'PROCEDURE', '{TUG_CREW,LEAD}', 12, 7),
  ('DEICING_BASIC',   'Basic Deicing',         'PROCEDURE', '{RAMP_AGENT,LEAD}', 12, 8);

-- ============================================================
-- SEED: EQUIPMENT QUALIFICATION TYPES
-- ============================================================
INSERT INTO equipment_qual_types (code, label, category, display_order) VALUES
  ('TUG',          'Tug',             'GSE', 1),
  ('BELT_LOADER',  'Belt Loader',     'GSE', 2),
  ('GPU',          'Ground Power Unit','GSE', 3),
  ('LAV_TRUCK',    'Lav Truck',       'GSE', 4),
  ('BAG_CART',     'Bag Cart',        'GSE', 5),
  ('AIR_START',    'Air Start Unit',  'GSE', 6),
  ('PUSHBACK_TUG', 'Pushback Tug',   'GSE', 7);

-- ============================================================
-- SEED: TEAMS
-- ============================================================
INSERT INTO teams (id, label, shift, station, lead_user_id) VALUES
  ('ALPHA-AM',  'Alpha Team', 'AM',  'LAX', 'LD03'),
  ('BRAVO-PM',  'Bravo Team', 'PM',  'LAX', 'TC14');

-- ============================================================
-- SEED: TEAM MEMBERS
-- ============================================================
INSERT INTO team_members (team_id, user_id) VALUES
  ('ALPHA-AM', 'CM'),
  ('ALPHA-AM', 'TC12'),
  ('ALPHA-AM', 'BR01'),
  ('ALPHA-AM', 'LD03'),
  ('BRAVO-PM', 'TC14');

-- ============================================================
-- SEED: ZONES
-- ============================================================
INSERT INTO zones (id, label, station, gate_ids) VALUES
  ('T7-NORTH',  'Terminal 7 North', 'LAX', '{G42B,G47A}'),
  ('T7-SOUTH',  'Terminal 7 South', 'LAX', '{G50}'),
  ('TBIT-WEST', 'TBIT West',        'LAX', '{}');

-- ============================================================
-- SEED: USER ZONE ASSIGNMENTS
-- ============================================================
INSERT INTO user_zone_assignments (user_id, zone_id, shift) VALUES
  ('CM',   'T7-NORTH', 'AM'),
  ('TC12', 'T7-NORTH', 'AM'),
  ('BR01', 'T7-SOUTH', 'AM'),
  ('LD03', 'T7-NORTH', 'AM'),
  ('TC14', 'T7-SOUTH', 'PM');

-- ============================================================
-- SEED: SHIFT STATUS (all seed users on shift)
-- ============================================================
INSERT INTO shift_status (user_id, on_shift, shift_start, shift_window) VALUES
  ('CM',   true,  now() - interval '2 hours', 'AM'),
  ('TC12', true,  now() - interval '2 hours', 'AM'),
  ('BR01', true,  now() - interval '2 hours', 'AM'),
  ('LD03', true,  now() - interval '2 hours', 'AM'),
  ('TC14', false, NULL, 'PM');

-- ============================================================
-- SEED: USER CERTIFICATIONS
-- ============================================================
INSERT INTO user_certifications (user_id, cert_code, earned_at, expires_at, status) VALUES
  -- CM (Supervisor): all safety + hazmat
  ('CM', 'RAMP_SAFETY',   '2025-08-15', '2026-08-15', 'ACTIVE'),
  ('CM', 'FOD_AWARENESS', '2025-09-01', '2026-09-01', 'ACTIVE'),
  ('CM', 'HAZMAT_BASIC',  '2025-07-10', '2026-07-10', 'ACTIVE'),
  -- TC12 (Tug Crew): full tug quals
  ('TC12', 'RAMP_SAFETY',   '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('TC12', 'FOD_AWARENESS', '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('TC12', 'TUG_OPERATION', '2024-11-15', '2026-11-15', 'ACTIVE'),
  ('TC12', 'PUSHBACK_CERT', '2025-01-20', '2027-01-20', 'ACTIVE'),
  ('TC12', 'HAZMAT_BASIC',  '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('TC12', 'WING_WALKER',   '2025-03-10', '2026-03-10', 'EXPIRED'),
  -- TC14 (Tug Crew): mostly current, one gap
  ('TC14', 'RAMP_SAFETY',   '2025-10-01', '2026-10-01', 'ACTIVE'),
  ('TC14', 'TUG_OPERATION', '2025-02-01', '2027-02-01', 'ACTIVE'),
  ('TC14', 'PUSHBACK_CERT', '2025-04-01', '2027-04-01', 'ACTIVE'),
  ('TC14', 'HAZMAT_BASIC',  '2025-10-01', '2026-10-01', 'ACTIVE'),
  -- BR01 (Bag Runner): belt loader + basics
  ('BR01', 'RAMP_SAFETY',    '2025-11-01', '2026-11-01', 'ACTIVE'),
  ('BR01', 'FOD_AWARENESS',  '2025-11-01', '2026-11-01', 'ACTIVE'),
  ('BR01', 'BELT_LOADER_OP', '2025-05-15', '2027-05-15', 'ACTIVE'),
  ('BR01', 'HAZMAT_BASIC',   '2025-11-01', '2026-11-01', 'ACTIVE'),
  -- LD03 (Lead): broad coverage
  ('LD03', 'RAMP_SAFETY',   '2025-04-01', '2026-04-01', 'ACTIVE'),
  ('LD03', 'FOD_AWARENESS', '2025-04-01', '2026-04-01', 'ACTIVE'),
  ('LD03', 'WING_WALKER',   '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('LD03', 'HAZMAT_BASIC',  '2025-04-01', '2026-04-01', 'ACTIVE');

-- ============================================================
-- SEED: USER EQUIPMENT QUALS
-- ============================================================
INSERT INTO user_equipment_quals (user_id, equip_code, qualified_at, status) VALUES
  -- TC12: tug + pushback tug
  ('TC12', 'TUG',          '2024-11-15', 'ACTIVE'),
  ('TC12', 'PUSHBACK_TUG', '2025-01-20', 'ACTIVE'),
  ('TC12', 'GPU',          '2025-03-01', 'ACTIVE'),
  -- TC14: tug + pushback tug
  ('TC14', 'TUG',          '2025-02-01', 'ACTIVE'),
  ('TC14', 'PUSHBACK_TUG', '2025-04-01', 'ACTIVE'),
  -- BR01: belt loader + bag cart
  ('BR01', 'BELT_LOADER',  '2025-05-15', 'ACTIVE'),
  ('BR01', 'BAG_CART',     '2025-05-15', 'ACTIVE'),
  -- LD03: broad (lead qualification)
  ('LD03', 'TUG',          '2024-08-01', 'ACTIVE'),
  ('LD03', 'BELT_LOADER',  '2024-08-01', 'ACTIVE'),
  ('LD03', 'GPU',          '2025-01-01', 'ACTIVE');

-- ============================================================
-- SEED: LEARNING MODULES
-- ============================================================
INSERT INTO learning_modules (code, label, category, required_for, display_order) VALUES
  ('FOD_AWARENESS',    'FOD Awareness',           'SAFETY',     '{TUG_CREW,BAG_RUNNER,LEAD,SUPERVISOR,RAMP_AGENT}', 1),
  ('PUSHBACK_PROC',    'Pushback Procedures',     'PROCEDURE',  '{TUG_CREW,LEAD}', 2),
  ('SAFETY_BRIEFING',  'Daily Safety Briefing',   'SAFETY',     '{TUG_CREW,BAG_RUNNER,LEAD,SUPERVISOR,CABIN_CLEANER,FUELER,RAMP_AGENT}', 3),
  ('EQUIP_INSPECTION', 'Equipment Pre-Use Inspection', 'EQUIPMENT', '{TUG_CREW,BAG_RUNNER,RAMP_AGENT}', 4),
  ('HAZMAT_HANDLING',  'Hazmat Handling Basics',   'COMPLIANCE', '{TUG_CREW,BAG_RUNNER,LEAD,SUPERVISOR,FUELER,RAMP_AGENT}', 5);

-- ============================================================
-- SEED: USER LEARNING PROGRESS
-- ============================================================
INSERT INTO user_learning_progress (user_id, module_code, status, started_at, completed_at, score) VALUES
  -- CM: all complete (supervisor)
  ('CM', 'FOD_AWARENESS',    'COMPLETED',   '2025-08-01', '2025-08-01', 95),
  ('CM', 'SAFETY_BRIEFING',  'COMPLETED',   '2025-08-01', '2025-08-01', 100),
  ('CM', 'HAZMAT_HANDLING',  'COMPLETED',   '2025-08-02', '2025-08-02', 88),
  -- TC12: mostly done, one in progress
  ('TC12', 'FOD_AWARENESS',    'COMPLETED',   '2025-06-01', '2025-06-02', 90),
  ('TC12', 'PUSHBACK_PROC',    'COMPLETED',   '2025-06-03', '2025-06-04', 85),
  ('TC12', 'SAFETY_BRIEFING',  'COMPLETED',   '2025-06-01', '2025-06-01', 92),
  ('TC12', 'EQUIP_INSPECTION', 'IN_PROGRESS', '2026-05-20', NULL, NULL),
  ('TC12', 'HAZMAT_HANDLING',  'COMPLETED',   '2025-06-05', '2025-06-06', 78),
  -- TC14: partial
  ('TC14', 'PUSHBACK_PROC',    'COMPLETED',   '2025-10-01', '2025-10-02', 88),
  ('TC14', 'SAFETY_BRIEFING',  'NOT_STARTED', NULL, NULL, NULL),
  ('TC14', 'HAZMAT_HANDLING',  'IN_PROGRESS', '2026-05-15', NULL, NULL),
  -- BR01: partial
  ('BR01', 'FOD_AWARENESS',    'COMPLETED',   '2025-11-01', '2025-11-02', 82),
  ('BR01', 'SAFETY_BRIEFING',  'COMPLETED',   '2025-11-01', '2025-11-01', 95),
  ('BR01', 'EQUIP_INSPECTION', 'COMPLETED',   '2025-11-03', '2025-11-04', 90),
  ('BR01', 'HAZMAT_HANDLING',  'NOT_STARTED', NULL, NULL, NULL),
  -- LD03: all complete (lead)
  ('LD03', 'FOD_AWARENESS',    'COMPLETED',   '2025-04-01', '2025-04-02', 96),
  ('LD03', 'PUSHBACK_PROC',    'COMPLETED',   '2025-04-03', '2025-04-04', 92),
  ('LD03', 'SAFETY_BRIEFING',  'COMPLETED',   '2025-04-01', '2025-04-01', 100),
  ('LD03', 'EQUIP_INSPECTION', 'COMPLETED',   '2025-04-05', '2025-04-06', 94),
  ('LD03', 'HAZMAT_HANDLING',  'COMPLETED',   '2025-04-07', '2025-04-08', 90);
