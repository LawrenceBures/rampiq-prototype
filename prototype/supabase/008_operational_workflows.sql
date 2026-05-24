-- RampIQ — Operational Workflows
-- Equipment signals, gate readiness checklists, LT timing.
-- All workflows write to rampiq_events with details_json for workflow-specific data.

-- ============================================================
-- ADD details_json TO rampiq_events
-- ============================================================
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS details_json JSONB;

-- ============================================================
-- NEW EVENT TYPES
-- ============================================================
INSERT INTO event_types (code, label, default_severity, applicable_targets, display_order) VALUES
  ('EQUIP_STATUS',   'Equipment status',  'MEDIUM', '{EQUIPMENT}',  9),
  ('GATE_READINESS', 'Gate readiness',    'LOW',    '{GATE}',       10),
  ('LT_DISPATCH',    'LT dispatched',     'LOW',    '{DISPATCH}',   11),
  ('LT_ARRIVAL',     'LT arrived',        'LOW',    '{GATE}',       12)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- NEW QR TARGET: bag room dispatch
-- ============================================================
INSERT INTO qr_targets (id, target_type, station, label) VALUES
  ('LAX-DISPATCH-BAGROOM', 'DISPATCH', 'LAX', 'Bag Room Dispatch')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- INDEX: details_json queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_events_details ON rampiq_events USING gin (details_json) WHERE details_json IS NOT NULL;
