-- RampIQ Operational Readiness — Supabase Schema v2
-- Unified event architecture. All operational state derived from events.
-- Run against a Supabase project or any PostgreSQL instance.

-- ================================================
-- UNIFIED EVENTS TABLE
-- ================================================
-- Every field submission creates one row. Gate state is computed dynamically.

CREATE TABLE IF NOT EXISTS rampiq_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now(),
  gate_id         TEXT NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'arrival_readiness', 'departure_readiness',
    'bag_support', 'equipment_issue'
  )),
  equipment_id    TEXT,
  severity        TEXT CHECK (severity IN ('watch', 'needs-attention', 'out-of-service') OR severity IS NULL),
  status          TEXT,
  issue_type      TEXT CHECK (issue_type IN (
    'wont-start', 'belt-not-moving', 'hydraulic', 'battery',
    'unsafe-damaged', 'missing', 'other'
  ) OR issue_type IS NULL),
  checklist_json  JSONB,
  flags_json      JSONB,
  notes           TEXT DEFAULT '',
  source_role     TEXT DEFAULT 'agent' CHECK (source_role IN ('agent', 'manager')),
  source_surface  TEXT DEFAULT 'mobile' CHECK (source_surface IN ('mobile', 'desktop')),
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION
);

-- Indexes for common queries
CREATE INDEX idx_events_gate ON rampiq_events (gate_id);
CREATE INDEX idx_events_type ON rampiq_events (event_type);
CREATE INDEX idx_events_created ON rampiq_events (created_at DESC);
CREATE INDEX idx_events_equipment ON rampiq_events (equipment_id) WHERE equipment_id IS NOT NULL;

-- ================================================
-- ENABLE REALTIME (Supabase-specific)
-- ================================================
-- Uncomment when using Supabase:
-- ALTER PUBLICATION supabase_realtime ADD TABLE rampiq_events;

-- ================================================
-- GATE DEFINITIONS (reference only — not operational state)
-- ================================================
CREATE TABLE IF NOT EXISTS gates (
  id          TEXT PRIMARY KEY,
  flight      TEXT NOT NULL,
  aircraft    TEXT NOT NULL,
  route       TEXT NOT NULL
);

INSERT INTO gates (id, flight, aircraft, route) VALUES
  ('Alpha',   'AA1318', 'B737', 'DFW → ORD'),
  ('Bravo',   'AA1350', 'A321', 'DFW → LAX'),
  ('Charlie', 'WN1334', 'B738', 'DFW → DEN'),
  ('Delta',   'AA2201', 'B739', 'DFW → SFO'),
  ('Echo',    'UA0418', 'A319', 'DFW → EWR'),
  ('Foxtrot', 'AA0917', 'B738', 'DFW → MIA'),
  ('Golf',    'DL1144', 'A321', 'DFW → ATL'),
  ('Hotel',   'WN2280', 'B737', 'DFW → PHX'),
  ('India',   'AA1042', 'B738', 'DFW → SEA')
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- EQUIPMENT (reference only)
-- ================================================
CREATE TABLE IF NOT EXISTS equipment (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  location    TEXT NOT NULL
);

INSERT INTO equipment (id, type, location) VALUES
  ('BL-201', 'Belt Loader',     'Depot 1 · Concourse A'),
  ('BL-204', 'Belt Loader',     'Depot 1 · Concourse D'),
  ('BL-207', 'Belt Loader',     'Depot 2 · Concourse B'),
  ('TG-118', 'Tug',             'Depot 2 · Concourse B'),
  ('TG-122', 'Tug',             'Depot 1 · Concourse A'),
  ('GPU-031', 'GPU',            'Depot 1 · Concourse A'),
  ('GPU-044', 'GPU',            'Depot 2 · Concourse C'),
  ('BC-015', 'Bag Cart',        'Depot 1 · Bagroom'),
  ('BC-019', 'Bag Cart',        'Depot 2 · Bagroom'),
  ('LC-008', 'Lav Cart',        'Depot 1 · Service'),
  ('AS-003', 'Air Start Unit',  'Depot 2 · Concourse C')
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- MANAGER NOTES
-- ================================================
CREATE TABLE IF NOT EXISTS manager_notes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT now(),
  gate_id       TEXT NOT NULL,
  note          TEXT NOT NULL,
  author        TEXT,
  is_escalation BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_mnotes_gate ON manager_notes (gate_id);
CREATE INDEX idx_mnotes_created ON manager_notes (created_at DESC);
