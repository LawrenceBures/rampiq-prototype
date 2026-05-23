-- RampIQ Phase 1 — Operational Memory Schema
-- Run against Supabase SQL editor after 001_rampiq_events.sql
-- This migration drops the old table and creates the Phase 1 schema.

-- ============================================================
-- DROP OLD TABLE (prototype data only — no production data)
-- ============================================================
DROP TABLE IF EXISTS rampiq_events CASCADE;

-- ============================================================
-- QR TARGETS
-- ============================================================
CREATE TABLE qr_targets (
  id              text PRIMARY KEY,              -- encoded QR value (e.g. "LAX-GATE-G42B")
  target_type     text NOT NULL,                  -- GATE, EQUIPMENT, FLIGHT, CHECKPOINT
  station         text NOT NULL,
  gate_id         text,                           -- populated if target_type = GATE
  equipment_id    text,                           -- populated if target_type = EQUIPMENT
  equipment_kind  text,                           -- TUG, BELT_LOADER, GPU, LAV_TRUCK, BAG_CART
  flight_id       text,                           -- populated if target_type = FLIGHT
  label           text NOT NULL,                  -- human-readable ("Gate G42B", "Tug #42")
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_targets_type_active ON qr_targets (target_type, active);

-- ============================================================
-- LIGHTWEIGHT USERS
-- ============================================================
CREATE TABLE users_lite (
  id              text PRIMARY KEY,               -- initials, employee ID, or device assignment code
  display_name    text,                            -- "Cortez M."
  role_type       text NOT NULL,                   -- TUG_CREW, BAG_RUNNER, LEAD, SUPERVISOR, etc.
  default_shift   text,                            -- AM, PM, OVERNIGHT
  station         text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- EVENT TYPES (controlled vocabulary)
-- ============================================================
CREATE TABLE event_types (
  code              text PRIMARY KEY,              -- BAG_DELAY
  label             text NOT NULL,                 -- "Bag delay"
  default_severity  text NOT NULL,                 -- LOW, MEDIUM, HIGH, CRITICAL
  applicable_targets text[] NOT NULL,              -- which qr_target_types this event applies to
  active            boolean NOT NULL DEFAULT true,
  display_order     integer NOT NULL DEFAULT 0
);

-- ============================================================
-- RAMPIQ EVENTS (operational memory)
-- ============================================================
CREATE TABLE rampiq_events (
  -- Identity and timing
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  offline_created_at      timestamptz,

  -- Event classification
  event_type              text NOT NULL,
  event_subtype           text,
  severity                text NOT NULL,            -- LOW, MEDIUM, HIGH, CRITICAL

  -- Context (resolved from QR target)
  station                 text NOT NULL,
  gate_id                 text,
  flight_id               text,
  equipment_id            text,
  qr_target_type          text NOT NULL,            -- GATE, EQUIPMENT, FLIGHT, CHECKPOINT
  qr_target_id            text NOT NULL,

  -- Operational detail
  notes                   text,
  operational_status      text NOT NULL DEFAULT 'OPEN',  -- OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, CANCELLED

  -- Attribution
  reported_by             text NOT NULL,
  role_type               text NOT NULL,
  shift_window            text NOT NULL,            -- AM, PM, OVERNIGHT
  device_id               text NOT NULL,
  source_platform         text NOT NULL,            -- IOS_SAFARI, ANDROID_CHROME, ZEBRA_TC56, DESKTOP

  -- Resolution
  resolved_at             timestamptz,
  resolved_by             text,
  event_duration_seconds  integer GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (resolved_at - created_at))::integer
  ) STORED,

  -- Sync state
  sync_status             text NOT NULL DEFAULT 'SYNCED'  -- SYNCED, PENDING, FAILED
);

-- Indexes for dashboard queries
CREATE INDEX idx_events_station_status ON rampiq_events (station, operational_status, created_at DESC);
CREATE INDEX idx_events_severity_open ON rampiq_events (severity, operational_status) WHERE operational_status != 'RESOLVED';
CREATE INDEX idx_events_flight ON rampiq_events (flight_id) WHERE flight_id IS NOT NULL;
CREATE INDEX idx_events_equipment ON rampiq_events (equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX idx_events_qr_target ON rampiq_events (qr_target_id);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_events;

-- ============================================================
-- ROW LEVEL SECURITY (Phase 1 — demo-grade)
-- ============================================================
ALTER TABLE rampiq_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_lite ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;

-- All tables readable by anon for Phase 1
CREATE POLICY "anon_read_events" ON rampiq_events FOR SELECT USING (true);
CREATE POLICY "anon_insert_events" ON rampiq_events FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_events" ON rampiq_events FOR UPDATE USING (true);

CREATE POLICY "anon_read_qr_targets" ON qr_targets FOR SELECT USING (true);
CREATE POLICY "anon_read_users_lite" ON users_lite FOR SELECT USING (true);
CREATE POLICY "anon_read_event_types" ON event_types FOR SELECT USING (true);

-- ============================================================
-- SEED: EVENT TYPES
-- ============================================================
INSERT INTO event_types (code, label, default_severity, applicable_targets, display_order) VALUES
  ('BAG_DELAY',         'Bag delay',          'MEDIUM',   '{GATE,FLIGHT,CHECKPOINT}', 1),
  ('EQUIPMENT_FAILURE', 'Equipment failure',  'HIGH',     '{EQUIPMENT}',              2),
  ('GATE_BLOCKED',      'Gate blocked',       'HIGH',     '{GATE}',                   3),
  ('PUSHBACK_DELAY',    'Pushback delay',     'HIGH',     '{GATE,FLIGHT}',            4),
  ('RUNNER_REQUESTED',  'Runner requested',   'MEDIUM',   '{GATE,FLIGHT,CHECKPOINT}', 5),
  ('LAV_SERVICE_DELAY', 'Lav service delay',  'LOW',      '{GATE,EQUIPMENT}',         6),
  ('CARGO_HOLD',        'Cargo hold',         'MEDIUM',   '{FLIGHT,GATE}',            7),
  ('FUEL_DELAY',        'Fuel delay',         'MEDIUM',   '{GATE,FLIGHT}',            8);

-- ============================================================
-- SEED: QR TARGETS (pilot set)
-- ============================================================
INSERT INTO qr_targets (id, target_type, station, gate_id, equipment_id, equipment_kind, flight_id, label) VALUES
  ('LAX-GATE-G42B',        'GATE',       'LAX', 'G42B',  NULL,          NULL,          NULL,     'Gate G42B'),
  ('LAX-GATE-G47A',        'GATE',       'LAX', 'G47A',  NULL,          NULL,          NULL,     'Gate G47A'),
  ('LAX-GATE-G50',         'GATE',       'LAX', 'G50',   NULL,          NULL,          NULL,     'Gate G50'),
  ('LAX-EQUIP-TUG-042',    'EQUIPMENT',  'LAX', NULL,    'TUG-042',     'TUG',         NULL,     'Tug #42'),
  ('LAX-EQUIP-BELT-007',   'EQUIPMENT',  'LAX', NULL,    'BELT-007',    'BELT_LOADER', NULL,     'Belt Loader #7'),
  ('LAX-EQUIP-GPU-031',    'EQUIPMENT',  'LAX', NULL,    'GPU-031',     'GPU',         NULL,     'GPU #31'),
  ('LAX-EQUIP-LAV-003',    'EQUIPMENT',  'LAX', NULL,    'LAV-003',     'LAV_TRUCK',   NULL,     'Lav Truck #3'),
  ('LAX-CHECK-RAMPCTL',    'CHECKPOINT', 'LAX', NULL,    NULL,          NULL,          NULL,     'Ramp Control');

-- ============================================================
-- SEED: USERS (pilot crew)
-- ============================================================
INSERT INTO users_lite (id, display_name, role_type, default_shift, station) VALUES
  ('CM',   'Cortez M.',    'SUPERVISOR',    'AM',        'LAX'),
  ('TC12', 'Tug Crew 12',  'TUG_CREW',      'AM',        'LAX'),
  ('TC14', 'Tug Crew 14',  'TUG_CREW',      'PM',        'LAX'),
  ('BR01', 'Bag Runner 1', 'BAG_RUNNER',    'AM',        'LAX'),
  ('LD03', 'Lead 3',       'LEAD',          'AM',        'LAX');
