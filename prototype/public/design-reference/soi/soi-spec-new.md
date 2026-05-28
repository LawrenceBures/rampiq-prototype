# SOI Surface — Layout System Specification

**Version** 1.0 · Implementation blueprint
**Audience** Claude Code, frontend engineers implementing the SOI command environment
**Status** Decisions locked, ready to build

---

## 1 · Overview & Principles

SOI is a role-aware operational command environment, not a dashboard builder. The interface is **composed, never improvised** — every layout is the result of a curated arrangement, not freeform pixel placement.

The system is built on three concepts:

- **Anchors** — permanent UI elements that cannot be moved, hidden, resized, or replaced. They define SOI's identity.
- **Slots** — fixed positions in the layout that accept modules. Slots have a constrained size system (Compact, Normal, Expanded).
- **Modules** — content units that operators can place into slots, reorder within a rail, switch size, or hide.

Movement is **snap-only**. There is no freeform dragging. Modules either land in a slot or they don't.

Reference behaviors (for interaction language): Notion sidebar reordering, Figma right-panel collapse states, Blender workspace tabs.

---

## 2 · Anchor Slots (Permanent)

These four anchors are non-customizable. They appear in every layout, every role, every saved view.

| ID | Element | Position | Behavior |
|----|---------|----------|----------|
| `A1` | Header | Top, full width, 56–62px | Brand mark, station code, operator identity, time/conditions, SOI status, layout pill |
| `M1` | Map | Center, upper area | Ambient pressure-field visualization. Position fixed. Visualization mode can switch (Spatial / Schematic / Topo) but the slot itself doesn't move |
| `A2` | Active Recommendation | Center, below map | The decision surface. Expands vertically in Crisis Mode (consumes M1's vertical space) |
| `A3` | Command Dock | Bottom, full width, ~76px | AI presence, waveform, voice/text input. Always at bottom |

**Implementation note:** anchors should be visually distinguishable in Edit Mode via a lock badge and ~80% opacity (see Section 8).

---

## 3 · Customizable Slots

Three slot regions, ten slots total.

### Left Rail · `L1`–`L4`
Vertical column, fixed width ~240–268px depending on density.
Four slots stacked top to bottom.

### Right Rail · `R1`–`R4`
Vertical column, fixed width ~280–320px depending on density.
Four slots stacked top to bottom.

### Lower Utility · `U1`–`U2`
Horizontal row below the recommendation panel, above the dock.
Two slots side-by-side, spanning the center column width.

**Rule:** Modules can be moved between any slot in any region (left rail → right rail is allowed). Edit Mode highlights the destination rail when a module is dragged over it.

---

## 4 · Slot Sizes

Three sizes per slot. The size lives on the **module**, not the slot.

| Size | Units | Description |
|------|-------|-------------|
| `Compact` | 1 | Header + 1-line summary only. For de-emphasized modules |
| `Normal` | 1 | Default. Full module content visible |
| `Expanded` | 2 | Module consumes 2 adjacent slot positions in the same rail |

**Constraints:**
- An Expanded module in `L2` consumes `L2` and `L3`. Sliding it into a different position must keep both halves adjacent and in the same rail
- Lower utility slots (`U1`, `U2`) do not support Expanded — they are Compact or Normal only
- Empty slots are valid and only visible in Edit Mode

**No arbitrary resizing.** Operators cannot pixel-stretch panels. Size changes are discrete state changes only.

---

## 5 · Module Library

Modules are the content units that can live in slots. Every module declares the slot regions it's allowed in (some are rail-only, none for utility).

### Core Operational Modules
| Module ID | Name | Allowed Regions | Default Size |
|-----------|------|-----------------|--------------|
| `op-snapshot` | Operational Snapshot | L, R | Normal |
| `zone-health` | Zone Health | L, R | Normal |
| `staffing` | Staffing | L, R | Compact |
| `recovery-status` | Recovery Status | L, R | Normal |
| `op-intelligence` | Operational Intelligence | L, R | Normal |
| `recovery-confidence` | Recovery Confidence | L, R | Normal |
| `recommended-next` | Recommended Next | L, R | Compact |
| `workforce-dist` | Workforce Distribution | L, R | Normal |
| `all-zones` | All Zones Overview | L, R | Normal |
| `recovery-coord` | Recovery Coordination | L, R | Normal |
| `cross-zone-forecast` | Cross-Zone Forecast | L, R | Normal |

### Dispatch Modules
| Module ID | Name | Allowed Regions | Default Size |
|-----------|------|-----------------|--------------|
| `assignment-queue` | Assignment Queue | L, R | Normal |
| `flight-schedule` | Flight Schedule | L, R | Normal |
| `resource-movement` | Resource Movement | L, R | Normal |
| `pending-dispatches` | Pending Dispatches | L, R | Normal |
| `inbound-coord` | Inbound Coordination | L, R | Normal |
| `equipment-availability` | Equipment Availability | L, R | Compact |
| `coordination-msgs` | Coordination Messages | L, R | Normal |
| `gate-conflicts` | Gate Conflicts | L, R | Compact |

### Executive / Network Modules
| Module ID | Name | Allowed Regions | Default Size |
|-----------|------|-----------------|--------------|
| `kpi-strip` | KPI Strip | L, R | Normal |
| `throughput` | Throughput | L, R | Normal |
| `stabilization-forecast` | Stabilization Forecast | L, R | Normal |
| `historical-trend` | Historical Trend | L, R | Compact |
| `predictive-summary` | Predictive Summary | L, R | Normal |
| `cross-station` | Cross-Station Status | L, R | Normal |
| `cost-impact` | Cost Impact | L, R | Normal |
| `governance-audit` | Governance & Audit | L, R | Normal |

### Utility Modules (lower utility slots only)
| Module ID | Name | Allowed Regions | Default Size |
|-----------|------|-----------------|--------------|
| `incident-timeline` | Incident Timeline | U | Compact |
| `audit-trail` | Audit Trail | U | Normal |
| `quick-kpi-ribbon` | Quick KPI Ribbon | U | Compact |
| `notification-stream` | Notification Stream | U | Compact |

### Optional / Discoverable Modules
Shown in the "+ Add Module" gallery in Edit Mode.

| Module ID | Name | Allowed Regions | Default Size |
|-----------|------|-----------------|--------------|
| `weather-impact` | Weather Impact | L, R | Compact |
| `incident-history` | Incident History | L, R | Normal |
| `equipment-roster` | Equipment Roster | L, R | Normal |
| `resource-utilization` | Resource Utilization | L, R | Normal |
| `inbound-surge` | Inbound Surge | L, R | Compact |
| `crew-assignments` | Crew Assignments | L, R | Normal |

---

## 6 · Role Presets

Each role ships with a default layout. Operators inherit the role default until they save a personal custom layout.

### Crew Chief — Default
**Priorities:** Recovery emphasized · Staffing visible · Gate pressure prioritized

```
L1: op-snapshot       (Normal · emphasized)
L2: zone-health       (Normal)
L3: staffing          (Compact)
L4: recovery-status   (Normal · emphasized)

R1: op-intelligence   (Normal)
R2: equipment-roster  (Normal)
R3: crew-assignments  (Compact)
R4: recommended-next  (Compact)

U1: incident-timeline (Compact)
U2: empty
```

### Ramp Manager — Default
**Priorities:** Broad zones · Workforce distribution · Recovery coordination · Forecast

```
L1: all-zones           (Normal · emphasized)
L2: workforce-dist      (Normal · emphasized)
L3: recovery-coord      (Normal)
L4: resource-utilization(Compact)

R1: op-intelligence     (Normal)
R2: cross-zone-forecast (Normal)
R3: equipment-roster    (Normal)
R4: inbound-surge       (Compact)

U1: incident-timeline   (Compact)
U2: audit-trail         (Compact)
```

### Dispatcher — Default
**Priorities:** Assignment queue · Inbound/outbound · Resource movement · Coordination

```
L1: assignment-queue    (Normal · emphasized)
L2: flight-schedule     (Normal · emphasized)
L3: resource-movement   (Normal)
L4: equipment-availability (Compact)

R1: pending-dispatches  (Normal · emphasized)
R2: inbound-coord       (Normal)
R3: coordination-msgs   (Normal)
R4: gate-conflicts      (Compact)

U1: quick-kpi-ribbon    (Compact)
U2: notification-stream (Compact)
```

### Executive — Default
**Priorities:** Predictive · Throughput · Forecast · KPIs

```
L1: kpi-strip              (Normal · emphasized)
L2: throughput             (Normal)
L3: stabilization-forecast (Normal · emphasized)
L4: historical-trend       (Compact)

R1: predictive-summary     (Normal · emphasized)
R2: cross-station          (Normal)
R3: cost-impact            (Normal)
R4: governance-audit       (Compact)

U1: quick-kpi-ribbon       (Compact)
U2: empty
```

**"Emphasized" rendering:** module gets a faint cyan tint on the background and a brighter accent on its header. This is a default-layout signal of priority, not a separately configurable state. When an operator customizes, emphasis is preserved on the module that was originally emphasized.

---

## 7 · Saved Layouts

Operators can save and switch between named layouts. Hard cap: **5 named layouts total per operator per station.**

| Layout Name | Source | Customizable |
|-------------|--------|--------------|
| `Default` | Role preset | No (always reflects role default) |
| `Operational` | Operator-defined | Yes |
| `Focus` | Operator-defined | Yes |
| `Crisis` | System-defined, operator-tunable | Yes (limited) |
| `Personal Custom` | Operator-defined | Yes |

**Switching:** layouts switch via a dropdown in the header (currently shown as the layout pill). Switching is instant; no transition animation longer than 200ms.

**"Modified" indicator:** if the current view diverges from the saved layout it's based on, an amber "Modified" pill appears in the header. Clicking it shows a tooltip listing the differences ("L3 moved · Staffing collapsed · Weather Impact added").

**Reset:** any saved layout can be reset to its definition. Default layout reset = role preset. Other layouts reset = the last saved state of that layout.

---

## 8 · Edit Mode

### Activation
- Explicit toggle in the header overflow menu ("Edit Layout") or via keyboard shortcut (`⌘E` / `Ctrl-E`)
- Edit Mode is **never** auto-activated. Operators must enter it intentionally
- Exiting requires Save, Cancel, or Reset (no exit-on-click-outside)

### Visual Language
| Element | Treatment |
|---------|-----------|
| Edit Banner (replaces header) | Cyan border-bottom, animated cyan top hairline, "EDIT LAYOUT" pill with pulsing dot |
| Rail backgrounds | Dashed cyan boundary inset 14px from rail edge, faint dot-grid background |
| Slot frames | Visible as dashed amber borders. Empty slots show "— empty —" placeholder |
| Anchors | Lock badge in top-right corner with padlock icon; opacity reduced to ~82% |
| Modules | Grip handle gutter (28px wide) on left edge; hover reveals top-right toolbar (Collapse, Hide) |
| Dragging module | Tilted -1.2°, lifted -6px, cyan border, drop shadow + glow |
| Drop indicator | 3px cyan bar with capped endpoints, pulsing 1.4s ease-in-out |
| Hidden tray | Per-rail, at bottom of rail, contains chips for restoring hidden modules |

### Affordances per Module
- **Drag handle** (six-dot grip, left gutter)
- **Collapse toggle** (top-right, switches module to Compact)
- **Hide button** (top-right, moves module to the rail's hidden tray)
- **Size cycle** (right-click or long-press menu: Compact / Normal / Expanded)

### Banner Controls
- **Preset selector** — shows current preset name with dropdown to switch
- **Modified indicator** — amber pill when layout diverges from preset, clickable for diff tooltip
- **Reset to Default** — danger-styled button, returns to role preset
- **Cancel** — reverts unsaved session changes
- **Save Layout** — primary cyan button, commits changes

### Persistence
Save commits to: `(user_id, role, station_id, layout_name)` tuple. Edits are session-local until saved.

---

## 9 · Layout State Model

### Storage Schema
```ts
LayoutState {
  userId: string
  role: 'crew_chief' | 'ramp_manager' | 'dispatcher' | 'executive'
  stationId: string                   // e.g. "LAX"
  layoutName: 'Default'|'Operational'|'Focus'|'Crisis'|'Personal Custom'
  slots: {
    L1?: ModuleInstance, L2?: ModuleInstance, L3?: ModuleInstance, L4?: ModuleInstance,
    R1?: ModuleInstance, R2?: ModuleInstance, R3?: ModuleInstance, R4?: ModuleInstance,
    U1?: ModuleInstance, U2?: ModuleInstance,
  }
  lastModified: timestamp
}

ModuleInstance {
  moduleId: string                    // e.g. "recovery-status"
  size: 'compact' | 'normal' | 'expanded'
  emphasized: boolean
}
```

### Resolution Chain
On login, SOI resolves which layout to render via:

1. **Last-used layout** for `(userId, role, stationId)` — if it exists
2. Else: Role preset Default for that station
3. Else: Generic Default fallback (Crew Chief preset)

**Key rule:** layout is keyed by `(user, role, station)`. A Crew Chief at LAX and the same operator at JFK can have different layouts. This matters because station ops differ.

### Last-Used Wins
On switching layouts mid-session, the chosen layout becomes the new "last used." Cross-session persistence applies.

The current layout name is always visible in the header pill so operators are never surprised.

---

## 10 · Crisis Mode

Crisis Mode is a saved layout *and* a system-suggested mode trigger.

### Triggers
| Trigger | Behavior |
|---------|----------|
| Operator selects "Crisis" from layout dropdown | Switches immediately |
| Pressure index crosses 80 or severity = CRITICAL | SOI **suggests** the switch via a dock prompt: "Pressure index crossed threshold — switch to Crisis layout?" |
| Multi-zone cascade detected | Suggested switch (same prompt) |

**Never automatic.** SOI suggests, the operator decides. This is a hard product decision — automatic layout changes mid-incident are disorienting.

### Layout Differences (Crisis vs Default)
| Region | Default | Crisis |
|--------|---------|--------|
| Header | Standard | Adds crisis strip below header with incident ID, severity, time elapsed, containment countdown |
| Map (`M1`) | Standard ambient | Collapsed to thin strip; vertical space ceded to recommendation |
| Recommendation (`A2`) | Standard | **Expanded** vertically; shows full Stabilization Plan inline with step status, plus an Alternative Path card |
| Left Rail | Role default | Collapsed to essentials: Incident Card, Recovery Status, Active Resources |
| Right Rail | Role default | **Active Risk promoted to top** (larger type, red card, containment countdown inline). Followed by Predictive Cascade, Resource Confidence |
| Utility Slots | Role default | Hidden |
| Optional Modules | Various | Auto-hidden; "12 modules deferred" pill in crisis strip with click-to-expand |
| Dock | Standard | Adds quick-action chips: `Brief Team`, `Hold Position`, `Escalate` (warning-styled) |

### Crisis Visual Treatment
- Environment background gains a faint orange tint at top and bottom edges
- Crisis strip has an animated top hairline (slow 5s sweep)
- Severity values use orange text with subtle glow
- Containment countdown is the most prominent number on the screen (18px mono, orange)

**Important:** Crisis Mode is still calm. No flashing, no shaking, no panic. The aesthetic principle is "concentrated attention," not "alarm."

### Exiting Crisis Mode
- Operator manually switches to another layout
- Incident is resolved → SOI prompts: "Incident resolved — return to your previous layout?"
- Never auto-exits without operator confirmation

---

## 11 · Open Implementation Questions

These are the decisions still owed before this is production-ready:

1. **Density toggle scope.** Is "Compact / Normal / Expanded" the only size system, or is there also a separate global density preference (e.g. tighter padding throughout)? Current spec assumes module-level only. Confirm or extend.
2. **Module discovery.** New operators need a way to find optional modules. Recommended: "+ Add Module" affordance in Edit Mode opens a gallery filtered by what's allowed in the active slot. Confirm before implementation.
3. **Cross-rail drag.** Spec allows moving modules between left and right rails. Visual treatment: destination rail's dashed boundary brightens to solid cyan during drag-over. Confirm interaction language.
4. **Audit trail for layout changes.** Should layout edits be logged for governance/handoff purposes? Probably yes for operational roles; possibly not for personal customization. Decide before shipping.
5. **Mobile / smaller viewports.** This spec assumes desktop ≥1280px. Tablet and mobile presentations of SOI are out of scope here and need their own specification.
6. **Crisis Mode tunability.** Operators can save a customized Crisis layout, but the *core* crisis behaviors (expanded recommendation, promoted risk card, deferred modules) are not editable. Confirm this constraint holds.
7. **Preset versioning.** When SOI ships a role-preset update, do operators get migrated to the new default, or do they keep their saved version? Recommendation: prompt on next login with a diff view.

---

## 12 · Asset Map

| File | Purpose |
|------|---------|
| `soi-command.html` | Default layout (Crew Chief preset) — the canonical view |
| `soi-edit-mode.html` | Edit Mode states — drag, drop indicator, collapse, hide, hidden tray |
| `soi-role-presets.html` | Four role default layouts side-by-side |
| `soi-crisis.html` | Crisis Mode — expanded recommendation, promoted risk, dock quick-actions |
| `soi-slot-system.html` | Architectural blueprint of all 14 slots (4 anchors + 10 customizable) |
| `soi-spec.md` | This document |

---

## 13 · Design Principles (Reference)

When implementation questions arise, fall back to these:

- **Composed, not built.** Operators feel "I am tailoring my operational surface," not "I am building software."
- **Anchors define identity.** Don't make them movable. Ever.
- **Snap-only, not freeform.** No arbitrary positioning. Constrained freedom outperforms unconstrained freedom for operational tools.
- **Role-aware before personal.** Defaults should be opinionated and correct for the role. Personal customization is a polish layer, not the foundation.
- **Calm under pressure.** Even in Crisis Mode, the system reads as composed. No alarms, no flashing. Information concentration, not panic.
- **Premium restraint.** Hairlines over heavy borders. Generous spacing over density. Restrained glow on status accents only.

---

*End of spec.*
