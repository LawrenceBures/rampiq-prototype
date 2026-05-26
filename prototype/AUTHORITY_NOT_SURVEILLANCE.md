# AUTHORITY_NOT_SURVEILLANCE

## Permanent Architectural Doctrine — RampIQ

This document defines the governance boundary between operational coordination
and workforce surveillance. It is not a style guide. It is an architectural
constraint that must be enforced in every module, every surface, and every
derivation function in the platform.

---

## Core Principle

RampIQ is **operational coordination software**, not workforce evaluation software.

The system exists to help coordinators manage operational pressure. It does NOT
exist to rank, score, or evaluate individual operators.

---

## 1. Coordinator-First Surfacing

Workload signals appear to the **coordinator first**.

- Overload is framed as "operational support need," not individual failure.
- Escalation is "coordination support," not punishment.
- The coordinator sees their own pressure before anyone else sees it.

**Implementation rule:** `deriveWorkforceCoordination` surfaces operator loads
to the operator's own session before surfacing them to managers.

---

## 2. Aggregate vs. Individual Visibility

| Viewer Role | Sees | Does NOT See |
|---|---|---|
| **Coordinator** | Own workload, own incidents, own escalations, own overload support signals | Other coordinators' individual loads |
| **Manager** | Zone/system pressure aggregates, ownership gaps, coordination health | Cross-zone individual overload ranking |
| **Ops Director** | Full operational reconstruction, cross-zone coordination | This is the only role with individual accountability replay |

**Implementation rule:** Role-based filtering happens in the rendering layer,
not in the derivation layer. The derivation pipeline computes everything;
the UI filters what's shown based on operator role.

---

## 3. Replay Visibility Semantics

- **Operational replay** (all roles): "What happened to this zone/incident?"
- **Accountability replay** (Ops Director only): "Who owned what, when?"

Operational replay shows events, incidents, recovery actions, and pressure
evolution. It does NOT highlight individual operator performance metrics.

Accountability replay shows ownership chains, handoff timing, and escalation
responses. It requires elevated permissions.

**Implementation rule:** Replay reconstruction functions are role-agnostic.
Visibility filtering is applied at render time.

---

## 4. Coordination Language

### The system SHOULD describe:
- coordination conditions
- operational pressure
- escalation need
- ownership gaps
- support requirements
- workload distribution

### The system MUST NOT describe:
- employee performance
- rankings or scorecards
- "good" or "bad" operators
- comparative productivity
- response time leaderboards
- individual efficiency metrics

**Implementation rule:** Every `title` and `explanation` field in insights,
escalation signals, and operator loads must use coordination framing.
Review any string that names an operator — it should describe the
operational condition, not evaluate the person.

---

## 5. Explicit Non-Goals

RampIQ is **NOT**:
- HR software
- performance evaluation software
- labor analytics software
- workforce scoring software
- productivity tracking software
- attendance monitoring software

These are not future features that haven't been built yet.
These are **architectural boundaries that must never be crossed**.

---

## 6. Trust Test

RampIQ succeeds if operators feel:
> "This system helps coordination."

RampIQ fails if operators feel:
> "This system evaluates me."

Every feature, every insight, every surface must pass this test.

---

## Enforcement

This doctrine applies to:
- `workforce-coordination.ts` — escalation and load derivation
- `operational-patterns.ts` — pattern detection language
- `derived-operational-state.ts` — operational summaries
- All dashboard rendering — visibility filtering
- All replay surfaces — historical reconstruction access
- All mobile surfaces — agent-facing language

Changes that violate this doctrine should be rejected at review.
