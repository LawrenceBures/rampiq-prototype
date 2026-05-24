-- RampIQ — Operational Authenticity Pass
-- Replaces demo/generic terminology with realistic Eagle's Nest ops structure.
-- Roles: Ramp Agent, Regional Cabin, LT/Runner, LAV Tech, Crew Chief, Bag Room
-- Users: CC01, RA14, RA22, LT02, RC05
-- Teams: RAMP-AM, RAMP-PM
-- Zones: Gate groupings only (no invented geography)

-- ============================================================
-- CLEAR ALL DEPENDENT DATA (FK ordering)
-- ============================================================
DELETE FROM assignment_transitions;
DELETE FROM crew_assignments;
DELETE FROM user_learning_progress;
DELETE FROM user_equipment_quals;
DELETE FROM user_certifications;
DELETE FROM shift_status;
DELETE FROM user_zone_assignments;
DELETE FROM team_members;
DELETE FROM teams;
DELETE FROM zones;
DELETE FROM users_lite;

-- ============================================================
-- USERS — realistic Eagle's Nest crew
-- ============================================================
INSERT INTO users_lite (id, display_name, role_type, default_shift, station) VALUES
  ('CC01', 'Martinez J.',  'CREW_CHIEF',     'AM', 'LAX'),
  ('RA14', 'Santos R.',    'RAMP_AGENT',     'AM', 'LAX'),
  ('RA22', 'Okafor D.',    'RAMP_AGENT',     'PM', 'LAX'),
  ('LT02', 'Nguyen T.',    'LT_RUNNER',      'AM', 'LAX'),
  ('RC05', 'Park S.',      'REGIONAL_CABIN', 'AM', 'LAX');

-- ============================================================
-- TEAMS
-- ============================================================
INSERT INTO teams (id, label, shift, station, lead_user_id) VALUES
  ('RAMP-AM', 'Ramp AM', 'AM', 'LAX', 'CC01'),
  ('RAMP-PM', 'Ramp PM', 'PM', 'LAX', 'RA22');

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
INSERT INTO team_members (team_id, user_id) VALUES
  ('RAMP-AM', 'CC01'),
  ('RAMP-AM', 'RA14'),
  ('RAMP-AM', 'LT02'),
  ('RAMP-AM', 'RC05'),
  ('RAMP-PM', 'RA22');

-- ============================================================
-- ZONES — gate groupings only, no invented geography
-- ============================================================
INSERT INTO zones (id, label, station, gate_ids) VALUES
  ('GATES-52ABC', 'Gates 52A–C', 'LAX', '{52A,52B,52C}'),
  ('GATES-52DEF', 'Gates 52D–F', 'LAX', '{52D,52E,52F}'),
  ('GATES-52GHI', 'Gates 52G–I', 'LAX', '{52G,52H,52I}');

-- ============================================================
-- ZONE ASSIGNMENTS
-- ============================================================
INSERT INTO user_zone_assignments (user_id, zone_id, shift) VALUES
  ('CC01', 'GATES-52ABC', 'AM'),
  ('RA14', 'GATES-52ABC', 'AM'),
  ('LT02', 'GATES-52DEF', 'AM'),
  ('RC05', 'GATES-52ABC', 'AM'),
  ('RA22', 'GATES-52GHI', 'PM');

-- ============================================================
-- SHIFT STATUS
-- ============================================================
INSERT INTO shift_status (user_id, on_shift, shift_start, shift_window) VALUES
  ('CC01', true,  now() - interval '2 hours', 'AM'),
  ('RA14', true,  now() - interval '2 hours', 'AM'),
  ('LT02', true,  now() - interval '2 hours', 'AM'),
  ('RC05', true,  now() - interval '2 hours', 'AM'),
  ('RA22', false, NULL, 'PM');

-- ============================================================
-- CERTIFICATIONS — update required_for to new role names
-- ============================================================
UPDATE certification_types SET required_for = '{RAMP_AGENT,LT_RUNNER,CREW_CHIEF,REGIONAL_CABIN,LAV_TECH,BAG_ROOM}' WHERE code = 'RAMP_SAFETY';
UPDATE certification_types SET required_for = '{RAMP_AGENT,LT_RUNNER,CREW_CHIEF,REGIONAL_CABIN}' WHERE code = 'FOD_AWARENESS';
UPDATE certification_types SET required_for = '{RAMP_AGENT}' WHERE code = 'TUG_OPERATION';
UPDATE certification_types SET required_for = '{RAMP_AGENT}' WHERE code = 'PUSHBACK_CERT';
UPDATE certification_types SET required_for = '{LT_RUNNER,RAMP_AGENT}' WHERE code = 'BELT_LOADER_OP';
UPDATE certification_types SET required_for = '{RAMP_AGENT,LT_RUNNER,CREW_CHIEF,LAV_TECH}' WHERE code = 'HAZMAT_BASIC';
UPDATE certification_types SET required_for = '{RAMP_AGENT,CREW_CHIEF}' WHERE code = 'WING_WALKER';
UPDATE certification_types SET required_for = '{RAMP_AGENT,CREW_CHIEF}' WHERE code = 'DEICING_BASIC';

-- ============================================================
-- USER CERTIFICATIONS
-- ============================================================
INSERT INTO user_certifications (user_id, cert_code, earned_at, expires_at, status) VALUES
  ('CC01', 'RAMP_SAFETY',   '2025-08-15', '2026-08-15', 'ACTIVE'),
  ('CC01', 'FOD_AWARENESS', '2025-09-01', '2026-09-01', 'ACTIVE'),
  ('CC01', 'HAZMAT_BASIC',  '2025-07-10', '2026-07-10', 'ACTIVE'),
  ('CC01', 'WING_WALKER',   '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('RA14', 'RAMP_SAFETY',   '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('RA14', 'FOD_AWARENESS', '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('RA14', 'TUG_OPERATION', '2024-11-15', '2026-11-15', 'ACTIVE'),
  ('RA14', 'PUSHBACK_CERT', '2025-01-20', '2027-01-20', 'ACTIVE'),
  ('RA14', 'HAZMAT_BASIC',  '2025-06-01', '2026-06-01', 'ACTIVE'),
  ('RA14', 'WING_WALKER',   '2025-03-10', '2026-03-10', 'EXPIRED'),
  ('RA22', 'RAMP_SAFETY',   '2025-10-01', '2026-10-01', 'ACTIVE'),
  ('RA22', 'TUG_OPERATION', '2025-02-01', '2027-02-01', 'ACTIVE'),
  ('RA22', 'PUSHBACK_CERT', '2025-04-01', '2027-04-01', 'ACTIVE'),
  ('RA22', 'HAZMAT_BASIC',  '2025-10-01', '2026-10-01', 'ACTIVE'),
  ('LT02', 'RAMP_SAFETY',   '2025-11-01', '2026-11-01', 'ACTIVE'),
  ('LT02', 'FOD_AWARENESS', '2025-11-01', '2026-11-01', 'ACTIVE'),
  ('LT02', 'BELT_LOADER_OP','2025-05-15', '2027-05-15', 'ACTIVE'),
  ('LT02', 'HAZMAT_BASIC',  '2025-11-01', '2026-11-01', 'ACTIVE'),
  ('RC05', 'RAMP_SAFETY',   '2025-04-01', '2026-04-01', 'ACTIVE'),
  ('RC05', 'FOD_AWARENESS', '2025-04-01', '2026-04-01', 'ACTIVE'),
  ('RC05', 'HAZMAT_BASIC',  '2025-04-01', '2026-04-01', 'ACTIVE');

-- ============================================================
-- USER EQUIPMENT QUALS
-- ============================================================
INSERT INTO user_equipment_quals (user_id, equip_code, qualified_at, status) VALUES
  ('RA14', 'TUG',          '2024-11-15', 'ACTIVE'),
  ('RA14', 'PUSHBACK_TUG', '2025-01-20', 'ACTIVE'),
  ('RA14', 'GPU',          '2025-03-01', 'ACTIVE'),
  ('RA22', 'TUG',          '2025-02-01', 'ACTIVE'),
  ('RA22', 'PUSHBACK_TUG', '2025-04-01', 'ACTIVE'),
  ('LT02', 'BELT_LOADER',  '2025-05-15', 'ACTIVE'),
  ('LT02', 'BAG_CART',     '2025-05-15', 'ACTIVE'),
  ('CC01', 'TUG',          '2024-08-01', 'ACTIVE'),
  ('CC01', 'BELT_LOADER',  '2024-08-01', 'ACTIVE'),
  ('CC01', 'GPU',          '2025-01-01', 'ACTIVE');

-- ============================================================
-- CREW ASSIGNMENTS
-- ============================================================
INSERT INTO crew_assignments (
  team_id, assigned_user_ids, zone_id, gate_ids, equipment_ids,
  assigned_by, shift_window, status, notes
) VALUES
  (
    'RAMP-AM',
    '{CC01,RA14,LT02,RC05}',
    'GATES-52ABC',
    '{52A,52B,52C}',
    '{TUG-042,BELT-007}',
    'CC01',
    'AM',
    'ACTIVE',
    'AM ramp crew covering gates 52A through 52C'
  ),
  (
    'RAMP-PM',
    '{RA22}',
    'GATES-52GHI',
    '{52G,52H,52I}',
    '{GPU-031}',
    'RA22',
    'PM',
    'ACTIVE',
    'PM ramp crew covering gates 52G through 52I'
  );

-- ============================================================
-- UPDATE LEARNING MODULES required_for to new roles
-- ============================================================
UPDATE learning_modules SET required_for = '{RAMP_AGENT,LT_RUNNER,CREW_CHIEF,REGIONAL_CABIN}' WHERE code = 'FOD_AWARENESS';
UPDATE learning_modules SET required_for = '{RAMP_AGENT,CREW_CHIEF}' WHERE code = 'PUSHBACK_PROC';
UPDATE learning_modules SET required_for = '{RAMP_AGENT,LT_RUNNER,CREW_CHIEF,REGIONAL_CABIN,LAV_TECH,BAG_ROOM}' WHERE code = 'SAFETY_BRIEFING';
UPDATE learning_modules SET required_for = '{RAMP_AGENT,LT_RUNNER}' WHERE code = 'EQUIP_INSPECTION';
UPDATE learning_modules SET required_for = '{RAMP_AGENT,LT_RUNNER,CREW_CHIEF,LAV_TECH}' WHERE code = 'HAZMAT_HANDLING';
