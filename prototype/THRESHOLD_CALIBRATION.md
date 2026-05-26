# RampIQ — Operational Threshold Calibration

## Current thresholds are educated architectural estimates.
## Real operational data must tune them.

---

## Pattern Engine (operational-patterns.ts)

| Threshold | Current Value | What it controls | Needs validation |
|---|---|---|---|
| Gate recurrence window | 3 hours | How far back to look for recurring gate incidents | Is 3h the right operational window? |
| Gate recurrence minimum | 2 incidents | How many incidents before flagging a gate | Is 2 too sensitive? Too late? |
| Equipment event minimum | 2 events | How many events before flagging equipment | Same question |
| Recovery friction minimum | 1 failed action | How many failed actions before flagging | Should this be 2? |
| Slow recovery threshold | 20 minutes | How long before flagging slow recovery | Real ramp recovery timing? |
| Zone sustained pressure | 30 minutes | How long before flagging sustained zone pressure | Realistic for AM shift? PM? |
| Severity weights | CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1 | How severity maps to pressure scoring | Do operators weight these differently? |

## Workforce Coordination (workforce-coordination.ts)

| Threshold | Current Value | What it controls | Needs validation |
|---|---|---|---|
| Elevated incidents | 2 | When a coordinator's load is flagged as elevated | How many incidents is normal for one chief? |
| Saturated incidents | 3 | When flagged as saturated | When do real chiefs start struggling? |
| Needs-support score | 20 | Total load score triggering support signal | Is this too sensitive? Too late? |
| Unacknowledged threshold | 10 minutes | When a proposed action is flagged as unacknowledged | Realistic response time expectation? |
| Stalled coordination | 20 minutes | When confirmed-but-not-recovering is flagged | How long does real confirmation → recovery take? |
| Critical stall | 45 minutes | When stalled becomes critical | When do real ops managers get concerned? |
| Blocked cascade | 2 actions | When multiple blocked actions trigger cascade signal | Is 2 right? |

## Anticipatory Cognition (anticipatory-cognition.ts)

| Threshold | Current Value | What it controls | Needs validation |
|---|---|---|---|
| Pressure accumulation window | 15 minutes | How quickly growing pressure is detected | Too fast? Too slow? |
| Escalation density threshold | 2 in 15 min | When escalation accumulation is flagged | Normal escalation rate during peak? |
| Blocked cascade threshold | 2 actions | When recovery blockage becomes a signal | Same as workforce — validate |
| Multi-zone pressure threshold | 6 severity-weighted | When a zone is "pressured" | Realistic zone load during normal ops? |

## Stability Index Components

| Component | Weighting | Needs validation |
|---|---|---|
| Active Pressure | severity × 4, normalized to 100 | How should severity translate to pressure? |
| Escalation Density | count × 20, normalized to 100 | How many escalations is "normal" per hour? |
| Recovery Load | active × 10 + blocked × 25 | What's a normal active recovery action count? |
| Workload Concentration | max-per-operator × 20 | What's normal load per coordinator? |

## Questions for Design Partners

1. "How many incidents do you typically handle in a shift?"
2. "At what point do you feel overwhelmed?"
3. "How long does it typically take to go from detection to recovery?"
4. "How often do you escalate? What triggers escalation?"
5. "What's a normal recovery action failure rate?"
6. "How many gates does one crew chief typically manage?"
7. "When do you know the operation is 'going bad'?"
8. "What's the earliest sign of a cascade?"

---

## Calibration Process

1. Capture real answers from design partner conversations
2. Document which thresholds need adjustment
3. Adjust thresholds in the constants at the top of each module
4. Re-run stress simulation to validate adjusted behavior
5. Re-validate with design partner

All thresholds are tunable constants — no architecture changes needed.
