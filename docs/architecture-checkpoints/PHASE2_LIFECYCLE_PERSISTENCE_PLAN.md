# RampIQ Phase 2 — Lifecycle Persistence Plan

**Date**: 2026-05-25
**Step**: Phase 2 Step 1 — Lifecycle Persistence Foundation
**Status**: Implementation complete, awaiting review

---

## Why Lifecycle Tables Come Before Propagation

Propagation hardening (incremental updates, zone-scoped subscriptions, optimistic updates) is a delivery mechanism. Lifecycle tables are what gets delivered. Without lifecycle persistence, propagation has nothing to propagate — incidents and recovery actions exist only in localStorage mock data.

The dependency chain:
1. **Lifecycle tables** (this step) — incidents and recovery actions become real Supabase entities
2. **Command handlers** (this step) — transitions validate and emit events
3. **UI surfaces** (next step) — crew chief recovery console, manager incident view consume real data
4. **Propagation hardening** (later) — incremental delivery of lifecycle state changes

Building propagation first would mean optimizing the delivery of prototype mock data. Building lifecycle first means propagation has real operational entities to deliver.

---

## Table Responsibilities

### `rampiq_incidents`

**Source of truth for**: Current incident status, ownership, timing, affected scope.

**Allowed command events**:

| Event Type | Transition | Timing Fields Set |
|-----------|-----------|-------------------|
| `incident.detected` | → DETECTED (creation) | `opened_at` |
| `incident.confirmed` | DETECTED → CONFIRMED | `acknowledged_at`, `acknowledged_by` |
| `incident.recovering` | CONFIRMED → RECOVERING | `recovering_at` |
| `incident.stabilized` | RECOVERING → STABILIZED | `stabilized_at` |
| `incident.resolved` | RECOVERING/STABILIZED → RESOLVED | `resolved_at` |
| `incident.closed` | RESOLVED → CLOSED | `closed_at` |

**Allowed status transitions** (from operational-states.ts):
```
DETECTED   → CONFIRMED, RESOLVED (false alarm)
CONFIRMED  → RECOVERING
RECOVERING → STABILIZED, RESOLVED
STABILIZED → RESOLVED
RESOLVED   → CLOSED
CLOSED     → (terminal)
```

**Replay reconstruction rules**:
To reconstruct incident state at time T:
1. Find the incident's `correlation_id`
2. Fetch all `rampiq_events` where `correlation_id` matches and `entity_type = 'incident'`
3. Sort by `COALESCE(offline_created_at, created_at)`
4. Walk events, applying `state_after` at each step
5. The last event before T gives the incident's state at T

**Must never mutate without emitting an event**:
- `status` — every status change emits a corresponding `incident.*` event
- `assigned_to` — ownership changes emit `incident.confirmed` or are included in transition events
- `severity` — severity changes would emit an event (not currently implemented as a standalone transition)

---

### `rampiq_recovery_actions`

**Source of truth for**: Current action status, assignment, timing.

**Allowed command events**:

| Event Type | Transition | Timing Fields Set |
|-----------|-----------|-------------------|
| `recovery_action.proposed` | → PROPOSED (creation) | `proposed_at` |
| `recovery_action.acknowledged` | PROPOSED → ACKNOWLEDGED | `acknowledged_at`, `acknowledged_by` |
| `recovery_action.active` | ACKNOWLEDGED → ACTIVE | `started_at` |
| `recovery_action.blocked` | ACTIVE → BLOCKED | `blocked_at` |
| `recovery_action.complete` | ACTIVE → COMPLETE | `completed_at` |
| `recovery_action.escalated` | ACTIVE/BLOCKED → ESCALATED | `completed_at` |
| `recovery_action.withdrawn` | PROPOSED/ACKNOWLEDGED/BLOCKED → WITHDRAWN | `completed_at` |

**Allowed status transitions** (from operational-states.ts):
```
PROPOSED     → ACKNOWLEDGED, WITHDRAWN
ACKNOWLEDGED → ACTIVE, WITHDRAWN
ACTIVE       → BLOCKED, COMPLETE, ESCALATED
BLOCKED      → ACTIVE, ESCALATED, WITHDRAWN
COMPLETE     → (terminal)
ESCALATED    → (terminal)
WITHDRAWN    → (terminal)
```

**Replay reconstruction rules**:
To reconstruct action state at time T:
1. Fetch all `rampiq_events` where `entity_type = 'recovery_action'` and `entity_id` matches
2. Sort by replay timestamp
3. Walk events applying `state_after`
4. Last event before T gives state at T

**Must never mutate without emitting an event**:
- `status` — every status change emits a corresponding `recovery_action.*` event
- `assigned_to` — assignment changes are captured in transition events
- `completed_at` — set on terminal transitions, recorded in event

---

## Command Flow

Every lifecycle command follows this pattern:

```
Caller invokes command (createIncident, transitionIncident, etc.)
  │
  ├─ 1. Validate: isValidTransition(lifecycle, from, to)
  │     └─ Invalid → return null, log error
  │
  ├─ 2. Update lifecycle table (Supabase UPDATE/INSERT)
  │     └─ Sets status, timing fields, ownership
  │     └─ updated_at set automatically by trigger
  │
  └─ 3. Append rampiq_events row
        └─ event_type: domain.verb (e.g., 'incident.confirmed')
        └─ entity_type: 'incident' or 'recovery_action'
        └─ entity_id: lifecycle table row ID
        └─ state_before: previous status
        └─ state_after: new status
        └─ correlation_id: from parent incident
        └─ causation_event_id: source event if applicable
        └─ zone_id: from incident context
        └─ event_version: 2
```

---

## Event Strategy

### Event Version

All lifecycle events are emitted with `event_version: 2`. Phase 1 events (created by `postEvent()`) have `event_version: 1`. This allows replay to distinguish between legacy events and lifecycle-aware events.

### Event vs Lifecycle Table

| Question | Answer |
|----------|--------|
| What's the current status of incident X? | Read `rampiq_incidents` WHERE id = X |
| What happened to incident X over time? | Read `rampiq_events` WHERE entity_type = 'incident' AND entity_id = X |
| How many active incidents are there? | Count `rampiq_incidents` WHERE status NOT IN ('RESOLVED', 'CLOSED') |
| What was the state at 14:23? | Replay events up to that timestamp |
| Who acknowledged incident X? | Read `rampiq_incidents.acknowledged_by` (current) or find the `incident.confirmed` event (historical) |

### Correlation

Incidents generate a `correlation_id` on creation. Recovery actions inherit it. All events in an incident episode share the same `correlation_id`. This enables:
- Fetching the complete timeline of an incident: all events with matching `correlation_id`
- Cross-entity grouping: incident events + recovery action events in one timeline
- Future: support requests linked to the same incident

---

## Remaining Risks

### No Transaction Guarantee

Lifecycle update and event append are sequential, not atomic. If the event append fails after the lifecycle update succeeds, there's a gap in the event log. The lifecycle table remains correct (it's the current-state authority), but replay may miss a transition. Mitigation: Supabase RPC functions in Phase 3.

### No UI Consumption Yet

The lifecycle commands are wired but no page calls them. Verification requires either manual API testing or a minimal verification path. The crew chief recovery console and manager incident view are the natural consumers — they come in the next step.

### No Cascade Automation

Creating an incident with `affected_gate_ids` doesn't automatically create events for affected gates. Cascade propagation is a later concern. For now, affected gates are metadata on the incident record.

### Severity Changes Not Modeled

The incident lifecycle tracks status transitions but not severity changes. If an incident's severity changes from HIGH to CRITICAL, there's no dedicated event type. The severity field can be updated, but it won't emit a separate event. This is acceptable for Phase 2 — severity escalation can be added as a standalone command later.

### Demo-Grade RLS

All lifecycle tables use `USING (true)` / `WITH CHECK (true)` RLS policies. Any anonymous client can read, insert, and update. Production requires role-based policies.

---

## Next Step After This Implementation

**Phase 2 Step 2: Wire Incident + Recovery UI**

Convert the manager incident console and crew chief recovery view to consume lifecycle commands:
- Manager creates/transitions incidents via `createIncident()` / `transitionIncident()`
- Chief proposes/transitions recovery actions via `createRecoveryAction()` / `transitionRecoveryAction()`
- Both surfaces read from lifecycle tables, not from mock data
- Shared primitives (OperationalStatus, SeverityIndicator, ElapsedTime, ActionButton) render the lifecycle state

This step does NOT build the full prototype recovery UI. It wires the data layer and provides a minimal verification surface.
