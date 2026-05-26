# RampIQ — Operational Coordination Doctrine

## For design partners, pilot conversations, and operational leadership

---

RampIQ is operational coordination software for airline ramp operations.

It helps crew chiefs, ops managers, and ramp teams coordinate incident
response, recovery actions, and zone pressure — in realtime, across
shifts, with full operational memory.

This document describes what RampIQ is, what it is not, and how it
protects the people who use it.

---

## What RampIQ Does

- Tracks incidents and recovery actions across gates and zones
- Shows who owns coordination and where support is needed
- Detects operational patterns: recurring gate issues, equipment risk,
  recovery friction, zone pressure
- Replays operational history so teams can understand what happened
  during a shift
- Syncs across desktop consoles and mobile devices in realtime

## What RampIQ Does Not Do

- **Does not rank operators.** There are no leaderboards, scorecards,
  or comparative productivity metrics.
- **Does not evaluate performance.** The system describes operational
  conditions — not people.
- **Does not track individual efficiency.** Response times are shown
  for operational awareness, not for individual measurement.
- **Does not produce HR data.** RampIQ is not connected to payroll,
  attendance, scheduling, or performance review systems.

## How Workload Is Surfaced

When a coordinator has too many active incidents and recovery actions,
the system surfaces this as **"coordination support needed"** — not as
an individual failing.

- The coordinator sees their own workload first
- Managers see aggregate zone pressure, not individual rankings
- Individual accountability replay is restricted to operations
  directors and is audited

The framing is always: "this operational area needs more resources"
— never "this person is underperforming."

## How Replay Works

RampIQ records every operational action as an immutable event.
Replay reconstructs what operations looked like at any past moment.

- **Operational replay** is available to all coordinators. It shows
  what happened at a gate, a zone, or an incident — for learning
  and handoff context.
- **Individual accountability replay** — reviewing a specific
  coordinator's decisions over time — is restricted to operations
  directors and generates an audit record.

Nobody's operational history is silently reviewed. Access is logged.

## The Trust Principle

RampIQ succeeds when operators say:
> "This system helps me coordinate."

RampIQ fails when operators say:
> "This system watches me."

This distinction is built into the architecture, not just the policy.
Visibility rules, language choices, and access controls are enforced
in code — not left to organizational goodwill.

---

*RampIQ is built for the people on the ramp, not for the people
watching the ramp.*
