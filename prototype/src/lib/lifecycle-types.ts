// SOI — Lifecycle Entity Types
// Phase 2: Incidents + Recovery Actions
//
// These interfaces represent the CURRENT STATE projection.
// They are read from lifecycle tables, not from the event log.
// The event log records the history of how this state was reached.

import type { IncidentStatus, RecoveryActionStatus, Severity } from './operational-states';

// ============================================================
// INCIDENT
// ============================================================

export interface Incident {
  id: string;

  // Classification
  title: string;
  category: string | null;
  severity: Severity;
  status: IncidentStatus;

  // Location
  station: string;
  zone_id: string | null;
  gate_id: string | null;
  flight_id: string | null;

  // Affected scope
  affected_gate_ids: string[];
  affected_equipment_ids: string[];

  // Ownership
  created_by: string;
  assigned_to: string | null;
  acknowledged_by: string | null;

  // Detail
  description: string | null;
  details_json: Record<string, unknown> | null;

  // Timing
  opened_at: string;
  acknowledged_at: string | null;
  recovering_at: string | null;
  stabilized_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;

  // Event linkage
  source_event_id: string | null;
  correlation_id: string;
}

// ============================================================
// RECOVERY ACTION
// ============================================================

export interface RecoveryAction {
  id: string;

  // Parent
  incident_id: string;

  // Classification
  title: string;
  action_type: string | null;
  severity: Severity;
  status: RecoveryActionStatus;

  // Assignment
  proposed_by: string;
  assigned_to: string | null;
  acknowledged_by: string | null;

  // Location
  station: string;
  zone_id: string | null;
  gate_id: string | null;

  // Detail
  description: string | null;
  details_json: Record<string, unknown> | null;

  // Timing
  eta_at: string | null;
  proposed_at: string;
  acknowledged_at: string | null;
  started_at: string | null;
  blocked_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  // Event linkage
  source_event_id: string | null;
  correlation_id: string | null;
}

// ============================================================
// COMMAND INPUTS
// ============================================================
// These are what callers pass to lifecycle commands.
// Commands handle the rest (status, timestamps, event emission).

export interface CreateIncidentInput {
  title: string;
  category?: string;
  severity: Severity;
  station?: string;
  zone_id?: string;
  gate_id?: string;
  flight_id?: string;
  affected_gate_ids?: string[];
  affected_equipment_ids?: string[];
  description?: string;
  details_json?: Record<string, unknown>;
  created_by: string;
  assigned_to?: string;
  source_event_id?: string;
}

export interface TransitionIncidentInput {
  incident_id: string;
  new_status: IncidentStatus;
  actor_id: string;
  actor_role: string;
  notes?: string;
  assigned_to?: string;
  details_json?: Record<string, unknown>;
}

export interface CreateRecoveryActionInput {
  incident_id: string;
  title: string;
  action_type?: string;
  severity?: Severity;
  proposed_by: string;
  assigned_to?: string;
  zone_id?: string;
  gate_id?: string;
  description?: string;
  details_json?: Record<string, unknown>;
  eta_at?: string;
  source_event_id?: string;
}

export interface TransitionRecoveryActionInput {
  action_id: string;
  new_status: RecoveryActionStatus;
  actor_id: string;
  actor_role: string;
  assigned_to?: string;
  notes?: string;
  details_json?: Record<string, unknown>;
}
