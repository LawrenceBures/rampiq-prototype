# RampIQ Conversion & Gap Audit Report

**Date**: 2026-05-25
**Auditor**: Claude (automated)
**Repo**: ~/Projects/rampiq-phase4
**Prototype**: prototype/rampiq-ui-prototype/

---

## 1. Existing Repo Inventory

### 1.1 Repo Structure

The repo root is `~/Projects/rampiq-phase4/`. Key project directories:

| Path | Purpose |
|------|---------|
| `prototype/` | Next.js 16 app (the existing working app) |
| `prototype/rampiq-ui-prototype/` | Static HTML prototype (just extracted) |
| `supabase/` | Root-level Supabase config + 10 timestamped migrations |
| `sim/` | Python simulation engine (algorithms, disruption, data gen) |
| `docs/` | Architecture docs (system-boundary, data-dependency-map) |
| `handoff/` | Architecture, README, tuning log |
| `demo/` | Standalone HTML demos (rampiq-live-demo.html, rampiq-live-v2.html) |
| `screenshots/` | Recovery demo screenshots + capture script |
| `assets/mobile-reference/` | Mobile reference materials |
| `rampiq-assets/mobile-reference/` | Additional mobile reference |

> **Note**: Root also contains ~40 unrelated personal ZIP files (gitignored via `*.zip`).

### 1.2 Next.js App Routes (prototype/src/app/)

**21 pages across 5 role domains:**

| Route | File | Domain |
|-------|------|--------|
| `/` | `page.tsx` | Root redirect |
| `/prototype/rampiq` | `page.tsx` | Hub/nav |
| `/prototype/rampiq/dashboard` | `page.tsx` | Manager realtime event board |
| `/prototype/rampiq/manager` | `page.tsx` | Redirect to dashboard |
| `/prototype/rampiq/manager/gate/[gateId]` | `page.tsx` | Gate-specific manager view |
| `/prototype/rampiq/mobile` | `page.tsx` | Agent hub (identity selection) |
| `/prototype/rampiq/mobile/scan` | `page.tsx` | QR camera + manual entry |
| `/prototype/rampiq/mobile/gate/[gateId]` | `page.tsx` | Gate event report form |
| `/prototype/rampiq/mobile/equipment/[equipmentId]` | `page.tsx` | Equipment issue report |
| `/prototype/rampiq/mobile/profile` | `page.tsx` | Agent certs/quals/zones |
| `/prototype/rampiq/mobile/queue` | `page.tsx` | Offline event queue |
| `/prototype/rampiq/mobile/report` | `page.tsx` | Generic event report |
| `/prototype/rampiq/mobile/lt-dispatch` | `page.tsx` | LT dispatch workflow |
| `/prototype/rampiq/operations/assignments` | `page.tsx` | Crew assignments board |
| `/prototype/rampiq/operations/dispatch` | `page.tsx` | Dispatch operations |
| `/prototype/rampiq/operations/flights` | `page.tsx` | Flight board |
| `/prototype/rampiq/operations/team-builder` | `page.tsx` | Team composition |
| `/prototype/rampiq/operations/workforce-pool` | `page.tsx` | Workforce availability |
| `/prototype/rampiq/workforce` | `page.tsx` | Workforce readiness dashboard |
| `/prototype/rampiq/workforce/agent/[userId]` | `page.tsx` | Individual agent profile |
| `/prototype/rampiq/admin/qr` | `page.tsx` | QR target management |
| `/api/rampiq/events` | `route.ts` | REST API: GET/POST/PATCH/DELETE |

### 1.3 Library Code (prototype/src/lib/)

| File | Purpose |
|------|---------|
| `supabase.ts` | Supabase client init (realtime: 10 events/sec) |
| `store.ts` | All data hooks: `useLiveEvents`, `useUsers`, `useQrTargets`, `useEventTypes`, `useAgentProfile`, `useOperationalMetrics`, `useOperationalReadiness`, `useFlights`, `useCrewAssignments`. Fallback data. Composition functions: `fetchAgentProfile`, `computeOperationalMetrics`, `fetchOperationalReadiness`, `computeAssignmentPressure`, `computeSuggestion` |
| `identity.ts` | `getIdentity()`, `setIdentity()`, `clearIdentity()` — localStorage session |
| `scan-input.ts` | QR abstraction: jsQR camera + Zebra DataWedge keystroke + manual entry |
| `offline-queue.ts` | IndexedDB queue for offline event submission |
| `demo-data.ts` | Fallback data constants (users, QR targets, event types, certs, teams, zones, flights, assignments) |
| `rampiq-types.ts` | TypeScript type definitions |

### 1.4 Supabase Schema (supabase/migrations/)

**10 migrations, applied in order:**

| Migration | Tables Created/Modified |
|-----------|----------------------|
| `20260523000000_phase1_schema.sql` | `rampiq_events` (legacy v1) |
| `20260523010000_phase1_unified_schema.sql` | `qr_targets`, `users_lite`, `event_types`, `rampiq_events` (v2), `flights` |
| `20260523020000_workforce_readiness.sql` | `certification_types`, `user_certifications`, `equipment_qual_types`, `user_equipment_quals`, `teams`, `team_members`, `zones`, `user_zone_assignments`, `shift_status`, `learning_modules`, `user_learning_progress`, `recommendation_log` |
| `20260523030000_crew_assignments.sql` | `crew_assignments` |
| `20260523040000_assignment_transitions.sql` | `assignment_transitions` |
| `20260523050000_eagle_terminal_layout.sql` | Seed data: zones (EAGLE-NORTH/MID/SOUTH), QR targets (Gates 52A-52I) |
| `20260523060000_authenticity_pass.sql` | Seed data: 5 realistic users, 2 teams, certs, equipment quals |
| `20260523070000_operational_workflows.sql` | `details_json` column, new event types (EQUIP_STATUS, GATE_READINESS, LT_DISPATCH, LT_ARRIVAL) |
| `20260523080000_dispatch_lifecycle.sql` | `acknowledged_at`, `acknowledged_by` on crew_assignments |
| `20260523090000_workforce_orchestration.sql` | (Additional orchestration fields) |

**All tables: 20+**
**All RLS policies: DEMO-ONLY (anon read/write)**
**Realtime enabled on: `rampiq_events`, `crew_assignments`**

### 1.5 Database Table Summary

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `rampiq_events` | Core event log | event_type, severity, station, gate_id, flight_id, equipment_id, operational_status, reported_by, sync_status, details_json |
| `qr_targets` | Scannable nodes | target_type (GATE/EQUIPMENT/FLIGHT/CHECKPOINT/DISPATCH), station, gate_id, equipment_kind |
| `users_lite` | Workforce identity | role_type (6 roles), default_shift, station |
| `event_types` | Event catalog | code, default_severity, applicable_targets |
| `flights` | Flight schedule | gate_id, aircraft, route, turn_type, status |
| `certification_types` | Cert catalog | category, required_for, renewal_months |
| `user_certifications` | Agent certs | cert_code, earned_at, expires_at, status |
| `equipment_qual_types` | Equipment qual catalog | category |
| `user_equipment_quals` | Agent equipment quals | equip_code, qualified_at, status |
| `teams` | Crew teams | label, shift, lead_user_id |
| `team_members` | Team membership | team_id, user_id |
| `zones` | Operational zones | gate_ids array, station |
| `user_zone_assignments` | Zone assignments | user_id, zone_id, shift |
| `shift_status` | On/off shift | on_shift, shift_start, shift_window |
| `learning_modules` | Training catalog | category, required_for |
| `user_learning_progress` | Training progress | module_code, status, score |
| `recommendation_log` | Assistive AI audit trail | recommendation_type, context_json, override_used, override_reason |
| `crew_assignments` | Assignment lifecycle | status (ASSIGNED→ACKNOWLEDGED→EN_ROUTE→IN_PROGRESS→COMPLETE), override tracking |
| `assignment_transitions` | Reassignment audit | from/to assignment, transition_type |

### 1.6 QR Scan Logic

**Exists and is functional.**
- `scan-input.ts`: Hardware abstraction (jsQR camera, Zebra DataWedge, manual entry)
- `mobile/scan/page.tsx`: Camera UI with permission handling
- QR resolution routes by target_type to appropriate page
- `qr_targets` table with 12+ seeded targets

### 1.7 Mobile Scanner Flow

**Exists and is functional.**
- Identity selection (5 demo users)
- Camera-based QR scanning with jsQR
- Zebra TC56 DataWedge keystroke capture
- Gate/equipment event reporting
- Offline queue (IndexedDB) with sync
- Profile view (certs, quals, zones)

### 1.8 Manager Dashboard

**Exists and is functional.**
- Live event feed (3s polling + Supabase realtime)
- Severity/status/gate/shift filters
- Event aging (warm/hot/stale)
- Resolution latency metrics (avg, p50, p90)
- Gate-specific views
- Workforce readiness dashboard
- Agent profile drilldown

### 1.9 Realtime/Event Logic

- Supabase postgres_changes on `rampiq_events` and `crew_assignments`
- Polling fallback (3s interval)
- localStorage fallback when Supabase unavailable
- REST API endpoint (`/api/rampiq/events`)

### 1.10 Auth/Role Logic

**Demo-grade only.**
- No authentication backend
- Anonymous Supabase with open RLS
- localStorage identity (`getIdentity`/`setIdentity`)
- 6 role types: RAMP_AGENT, REGIONAL_CABIN, LT_RUNNER, LAV_TECH, CREW_CHIEF, BAG_ROOM
- No middleware, no role-based route guards

### 1.11 Reusable Components

**None extracted.** All UI is embedded in page files. No `src/components/` directory.

Common patterns exist in hooks (store.ts) but no shared React components.

### 1.12 CSS/Design System

- Tailwind v4 via `@tailwindcss/postcss`
- `globals.css`: Light/dark theme CSS variables
- `rampiq.css` (~32KB): Gate headers, severity colors, aging indicators, gate cards
- No component library (no shadcn/ui)
- Geist fonts (sans + mono)

### 1.13 Seed/Demo Data

- SQL migrations contain all seed data (users, teams, zones, QR targets, certs)
- `demo-data.ts`: TypeScript fallback constants
- `store.ts`: FALLBACK_* arrays for offline mode
- `makeFallbackFlights()`: Dynamic flight generation

### 1.14 Python Simulation Engine (sim/)

| File | Purpose |
|------|---------|
| `simulator.py` | Core simulation loop |
| `algorithms.py` | Pressure scoring, crew suggestion, zone optimization |
| `models.py` | Data models (Gate, Zone, Crew, Event) |
| `data_generator.py` | Synthetic operational data generation |
| `disruptor.py` | Disruption injection (equipment failures, weather, crew shortages) |
| `config.py` | Simulation parameters |
| `runner.py` | CLI runner |

### 1.15 Dependencies

```
@supabase/supabase-js ^2.105.4
html5-qrcode ^2.3.8
jsqr ^1.4.0
next 16.2.6
qrcode.react ^4.2.0
react 19.2.4
react-dom 19.2.4
tailwindcss ^4
typescript ^5
```

---

## 2. Prototype Inventory (prototype/rampiq-ui-prototype/)

### 2.1 All Screens (29 files)

| File | Role | Purpose | Visual / Functional |
|------|------|---------|-------------------|
| `index.html` | — | Landing, redirects to manager/pulse.html | Visual |
| **Manager (8)** | | | |
| `manager/pulse.html` | Manager | Station pulse: zones, gate map, incidents, event stream | Functional (nav, event drip, timers) |
| `manager/incidents.html` | Manager | Incident table + detail panel | Functional (selection, clock) |
| `manager/recovery.html` | Manager | Recovery console: timeline, action board, participants | Functional (clock, action proposals, events) |
| `manager/support.html` | Manager | Support request triage | Functional (filters, selection) |
| `manager/geography.html` | Manager | Spatial node graph, gate detail | Functional (gate selection, cascade viz) |
| `manager/turn-queue.html` | Manager | Aircraft queue by status/zone | Functional (filters, sorting) |
| `manager/workforce.html` | Manager | Crew status by zone | Partially (read-only, toasts) |
| `manager/equipment.html` | Manager | Equipment inventory by type/status | Functional (filters) |
| **Crew Chief (3)** | | | |
| `crew-chief/zone.html` | Chief | Zone gate cards, crew dots, pressure | Functional (nav to recovery) |
| `crew-chief/queue.html` | Chief | Zone turn queue, tabbed filters | Functional (tabs, sorting) |
| `crew-chief/recovery.html` | Chief | Recovery + support + crew + acks + feed tabs | Functional (action status updates, events) |
| **Agent (4 + CSS)** | | | |
| `agent/now.html` | Agent | Current assignment, next step, quick support | Functional (step confirm, events) |
| `agent/aircraft.html` | Agent | Service checklist with toggles | Functional (checkboxes, events) |
| `agent/scan.html` | Agent | QR scan simulation | Functional (demo scan, events, nav) |
| `agent/support.html` | Agent | Support request category picker | Functional (category select, events, state write) |
| `agent/agent.css` | Agent | iPhone frame, mobile component styles | — |
| **Admin (7)** | | | |
| `admin/stations.html` | Admin | Station identity + operational windows | Functional (form, config events) |
| `admin/zones.html` | Admin | Zone configuration | Functional (zone selection) |
| `admin/nodes.html` | Admin | Gate/node network + adjacency graph | Functional (node selection, SVG graph) |
| `admin/qr.html` | Admin | QR code management per node | Functional |
| `admin/workflows.html` | Admin | Turn workflow definitions | Functional |
| `admin/permissions.html` | Admin | Role/zone permission matrix | Functional |
| `admin/thresholds.html` | Admin | Alert threshold tuning | Functional |
| **Replay (1)** | | | |
| `replay/replay.html` | Replay | Event timeline playback, state canvas | Functional (event nav, state updates) |

### 2.2 Shared Infrastructure

| File | Purpose |
|------|---------|
| `shared/mock-data.js` | State store: `RampIQ.data.load/save/reset/update`. 12 data structures (station, osi, zones, gates, incidents, support, recoveryActions, recoveryTimeline, crew, equipment, qrCodes, seedEvents). Persists to `localStorage:rampiq_state_v1` |
| `shared/events.js` | Event bus: `RampIQ.events.emit/stream/onEvent`. Max 200 events in `localStorage:rampiq_events_v1`. Cross-tab via storage events. 10 convenience emitters (serviceConfirmed, supportRequested, actionProposed, etc.) |
| `shared/interactions.js` | UI shell: `RampIQ.ui.init(role)`. Command bar (station/shift/clock/OSI/role switcher), demo tag, toast system, OSI flicker (4.5s), clock (1s) |
| `shared/styles.css` | Full design system: dark theme, JetBrains Mono + Inter Tight, zone tiles, gate cards, incident cards, event rows, action cards, support rows, pills, form elements, responsive at 1024px |

### 2.3 Mock Data Structures

```
station     { code, name, shift }
osi         integer (58-82, pressure index)
zones[]     { id, name, gates, turns, support, incidents, pressure, role, chief }
gates[]     { id, tail, flight, dep, state, step, zone, crew, [incidentId] }
incidents[] { id, cat, type, where, gate, detail, age, startSec, chief, actions, partic, affected[] }
support[]   { id, cat, type, where, detail, from, age, status, zone }
recoveryActions[] { id, incId, title, status, assigned, eta, ts }
recoveryTimeline[] { t, tp, m, who }
crew[]      { id, name, role, zone, pos, status, lastEvt }
equipment[] { id, type, loc, status, op, note }
qrCodes[]   { node, code, lastScan, scans24h }
seedEvents[] [timestamp, TYPE, severity, message, location, agent]
```

### 2.4 Event Types in Prototype

```
SERVICE   — service confirmations (bag load, cabin, catering, etc.)
SUPPORT   — support requests + ack + resolve
INCIDENT  — incident creation
RECOVERY  — recovery action lifecycle
EXCEPTION — equipment/operational exceptions
POSITION  — position check-in, QR scan
CONFIG    — admin configuration changes
```

### 2.5 Interactive Behaviors Summary

| Behavior | Where Used |
|----------|-----------|
| Gate click → navigate/toast | pulse, geography, zone |
| Incident click → recovery console | pulse, incidents, zone, queue |
| Filter tabs (status/zone/severity) | turn-queue, support, incidents, queue |
| Action status progression (proposed→ackd→inprog→done) | recovery (manager + chief) |
| Service confirmation (button→green→emit) | agent/now, agent/aircraft |
| QR scan simulation | agent/scan |
| Support category → emit + state write | agent/support |
| Zone/node selection → detail panel | admin/zones, admin/nodes |
| Recovery clock (1s timer) | recovery, incidents |
| OSI flicker (4.5s random ±1) | interactions.js (all pages) |
| Event stream drip (4.2s simulated) | pulse |
| Cross-tab event broadcast | events.js (all pages) |

### 2.6 localStorage Keys

| Key | Used By | Purpose |
|-----|---------|---------|
| `rampiq_state_v1` | mock-data.js | Full operational state |
| `rampiq_events_v1` | events.js | Event stream (max 200) |

---

## 3. Reusable Assets (What Can Plug In)

### 3.1 From Existing Repo → Keep

| Asset | Path | Reuse Status |
|-------|------|-------------|
| Supabase schema (10 migrations) | `supabase/migrations/` | **Keep as-is.** 20+ tables ready. |
| Supabase client | `prototype/src/lib/supabase.ts` | **Keep.** Realtime configured. |
| QR scan abstraction | `prototype/src/lib/scan-input.ts` | **Keep.** jsQR + Zebra + manual. |
| Offline queue | `prototype/src/lib/offline-queue.ts` | **Keep.** IndexedDB sync. |
| Identity management | `prototype/src/lib/identity.ts` | **Keep.** Extend later for real auth. |
| Type definitions | `prototype/src/lib/rampiq-types.ts` | **Keep.** TypeScript foundation. |
| Data hooks | `prototype/src/lib/store.ts` | **Keep.** 10+ hooks, composition fns. |
| Demo/fallback data | `prototype/src/lib/demo-data.ts` | **Keep.** Offline fallback. |
| Events API | `prototype/src/app/api/rampiq/events/route.ts` | **Keep.** REST endpoint. |
| Simulation engine | `sim/` | **Keep.** Seed data + disruption generation. |
| Architecture docs | `docs/`, `handoff/` | **Keep.** Reference. |
| Tailwind + rampiq.css | `prototype/src/app/prototype/rampiq/rampiq.css` | **Partially reuse.** Gate/severity/aging styles. |

### 3.2 From Prototype → Extract Design

| Asset | Path | Reuse Status |
|-------|------|-------------|
| Design system (styles.css) | `rampiq-ui-prototype/shared/styles.css` | **Extract color palette, typography, component patterns.** The prototype design is more polished than the existing app. |
| Agent mobile frame (agent.css) | `rampiq-ui-prototype/agent/agent.css` | **Extract phone-frame concept** for mobile preview mode. |
| Event bus patterns (events.js) | `rampiq-ui-prototype/shared/events.js` | **Reference only.** Existing Supabase realtime replaces this. |
| Mock data shapes (mock-data.js) | `rampiq-ui-prototype/shared/mock-data.js` | **Reference only.** Schema already exists in Supabase. |
| Page layouts (all HTML) | `rampiq-ui-prototype/**/*.html` | **Convert to React components.** The HTML structure is the conversion blueprint. |

---

## 4. Duplicate Work to Avoid

### 4.1 Direct Overlaps

| Prototype Screen | Existing Route | Action |
|------------------|---------------|--------|
| `manager/pulse.html` | `/dashboard` | **DO NOT rebuild from scratch.** Enhance existing dashboard with prototype's zone tiles + geography layout. |
| `agent/scan.html` | `/mobile/scan` | **DO NOT rebuild.** Existing scan is superior (real camera, Zebra, offline). Adopt prototype's visual styling only. |
| `agent/support.html` | `/mobile/report` | **Merge.** Existing has form-based reporting; prototype has category-picker UX. Combine. |
| `manager/workforce.html` | `/workforce` | **DO NOT rebuild.** Existing has Supabase-backed certs/quals. Adopt prototype's zone-grouped layout. |
| Agent identity flow | `/mobile` | **Keep existing.** Already has `setIdentity()` + task list. |

### 4.2 Schema Overlaps

| Prototype Mock Data | Existing Supabase Table | Action |
|--------------------|-----------------------|--------|
| `zones[]` | `zones` | **Use existing table.** Prototype zones are simpler (no gate_ids array). |
| `crew[]` | `users_lite` + `shift_status` + `team_members` | **Use existing tables.** More normalized. |
| `equipment[]` | `qr_targets` (where target_type=EQUIPMENT) | **Use existing table.** Extend if needed. |
| `incidents[]` | No dedicated table | **GAP — needs new table.** |
| `support[]` | No dedicated table | **GAP — needs new table.** |
| `recoveryActions[]` | No dedicated table | **GAP — needs new table.** |
| `seedEvents[]` | `rampiq_events` + `event_types` | **Use existing.** |
| `qrCodes[]` | `qr_targets` | **Use existing.** Add `last_scan`, `scans_24h` columns. |
| `gates[]` (state) | `flights` + computed from events | **Derive from existing tables.** Don't store gate state separately. |

### 4.3 Rules

1. **Never rebuild QR scanning.** The existing implementation handles real hardware.
2. **Never rebuild the events API.** It already works with Supabase + fallback.
3. **Never rebuild offline queue.** IndexedDB implementation is production-grade.
4. **Never rebuild identity/session.** Extend, don't replace.
5. **Never duplicate Supabase schema.** The prototype's localStorage structures inform what tables to ADD, not replace.

---

## 5. Operational Domain Gap Analysis

### 5.1 Ramp Agents

| Aspect | Prototype | Existing App | Gap |
|--------|-----------|-------------|-----|
| Current assignment view | `agent/now.html` (step-by-step) | `/mobile` (task list) | Merge: add step-by-step progression |
| Service confirmation | Click → emit | `/mobile/gate/[gateId]` (form) | Merge: add quick-confirm alongside form |
| Aircraft checklist | `agent/aircraft.html` (toggles) | Not present | **BUILD** |
| QR scan | `agent/scan.html` (simulated) | `/mobile/scan` (real camera) | Keep existing, add position check-in emit |
| Support request | `agent/support.html` (categories) | `/mobile/report` (generic form) | Merge: category picker + detail form |
| Phase: **1** | | | |

### 5.2 Crew Chiefs

| Aspect | Prototype | Existing App | Gap |
|--------|-----------|-------------|-----|
| Zone dashboard | `crew-chief/zone.html` | Not present | **BUILD** |
| Zone turn queue | `crew-chief/queue.html` | Not present | **BUILD** |
| Recovery + support + crew tabs | `crew-chief/recovery.html` | Not present | **BUILD** |
| Support acknowledgment | Click → ack | Not present | **BUILD** (needs support_requests table) |
| Action management | Status transitions | Not present | **BUILD** (needs recovery_actions table) |
| Phase: **1** | | | |

### 5.3 Ramp Managers

| Aspect | Prototype | Existing App | Gap |
|--------|-----------|-------------|-----|
| Station pulse | `manager/pulse.html` | `/dashboard` (event-focused) | **ENHANCE**: add zone tiles, geography, incident panel |
| Incident console | `manager/incidents.html` | Not present | **BUILD** |
| Recovery console | `manager/recovery.html` | Not present | **BUILD** |
| Support triage | `manager/support.html` | Not present | **BUILD** |
| Geography / node graph | `manager/geography.html` | Not present | **BUILD** |
| Turn queue | `manager/turn-queue.html` | Not present | **BUILD** |
| Workforce view | `manager/workforce.html` | `/workforce` (readiness) | **ENHANCE** with zone-grouped layout |
| Equipment view | `manager/equipment.html` | Not present | **BUILD** |
| Phase: **1** | | | |

### 5.4 Admin

| Aspect | Prototype | Existing App | Gap |
|--------|-----------|-------------|-----|
| Station setup | `admin/stations.html` | Not present | **BUILD** (Phase 2) |
| Zone config | `admin/zones.html` | Not present | **BUILD** (Phase 2) |
| Node/gate config | `admin/nodes.html` | Not present | **BUILD** (Phase 2) |
| QR code management | `admin/qr.html` | `/admin/qr` (exists) | **ENHANCE** |
| Workflows | `admin/workflows.html` | Not present | **BUILD** (Phase 2) |
| Permissions | `admin/permissions.html` | Not present | **BUILD** (Phase 2) |
| Thresholds | `admin/thresholds.html` | Not present | **BUILD** (Phase 2) |
| Phase: **2** | | | |

### 5.5 Replay

| Aspect | Prototype | Existing App | Gap |
|--------|-----------|-------------|-----|
| Event timeline | `replay/replay.html` (functional) | Not present | **BUILD** (Phase 5) |
| State reconstruction | Canvas + derived state | Not present | **BUILD** (Phase 5) |
| Session selection | Dropdown | Not present | **BUILD** (Phase 5) |
| Phase: **5** | | | |

### 5.6 Baggage Runners / Bag Room / Transfer Room

| Aspect | Status | Phase |
|--------|--------|-------|
| Runner dispatch request (from agent → chief) | Prototype has RUNNER_REQUESTED event type | **Phase 1** (event type exists) |
| Runner arrival confirmation | Not present | **Phase 2** |
| Bag room status board | Not present | **Phase 2** |
| Transfer room coordination | Not present | **Phase 3** |
| Bag reconciliation (IATA BSM integration) | Not present | **Later** |
| **Events created**: runner_requested, runner_dispatched, runner_arrived, bag_loaded, bag_transferred | | |
| **Events consumed**: flight manifest, gate assignment, connection times | | |
| **Delays caused**: late bag delivery, misconnect, bag room backup | | |
| **Dependencies**: flight schedule, gate assignments, crew assignments | | |

### 5.7 Lav Service

| Aspect | Status | Phase |
|--------|--------|-------|
| Lav service request | Prototype has LAV_SERVICE_DELAY event type, LAV_TECH role | **Phase 1** (event type exists) |
| Lav truck availability | Equipment table has LAV_TRUCK type | **Phase 1** (partial) |
| Lav service completion | Not present as workflow | **Phase 2** |
| **Events created**: lav_requested, lav_arrived, lav_complete, lav_delay | | |
| **Delays caused**: lav not complete before boarding, truck breakdown | | |
| **Dependencies**: gate schedule, equipment availability | | |

### 5.8 Fuel

| Aspect | Status | Phase |
|--------|--------|-------|
| Fuel request from ops | Prototype has FUEL_DELAY event type | **Phase 1** (event type) |
| Fuel truck dispatch | Not present | **Phase 2** |
| Fuel complete confirmation | Not present | **Phase 2** |
| Fuel vendor coordination | Not present | **Phase 3** |
| **Events created**: fuel_requested, fuel_arrived, fuel_complete, fuel_delay | | |
| **Delays caused**: late fuel, wrong fuel quantity, fuel truck unavailable | | |
| **Dependencies**: aircraft type (fuel requirements), gate assignments | | |

### 5.9 Catering

| Aspect | Status | Phase |
|--------|--------|-------|
| Catering truck in equipment list | Yes (prototype mock) | **Phase 1** (equipment tracking) |
| Catering arrival/departure | Not present | **Phase 2** |
| Catering delay event | Not present | **Phase 2** |
| **Events created**: catering_arrived, catering_loaded, catering_delay | | |
| **Delays caused**: late catering, wrong count, caterer no-show | | |
| **Dependencies**: flight schedule, gate access, crew clearance | | |

### 5.10 Cabin Cleaning

| Aspect | Status | Phase |
|--------|--------|-------|
| REGIONAL_CABIN role exists | Yes (Supabase schema) | **Phase 1** (role exists) |
| Cabin clean start/complete | Not present as workflow | **Phase 2** |
| Clean team dispatch | Not present | **Phase 2** |
| **Events created**: cabin_clean_start, cabin_clean_complete, cabin_clean_delay | | |
| **Delays caused**: late cleaning, incomplete cleaning, insufficient crew | | |
| **Dependencies**: deplaning complete, gate time window | | |

### 5.11 Gate Coordination

| Aspect | Status | Phase |
|--------|--------|-------|
| Gate assignment display | Prototype gates[] + existing flights table | **Phase 1** (exists) |
| Gate conflict detection | Not present | **Phase 2** |
| Gate swap coordination | Not present | **Phase 2** |
| Gate readiness event | GATE_READINESS event type exists | **Phase 1** (event type) |
| **Events created**: gate_assigned, gate_cleared, gate_conflict, gate_swap | | |
| **Dependencies**: flight schedule, maintenance, equipment positioning | | |

### 5.12 Maintenance / GSE

| Aspect | Status | Phase |
|--------|--------|-------|
| Equipment status tracking | Prototype equipment[] + existing qr_targets | **Phase 1** (partial) |
| Equipment failure event | EQUIPMENT_FAILURE + EQUIP_STATUS event types exist | **Phase 1** (exists) |
| GSE dispatch | Not present | **Phase 2** |
| Maintenance request workflow | Not present | **Phase 2** |
| Preventive maintenance schedule | Not present | **Phase 3** |
| **Events created**: equip_failed, equip_dispatched, equip_repaired, maint_scheduled | | |
| **Delays caused**: equipment failure cascade (prototype models this well) | | |
| **Dependencies**: equipment inventory, crew qualifications | | |

### 5.13 Pushback / Tug Operations

| Aspect | Status | Phase |
|--------|--------|-------|
| PUSHBACK_DELAY event type | Exists in schema | **Phase 1** (event type) |
| TUG equipment type | Exists in schema | **Phase 1** (equipment tracking) |
| Pushback request workflow | Not present | **Phase 2** |
| Tug driver assignment | Not present | **Phase 2** |
| Push alley chokepoint modeling | Prototype has Push Alley node type | **Phase 2** |
| **Events created**: pushback_requested, pushback_cleared, pushback_complete, pushback_delay | | |
| **Delays caused**: no tug available, push alley blocked, wing clearance issue | | |
| **Dependencies**: gate clearance, ATC clearance, crew ready | | |

### 5.14 Deicing

| Aspect | Status | Phase |
|--------|--------|-------|
| Deicing workflow | Not present | **Phase 3+** (seasonal) |
| Deicing pad management | Not present | **Phase 3+** |
| Holdover time tracking | Not present | **Phase 3+** |
| **Events created**: deice_requested, deice_start, deice_complete, holdover_warning | | |
| **Dependencies**: weather, aircraft type, deice fluid availability | | |

### 5.15 Operations Monitor (Read-Only)

| Aspect | Status | Phase |
|--------|--------|-------|
| Station-wide event stream | Prototype pulse.html event stream | **Phase 1** (exists in prototype) |
| Multi-station view | Not present | **Phase 3** |
| KPI dashboard | Not present | **Phase 3** |
| Delay attribution | Not present | **Phase 3** |
| **Phase**: Read-only overlay on existing data | | |

### 5.16 Dispatch / Flight Ops (Read-Only Context)

| Aspect | Status | Phase |
|--------|--------|-------|
| Flight board | Existing `/operations/flights` | **Phase 1** (exists) |
| LT dispatch | Existing `/mobile/lt-dispatch` + LT_DISPATCH event type | **Phase 1** (exists) |
| Dispatch lifecycle | Existing migration 009 (acknowledged_at/by) | **Phase 1** (exists) |
| Read-only flight context in recovery | Prototype recovery.html context panel | **Phase 2** |

---

## 6. Missing Technical Systems

### 6.1 Critical Gaps (Must Have for MVP)

| System | Status | What's Needed |
|--------|--------|--------------|
| **Incidents table** | MISSING | `incidents` table: id, category, type, location, gate_id, detail, severity, status (OPEN→ACKNOWLEDGED→RECOVERING→RESOLVED→CLOSED), assigned_chief, affected_gates[], created_at, resolved_at. This is the biggest schema gap — the prototype models incidents richly but no Supabase table exists. |
| **Support requests table** | MISSING | `support_requests` table: id, category, type, location, gate_id, detail, requested_by, status (OPEN→ACKNOWLEDGED→DISPATCHED→EN_ROUTE→RESOLVED), acknowledged_by, acknowledged_at, resolved_at, zone_id. |
| **Recovery actions table** | MISSING | `recovery_actions` table: id, incident_id (FK), title, status (PROPOSED→ACKNOWLEDGED→IN_PROGRESS→DONE→ESCALATED), assigned_to, eta, proposed_by, completed_at. |
| **Recovery timeline table** | MISSING | `recovery_timeline` table: id, incident_id (FK), timestamp, type (crit/warn/info/good), message, who. Append-only audit trail per incident. |
| **Acknowledgment lifecycle** | PARTIAL | `crew_assignments` has acknowledged_at/by. But incidents, support requests, and recovery actions all need their own ack tracking. |
| **Equipment inventory table** | MISSING | `equipment` table: id, type, location_node, status (AVAILABLE→IN_USE→FAILED→MAINTENANCE), operator, notes, zone_id. Currently equipment is only in `qr_targets` which conflates scannable nodes with equipment state. |

### 6.2 Important Gaps (Phase 2)

| System | Status | What's Needed |
|--------|--------|--------------|
| **Station/zone/node graph schema** | PARTIAL | `zones` and `qr_targets` exist but lack: node adjacency (critical for cascade modeling), chokepoint classification, capacity constraints. Need `node_adjacencies` table or adjacency array on qr_targets. |
| **Turn/service workflow engine** | MISSING | No workflow definition table. Prototype `admin/workflows.html` implies configurable service steps per aircraft type (narrow-body vs wide-body). Need `workflow_templates` and `turn_service_steps` tables. |
| **Pressure scoring engine** | PARTIAL | Python `sim/algorithms.py` has scoring. `store.ts` has `computeAssignmentPressure` and `computeSuggestion`. But no server-side pressure computation or zone-level OSI calculation backed by real events. |
| **Role permissions** | MISSING | No `role_permissions` table. Prototype `admin/permissions.html` implies per-role, per-zone access control. |
| **Operational event schema (formal)** | PARTIAL | `rampiq_events` exists but `event_types` needs expansion for all domains (fuel, catering, cabin, pushback, etc.). The prototype has 7 event types; realistic ops need 30+. |
| **QR code assignment system** | PARTIAL | `qr_targets` exists. Missing: `last_scan_at`, `scans_24h` columns. Missing: QR generation/printing workflow. |

### 6.3 Future Gaps (Phase 3+)

| System | Status | What's Needed |
|--------|--------|--------------|
| **Append-only event table** | PARTIAL | `rampiq_events` is the event log but allows UPDATE/DELETE (demo RLS). Production needs append-only with status changes as new events. |
| **Replay engine** | MISSING | Prototype has `replay/replay.html` with timeline scrubbing. Need server-side state reconstruction from events + snapshotting. |
| **Audit log** | PARTIAL | `recommendation_log` exists for assistive AI audit. Need general audit trail for all state mutations. |
| **Realtime subscription model** | PARTIAL | Supabase realtime on 2 tables. Need channel-based subscriptions per zone/gate for targeted updates. |
| **Mobile offline/degraded mode** | PARTIAL | IndexedDB queue exists. Missing: conflict resolution strategy, sync status UI beyond queue page, degraded-mode indicators. |
| **Authentication** | MISSING | No auth backend. Need Supabase Auth or external provider, proper RLS policies, JWT role claims. |

---

## 7. Recommended Conversion Plan

### Phase 0: Audit Cleanup (This Document)

- [x] Audit existing repo
- [x] Audit prototype
- [x] Identify overlaps and gaps
- [x] Produce this report
- [ ] Get approval to proceed

### Phase 1: Convert Prototype → Next.js Routes

**Goal**: Replace static HTML with React components using existing repo structure. No new backend work.

**Step 1.1**: Create shared React components from prototype patterns
- `ZoneTile` (from zone-tile pattern)
- `GateCard` (from gate card pattern)
- `IncidentCard` (from inc-card pattern)
- `EventRow` (from event-row pattern)
- `ActionCard` (from act-card pattern)
- `SupportRow` (from sup-row pattern)
- `StatusPill` (from pill pattern)
- `CommandBar` (from interactions.js)
- `PhoneFrame` (from agent.css phone frame)

**Step 1.2**: Convert manager pages
- `manager/pulse.html` → enhance existing `/dashboard` with zone tiles + geography + incident panel
- `manager/incidents.html` → new route `/manager/incidents`
- `manager/recovery.html` → new route `/manager/recovery/[incidentId]`
- `manager/support.html` → new route `/manager/support`
- `manager/geography.html` → new route `/manager/geography`
- `manager/turn-queue.html` → new route `/manager/turn-queue`
- `manager/equipment.html` → new route `/manager/equipment`
- Keep existing `/workforce` and `/workforce/agent/[userId]`

**Step 1.3**: Convert crew chief pages
- `crew-chief/zone.html` → new route `/chief/zone`
- `crew-chief/queue.html` → new route `/chief/queue`
- `crew-chief/recovery.html` → new route `/chief/recovery`

**Step 1.4**: Enhance agent pages
- Merge `agent/now.html` step UX into existing `/mobile`
- Add `agent/aircraft.html` → new route `/mobile/aircraft`
- Keep existing scan, add position check-in event
- Merge `agent/support.html` categories into existing `/mobile/report`

**Step 1.5**: Port design system
- Extract prototype color palette (--bg-0 through --bg-5, --amber, --red, --green, --blue) into Tailwind theme
- Port typography (JetBrains Mono + Inter Tight) or keep Geist — decision needed
- Port component CSS patterns into Tailwind utility classes or CSS modules

### Phase 2: Wire Supabase Schema

**Goal**: Add missing tables, seed data, extend existing schema.

**Step 2.1**: New migrations
```sql
-- 011_incidents.sql
CREATE TABLE incidents (...)

-- 012_support_requests.sql
CREATE TABLE support_requests (...)

-- 013_recovery_actions.sql
CREATE TABLE recovery_actions (...)

-- 014_recovery_timeline.sql
CREATE TABLE recovery_timeline (...)

-- 015_equipment_inventory.sql
CREATE TABLE equipment (...)

-- 016_node_adjacencies.sql
ALTER TABLE qr_targets ADD COLUMN adjacencies text[];
ALTER TABLE qr_targets ADD COLUMN node_type text; -- gate, chokepoint, bag_room, staging
ALTER TABLE qr_targets ADD COLUMN capacity integer;

-- 017_qr_scan_tracking.sql
ALTER TABLE qr_targets ADD COLUMN last_scan_at timestamptz;
ALTER TABLE qr_targets ADD COLUMN scans_24h integer DEFAULT 0;
```

**Step 2.2**: Seed data
- Seed incidents (3 active, matching prototype)
- Seed support requests (7, matching prototype)
- Seed recovery actions (5, tied to INC-0142)
- Seed recovery timeline (11 events)
- Seed equipment (12 items)
- Expand event_types (add fuel, catering, cabin, pushback events)

**Step 2.3**: Enable realtime on new tables
- `incidents`, `support_requests`, `recovery_actions`

### Phase 3: Wire Operational Events

**Goal**: Connect UI actions to real Supabase writes.

**Step 3.1**: Event creation
- Service confirmation → INSERT rampiq_events
- Support request → INSERT support_requests + INSERT rampiq_events
- QR scan → INSERT rampiq_events (POSITION type)
- Equipment failure → INSERT rampiq_events + UPDATE equipment status

**Step 3.2**: Acknowledgment flows
- Chief acknowledges support → UPDATE support_requests.status
- Chief acknowledges recovery action → UPDATE recovery_actions.status
- Agent acknowledges assignment → UPDATE crew_assignments.status

**Step 3.3**: Recovery action lifecycle
- Propose → INSERT recovery_actions + INSERT recovery_timeline
- Acknowledge → UPDATE recovery_actions + INSERT recovery_timeline
- Complete → UPDATE recovery_actions + INSERT recovery_timeline
- Escalate → UPDATE recovery_actions + INSERT recovery_timeline + INSERT rampiq_events (EXCEPTION)

### Phase 4: Wire Realtime State

**Goal**: Live updates across all roles.

**Step 4.1**: Supabase realtime channels
- `zone:{zoneId}` — zone-scoped events
- `incident:{incidentId}` — incident-scoped updates
- `station:{stationCode}` — station-wide broadcast

**Step 4.2**: Derived state computation
- Zone pressure from open events + incident count + support backlog
- Gate state from flight status + active events + service progress
- Station OSI from zone pressures (weighted average)

**Step 4.3**: Push to connected clients
- Manager sees zone pressure changes
- Chief sees gate state changes in their zone
- Agent sees assignment updates

### Phase 5: Build Replay

**Goal**: Historical playback from operational_events.

**Step 5.1**: Event archival
- Ensure all mutations append to `rampiq_events`
- Add state snapshots at configurable intervals

**Step 5.2**: Replay engine
- Fetch events for time range
- Reconstruct state at any point
- Step forward/backward through events

**Step 5.3**: Replay UI
- Convert `replay/replay.html` → `/replay`
- Timeline scrubber
- State canvas (geography + metrics)
- Derived state panel

---

## 8. First Safe Implementation Step

**After approval, the first action should be:**

### Step 0: Extract Shared Components

Create `prototype/src/components/rampiq/` with these files, extracted from prototype HTML patterns:

```
src/components/rampiq/
├── ZoneTile.tsx        (from pulse.html zone-tile)
├── GateCard.tsx        (from pulse.html gate)
├── IncidentCard.tsx    (from pulse.html inc-card)
├── EventRow.tsx        (from pulse.html event-row)
├── ActionCard.tsx      (from recovery.html act-card)
├── SupportRow.tsx      (from support.html sup-row)
├── StatusPill.tsx      (from pill pattern)
├── CommandBar.tsx      (from interactions.js command bar)
├── PressureBar.tsx     (from zone-tile pressure bar)
└── RecoveryClock.tsx   (from recovery.html timer)
```

**Why this first**: These components are used across multiple pages. Extracting them first means every subsequent page conversion reuses them instead of duplicating. Zero risk — no existing files are modified.

**Second action**: Convert `manager/pulse.html` into an enhanced `/dashboard` by composing these components with existing `useLiveEvents`, `useFlights`, and data hooks. This validates the component library against real Supabase data.

---

## Appendix: File Counts

| Area | Files |
|------|-------|
| Existing Next.js pages | 21 |
| Existing lib modules | 7 |
| Existing Supabase migrations | 10 |
| Existing Supabase tables | 20+ |
| Prototype HTML pages | 24 |
| Prototype shared files | 5 |
| Total prototype files | 29 |
| Python sim files | 7 |
| Documentation files | 5 |
