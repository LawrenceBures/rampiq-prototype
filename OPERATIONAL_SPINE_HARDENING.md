# RampIQ Operational Spine Hardening Report

**Date**: 2026-05-25
**Phase**: 1 Step 0 — Architectural Stabilization
**Status**: Audit complete. Awaiting approval to implement.

---

## 1. Operational Primitive Audit

### 1.1 Duplicated Patterns

These operational concepts are rendered with **different code, different class names, and different data shapes** across the prototype and existing app:

#### Gate Representation (3 implementations)

| Location | Class | Size | Data Shape | Behavior |
|----------|-------|------|-----------|----------|
| `pulse.html` | `.gate` | 52×60px | `{id, tail, dep, state, step}` | Click → recovery or toast |
| `zone.html` | `.chief-gate` | 240×160px | Same + crew dots, time-to-push calc | Click → recovery or toast |
| `turn-queue.html` | `.turn-row` | Full-width grid row | Same + progress bar, flag pill | Click → recovery or toast |

**Problem**: Same operational entity, three rendering modes, no shared logic.

#### Severity Display (7 implementations)

| Location | Pattern | Rendering |
|----------|---------|-----------|
| Gate cards | `.gate.crit` | Full gradient bg + critFlash animation |
| Incident cards | `.inc-cat.crit` | Text color only |
| Support status | `.sup-stat.open` | Full pill (bg + border + text) |
| Event rows | `.ev-type.crit` | Text color, mono 9px |
| Turn queue | `.turn-flag.crit` | Pill with bg + border |
| Zone tiles | `.zone-tile.crit` | Left border + bg gradient |
| Equipment | `.eq-stat.failed` | Pill status badge |

**Problem**: Severity is the most fundamental operational semantic. It has no canonical rendering.

#### Crew/Person Display (3 implementations)

| Location | Class | Layout |
|----------|-------|--------|
| `workforce.html` | `.agent-row` | 5-col grid, 26px avatar |
| `recovery.html` (chief) | `.cc-card` | Card layout, 36px avatar |
| Agent suite | `.team-card` | Flex row, different structure |

**Problem**: Same person entity, completely different rendering per role context.

#### Support Request Display (2 implementations)

| Location | Class | Grid |
|----------|-------|------|
| `support.html` | `.sup-row` | 5-column, `.act-btn` buttons |
| `recovery.html` (chief) | `.chief-sup-row` | 2-column, `.csr-btn` buttons |

**Problem**: Same lifecycle entity, different class names AND different button styling.

#### Action Buttons (3 implementations)

| Location | Class | Style |
|----------|-------|-------|
| Manager pages | `.act-btn` / `.act-btn.primary` / `.act-btn.danger` | 6px 10px padding |
| Chief pages | `.csr-btn` | 10px padding, subtly different |
| Agent pages | `.next-step` / `.sec-btn` | 28px/16px padding, much larger |

#### Filter/Tab Controls (4 implementations)

| Location | Class | Notes |
|----------|-------|-------|
| `support.html` | `.sup-filter` | 5px 12px, mono 10px |
| `queue.html` | `.queue-tab` | 7px 14px, mono 10px |
| `equipment.html` | `.filter-bar .f` | Same as sup-filter |
| Agent tabs | `.agent-tab` | Icon + text, flex column |

All functionally identical (toggle `.active` class, re-render list). Four class names.

#### Detail Panels (4 implementations)

| Location | Class | Section Pattern |
|----------|-------|----------------|
| `incidents.html` | `.inc-detail-pane` | `.stat-grid` + `.stat-block` |
| `support.html` | `.sup-detail-pane` | `.meta-grid` + `.meta-block` |
| `geography.html` | `.geo-side` | `.gate-info` |
| `recovery.html` | `.recov-side` | `.ctx-data` |

Same concept (right-side contextual panel), four different structural patterns.

### 1.2 Inconsistent Semantics

#### Time Display (4 behaviors)

| Type | Source | Behavior |
|------|--------|----------|
| Incident age | `startSec` field | Ticked every 1s via `tickIncidents()` |
| Support age | `age` string field | **NEVER updated** — static string |
| Recovery clock | `startSec` field | Ticked every 1s |
| Event timestamp | Array position `[0]` | Static string, never changes |

**Problem**: Age/elapsed time is sometimes live-ticking, sometimes frozen. No canonical time representation.

#### State Machine Implementations

Recovery actions and support requests both have status lifecycles implemented as inline `onclick` handlers with direct DOM mutation. No shared state machine abstraction. Manager and chief pages implement the **same** action lifecycle independently.

### 1.3 Canonical Operational Primitives (Proposed)

Based on the audit, these are the **minimum** reusable primitives needed:

```
src/components/rampiq/
├── primitives/
│   ├── SeverityIndicator.tsx    — canonical severity rendering (text, pill, bg, border variants)
│   ├── OperationalStatus.tsx    — status pill with lifecycle color
│   ├── PressureBar.tsx          — zone/gate pressure visualization
│   ├── ElapsedTime.tsx          — live-ticking elapsed time from ISO timestamp
│   ├── OperationalCounter.tsx   — labeled metric (count + label + optional severity)
│   └── ActionButton.tsx         — primary / danger / ghost variants
│
├── operational/
│   ├── GateCard.tsx             — gate rendering (compact / expanded / row variants via prop)
│   ├── EventRow.tsx             — event stream row
│   ├── TimelineEntry.tsx        — vertical timeline entry (incident history)
│   ├── IncidentCard.tsx         — incident summary card
│   ├── SupportRequestCard.tsx   — support request with lifecycle actions
│   ├── RecoveryActionCard.tsx   — recovery action with state machine buttons
│   ├── CrewMemberRow.tsx        — person display (compact / card / avatar variants)
│   ├── EquipmentCard.tsx        — equipment status card
│   ├── ZoneTile.tsx             — zone pressure/status summary
│   ├── AssignmentCard.tsx       — crew assignment with status lifecycle
│   └── TurnRow.tsx              — aircraft turn queue row
│
├── layout/
│   ├── CommandBar.tsx           — top bar (station, shift, clock, OSI, role nav)
│   ├── FilterBar.tsx            — toggle filter buttons (generic)
│   ├── DetailPanel.tsx          — right-side contextual panel (generic shell)
│   └── PhoneFrame.tsx           — mobile device frame wrapper
│
└── index.ts                     — barrel export
```

**Key design rules**:
- Every primitive accepts a `variant` prop where multiple renderings exist (e.g., `GateCard variant="compact" | "expanded" | "row"`)
- Severity and status are **always** derived from canonical enums, never from ad-hoc strings
- Time displays **always** compute from ISO timestamps, never from pre-formatted strings
- State machine transitions are props (`onAcknowledge`, `onResolve`, `onEscalate`), not inline handlers

---

## 2. Operational State Model Proposal

### 2.1 Current State Chaos

The audit found **no unified operational language**. States are string literals scattered across files:

| Entity | Prototype States | Next.js App States | Conflict |
|--------|-----------------|-------------------|----------|
| Gate | `occupied, warn, crit, recovery, empty` | No gate state model | — |
| Incident | `crit, warn, recovery` (type field) | No incident model | — |
| Support | `open, ack, enroute, resolved` | No support model | — |
| Recovery action | `proposed, ackd, inprog, done, escalated` | No recovery model | — |
| Event status | — | `OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, CANCELLED` | — |
| Assignment | — | `ASSIGNED, ACKNOWLEDGED, EN_ROUTE, IN_PROGRESS, COMPLETE, ISSUE_REPORTED, CANCELLED` | Schema says `ACTIVE, COMPLETED, CANCELLED` |
| Equipment | `in-use, avail, maint, failed` (prototype) | `OPERATIONAL, LIMITED, GROUNDED` (types.ts) | **Direct conflict** |
| User role | — | `RAMP_AGENT, REGIONAL_CABIN, LT_RUNNER, LAV_TECH, CREW_CHIEF, BAG_ROOM` (types.ts) vs `TUG_CREW, BAG_RUNNER, LEAD, SUPERVISOR, CABIN_CLEANER, FUELER` (schema) | **Direct conflict** |

### 2.2 Proposed Canonical State Definitions

These become the **authoritative operational language** for the entire system.

#### Gate Operational State

```typescript
type GateState =
  | 'EMPTY'        // No aircraft, no operation
  | 'OCCUPIED'     // Aircraft on gate, nominal operations
  | 'WATCH'        // Minor issue flagged, no action required yet
  | 'AT_RISK'      // Approaching delay threshold, needs attention
  | 'BLOCKED'      // Cannot proceed — equipment, crew, or dependency failure
  | 'RECOVERING'   // Active recovery in progress
  | 'STABILIZED'   // Recovery complete, returning to nominal
```

**Derivation rule**: Gate state is NEVER stored directly. It is **computed** from:
- Flight status (SCHEDULED → ON_GATE → BOARDING → DEPARTED)
- Open event count + max severity at this gate
- Active incident count at this gate
- Support request backlog at this gate

This is critical for replay: gate state must be reconstructable from events.

#### Support Request Lifecycle

```typescript
type SupportRequestStatus =
  | 'OPEN'          // Created by agent, awaiting chief response
  | 'ACKNOWLEDGED'  // Chief has seen it, no action yet
  | 'DISPATCHED'    // Crew/equipment assigned to address it
  | 'EN_ROUTE'      // Assigned resource is en route
  | 'RESOLVED'      // Issue addressed
  | 'VERIFIED'      // Originator confirmed resolution (optional)
  | 'CANCELLED'     // Withdrawn
```

#### Equipment Operational State

```typescript
type EquipmentStatus =
  | 'AVAILABLE'       // Operational, not assigned
  | 'ASSIGNED'        // Allocated to a gate/operation
  | 'IN_USE'          // Actively being operated
  | 'DEGRADED'        // Operational with known issue
  | 'FAILED'          // Non-operational, needs repair
  | 'MAINTENANCE'     // Scheduled maintenance, temporarily unavailable
```

**Note**: Replaces both prototype (`in-use, avail, maint, failed`) and types.ts (`OPERATIONAL, LIMITED, GROUNDED`).

#### Assignment Lifecycle

```typescript
type AssignmentStatus =
  | 'ASSIGNED'        // Created, awaiting acknowledgment
  | 'ACKNOWLEDGED'    // Agent confirmed receipt
  | 'EN_ROUTE'        // Agent traveling to position
  | 'ACTIVE'          // Agent on position, working
  | 'DELAYED'         // Agent blocked by dependency
  | 'COMPLETE'        // Work finished
  | 'OVERRIDDEN'      // Reassigned by chief/manager (audit trail)
  | 'CANCELLED'       // Withdrawn before completion
```

**Note**: `ACTIVE` replaces `IN_PROGRESS` (operational language, not project management language). `OVERRIDDEN` replaces implicit override tracking.

#### Incident Lifecycle

```typescript
type IncidentStatus =
  | 'DETECTED'        // System or agent flagged anomaly
  | 'CONFIRMED'       // Chief/manager verified it's real
  | 'RECOVERING'      // Active recovery actions in progress
  | 'STABILIZED'      // Immediate risk contained
  | 'RESOLVED'        // All recovery actions complete
  | 'CLOSED'          // Post-incident review complete
```

#### Recovery Action Lifecycle

```typescript
type RecoveryActionStatus =
  | 'PROPOSED'        // Suggested by chief/manager
  | 'ACKNOWLEDGED'    // Assignee confirmed awareness
  | 'ACTIVE'          // Work in progress
  | 'BLOCKED'         // Cannot proceed (dependency)
  | 'COMPLETE'        // Action finished
  | 'ESCALATED'       // Elevated to higher authority
  | 'WITHDRAWN'       // No longer needed
```

#### Event Severity

```typescript
type Severity =
  | 'LOW'        // Informational, no action required
  | 'MEDIUM'     // Attention needed, not urgent
  | 'HIGH'       // Urgent, action required soon
  | 'CRITICAL'   // Immediate action required
```

No change needed. The existing 4-level severity is correct. But rendering must be canonical (see Section 1.3).

#### User Roles (Reconciled)

```typescript
type OperationalRole =
  | 'RAMP_AGENT'      // General ramp crew
  | 'CREW_CHIEF'      // Zone-level leader
  | 'LEAD'            // Shift lead / supervisor
  | 'BAG_RUNNER'       // Baggage runner (replaces LT_RUNNER)
  | 'BAG_ROOM'        // Bag room operator
  | 'CABIN_CREW'      // Regional cabin / cleaning (replaces REGIONAL_CABIN)
  | 'LAV_TECH'        // Lavatory service
  | 'TUG_DRIVER'      // Pushback / tug operations
  | 'FUELER'          // Fuel service (future)
```

**Migration path**: Add new roles, alias old ones, deprecate over time. Don't break existing data.

### 2.3 State Transition Rules

Every lifecycle must define:
1. **Valid transitions** (what state can follow what)
2. **Who can trigger** (which roles)
3. **What event is emitted** (for replay)

Example — Support Request:

```
OPEN → ACKNOWLEDGED      (chief, manager)
OPEN → CANCELLED         (originator, chief, manager)
ACKNOWLEDGED → DISPATCHED (chief, manager)
DISPATCHED → EN_ROUTE    (assigned resource)
EN_ROUTE → RESOLVED      (assigned resource, chief)
RESOLVED → VERIFIED      (originator)
ANY → CANCELLED          (chief, manager)
```

Every transition emits an operational event with `state_before` and `state_after`.

---

## 3. Operational Event Contract Proposal

### 3.1 Current Event Structure (Audit)

The existing `rampiq_events` table has:

```sql
id, created_at, offline_created_at, event_type, event_subtype,
severity, station, gate_id, flight_id, equipment_id,
qr_target_id, notes, operational_status, reported_by,
role_type, shift_window, device_id, source_platform,
resolved_at, resolved_by, event_duration_seconds, sync_status
```

The prototype event bus uses:

```javascript
[timestamp, TYPE, severity, message, location, agent]
// TYPE: SERVICE, SUPPORT, POSITION, RECOVERY, INCIDENT, EXCEPTION, CONFIG
```

**Problems**:
1. No `state_before` / `state_after` — can't replay state transitions
2. No `entity_type` / `entity_id` — can't trace which entity was affected
3. No `related_entities` — can't model cascades
4. No `causality` — can't chain events (this event was caused by that event)
5. `operational_status` on the event itself is mutable (OPEN → RESOLVED), violating append-only principle
6. `event_duration_seconds` is a GENERATED column, coupling event shape to resolution lifecycle
7. Prototype events are flat arrays with positional semantics — brittle and non-extensible

### 3.2 Proposed Canonical Event Structure

```typescript
interface OperationalEvent {
  // === Identity ===
  event_id: string;              // UUID, immutable
  created_at: string;            // Server timestamp (ISO 8601)
  offline_created_at?: string;   // Client timestamp if queued offline

  // === Actor ===
  actor_id: string;              // User ID who caused this event
  actor_role: OperationalRole;   // Role at time of action
  source_platform: SourcePlatform;
  device_id: string;

  // === Classification ===
  event_type: string;            // Verb: 'service.confirmed', 'support.created',
                                 //        'assignment.acknowledged', 'incident.detected',
                                 //        'recovery_action.proposed', 'equipment.failed',
                                 //        'gate.scanned', 'config.updated'
  severity: Severity;            // Event severity at time of creation

  // === Target Entity ===
  entity_type: EntityType;       // 'gate' | 'equipment' | 'flight' | 'support_request'
                                 // | 'incident' | 'recovery_action' | 'assignment'
                                 // | 'zone' | 'station' | 'user'
  entity_id: string;             // ID of the affected entity

  // === Operational Context ===
  station: string;               // Station code
  zone_id?: string;              // Zone if applicable
  gate_id?: string;              // Gate if applicable
  flight_id?: string;            // Flight if applicable
  shift_window: ShiftWindow;     // Shift at time of event

  // === State Transition ===
  state_before?: string;         // Previous state of entity (null for creation events)
  state_after?: string;          // New state of entity (null for read-only events)

  // === Relationships ===
  related_entities?: RelatedEntity[];  // Other entities affected
  caused_by_event_id?: string;         // Parent event that triggered this one
  incident_id?: string;                // Incident context if in recovery

  // === Payload ===
  details: Record<string, unknown>;    // Event-type-specific structured data
  notes?: string;                      // Free-text operator notes

  // === Sync ===
  sync_status: SyncStatus;       // SYNCED | PENDING | FAILED
}

interface RelatedEntity {
  entity_type: EntityType;
  entity_id: string;
  relationship: string;          // 'cascade_target' | 'adjacent_gate' | 'assigned_equipment'
}
```

### 3.3 Event Type Taxonomy

Use `domain.verb` naming convention:

```
service.confirmed         — Agent confirms service step complete
service.started           — Agent begins a service
support.created           — Agent requests support
support.acknowledged      — Chief acknowledges support request
support.dispatched        — Chief dispatches resource
support.resolved          — Resource marks support resolved
support.verified          — Originator confirms resolution
incident.detected         — System or person flags incident
incident.confirmed        — Chief/manager confirms incident
incident.recovering       — Recovery actions initiated
incident.stabilized       — Immediate risk contained
incident.resolved         — All recovery actions complete
recovery_action.proposed  — Chief proposes recovery action
recovery_action.acknowledged — Assignee acknowledges action
recovery_action.active    — Work begins on action
recovery_action.complete  — Action finished
recovery_action.escalated — Action elevated
assignment.created        — Chief/manager creates assignment
assignment.acknowledged   — Agent acknowledges assignment
assignment.active         — Agent begins work
assignment.complete       — Agent completes assignment
assignment.overridden     — Assignment reassigned
equipment.failed          — Equipment failure detected
equipment.degraded        — Equipment operating with issue
equipment.repaired        — Equipment restored
gate.scanned              — QR position check-in
config.updated            — Admin changes configuration
position.checkin          — Agent positional check-in
```

### 3.4 Migration Path

The existing `rampiq_events` table stays. We add columns incrementally:

```sql
ALTER TABLE rampiq_events ADD COLUMN entity_type text;
ALTER TABLE rampiq_events ADD COLUMN entity_id text;
ALTER TABLE rampiq_events ADD COLUMN state_before text;
ALTER TABLE rampiq_events ADD COLUMN state_after text;
ALTER TABLE rampiq_events ADD COLUMN caused_by_event_id uuid REFERENCES rampiq_events(id);
ALTER TABLE rampiq_events ADD COLUMN incident_id uuid;
ALTER TABLE rampiq_events ADD COLUMN zone_id text;
ALTER TABLE rampiq_events ADD COLUMN related_entities jsonb;
```

Existing events get `entity_type` and `entity_id` backfilled from `qr_target_id` + `gate_id` + `equipment_id`.

New code writes both old fields (for backward compat) and new fields. Old code ignores new fields.

### 3.5 Append-Only Principle

**Current violation**: `operational_status` on `rampiq_events` is mutable (OPEN → ACKNOWLEDGED → RESOLVED). This means the event table is not append-only.

**Fix**: Status transitions become **new events**, not mutations.

- Event created → `operational_status = 'OPEN'`, event_type = `support.created`
- Chief acknowledges → NEW event, event_type = `support.acknowledged`, entity_id = support_request_id, state_before = 'OPEN', state_after = 'ACKNOWLEDGED'
- The `support_requests` table (materialized state) gets updated
- The `rampiq_events` row for the original event is NOT mutated

**Transition period**: Keep `operational_status` mutable on `rampiq_events` for now (existing dashboard depends on it). New lifecycle entities (incidents, support_requests, recovery_actions) use append-only events from day one.

---

## 4. Event Propagation Architecture

### 4.1 Current Propagation Map

When an event is created today:

```
Agent submits event
  → postEvent() writes to Supabase rampiq_events
    → Supabase realtime fires INSERT on 'rampiq_events_live' channel
      → Dashboard useLiveEvents() callback fires fetchEvents()
        → Full table re-fetch (SELECT * FROM rampiq_events)
          → React state update → re-render entire dashboard
  → OR: postEvent() writes to localStorage (fallback)
    → Only this tab sees the change
    → No cross-tab notification (no storage event on same tab)
```

When an event status changes:

```
Manager clicks "Acknowledge" on dashboard
  → updateEventStatus() PATCH to Supabase
    → Supabase realtime fires UPDATE on 'rampiq_events_live' channel
      → Dashboard useLiveEvents() callback fires fetchEvents()
        → Full table re-fetch again
          → Re-render
  → No notification to mobile agent who created the event
  → No notification to crew chief
  → No zone-scoped broadcast
```

### 4.2 Propagation Problems

| Problem | Impact | Risk Level |
|---------|--------|-----------|
| **Full table re-fetch on every event** | O(n) query on every INSERT. With 1000+ events, this becomes expensive at 3s polling. | HIGH |
| **No scoped channels** | Manager sees ALL events. Chief sees ALL events. No zone filtering at subscription level. | MEDIUM |
| **No mobile push** | Agent never learns their support request was acknowledged. | HIGH |
| **Prototype cross-tab works, Next.js doesn't** | Prototype uses `storage` events. Next.js uses Supabase realtime. But fallback mode (localStorage) has no cross-tab. | MEDIUM |
| **Stale state on dashboard** | Between polls (3s gap), dashboard shows old data. New events flash via `newIds` but resolved events may still show as open for up to 3s. | LOW |
| **No optimistic updates** | Click "Acknowledge" → wait for Supabase round-trip → then UI updates. Feels slow. | LOW |
| **Race condition: simultaneous ack** | Two managers can both click "Acknowledge" on same event. Both succeed. No conflict detection. | MEDIUM |
| **Offline event ordering** | Offline events have `offline_created_at` but sync in arbitrary order. Replay may reconstruct wrong sequence. | HIGH |

### 4.3 Proposed Propagation Architecture

**Phase 1 (Minimal viable fix)**:

1. **Incremental fetch, not full re-fetch**: On realtime event, fetch only the changed row by ID, merge into local state. Reduces query load from O(n) to O(1).

2. **Zone-scoped subscriptions**: Subscribe to `rampiq_events` WHERE `zone_id = X` for chief pages. Subscribe to all for manager pages. Agent subscribes to own assignment's zone.

3. **Optimistic status updates**: Update local state immediately on user action. Reconcile when Supabase confirms or rejects.

4. **Offline timestamp ordering**: Sort by `COALESCE(offline_created_at, created_at)` for replay. Add `sequence_number` (monotonic per device) for tiebreaking.

**Phase 2 (Later)**:

5. **Agent notifications**: Supabase realtime subscription on mobile for events matching agent's active assignment gate_id.

6. **Conflict detection**: Add `updated_at` column, use optimistic concurrency (WHERE updated_at = expected). Reject stale updates.

### 4.4 Deterministic Propagation Rules

For any operational event, the propagation must be **deterministic and documentable**:

```
EVENT: support.created (severity: HIGH, gate: B7, zone: B)
PROPAGATES TO:
  1. rampiq_events table         → INSERT (append-only)
  2. support_requests table      → INSERT (materialized state)
  3. Zone B chief                → realtime notification
  4. Station manager dashboard   → event stream + zone B pressure recalc
  5. Gate B7 state               → recompute (may escalate to AT_RISK)
  6. Zone B pressure             → recompute (support backlog increased)
  7. Station OSI                 → recompute (weighted zone average)
DOES NOT PROPAGATE TO:
  - Other zones (unless cascade)
  - Agent who created it (they already know)
  - Admin pages (config, not operations)
  - Replay (until explicitly requested)
```

This determinism is what makes replay possible.

---

## 5. Replay Readiness Analysis

### 5.1 Current Replay Capability

**Prototype**: `replay/replay.html` has a functional timeline scrubber that navigates through `seedEvents` (21 pre-seeded events). It reconstructs a visual state (gate map + metrics) at each event position. This is a **visual mock** — it reads from the same `rampiq_state_v1` localStorage, not from replayed events.

**Next.js app**: No replay capability. Events are stored in `rampiq_events` table but there's no reconstruction logic.

### 5.2 Replay Requirements

For deterministic replay, the system must satisfy:

| Requirement | Current Status | Gap |
|-------------|---------------|-----|
| **Ordered event log** | Events have `created_at` timestamp | Need `COALESCE(offline_created_at, created_at)` ordering + device sequence numbers |
| **Append-only events** | `operational_status` is MUTABLE on events | Status transitions must become new events (Section 3.5) |
| **State derivability** | Gate state not stored (good), but zone pressure is stored in prototype mock data (bad) | All derived state (gate state, zone pressure, OSI) must be computable from events |
| **Causal chains** | No `caused_by_event_id` | Need causality links for cascade reconstruction |
| **Entity lifecycle** | No `state_before` / `state_after` | Need transition fields on every state-changing event |
| **Snapshot capability** | No snapshots | Need periodic state snapshots for efficient replay of long time ranges |
| **Deterministic computation** | `computeAssignmentPressure()` uses current time | Replay functions must accept a `replay_at` timestamp parameter |

### 5.3 What Makes Replay Work

Replay = reconstruct state at time T by:

1. Find the most recent snapshot before T
2. Fetch all events between snapshot and T
3. Apply events in order to reconstruct state
4. Derive computed state (gate state, zone pressure, OSI)

For this to work:

- **Every state mutation** must produce an event with `state_before` and `state_after`
- **No derived state** should be stored as primary data (it's always recomputable)
- **Time functions** must be injectable (no `Date.now()` in business logic; pass time as parameter)
- **Randomness** must be eliminated from state computation (the prototype's OSI flicker is random ±1 — this must become deterministic, based on event-derived pressure)

### 5.4 Replay-Safe Design Rules

1. **Never store computed state as authoritative.** Gate state, zone pressure, OSI, and crew availability are always derived.
2. **Every user action emits an event.** No silent state mutations.
3. **Events are immutable after creation.** Status changes create new events referencing the original.
4. **Time is a parameter, not a global.** All functions that use "now" accept an optional `asOf` timestamp.
5. **Causality is explicit.** If event B was triggered by event A, `caused_by_event_id` links them.

### 5.5 Implementation Sequence for Replay Readiness

1. Add `entity_type`, `entity_id`, `state_before`, `state_after`, `caused_by_event_id` to `rampiq_events` (schema migration)
2. Modify `postEvent()` to accept and store these fields
3. Create `deriveGateState(gateId, events, asOf?)` — pure function
4. Create `deriveZonePressure(zoneId, events, asOf?)` — pure function
5. Create `deriveStationOSI(station, events, asOf?)` — pure function
6. Ensure all new lifecycle tables (incidents, support_requests, recovery_actions) emit events on every state change

Replay UI comes later. The architecture comes now.

---

## 6. Failure Point Analysis

### 6.1 Duplicate QR Scans

**Scenario**: Agent scans same gate QR twice within seconds.
**Current behavior**: Two identical events created. No deduplication.
**Risk**: Duplicate position check-ins, inflated scan counts.
**Fix**: Client-side debounce (ignore same QR within 10s) + server-side idempotency key (`device_id + qr_target_id + 10s window`).

### 6.2 Simultaneous Status Updates

**Scenario**: Two managers both click "Acknowledge" on the same event within the 3s poll interval.
**Current behavior**: Both PATCH requests succeed. Last write wins. No conflict detection.
**Risk**: Audit trail shows wrong acknowledger. Possible state corruption if one acks while other resolves.
**Fix**: Add `updated_at` column. PATCH with `WHERE updated_at = $expected`. Return 409 on conflict. Client retries with fresh state.

### 6.3 Stale Manager State

**Scenario**: Manager has dashboard open for 30 minutes. Network hiccup causes realtime subscription to drop. Polling continues but misses events during the gap.
**Current behavior**: `useLiveEvents` polls every 3s. If Supabase realtime drops, only polling remains. No "last seen event" watermark.
**Risk**: Manager makes decisions on stale data.
**Fix**: Track `lastEventId` or `lastCreatedAt`. On reconnect, fetch events since last known. Display "Last updated X seconds ago" indicator. Visual warning if stale > 30s.

### 6.4 Offline Queue Collisions

**Scenario**: Agent creates 5 events offline. Goes online. `syncQueue()` sends all 5. Network drops mid-sync. 3 succeed, 2 fail.
**Current behavior**: Successful events removed from IndexedDB. Failed events increment `attempts` counter. No auto-retry.
**Risk**: 2 events stuck in queue. Agent may not notice. No visual urgency.
**Fix**: 
- Auto-retry with exponential backoff (10s, 30s, 60s)
- Queue depth badge already exists on mobile home — ensure it persists
- Add `offline_created_at` to all queued events (already done)
- Add deduplication: hash of `(event_type + gate_id + reported_by + floor(offline_created_at / 10s))` as idempotency key

### 6.5 Rapid Submissions

**Scenario**: Agent rapidly taps "Next Step" 5 times on `now.html`.
**Current behavior**: Each tap emits `serviceConfirmed()` and creates an event. Button shows green for 1.8s then resets, but taps during the green state still fire.
**Risk**: 5 duplicate service confirmation events.
**Fix**: Disable button during submission + cooldown period. Use `submitting` state flag (the Next.js app already does this; the prototype doesn't).

### 6.6 Escalation Storms

**Scenario**: Equipment failure at gate B7 causes cascade to B8, B9, B14. Chief escalates. Manager escalates. Both create escalation events simultaneously.
**Current behavior**: No coordination. Two escalation events for same incident.
**Risk**: Confusing audit trail. Double resource dispatch.
**Fix**: Incidents have a single `assigned_chief` owner. Only owner can escalate. Others can request escalation (different event type). Incident state machine prevents duplicate transitions.

### 6.7 Conflicting Gate States

**Scenario**: Flight system says gate B7 is EMPTY (departed). Event system says gate B7 has an open CRITICAL equipment failure.
**Current behavior**: No reconciliation. Gate state depends on which data source the page reads.
**Risk**: Manager sees "empty" gate while crew chief sees "critical" gate.
**Fix**: Gate state derivation function considers ALL data sources: flight status AND event status AND incident status. Highest severity wins. `deriveGateState()` as single source of truth.

### 6.8 Reconnect Conflicts

**Scenario**: Agent goes offline, creates events with `offline_created_at = 14:23:00`. Meanwhile, manager resolves one of the agent's earlier events at 14:23:30. Agent comes online at 14:25:00 and syncs.
**Current behavior**: Sync creates events with `offline_created_at` in the past. No awareness of manager's resolution.
**Risk**: Timeline shows agent event after manager resolution, but agent event was actually created before. Replay order is wrong.
**Fix**: Use `COALESCE(offline_created_at, created_at)` for replay ordering. Sync response should return current state of referenced entities so agent can reconcile.

### 6.9 Invalid Recovery Chains

**Scenario**: Recovery action "Deploy backup belt loader" is marked COMPLETE. But the incident it belongs to has already been RESOLVED by another path. The completion event references a closed incident.
**Current behavior**: No validation. Action completion succeeds regardless of incident state.
**Risk**: Orphaned recovery actions. Confusing timeline.
**Fix**: Validate incident state on recovery action transition. If incident is RESOLVED/CLOSED, action transitions to WITHDRAWN (not COMPLETE). Emit event with `state_after = 'WITHDRAWN'` and `notes = 'Parent incident already resolved'`.

### 6.10 Schema Mismatches (Existing Bugs)

These are **already broken** in the current codebase:

| Issue | Location | Impact |
|-------|----------|--------|
| `details_json` column missing from schema | Migration 001 vs store.ts:97 | Gate readiness + LT dispatch inserts fail on Supabase |
| Role enum mismatch | types.ts:35 vs migration 002 seed data | Queries return unexpected role values |
| Assignment status `ACTIVE` vs `ASSIGNED` | Migration 003 DEFAULT vs store.ts:1178 | Seeded assignments have wrong status for code that filters by `ASSIGNED` |
| `sync_status` always `SYNCED` | store.ts:69, 105 | Can't identify which events were created offline |
| `event_duration_seconds` GENERATED vs manual compute | Schema vs store.ts:147 | Conflict between server-computed and client-computed duration |

These must be fixed before any spine hardening work. They are the first implementation step.

---

## 7. Recommended Implementation Sequence

### Step 0: Fix Existing Schema Mismatches (FIRST)

**Risk**: Zero. Fixes bugs. No behavior change for working features.

1. Add `details_json JSONB` column to `rampiq_events`
2. Reconcile role enums (add aliases, don't break existing data)
3. Fix `crew_assignments` status DEFAULT from `'ACTIVE'` to `'ASSIGNED'`
4. Make `sync_status` actually reflect offline state in `postEvent()`

### Step 1: Define Canonical State Enums

**Risk**: Low. TypeScript-only change. No schema change.

Create `src/lib/operational-states.ts`:
- All lifecycle enums from Section 2.2
- State transition validators (pure functions)
- Severity/status color mappings (single source of truth)
- Replace scattered string literals across pages

### Step 2: Define Canonical Event Contract

**Risk**: Low. Additive schema change. No breaking changes.

1. Add columns to `rampiq_events`: `entity_type`, `entity_id`, `state_before`, `state_after`, `caused_by_event_id`, `zone_id`, `related_entities`
2. Update `postEvent()` to accept and store new fields (optional, backward compatible)
3. Update `EventSubmission` type to include new fields

### Step 3: Extract Operational Primitives

**Risk**: Low. New files only. No existing files modified.

Create the components from Section 1.3:
- Start with `SeverityIndicator` (most duplicated pattern)
- Then `OperationalStatus`, `ElapsedTime`, `ActionButton`
- Then `GateCard`, `EventRow`, `ZoneTile`

### Step 4: Create Derived State Functions

**Risk**: Low. Pure functions. No side effects.

Create `src/lib/derived-state.ts`:
- `deriveGateState(gateId, events, flights, asOf?)` → GateState
- `deriveZonePressure(zoneId, events, asOf?)` → number (0-100)
- `deriveStationOSI(station, zonePressures)` → number (0-100)

These replace the prototype's stored `osi`, `zones[].pressure`, and `gates[].state` with computed values.

### Step 5: Add Lifecycle Tables

**Risk**: Medium. New tables. New hooks. Pages start using them.

Add `incidents`, `support_requests`, `recovery_actions`, `recovery_timeline` tables. Create corresponding hooks and mutation functions. Wire crew chief and manager pages.

### Step 6: Wire Deterministic Propagation

**Risk**: Medium. Changes how events propagate.

Replace full re-fetch with incremental updates. Add zone-scoped subscriptions. Add optimistic updates for status transitions.

---

## 8. First Safe Implementation Step

**After approval, implement Step 0 + Step 1 together.**

### Step 0: Fix Schema Mismatches

New migration file: `supabase/migrations/20260525000000_spine_hardening_fixes.sql`

```sql
-- Add missing details_json column
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS details_json jsonb;

-- Fix crew_assignments status default
ALTER TABLE crew_assignments ALTER COLUMN status SET DEFAULT 'ASSIGNED';

-- Add entity tracking columns (additive, no breaking change)
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS state_before text;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS state_after text;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS caused_by_event_id uuid;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS zone_id text;
ALTER TABLE rampiq_events ADD COLUMN IF NOT EXISTS related_entities jsonb;

-- Index for replay ordering
CREATE INDEX IF NOT EXISTS idx_events_replay_order
  ON rampiq_events (COALESCE(offline_created_at, created_at));

-- Index for entity lookup
CREATE INDEX IF NOT EXISTS idx_events_entity
  ON rampiq_events (entity_type, entity_id);

-- Enable realtime on new lifecycle tables (when created)
```

### Step 1: Canonical State Definitions

New file: `prototype/src/lib/operational-states.ts`

Contains:
- All lifecycle enums from Section 2.2
- `isValidTransition(entityType, from, to)` — pure validator
- `severityColor(severity)` — single source of truth for UI colors
- `statusColor(entityType, status)` — single source of truth
- `severityRank(severity)` — numeric ordering

Then update `rampiq-types.ts` to import from this file instead of defining inline.

**What this does NOT do**:
- Does not change any existing page
- Does not change any existing component
- Does not break any existing feature
- Does not add any new UI

**What this enables**:
- Every future component uses canonical enums
- State transitions are validatable
- Colors are consistent
- Replay can validate event sequences

---

## Summary

The RampIQ operational spine has these core problems:

1. **No canonical operational language** — states are ad-hoc strings
2. **No replay-safe event structure** — events are mutable, lack causality
3. **7 different severity renderings** — no shared primitives
4. **Schema/code mismatches** — 5 active bugs where TypeScript and SQL disagree
5. **Full re-fetch on every event** — won't scale past demo
6. **No cascade/causality tracking** — incidents can't trace their cause chain
7. **Offline ordering is broken** — replay can't reconstruct correct sequence

None of these require new features. All of them require disciplined standardization.

The implementation sequence (Step 0 → 6) fixes these in order of risk, starting with zero-risk schema fixes and ending with propagation changes that touch live behavior.

**Awaiting approval to begin Step 0 + Step 1.**
