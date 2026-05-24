-- RampIQ — Workforce Orchestration Phase 1
-- Extends users_lite with scheduling. Creates flights table.

-- ============================================================
-- EXTEND users_lite WITH SCHEDULING
-- ============================================================
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS shift_end TIME;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS lunch_start TIME;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS lunch_end TIME;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS break_start TIME;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS break_end TIME;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS extension_eligible BOOLEAN DEFAULT true;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS pushback_certified BOOLEAN DEFAULT false;
ALTER TABLE users_lite ADD COLUMN IF NOT EXISTS pushback_recert_date DATE;

-- Seed scheduling data for existing users
UPDATE users_lite SET
  shift_end = '14:30', lunch_start = '10:00', lunch_end = '10:30',
  break_start = '12:30', break_end = '12:45',
  extension_eligible = true, pushback_certified = true, pushback_recert_date = '2026-11-15'
WHERE id = 'CC01';

UPDATE users_lite SET
  shift_end = '14:30', lunch_start = '10:15', lunch_end = '10:45',
  break_start = '12:45', break_end = '13:00',
  extension_eligible = true, pushback_certified = true, pushback_recert_date = '2026-08-01'
WHERE id = 'RA14';

UPDATE users_lite SET
  shift_end = '22:30', lunch_start = '18:00', lunch_end = '18:30',
  break_start = '20:15', break_end = '20:30',
  extension_eligible = false, pushback_certified = true, pushback_recert_date = '2027-02-01'
WHERE id = 'RA22';

UPDATE users_lite SET
  shift_end = '14:30', lunch_start = '10:30', lunch_end = '11:00',
  break_start = '13:00', break_end = '13:15',
  extension_eligible = true, pushback_certified = false, pushback_recert_date = NULL
WHERE id = 'LT02';

UPDATE users_lite SET
  shift_end = '14:30', lunch_start = '10:00', lunch_end = '10:30',
  break_start = '12:30', break_end = '12:45',
  extension_eligible = true, pushback_certified = false, pushback_recert_date = NULL
WHERE id = 'RC05';

-- ============================================================
-- FLIGHTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS flights (
  id          TEXT PRIMARY KEY,
  gate_id     TEXT REFERENCES gates(id),
  aircraft    TEXT NOT NULL,
  route       TEXT NOT NULL,
  arrival_time   TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  turn_type   TEXT DEFAULT 'THROUGH',
  status      TEXT DEFAULT 'SCHEDULED',
  active      BOOLEAN DEFAULT true
);

ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_flights" ON flights FOR SELECT USING (true);
CREATE POLICY "anon_update_flights" ON flights FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE flights;

-- Seed flights with realistic LAX timing (today's date, staggered arrivals)
INSERT INTO flights (id, gate_id, aircraft, route, arrival_time, departure_time, turn_type, status) VALUES
  ('AA1318', '52A', 'B737', 'ORD → LAX', now() + interval '45 min',  now() + interval '2 hours 15 min', 'THROUGH', 'INBOUND'),
  ('AA1350', '52B', 'A321', 'SFO → LAX', now() - interval '20 min',  now() + interval '55 min',         'THROUGH', 'ON_GATE'),
  ('WN1334', '52C', 'B738', 'DEN → LAX', now() + interval '1 hour',  now() + interval '2 hours 30 min', 'THROUGH', 'SCHEDULED'),
  ('AA2201', '52D', 'B739', 'SEA → LAX', now() - interval '45 min',  now() + interval '30 min',         'THROUGH', 'BOARDING'),
  ('UA0418', '52E', 'A319', 'EWR → LAX', now() + interval '2 hours', now() + interval '3 hours 45 min', 'ARRIVAL', 'SCHEDULED'),
  ('AA0917', '52F', 'B738', 'MIA → LAX', now() + interval '30 min',  now() + interval '1 hour 50 min',  'THROUGH', 'INBOUND'),
  ('DL1144', '52G', 'A321', 'ATL → LAX', now() - interval '1 hour',  now() + interval '15 min',         'DEPARTURE', 'BOARDING'),
  ('WN2280', '52H', 'B737', 'PHX → LAX', now() + interval '3 hours', now() + interval '4 hours 30 min', 'THROUGH', 'SCHEDULED'),
  ('AA1042', '52I', 'B738', 'HNL → LAX', now() + interval '1 hour 30 min', now() + interval '3 hours',  'THROUGH', 'INBOUND')
ON CONFLICT (id) DO UPDATE SET
  gate_id = EXCLUDED.gate_id,
  arrival_time = EXCLUDED.arrival_time,
  departure_time = EXCLUDED.departure_time,
  turn_type = EXCLUDED.turn_type,
  status = EXCLUDED.status;

CREATE INDEX IF NOT EXISTS idx_flights_gate ON flights (gate_id);
CREATE INDEX IF NOT EXISTS idx_flights_status ON flights (status) WHERE active = true;
