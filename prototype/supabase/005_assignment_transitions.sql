-- RampIQ Phase 1 — Assignment Transitions
-- Immutable operational history: reassignments create new records,
-- not mutations. This table links the from → to chain.

CREATE TABLE assignment_transitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  from_assignment_id  uuid NOT NULL REFERENCES crew_assignments(id),
  to_assignment_id    uuid NOT NULL REFERENCES crew_assignments(id),
  transition_type     text NOT NULL,   -- REASSIGN, HANDOFF, ESCALATION
  reason              text,
  initiated_by        text NOT NULL
);

CREATE INDEX idx_assign_trans_from ON assignment_transitions (from_assignment_id);
CREATE INDEX idx_assign_trans_to ON assignment_transitions (to_assignment_id);

ALTER TABLE assignment_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_transitions" ON assignment_transitions FOR SELECT USING (true);
CREATE POLICY "anon_insert_transitions" ON assignment_transitions FOR INSERT WITH CHECK (true);
