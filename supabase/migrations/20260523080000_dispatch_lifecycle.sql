-- RampIQ — Crew Chief Dispatch Lifecycle
-- Assignment states: ASSIGNED → ACKNOWLEDGED → EN_ROUTE → IN_PROGRESS → COMPLETE
-- Adds acknowledgment tracking columns.

-- ============================================================
-- ADD LIFECYCLE COLUMNS
-- ============================================================
ALTER TABLE crew_assignments ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE crew_assignments ADD COLUMN IF NOT EXISTS acknowledged_by TEXT;

-- ============================================================
-- UPDATE EXISTING ASSIGNMENTS TO NEW STATUS VOCABULARY
-- ============================================================
UPDATE crew_assignments SET status = 'ASSIGNED' WHERE status = 'ACTIVE';
