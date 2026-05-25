# RampIQ Phase 2 — Lifecycle Entity Relationships

**Date**: 2026-05-25

---

## Entity Relationship Map

```
rampiq_incidents
  │
  ├──< rampiq_recovery_actions   (incident_id FK, 1:many)
  │
  ├──> rampiq_events             (source_event_id, nullable — the event that triggered this incident)
  │
  └──> rampiq_events             (correlation_id, shared — all events in this incident episode)


rampiq_recovery_actions
  │
  ├──> rampiq_incidents          (incident_id FK, required — every action belongs to exactly one incident)
  │
  ├──> rampiq_events             (source_event_id, nullable — the event that prompted this action)
  │
  └──> rampiq_events             (correlation_id, inherited from parent incident)


rampiq_events
  │
  ├──> rampiq_events             (causation_event_id, self-referencing — what caused this event)
  │
  ├── entity_type + entity_id    (polymorphic reference to any lifecycle entity)
  │   ├── 'incident' + UUID      → points to rampiq_incidents.id
  │   ├── 'recovery_action' + UUID → points to rampiq_recovery_actions.id
  │   ├── 'gate' + TEXT          → points to gate_id (no FK, denormalized)
  │   ├── 'equipment' + TEXT     → points to equipment_id (no FK, denormalized)
  │   ├── 'assignment' + UUID    → points to crew_assignments.id
  │   └── 'flight' + TEXT        → points to flights.id
  │
  └── correlation_id             (groups events into operational episodes)
```

---

## Foreign Key Flow

```
rampiq_recovery_actions.incident_id  ──FK──>  rampiq_incidents.id
```

That is the only hard FK in the lifecycle schema. All other references are soft:

| From | Field | To | Type |
|------|-------|----|------|
| `rampiq_incidents.source_event_id` | UUID | `rampiq_events.id` | Soft (no FK constraint) |
| `rampiq_incidents.correlation_id` | UUID | Shared across events | Generated on incident creation |
| `rampiq_recovery_actions.source_event_id` | UUID | `rampiq_events.id` | Soft |
| `rampiq_recovery_actions.correlation_id` | UUID | Inherited from parent incident | Soft |
| `rampiq_events.entity_id` | TEXT | Any lifecycle table `.id` | Polymorphic, soft |
| `rampiq_events.causation_event_id` | UUID | `rampiq_events.id` | Self-referencing, soft |
| `rampiq_events.correlation_id` | UUID | Shared episode grouping | Soft |

**Why soft references**: The event log is append-only and must never fail due to FK violations from deleted or missing lifecycle records. Events outlive the entities they reference. A closed incident may be archived, but its events remain.

---

## Ownership Boundaries

### Incident Owns

| What | How |
|------|-----|
| Its recovery actions | `rampiq_recovery_actions.incident_id` FK |
| Its correlation scope | `correlation_id` generated on creation, inherited by all child entities and events |
| Its affected gates | `affected_gate_ids[]` array (metadata, not FK) |
| Its affected equipment | `affected_equipment_ids[]` array (metadata, not FK) |
| Its lifecycle timing | `opened_at`, `acknowledged_at`, `recovering_at`, `stabilized_at`, `resolved_at`, `closed_at` |

### Incident Does NOT Own

| What | Why |
|------|-----|
| Gate state | Gate state is derived from events, not stored on incidents |
| Zone pressure | Zone pressure is derived from events, not stored on incidents |
| The events themselves | Events are immutable records; the incident doesn't control them |
| Other incidents | No incident-to-incident FK; cascades are tracked via `affected_gate_ids` + `correlation_id` |

### Recovery Action Owns

| What | How |
|------|-----|
| Its own lifecycle timing | `proposed_at`, `acknowledged_at`, `started_at`, `blocked_at`, `completed_at` |
| Its assignment | `assigned_to`, `acknowledged_by` |
| Its ETA | `eta_at` |

### Recovery Action Does NOT Own

| What | Why |
|------|-----|
| The parent incident | It references, doesn't own. Deleting an action doesn't affect the incident. |
| Other recovery actions | No action-to-action FK. Sequencing is by `created_at` ordering. |
| The events it emits | Events are immutable; the action doesn't control them. |

---

## Command Ownership

Who is allowed to invoke each command, and what state must be true:

### Incident Commands

| Command | Invoker | Precondition |
|---------|---------|-------------|
| `createIncident()` | Any role (typically crew chief or system) | None — creation |
| `transitionIncident(→ CONFIRMED)` | Crew chief, manager | Status = DETECTED |
| `transitionIncident(→ RECOVERING)` | Crew chief, manager | Status = CONFIRMED |
| `transitionIncident(→ STABILIZED)` | Crew chief, manager | Status = RECOVERING |
| `transitionIncident(→ RESOLVED)` | Crew chief, manager | Status = RECOVERING or STABILIZED (or DETECTED for false alarm) |
| `transitionIncident(→ CLOSED)` | Manager | Status = RESOLVED |

**Note**: Role enforcement is not implemented in Phase 2 (demo-grade RLS). The `actor_role` field on the emitted event records who performed the transition for audit purposes.

### Recovery Action Commands

| Command | Invoker | Precondition |
|---------|---------|-------------|
| `createRecoveryAction()` | Crew chief, manager | Parent incident must exist |
| `transitionRecoveryAction(→ ACKNOWLEDGED)` | Assigned person | Status = PROPOSED |
| `transitionRecoveryAction(→ ACTIVE)` | Assigned person | Status = ACKNOWLEDGED |
| `transitionRecoveryAction(→ BLOCKED)` | Assigned person, crew chief | Status = ACTIVE |
| `transitionRecoveryAction(→ COMPLETE)` | Assigned person | Status = ACTIVE |
| `transitionRecoveryAction(→ ESCALATED)` | Crew chief, manager | Status = ACTIVE or BLOCKED |
| `transitionRecoveryAction(→ WITHDRAWN)` | Crew chief, manager | Status = PROPOSED, ACKNOWLEDGED, or BLOCKED |

---

## Event Ownership

Events belong to no one. They are immutable records of what happened.

### Who Emits Events

| Emitter | Event Types | entity_type |
|---------|------------|-------------|
| `createIncident()` | `incident.detected` | `incident` |
| `transitionIncident()` | `incident.confirmed/recovering/stabilized/resolved/closed` | `incident` |
| `createRecoveryAction()` | `recovery_action.proposed` | `recovery_action` |
| `transitionRecoveryAction()` | `recovery_action.acknowledged/active/blocked/complete/escalated/withdrawn` | `recovery_action` |
| `postEvent()` (Phase 1) | `service.confirmed`, `support.created`, legacy types | `gate`, `equipment`, `flight` |
| `updateEventStatus()` (Phase 1) | Mutates existing event row (legacy, not append-only) | N/A |

### Event Version Semantics

| Version | Source | Characteristics |
|---------|--------|----------------|
| 1 | `postEvent()` (Phase 1) | May lack entity_type/entity_id. operational_status is mutable. Legacy schema compatibility. |
| 2 | Lifecycle commands (Phase 2) | Always has entity_type, entity_id, state_before, state_after, correlation_id. Append-only behavior. |

### Correlation Grouping

```
Incident created → correlation_id = X (generated)
  ├── Event: incident.detected         correlation_id = X
  ├── Event: incident.confirmed        correlation_id = X
  │
  ├── Recovery Action A created        correlation_id = X (inherited)
  │   ├── Event: recovery_action.proposed    correlation_id = X
  │   ├── Event: recovery_action.active      correlation_id = X
  │   └── Event: recovery_action.complete    correlation_id = X
  │
  ├── Recovery Action B created        correlation_id = X (inherited)
  │   ├── Event: recovery_action.proposed    correlation_id = X
  │   └── Event: recovery_action.escalated   correlation_id = X
  │
  ├── Event: incident.recovering       correlation_id = X
  ├── Event: incident.stabilized       correlation_id = X
  └── Event: incident.resolved         correlation_id = X
```

**To reconstruct the full incident timeline**: `SELECT * FROM rampiq_events WHERE correlation_id = X ORDER BY COALESCE(offline_created_at, created_at)`

---

## Read Path Summary

| Question | Table | Query |
|----------|-------|-------|
| Active incidents | `rampiq_incidents` | `WHERE status NOT IN ('RESOLVED', 'CLOSED')` |
| Actions for incident X | `rampiq_recovery_actions` | `WHERE incident_id = X` |
| Active actions (all incidents) | `rampiq_recovery_actions` | `WHERE status NOT IN ('COMPLETE', 'ESCALATED', 'WITHDRAWN')` |
| Full timeline of incident X | `rampiq_events` | `WHERE correlation_id = X ORDER BY COALESCE(offline_created_at, created_at)` |
| History of action Y | `rampiq_events` | `WHERE entity_type = 'recovery_action' AND entity_id = Y` |
| All events at gate Z during incident | `rampiq_events` | `WHERE correlation_id = X AND gate_id = Z` |
| Current state of incident X | `rampiq_incidents` | `WHERE id = X` (single row) |
| State of incident X at time T | `rampiq_events` | Replay: walk events for entity_id = X up to T |
