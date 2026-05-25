# RampIQ Architecture Checkpoint
## Phase 1 — Operational Spine Hardening

**Date**: 2026-05-25
**Branch**: main
**Production**: https://rampiq-prototype.vercel.app
**Last deploy**: ef4b4b5 (verified, no blocking issues)

---

## 1. Current Phase Status

### What Phase 1 Accomplished

Phase 1 transformed RampIQ from a frontend-driven prototype into the foundation of an event-driven operational system. Before this phase, RampIQ had realtime UI surfaces that independently calculated operational state, used ad-hoc string literals for severity and status, stored mutable events with no transition history, and had no path to replay or operational reconstruction.

After this phase, RampIQ has:
- A canonical operational language shared across the entire system
- Replay-compatible event metadata on every operational event
- Centralized derived state that any surface can consume
- Shared operational primitives that render deterministically from props
- A layered architecture with clear boundaries between truth, semantics, interpretation, and presentation

### Why the Architecture Changed

The audit identified critical architectural risks:
- **7 different severity renderings** across the prototype, each with its own color logic
- **3 independent gate card implementations** for the same operational entity
- **Inline state computation** duplicated across pages with no shared derivation
- **Mutable events** with no state transition history, making replay impossible
- **No entity tracking** — events existed but couldn't be traced to the gate, equipment, or assignment they affected
- **No causal chains** — when an equipment failure caused a gate cascade, nothing linked those events

These aren't feature gaps. They're structural weaknesses that would compound with every new surface added. Phase 1 addresses them before they become irreversible.

### What Operational Spine Hardening Means

The operational spine is the set of architectural layers between raw Supabase data and rendered UI surfaces. Hardening means:

1. **Standardizing the operational vocabulary** so every surface speaks the same language
2. **Making events replay-compatible** so operational history can be reconstructed
3. **Centralizing state derivation** so pages don't independently compute the same things differently
4. **Extracting shared primitives** so rendering is deterministic and consistent
5. **Separating truth from interpretation** so the system can scale without architectural collapse

---

## 2. Completed Steps

### Step 0 — Replay-Compatible Schema Foundation

**Objective**: Add columns to `rampiq_events` that enable entity tracking, state transition recording, event causality, and replay ordering. Fix existing schema mismatches.

**Files created**:
- `supabase/migrations/20260525000000_spine_hardening.sql`

**Architectural impact**:
- Every event can now carry `entity_type` + `entity_id` (what was affected)
- Every event can now carry `state_before` + `state_after` (what changed)
- Events can reference their cause via `causation_event_id`
- Events can be grouped into episodes via `correlation_id`
- Events carry `zone_id` for subscription scoping
- Events carry `event_version` for contract evolution
- Replay ordering index on `COALESCE(offline_created_at, created_at)`
- Existing events backfilled with entity_type/entity_id/zone_id from gate_id/equipment_id

**Risks solved**:
- Events without entity context (couldn't trace what was affected)
- Events without transition history (couldn't reconstruct state changes)
- No replay ordering (offline events interleaved incorrectly)
- No zone scoping (all subscriptions were station-wide)

**Remaining limitations**:
- All new columns are nullable (backward compat). Not all events have entity context populated yet.
- `causation_event_id` and `correlation_id` are not populated by any caller yet. They're schema-ready for when incidents/cascades are wired.
- `event_version` is always 1. Will increment when the event contract changes.

---

### Step 1 — Canonical Operational Language

**Objective**: Create a single source of truth for all operational state definitions, lifecycle transitions, severity/status colors, and replay-safe time utilities.

**Files created**:
- `prototype/src/lib/operational-states.ts` (690 lines)

**Architectural impact**:
- 6 lifecycle enums defined: OperationalStatus, AssignmentStatus, SupportRequestStatus, IncidentStatus, RecoveryActionStatus, EquipmentStatus
- 7 gate states defined (always derived, never stored): EMPTY, OCCUPIED, WATCH, AT_RISK, BLOCKED, RECOVERING, STABILIZED
- 10 entity types defined for event targeting
- 33 canonical event types using `domain.verb` convention
- Transition maps for every lifecycle with valid source/target states
- `isValidTransition()`, `validTransitions()`, `isTerminalState()` — pure validators
- `statusCssVar()` / `statusHex()` — single source of truth for all status colors
- `pressureCssVar()` / `pressureSeverity()` — threshold-based pressure coloring
- `classifyAge()` / `elapsedLabel()` / `elapsedSeconds()` — all accept `asOf` for replay
- `replayTimestamp()` / `sortForReplay()` — canonical replay ordering
- `canonicalAssignmentStatus()` / `legacyAssignmentStatus()` — backward compat bridges

**Risks solved**:
- Ad-hoc string literals for states scattered across files
- Inconsistent severity color mapping (7 different implementations)
- No transition validation (invalid state changes could be written)
- Time calculations using `Date.now()` directly (breaks replay)
- No canonical event type naming convention

**Remaining limitations**:
- Transition validators exist but are not enforced at write time. Invalid transitions can still be written to Supabase. Enforcement is a Phase 2 concern.
- Not all pages import from this module yet. Legacy imports from `rampiq-types.ts` persist on non-dashboard pages.

---

### Step 2 — Event Enrichment + Replay Metadata

**Objective**: Make `postEvent()` and `updateEventStatus()` automatically populate the replay-compatible fields added in Step 0, without changing any caller.

**Files modified**:
- `prototype/src/lib/rampiq-types.ts` — added new fields to `RampiqEvent` and `EventSubmission`
- `prototype/src/lib/store.ts` — added `deriveEntityContext()`, `getGateToZoneMap()`, `resolveZoneId()`. Modified `postEvent()` and `updateEventStatus()`
- `prototype/src/app/api/rampiq/events/route.ts` — added new fields to `MemoryEvent`

**Architectural impact**:
- `postEvent()` auto-derives `entity_type` + `entity_id` from `equipment_id > gate_id > flight_id`
- `postEvent()` auto-resolves `zone_id` from gate_id via cached zone lookup
- `postEvent()` sets `state_after: 'OPEN'` for new events
- `updateEventStatus()` fetches current status before updating, records `state_before` + `state_after`
- Zone lookup is cached per session (one Supabase call, reused across all events)
- Callers can override any derived field by passing it explicitly in the submission
- All changes are additive — zero caller modifications required

**Risks solved**:
- Events created without entity context
- Events created without zone context
- Status transitions with no before/after record
- Repeated zone lookups on every event creation

**Remaining limitations**:
- `causation_event_id` and `correlation_id` pass through but no caller sets them yet
- `state_before` on new events is always null (no prior state). Only `updateEventStatus()` captures both sides.
- Zone cache is per-session (page reload). If zones change during a session, stale mapping until reload.

---

### Step 3 — Shared Operational Primitives

**Objective**: Extract canonical React components that replace duplicated rendering patterns across the prototype. All components are presentation-only, deterministic, replay-safe, and side-effect free.

**Files created**:
- `prototype/src/components/rampiq/SeverityIndicator.tsx`
- `prototype/src/components/rampiq/OperationalStatus.tsx`
- `prototype/src/components/rampiq/ElapsedTime.tsx`
- `prototype/src/components/rampiq/PressureBar.tsx`
- `prototype/src/components/rampiq/ActionButton.tsx`
- `prototype/src/components/rampiq/GateCard.tsx`
- `prototype/src/components/rampiq/EventRow.tsx`
- `prototype/src/components/rampiq/ZoneTile.tsx`
- `prototype/src/components/rampiq/index.ts`

**Architectural impact**:
- `SeverityIndicator` replaces 7 inconsistent severity renderings (text, pill, badge, dot variants)
- `OperationalStatus` provides unified status rendering across all lifecycle types
- `ElapsedTime` replaces 4 inconsistent time displays. Accepts `asOf` for replay. No internal timer — parent controls re-render frequency.
- `PressureBar` replaces zone pressure bar with threshold coloring from operational-states.ts
- `ActionButton` replaces 4 button pattern variants (act-btn, csr-btn, next-step, sec-btn)
- `GateCard` replaces 3 gate implementations (compact 52px, expanded 240px) with variant prop
- `EventRow` provides canonical event stream row
- `ZoneTile` provides canonical zone summary tile with pressure bar

**Component architectural rules**:
1. Presentation-only — no data fetching
2. Deterministic — same props produce same output
3. Replay-safe — time-dependent components accept `asOf`
4. Side-effect free — no useState, useEffect, subscriptions, or timers
5. Props in, callbacks out — receive truth via props, emit via onClick/onAction
6. Colors from operational-states.ts — no local color maps

**Risks solved**:
- Duplicated severity rendering (7 implementations → 1)
- Duplicated gate rendering (3 implementations → 1 with variants)
- Time displays that mix ticking and frozen patterns (→ all replay-safe)
- Color logic scattered across pages (→ centralized in operational-states.ts)

**Remaining limitations**:
- Only wired into the dashboard page. Other pages (mobile, crew chief, admin) still use inline rendering.
- CSS-class-dependent elements (`.rq-qbtn`, `.sev-*` card borders, `.aging-*` overlays) are not replaced because they depend on existing CSS infrastructure. Primitives use inline styles.

---

### Step 4 — Derived Operational State

**Objective**: Centralize all operational interpretation into pure, replay-safe functions. Pages stop independently calculating summaries, aging, filtering, grouping, and distributions.

**Files created**:
- `prototype/src/lib/derived-operational-state.ts` (477 lines)

**Files modified**:
- `prototype/src/app/prototype/rampiq/dashboard/page.tsx` — replaced inline computation with `deriveDashboardState()` consumption. Net reduction of 133 lines.

**Architectural impact**:
- `summarizeEvents()` provides open/resolved counts, severity breakdown, status breakdown, oldest open event, and resolution latency (avg/p50/p90) in one call
- `filterEvents()` + `activeFilterCount()` + `extractFilterOptions()` replace inline filter logic
- `sortBySeverityThenAge()` + `sortByReplayOrder()` provide canonical sorting
- `agingClass()` + `ageMinutes()` + `groupByAging()` provide replay-safe aging derivation
- `groupEventsBy()` + `groupByEntity()` + `groupByZone()` provide generic grouping
- `derivePressure()` computes 0-100 pressure from event count + severity + age
- `deriveGatePressures()` + `deriveZonePressures()` compute per-entity pressure maps
- `computeDistribution()` provides pattern distributions with proportion and avg resolution
- `deriveDashboardState()` computes the complete dashboard view model in one call

Dashboard page reduced from ~843 lines to ~610 lines. All operational interpretation moved to pure functions. Page retains only React state management, action handlers, and JSX rendering.

**Risks solved**:
- Inline computation duplicated across views (feed, unresolved, patterns)
- Non-replay-safe time calculations using `Date.now()` directly
- Filter logic duplicated between feed and unresolved views
- Pattern distribution computed fresh on every render with no shared structure
- Pressure derivation not centralized (would be duplicated by every future zone/gate surface)

**Remaining limitations**:
- Only the dashboard page consumes `deriveDashboardState()`. Other pages still compute locally.
- `derivePressure()` uses a simple weighted formula (count + severity + age). The weights are reasonable defaults but may need tuning with real operational data.
- No memoization. `deriveDashboardState()` recomputes on every render. With 3s polling and small event counts this is fine. At scale, memoization or incremental updates will be needed.

---

## 3. Current Architecture Layers

### Layer 1 — Operational Truth

**Location**: Supabase tables + `rampiq_events` schema
**Responsibility**: Immutable record of what happened operationally. Every event, every state transition, every entity affected.

**What this layer must NEVER do**:
- Interpret events (no computed fields beyond `event_duration_seconds` which is GENERATED)
- Render anything
- Make decisions about severity thresholds or pressure
- Contain business rules about valid transitions

---

### Layer 2 — Operational Semantics

**Location**: `prototype/src/lib/operational-states.ts`
**Responsibility**: Define the operational vocabulary. What states exist, what transitions are valid, what colors mean what, what severity levels exist.

**What this layer must NEVER do**:
- Fetch data
- Depend on React
- Contain rendering logic
- Contain interpretation logic (summaries, grouping, pressure)
- Use `Date.now()` without `asOf` fallback

---

### Layer 3 — Operational Interpretation

**Location**: `prototype/src/lib/derived-operational-state.ts`
**Responsibility**: Derive meaning from operational truth using operational semantics. Summaries, filtering, aging, grouping, pressure derivation, distributions.

**What this layer must NEVER do**:
- Fetch data (receives events as function arguments)
- Depend on React
- Render anything
- Mutate input data
- Subscribe to realtime channels
- Use `Date.now()` without `asOf` fallback

---

### Layer 4 — Operational Presentation

**Location**: `prototype/src/components/rampiq/`
**Responsibility**: Render operational state deterministically from props. Severity indicators, status pills, elapsed time, gate cards, zone tiles.

**What this layer must NEVER do**:
- Fetch data
- Subscribe to realtime channels
- Compute operational state (receives it via props)
- Mutate state
- Contain business logic
- Use internal timers (parent controls re-render frequency)

---

### Data Flow

```
Supabase (Layer 1: Truth)
  → store.ts hooks (data access, not a layer — plumbing)
    → derived-operational-state.ts (Layer 3: Interpretation)
      → page components (orchestration — connects layers)
        → components/rampiq/* (Layer 4: Presentation)

operational-states.ts (Layer 2: Semantics)
  → imported by Layer 3 (for constants, validators, colors)
  → imported by Layer 4 (for colors, labels)
```

Pages are orchestrators, not layers. They connect truth (via hooks) to interpretation (via derived state functions) to presentation (via component props). They handle React state, user actions, and side effects (realtime subscriptions, polling).

---

## 4. Current Operational Philosophy

### "The operational event loop is the product"

RampIQ is not a dashboard that shows data. It is an operational event system that happens to have visual surfaces. The event loop — create event, propagate, derive state, render, act — is the core product. Every architectural decision serves this loop.

### "This must feel like the operation is changing in real time"

The user experience must convey operational immediacy. Not "a form was submitted" but "the operation just changed." This means:
- Events propagate within seconds (3s polling + realtime)
- State derivation is deterministic (same events → same display)
- Aging and pressure are live (but replay-safe)
- Actions (ack, resolve) update immediately

### "Build narrow, architect wide"

Phase 1 only touches the manager dashboard. But every module created — operational-states.ts, derived-operational-state.ts, components — is designed to serve all future surfaces (crew chief, agent, admin, replay). Build for one surface, architect for all.

### Replay-Compatible Operational Truth

Every event carries enough context to reconstruct the operational state at any point in history:
- `entity_type` + `entity_id` — what was affected
- `state_before` + `state_after` — what changed
- `causation_event_id` — what caused it
- `COALESCE(offline_created_at, created_at)` — when it actually happened
- All time functions accept `asOf` — state can be computed at any historical point

### Deterministic Operational Behavior

Same events in → same derived state out. No randomness. No `Date.now()` without `asOf`. No side effects in interpretation. This is what makes replay possible and what makes the system testable.

### Presentation vs Interpretation Separation

Components render from props. They don't compute summaries, filter events, or derive pressure. Interpretation functions compute from events. They don't render, subscribe, or manage state. This separation prevents logic drift — the most common cause of inconsistency across surfaces.

---

## 5. Current Remaining Risks

### Mutable `operational_status` on Events

`rampiq_events.operational_status` is updated in place (OPEN → ACKNOWLEDGED → RESOLVED). This violates append-only semantics. The `state_before` + `state_after` columns capture the transition, but the original event row is still mutated. True append-only lifecycle events are a Phase 2 concern.

### No Append-Only Lifecycle Event Streams

When a support request is acknowledged, the current system updates the event row. The target architecture would create a new event (`support.acknowledged`) with `state_before: 'OPEN'` and `state_after: 'ACKNOWLEDGED'`, leaving the original event unchanged. This requires lifecycle tables (incidents, support_requests, recovery_actions) which don't exist yet.

### No Lifecycle Tables

The prototype simulates incidents, support requests, and recovery actions in localStorage. No Supabase tables exist for these entities. The `IncidentStatus`, `SupportRequestStatus`, and `RecoveryActionStatus` enums are defined in operational-states.ts but have no corresponding schema.

### Propagation Engine Not Hardened

Event propagation is still full-table re-fetch on every change (`fetchEvents()` returns all events). Zone-scoped subscriptions exist in schema (zone_id column + index) but aren't used for targeted realtime channels. No incremental update mechanism.

### Causation/Correlation Not Fully Utilized

The `causation_event_id` and `correlation_id` columns exist and pass through `postEvent()`, but no caller populates them. They become relevant when incidents and cascades are wired — an equipment failure event would set `causation_event_id` on the resulting gate state change events.

### Remaining Duplicated UI Surfaces

Only the dashboard page consumes shared primitives and derived state. Mobile agent pages, crew chief pages, workforce pages, and operations pages still use inline rendering and local computation. Each new surface converted reduces duplication; each unconverted surface remains a drift risk.

### No Cross-Domain Orchestration

RampIQ currently operates within a single domain (ramp events). Connected domains — fuel, catering, cabin cleaning, pushback, baggage — are event types in the schema but have no workflow orchestration. This is explicitly deferred to later phases.

---

## 6. Current System Capabilities

### Replay-Compatible Reconstruction

Events carry `entity_type`, `entity_id`, `state_before`, `state_after`, `causation_event_id`, `correlation_id`, `zone_id`, and `event_version`. The `replayTimestamp()` function resolves `COALESCE(offline_created_at, created_at)` for correct ordering. `sortForReplay()` provides deterministic chronological ordering.

### Deterministic Operational Summaries

`summarizeEvents()` computes open/resolved counts, severity breakdown (4 levels), status breakdown (5 states), oldest open event, and resolution latency (avg/p50/p90) from any event list. Same events → same summary. No time dependency.

### Replay-Safe Elapsed Calculations

`elapsedLabel()`, `elapsedSeconds()`, `formatElapsedCompact()`, `classifyAge()`, and `ageMinutes()` all accept an optional `asOf: Date` parameter. When rendering live, `asOf` is omitted (defaults to now). When replaying, `asOf` is the replay cursor position. Same function, deterministic output.

### Canonical Severity/State Rendering

`SeverityIndicator` renders severity in text, pill, badge, or dot variants. `OperationalStatus` renders any lifecycle status with correct coloring. Colors derive from `statusCssVar()` and `SEVERITY_CSS_VAR` in operational-states.ts. One source of truth for all surfaces.

### Centralized Pressure Derivation

`derivePressure()` computes a 0-100 pressure value from event count (max 40 points), severity weighting (max 35 points), and age urgency (max 25 points). `deriveGatePressures()` and `deriveZonePressures()` compute per-entity pressure maps. All replay-safe via `asOf`.

### Zone/Gate Pressure Mapping

Gate-to-zone mapping is cached per session via `getGateToZoneMap()`. Events are enriched with `zone_id` at creation time. `deriveZonePressures()` groups events by zone and computes pressure for each.

### Event Grouping and Filtering

`filterEvents()` applies severity/status/gate/equipment/shift filters. `groupByAging()` groups events into stale/hot/warm/fresh bands. `groupEventsBy()` provides generic grouping. `computeDistribution()` provides pattern distributions with proportion and avg resolution time.

### Operational Interpretation Layering

`deriveDashboardState()` computes the complete dashboard view model — summary, filter options, aging groups, pattern distributions, attention events — in one pure function call. Pages consume derived state rather than computing it inline.

---

## 7. Next Likely Phases

### Lifecycle Tables (Phase 2)

Add Supabase tables for `incidents`, `support_requests`, `recovery_actions`, `recovery_timeline`. These entities currently exist only as mock data in the static prototype's localStorage. The operational-states.ts lifecycle enums and transition validators are ready.

### Deterministic Propagation (Phase 2)

Replace full-table re-fetch with incremental event processing. Subscribe to zone-scoped realtime channels. Implement optimistic status updates. Add stale-state detection and reconnect handling.

### Support Request Orchestration (Phase 2-3)

Wire the support request lifecycle: agent creates → chief acknowledges → resource dispatched → resolved → verified. Each transition emits an append-only event with `state_before` + `state_after`.

### Recovery Tracking (Phase 2-3)

Wire the recovery action lifecycle: proposed → acknowledged → active → complete/escalated. Link recovery actions to incidents via `correlation_id`. Build the recovery console from shared primitives.

### Append-Only Lifecycle Events (Phase 3)

Stop mutating `operational_status` on `rampiq_events`. Status changes become new events referencing the original. `rampiq_events` becomes the immutable event log. Materialized state tables (or views) provide current status for queries.

### Operational Replay Engine (Phase 3-4)

Build replay from `rampiq_events` ordered by `replayTimestamp()`. Reconstruct state at any point using `state_before` + `state_after` transitions. Use `causation_event_id` for cascade visualization. All derived state functions already accept `asOf`.

### Cross-Domain Visibility (Phase 4+)

Expand event types to cover fuel, catering, cabin cleaning, pushback, and baggage domains. Each domain contributes events to the shared event stream. Zone and gate pressure derivation automatically incorporates cross-domain events.

---

## 8. Commit History

### 9198e52 — Operational Spine Hardening: Replay-Compatible Event Architecture

**Milestone**: Foundation. Schema migration + canonical language + event enrichment.

Created:
- `supabase/migrations/20260525000000_spine_hardening.sql` — replay columns, indexes, backfill
- `prototype/src/lib/operational-states.ts` — canonical operational language (690 lines)

Modified:
- `prototype/src/lib/rampiq-types.ts` — added replay fields to RampiqEvent + EventSubmission
- `prototype/src/lib/store.ts` — auto-derive entity/zone, capture state transitions
- `prototype/src/app/api/rampiq/events/route.ts` — pass-through replay fields

Also included: `AUDIT_REPORT.md`, `OPERATIONAL_SPINE_HARDENING.md` (planning documents).

---

### 7410b99 — Add Shared Operational Primitives: Presentation-Only, Replay-Safe

**Milestone**: Visual expression of the canonical operational language.

Created 8 components + barrel export in `prototype/src/components/rampiq/`:
- SeverityIndicator, OperationalStatus, ElapsedTime, PressureBar
- ActionButton, GateCard, EventRow, ZoneTile

Zero existing files modified. Components created but not wired.

---

### a6fa813 — Wire Shared Operational Primitives into Manager Dashboard

**Milestone**: First surface consuming shared primitives.

Modified `dashboard/page.tsx`:
- Replaced inline severity/status/time rendering with SeverityIndicator, OperationalStatus, ElapsedTime
- Removed `statusBorderColor()`, `sevFg()`, `sevBg()` local helpers
- Net reduction: 23 lines

---

### ef4b4b5 — Add Derived Operational State: Centralize Event Interpretation

**Milestone**: Operational interpretation layer complete.

Created `prototype/src/lib/derived-operational-state.ts` (477 lines).

Modified `dashboard/page.tsx`:
- Replaced all inline computation with `deriveDashboardState()` consumption
- Net reduction: 133 lines (843 → 610)
- Removed: local percentile, aging, filtering, sorting, distribution computations
- Retained: React state, action handlers, CSS class helpers, JSX rendering

---

## 9. Current Production Status

| Attribute | Value |
|-----------|-------|
| **Production URL** | https://rampiq-prototype.vercel.app |
| **Dashboard URL** | https://rampiq-prototype.vercel.app/prototype/rampiq/dashboard |
| **Last deployed commit** | ef4b4b5 |
| **Build status** | Passed (21 routes, all static/dynamic pages compiled) |
| **TypeScript** | Clean compile (zero errors excluding stale .next cache) |
| **Dashboard rendering** | Verified: KPIs, severity counters, filters, tabs all rendering |
| **Hydration** | No errors detected |
| **Console errors** | None |
| **API endpoint** | `/api/rampiq/events` returning valid JSON |
| **Mobile agent** | Loading correctly (identity selection UI) |
| **Blocking issues** | None |

### Verified Component Rendering

| Component | Rendering | Location |
|-----------|-----------|----------|
| SeverityIndicator (badge) | Yes | EventCard severity tag |
| SeverityIndicator (text) | Yes | Attention banner severity |
| SeverityIndicator (pill) | Yes | EventCard expanded detail |
| OperationalStatus (pill) | Yes | EventCard status pill + detail |
| ElapsedTime (relative) | Yes | EventCard age, attention banners, oldest-open KPI |

### Untouched Surfaces (Still Working)

| Surface | Status |
|---------|--------|
| Mobile agent home | Loads, identity selection functional |
| Mobile scan | Camera/manual entry functional |
| Mobile report | Event submission functional |
| Operations flights | Flight board rendering |
| Operations assignments | Crew assignment board rendering |
| Workforce readiness | Readiness dashboard rendering |
| Admin QR | QR target management rendering |

---

## Appendix: Constraints That Must Be Preserved

1. **operational-states.ts is the single source of truth** for severity levels, lifecycle states, transition rules, and status colors. No page or component should define its own.

2. **derived-operational-state.ts functions are pure**. No `Date.now()` without `asOf`. No mutations. No fetching. No React.

3. **Components in components/rampiq/ are presentation-only**. No hooks, no subscriptions, no business logic, no internal state computation.

4. **Events carry replay metadata**. `postEvent()` auto-derives `entity_type`, `entity_id`, `zone_id`, and `state_after`. `updateEventStatus()` captures `state_before` + `state_after`. Do not bypass these enrichments.

5. **Zone cache is session-scoped**. `getGateToZoneMap()` loads once per page session. If zone configurations change, the cache is stale until page reload. This is acceptable for Phase 1.

6. **`operational_status` on events is still mutable**. This is a known compromise. `state_before` + `state_after` capture the transition for replay, but the row itself is updated. Do not add new mutable fields to events. Future lifecycle entities use append-only events.

7. **The dashboard is the only surface consuming derived state and shared primitives**. Other pages are unconverted. Converting them is safe but must follow the same layering: truth → semantics → interpretation → presentation.

8. **All time-dependent rendering must accept `asOf`**. When `asOf` is omitted, the function uses current time. When `asOf` is provided (replay), the function uses that timestamp. No exceptions.
