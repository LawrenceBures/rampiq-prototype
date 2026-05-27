# RampIQ · System Boundary Document

**Version 1.0 · Phase 4 · Pre-Pilot**
**Audience:** Pilot airline operations leadership, IT integration teams, ramp leadership

---

## Purpose of this document

This document defines what RampIQ is, what it does, what it does not do, and what assumptions must hold for it to operate. It exists to lock scope before integration discussions begin and to give an operations leader a clear picture of the risk surface they are taking on.

If you are evaluating RampIQ for pilot deployment, this is the document to read first. Every other RampIQ document — integration spec, simulation results, pricing — is downstream of what is decided here.

---

## What RampIQ is

RampIQ is a **decision-support platform for airline ramp operations**. It runs alongside existing dispatch and ground-handling systems, ingests their data, and produces structured operational intelligence for ramp leadership and ground crews.

It is not a system of record. It does not replace the AODB, the crew management system, or the BHS. It is a layer of inference and recommendation that sits on top of existing infrastructure.

The platform produces six classes of output:

1. **Flight risk scores.** A 0-100 difficulty rating per turnaround, computed from bag load, turn-time pressure, equipment requirements, upstream delay, and weather.
2. **Team suitability rankings.** For any flight, a ranked list of available crews with explainability for each ranking.
3. **Assignment recommendations.** For unassigned or reassignment-candidate flights, a ranked set of options with confidence scores and dependency analysis.
4. **Delay predictions.** Probability of on-time departure, predicted single largest contributor, and forecast slip in minutes.
5. **Equipment shortage alerts.** Forward-looking forecasts of where equipment supply will fall below demand within a 90-minute horizon.
6. **Recovery simulations.** During disruption events, a small set of intervention paths with simulated outcomes and tradeoffs.

These outputs are surfaced through three interfaces: a desktop console for ramp leadership, a mobile companion app for managers, and a separate mobile app for ground crew members.

---

## What RampIQ is not

RampIQ does not control aircraft. It does not communicate with the FAA NAS, ATC, or any FAA system. It does not generate or modify flight plans. It does not transmit operational directives to flight crew. It does not interface with airworthiness, weight and balance, or maintenance certification systems beyond reading scheduled maintenance windows.

RampIQ does not replace human judgment. Every recommendation is presented as a recommendation, not a directive. A ramp lead can override any recommendation. The system logs overrides as training signal but never escalates against operator decisions.

RampIQ does not autonomously act. It does not move equipment, dispatch crews, modify gate assignments, or change flight times without explicit human confirmation in the interface. The system can pre-stage actions for one-tap execution but the action requires a human tap.

RampIQ does not handle passenger data. No PNR, no passenger names, no seat assignments, no special-services data. The only passenger-related figure RampIQ ingests is total passenger count per flight, used in cascade impact estimation.

RampIQ does not provide HR-grade performance evaluation. The crew-side mobile app surfaces operational competencies for each agent's own benefit and career progression. It does not compute performance ratings used in disciplinary, compensation, or retention decisions. This is a deliberate political and ethical boundary, discussed in the worker-experience section below.

RampIQ does not require crew GPS tracking. Crew location is inferred from current flight assignment and last-known gate. Real-time GPS or BLE tracking is supported as an optional enhancement where available, but is never a deployment dependency.

---

## What RampIQ requires from the airline

Three integration tiers, in increasing order of capability.

### Tier 1 — Minimum viable deployment (read-only)

The smallest data footprint that allows RampIQ to operate with measurable lift.

- **Flight schedule feed.** Scheduled and current flight data for the operating station: tail, route, gate, scheduled and estimated times, aircraft type. Standard formats accepted: AODB feed, SITA Type-B, ARINC AIM, or proprietary REST. Update interval: 60 seconds or better.
- **Crew assignment data.** Current shift roster, team composition, base assignments, and active flight assignments. Source: airline's crew management system (CrewTrac, FOS, ARC, or proprietary). Update interval: 5 minutes or better.
- **Crew certifications.** Per-crew-member certification records: pushback, heavy-load, hazmat class, deicing, wide-body authorization, and any airline-specific qualifications. Source: training/qualifications system. Update interval: 24 hours acceptable.
- **Bag count per flight.** Forecasted and actual checked bag count per flight. Source: BHS feed, departure control system (Altea DCS, SabreSonic, or proprietary), or manual override entry. Update interval: 10 minutes acceptable for forecast, 60 seconds for actual.

With Tier 1 data, RampIQ produces flight risk scoring, team suitability rankings, assignment recommendations, and basic delay prediction. Equipment forecasting and crew mobility features are limited or unavailable.

### Tier 2 — Enhanced deployment (adds equipment visibility)

Adds operational depth around equipment and physical operations.

- **Equipment location and state.** Either real-time BLE/GPS tracking, or polled state from the airline's GSE management system, or scheduled-state inference from depot check-in/check-out logs. Update interval: 60 seconds for RTLS, 5 minutes for inference.
- **Equipment maintenance schedules.** Service intervals, in-shop windows, and known faults. Source: maintenance system or manual entry.
- **Gate occupancy and turnaround events.** Block-on, block-off, door-open, door-close, ground-power-on, ground-power-off events. Source: AODB or ACARS integration.

With Tier 2 data, the equipment intelligence layer becomes operational, including shortage forecasting, cross-depot rebalancing recommendations, and the recovery-simulation features that depend on equipment positioning.

### Tier 3 — Full deployment (adds environmental and crew-mobility data)

Adds the predictive layer needed for full IRROPS mode and crew mobility intelligence.

- **Weather feed.** METAR, TAF, and convective forecasts for the station and surrounding airspace. Source: NOAA, Schneider, FlightAware, or similar third-party weather provider. Update interval: 5 minutes.
- **ATC ground-stop and EDCT data.** FAA ASDI feed or commercial equivalent. Source: FlightAware Firehose, Cirium, or similar.
- **Crew location signal (optional).** Either BLE tag positioning, phone-based assignment-confirmation pings, or vehicle-mounted GPS. This is optional and may be politically constrained at certain stations. RampIQ does not require it. Where present, it improves crew-mobility visualizations.

With Tier 3 data, IRROPS mode becomes fully autonomous, crew mobility intelligence is fully active, and recovery simulations achieve their highest accuracy.

---

## What the airline does not need to give RampIQ

To preempt common questions and concerns from IT and operations leadership.

- No passenger data. Names, PNRs, special-services indicators, frequent-flyer status, and seat maps are not required and not requested.
- No payment, billing, or financial data.
- No safety reporting data (ASAP, ASRS submissions). RampIQ does not interact with the safety reporting chain.
- No personnel records beyond active certifications and shift assignments. No disciplinary records, performance reviews, attendance records, or compensation data.
- No access to airline credentials, customer-facing systems, or revenue management.
- No write access to the AODB, crew system, or any system of record. RampIQ is read-only against airline systems and writes only to its own data store.

---

## Operational boundaries

### Geographic scope

RampIQ operates per-station. A deployment at one hub is independent from a deployment at another hub. There is no cross-station dependency in the core algorithms. Multi-station benchmarking and network-level views are available in the executive interface but require separate deployments at each participating station.

### Flight scope

RampIQ models the ground-side turnaround. From block-on to block-off. Pre-arrival readiness and post-departure cleanup are out of scope. The system does not predict block-to-block flight times, en-route delays, or arrival times beyond what the existing flight schedule feed provides.

### Crew scope

RampIQ tracks ramp crews — ground handlers, pushback operators, baggage handlers, cargo handlers, deicing operators, and equipment operators. It does not track flight crew (pilots, flight attendants), customer-service agents, or maintenance personnel. The system reads but does not act on flight crew schedules.

### Decision scope

RampIQ recommends and forecasts. It does not decide. Every action that affects an aircraft, a crew assignment, an equipment dispatch, or a gate assignment requires explicit human confirmation in the interface. The system can stage actions for one-tap execution but the tap is required.

---

## Worker experience boundary

This section is explicit because deployment depends on it.

RampIQ surfaces operational data about ramp crews. That data is structured to be useful to the crew member first, to ramp leadership second, and is never used for HR-grade performance evaluation.

The operational competency model in the crew-side mobile app — the apprentice / journeyman / specialist / master tier progression, the certification roadmap, the practice metrics — is built around career growth and the unlocking of new assignment types. The framing is craft trade progression, not performance grading.

Specific commitments:

- **No anonymous performance comparison.** Crew members cannot see rankings, leaderboards, or relative performance comparisons against peers. The data shown to a crew member is their own data only.
- **No performance score that affects compensation, retention, or discipline.** RampIQ produces operational competency indicators. These are not performance ratings and are not exported to systems that drive HR decisions. This is contractually committed in the deployment agreement.
- **Visibility controls.** Each crew member can toggle which competency surfaces are visible to themselves, to their direct lead, and to station leadership. Default visibility is conservative.
- **Override transparency.** When a recommendation involves reassigning a crew member, the affected crew member sees the recommendation in their own app and can request a swap before accepting. Recommendations are never silently executed against an individual.
- **Union review.** Where a station is unionized, the worker-experience surfaces are reviewed with union representation before deployment.

---

## Data residency and retention

- All operational data is stored in the airline's choice of cloud region. RampIQ does not operate a multi-tenant data plane that mixes airline data.
- Hot operational data is retained for 90 days. Aggregate historical data used for model improvement is retained for 24 months and is anonymized at the crew-member level after 90 days.
- Crew location data, where collected, is retained for 14 days, used only for operational visualizations and crew-mobility computations, and is deleted on a rolling basis.
- An airline can request export and deletion of all data within 30 days of contract termination. This is contractually committed.

---

## Failure modes and degraded operation

Three documented failure modes and the system's behavior in each.

### Loss of upstream feed

If the flight schedule feed, crew system, or BHS feed is unavailable, RampIQ continues operating on its last-known state and surfaces a clear "stale data" indicator across all relevant screens. Recommendations are paused after 5 minutes of stale primary data. The operator can switch to manual override mode, where they enter critical changes by hand and the system continues to model downstream effects.

### Loss of RampIQ availability

If RampIQ itself is unavailable, ramp operations continue using the airline's existing tools and procedures. RampIQ is a layer on top, not a replacement; the underlying systems remain functional. There is no scenario in which a RampIQ outage grounds the operation.

### Disagreement between RampIQ and human judgment

When a ramp lead overrides a recommendation, the override is logged with reason code and outcome. After 90 days, the override log is reviewed and used to retrain weighting in the relevant algorithm. The ramp lead's authority is absolute; the system's role in disagreement is to learn, not to escalate.

---

## What RampIQ commits to in pilot deployment

These are the contractual commitments to a pilot airline.

- **Measurable lift target.** A pilot is structured around a measurable target metric agreed in advance. Typical targets: a 5-10% reduction in tarmac delay minutes, a 2-4% reduction in turnaround time on heavy-load operations, or a documented count of cascade-events contained per shift.
- **Pilot duration.** 90 days minimum, 180 days recommended. Below 90 days the system has not yet completed its first full retraining cycle and lift measurement is unreliable.
- **Single-station scope.** Pilot is one hub or one spoke station. Multi-station rollout is a separate engagement after pilot results.
- **Read-only by default.** No write access to airline systems is provisioned during pilot.
- **Audit trail.** Every recommendation, every override, every action staged or executed is logged with timestamp, operator, and reason code. The airline receives full audit access.
- **Right of withdrawal.** The airline may terminate the pilot at any time with 30 days notice. RampIQ exports all data within 30 days of termination notice.

---

## Out of scope for v1

Documented here so that scope discussions stay anchored.

- Multi-station coordination and network-wide optimization. Single-station deployments only in v1.
- Direct integration with the FAA NAS, NOTAMs system, or air-traffic control feeds beyond commercial relays.
- Passenger-facing communications, gate change announcements, or rebooking decisions.
- Cargo specialty handling beyond hazmat class indication. No live animals, no human remains, no high-value courier handling.
- Integration with airline revenue management or yield decisions.
- Predictive maintenance for ground equipment beyond reading scheduled maintenance windows.
- Ramp-side weather decisions (deicing fluid type, anti-icing timing). RampIQ surfaces deicing demand but does not specify procedure.

---

## Document version control

| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 | May 2026 | Pre-pilot | Initial scope lock for pilot conversations |

---

*RampIQ is a decision-support platform. Operational decisions are made by humans. The system's job is to make those decisions easier, faster, and better-informed.*
