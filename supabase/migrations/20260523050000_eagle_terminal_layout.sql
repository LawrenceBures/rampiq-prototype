-- RampIQ — Eagle Terminal Operational Layout
-- Replaces generic gate/zone naming with Eagle terminal structure.
-- Gates: 52A–52I. Zones: North/Mid/South clusters.
-- NATO labels (Alpha–India) used in UI display only.

-- ============================================================
-- UPDATE GATES (reference table)
-- ============================================================
DELETE FROM gates;
INSERT INTO gates (id, flight, aircraft, route) VALUES
  ('52A', 'AA1318', 'B737', 'DFW → ORD'),
  ('52B', 'AA1350', 'A321', 'DFW → LAX'),
  ('52C', 'WN1334', 'B738', 'DFW → DEN'),
  ('52D', 'AA2201', 'B739', 'DFW → SFO'),
  ('52E', 'UA0418', 'A319', 'DFW → EWR'),
  ('52F', 'AA0917', 'B738', 'DFW → MIA'),
  ('52G', 'DL1144', 'A321', 'DFW → ATL'),
  ('52H', 'WN2280', 'B737', 'DFW → PHX'),
  ('52I', 'AA1042', 'B738', 'DFW → SEA');

-- ============================================================
-- UPDATE QR TARGETS (replace old gate targets, keep equipment/checkpoint)
-- ============================================================
DELETE FROM qr_targets WHERE target_type = 'GATE';
INSERT INTO qr_targets (id, target_type, station, gate_id, equipment_id, equipment_kind, flight_id, label) VALUES
  ('LAX-GATE-52A', 'GATE', 'LAX', '52A', NULL, NULL, NULL, 'Gate 52A · Alpha'),
  ('LAX-GATE-52B', 'GATE', 'LAX', '52B', NULL, NULL, NULL, 'Gate 52B · Bravo'),
  ('LAX-GATE-52C', 'GATE', 'LAX', '52C', NULL, NULL, NULL, 'Gate 52C · Charlie'),
  ('LAX-GATE-52D', 'GATE', 'LAX', '52D', NULL, NULL, NULL, 'Gate 52D · Delta'),
  ('LAX-GATE-52E', 'GATE', 'LAX', '52E', NULL, NULL, NULL, 'Gate 52E · Echo'),
  ('LAX-GATE-52F', 'GATE', 'LAX', '52F', NULL, NULL, NULL, 'Gate 52F · Foxtrot'),
  ('LAX-GATE-52G', 'GATE', 'LAX', '52G', NULL, NULL, NULL, 'Gate 52G · Golf'),
  ('LAX-GATE-52H', 'GATE', 'LAX', '52H', NULL, NULL, NULL, 'Gate 52H · Hotel'),
  ('LAX-GATE-52I', 'GATE', 'LAX', '52I', NULL, NULL, NULL, 'Gate 52I · India');

-- ============================================================
-- CLEAR DEPENDENT TABLES FIRST (FK ordering)
-- ============================================================
DELETE FROM assignment_transitions;
DELETE FROM crew_assignments;
DELETE FROM user_zone_assignments;

-- ============================================================
-- UPDATE ZONES (Eagle terminal clusters)
-- ============================================================
DELETE FROM zones;
INSERT INTO zones (id, label, station, gate_ids) VALUES
  ('EAGLE-NORTH', 'Eagle North',  'LAX', '{52A,52B,52C}'),
  ('EAGLE-MID',   'Eagle Mid',    'LAX', '{52D,52E,52F}'),
  ('EAGLE-SOUTH', 'Eagle South',  'LAX', '{52G,52H,52I}');

-- ============================================================
-- RE-SEED ZONE ASSIGNMENTS
-- ============================================================
INSERT INTO user_zone_assignments (user_id, zone_id, shift) VALUES
  ('CM',   'EAGLE-NORTH', 'AM'),
  ('TC12', 'EAGLE-NORTH', 'AM'),
  ('BR01', 'EAGLE-MID',   'AM'),
  ('LD03', 'EAGLE-NORTH', 'AM'),
  ('TC14', 'EAGLE-SOUTH', 'PM');

-- ============================================================
-- RE-SEED CREW ASSIGNMENTS
-- ============================================================
INSERT INTO crew_assignments (
  team_id, assigned_user_ids, zone_id, gate_ids, equipment_ids,
  assigned_by, shift_window, status, notes
) VALUES
  (
    'ALPHA-AM',
    '{CM,TC12,BR01,LD03}',
    'EAGLE-NORTH',
    '{52A,52B,52C}',
    '{TUG-042,BELT-007}',
    'LD03',
    'AM',
    'ACTIVE',
    'Standard AM assignment — Alpha covers Eagle North cluster'
  ),
  (
    'BRAVO-PM',
    '{TC14}',
    'EAGLE-SOUTH',
    '{52G,52H,52I}',
    '{GPU-031}',
    'TC14',
    'PM',
    'ACTIVE',
    'Standard PM assignment — Bravo covers Eagle South cluster'
  );

-- ============================================================
-- CLEAN UP: remove any test events referencing old gate IDs
-- ============================================================
DELETE FROM rampiq_events WHERE gate_id IN ('G42B', 'G47A', 'G50');
