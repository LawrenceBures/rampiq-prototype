# RampIQ · Data Dependency Map

**Version 1.0 · Phase 4 · Pre-Pilot**
**Audience:** IT integration teams, solution architects, operations technology leadership

---

## Purpose of this document

This document maps every data input RampIQ requires to the source system that provides it, the realistic state of that source at major North American carriers, the update cadence required, and the degraded-operation behavior if the input is missing.

It is the engineering-facing companion to the System Boundary Document. Where the boundary document defines what RampIQ is, this document defines what it must consume to operate.

The honest answer to "can this be integrated?" is in this document. We are explicit about what is straightforward, what is a fight, and what is a deployment dependency that may not exist at every station.

---

## Reading the matrix

Each data input is described by:

- **Input** — the operational data RampIQ needs.
- **Used by** — which RampIQ algorithm or interface element depends on it.
- **Source system** — where this data lives at most North American airlines.
- **Integration approach** — how RampIQ retrieves it.
- **Cadence** — how frequently RampIQ needs an update.
- **Reality at the typical airline** — honest assessment ranging from `mature` to `variable` to `gap`.
- **Degraded behavior** — what RampIQ does when this input is missing or stale.

---

## Tier 1 — Minimum viable inputs

These are the inputs without which RampIQ cannot operate. A pilot deployment requires all five.

### Flight schedule

- **Used by.** Every screen, every algorithm. This is the spine of the system.
- **Source system.** Airline operational database (AODB). Standard products: SITA Airport, Amadeus Altea, ARINC AODB, or proprietary.
- **Integration approach.** Read-only feed. Standard formats: SITA Type-B messaging, ARINC AIM, REST/SOAP API, or scheduled flat-file extract.
- **Cadence.** 60 seconds for change events, 5 minutes acceptable for full snapshots.
- **Reality.** Mature. Every commercial airline has an AODB. The political challenge is access — the airline's IT team may take 6-10 weeks to provision a feed.
- **Degraded behavior.** Without this feed, RampIQ does not operate. There is no fallback.

### Crew assignment and roster

- **Used by.** Team suitability ranking, assignment recommendation, fatigue tracking, mobility intelligence.
- **Source system.** Crew management system. Common products: CrewTrac, Sabre Crew Manager, Jeppesen FOS, AIMS, or proprietary. Ramp crew often lives in a separate workforce-management product (Workbrain, Kronos, Quinyx).
- **Integration approach.** REST API where available. At carriers using older WFM products, this is frequently a database-level read replica or scheduled extract.
- **Cadence.** 5 minutes for active-shift data, 60 minutes acceptable for forward roster.
- **Reality.** Variable. Major carriers have well-structured systems. At a hub, this is solid; at a spoke, expect incomplete data.
- **Degraded behavior.** RampIQ falls back to manual roster entry by the ramp lead at shift start.

### Crew certifications

- **Used by.** Hard filter in team suitability (eligibility check), cert conflict detection, worker-experience cert roadmap.
- **Source system.** Training and qualifications system. Common products: ATA Certification Manager, proprietary internal systems, Workday Learning, or dedicated aviation training platforms.
- **Integration approach.** Daily extract is sufficient. REST API where available; flat-file extract is more common.
- **Cadence.** 24 hours. Certifications change slowly.
- **Reality.** Mature at major carriers, variable at regionals. A surprising number of carriers maintain certifications in spreadsheets or document management systems.
- **Degraded behavior.** Without cert data, the eligibility filter falls back to "all available crews" with a clear "cert not verified" flag on every recommendation.

### Bag count

- **Used by.** Flight risk score (heavy-load weighting), turn-time prediction, equipment forecasting, cascade modeling.
- **Source system.** BHS (baggage handling system) for actual scanned bags, or departure control system (DCS) for forecasted bags.
- **Integration approach.** BHS feeds are typically real-time message-bus subscriptions (RabbitMQ, Kafka, IBM MQ). DCS feeds are typically REST or SITA Type-B.
- **Cadence.** Forecast: 15 minutes acceptable. Actual scan rate: 60 seconds.
- **Reality.** Mature at major airports. The integration is moderately complex because BHS systems vary by station and may be operated by the airport authority rather than the airline.
- **Degraded behavior.** Without bag count, the heavy-load weighting defaults to aircraft type and historical averages for the route. Risk prediction accuracy drops an estimated 8-12 points.

### Gate map and assignments

- **Used by.** Mobility intelligence, cascade visualization, adjacency-conflict detection, equipment routing.
- **Source system.** AODB, same source as flight schedule.
- **Integration approach.** Static map (gate coordinates, walking distances) is loaded once and updated quarterly. Live gate assignments come through the flight schedule feed.
- **Cadence.** Static: quarterly. Live: same as flight schedule.
- **Reality.** Mature for live assignments. The static map data is sometimes harder to obtain — airports treat facility schematics as proprietary.
- **Degraded behavior.** Without the static map, mobility distance calculations fall back to terminal-level approximations.

---

## Tier 2 — Operational depth inputs

These add equipment intelligence and turn-event awareness.

### Equipment location and state

- **Used by.** Equipment intelligence screen, shortage forecasting, recovery simulation.
- **Source system.** Three possible sources, in decreasing order of fidelity: RTLS (BLE/GPS tags), GSE management system (digital check-in/check-out), or manual/inferred state.
- **Integration approach.** RTLS via vendor API (typically REST or MQTT). GSE management via REST or database extract. Manual via in-app entry.
- **Cadence.** RTLS: 60 seconds. GSE system: 5 minutes. Manual: best-effort.
- **Reality.** Gap at most stations. Station-wide RTLS deployment is rare.
- **Degraded behavior.** Equipment shortage forecasting becomes reactive rather than predictive.

### Equipment maintenance schedules

- **Used by.** Equipment availability forecasting, maintenance threshold alerts.
- **Source system.** GSE maintenance management system. Common products: Trax, Maintenance Connection, RAMCO Aviation.
- **Cadence.** 24 hours.
- **Reality.** Variable. Larger carriers have this digitized; smaller ones don't.
- **Degraded behavior.** Maintenance threshold alerts are unavailable.

### Turnaround events (ACARS / OOOI)

- **Used by.** Cascade detection, delay attribution, turn-time prediction model retraining.
- **Source system.** ACARS or proprietary OOOI feed (Out, Off, On, In). Provided by the airline's communications gateway: ARINC, SITA, or proprietary.
- **Cadence.** Real-time as events occur.
- **Reality.** Mature. Every carrier has this data.
- **Degraded behavior.** Without OOOI events, RampIQ uses scheduled times and standard turnaround patterns. Cascade detection latency increases by 3-6 minutes.

### Cargo manifest

- **Used by.** Hazmat handling cert filter, cargo-loader equipment forecasting.
- **Source system.** Cargo management system. Common products: SITA CargoSpot, IBS iCargo, proprietary.
- **Cadence.** 30 minutes.
- **Reality.** Variable. Major cargo-handling carriers have this; domestic-only passenger carriers may not.
- **Degraded behavior.** Hazmat indication falls back to the binary flag in the flight schedule.

---

## Tier 3 — Predictive layer inputs

### Weather feed

- **Used by.** IRROPS auto-trigger, environmental delay risk, deicing demand forecast.
- **Source system.** Third-party weather provider: NOAA (free, lower fidelity), Schneider Electric, Weather Decision Technologies, FlightAware Weather, IBM Weather Operations Center.
- **Integration approach.** REST API.
- **Cadence.** 5 minutes for METAR, 30 minutes for forecasts, real-time for convective alerts.
- **Reality.** Mature. The integration itself is straightforward.
- **Degraded behavior.** Without a paid feed, RampIQ falls back to NOAA public data. Convective forecasting is degraded; IRROPS auto-trigger may have higher false-positive rate.

### ATC ground-stop and EDCT data

- **Used by.** IRROPS auto-trigger, network-impact forecasting, recovery simulation.
- **Source system.** FAA ASDI feed (commercial subscription) or commercial relays such as FlightAware Firehose, Cirium, or ARINC FlightView.
- **Cadence.** 60 seconds for ground-stop status, real-time for EDCT issuance.
- **Reality.** Mature. The data is straightforward; the question is licensing cost.
- **Degraded behavior.** IRROPS auto-trigger relies on internal cascade detection only. Ground-stops are observed when systemic delays appear, adding 5-15 minutes of latency.

### Crew location signal (optional)

- **Used by.** Crew mobility intelligence, idle-pocket detection, repositioning ETAs.
- **Source system.** BLE tags on safety vests, phone-based assignment-confirmation pings, or vehicle-mounted GPS on tugs and belt loaders.
- **Cadence.** 60 seconds for tags, on-event for app pings.
- **Reality.** Politically sensitive. Real-time crew location tracking is a deal-killer at unionized stations unless structured carefully. The phone-app approach is generally acceptable because the crew member affirmatively checks in.
- **Degraded behavior.** RampIQ operates without this signal by default. Crew location is inferred from current assignment and last-known gate.

---

## Outputs — what RampIQ writes

- **Operational state stream.** JSON feed consumed by the RampIQ interfaces. Internal to the system.
- **Recommendation log.** Every recommendation, override, and outcome. Stored in RampIQ's database, exported to the airline on request.
- **Audit trail.** Every action staged or executed, with timestamp and operator.
- **Aggregate metrics.** Daily and weekly rollups for the executive interface.

RampIQ does not write to any airline system of record.

---

## Integration work effort estimate

Honest estimates for a typical pilot deployment.

- **Tier 1 integrations.** 6-10 weeks calendar time at the airline, 4-6 weeks of RampIQ engineering. The bottleneck is almost always airline IT provisioning.
- **Tier 2 integrations.** Adds 4-6 weeks. Equipment data is the wildcard.
- **Tier 3 integrations.** Adds 4-8 weeks for weather and ATC feeds. Crew location is a separate workstream with its own union timeline, often 8-12 additional weeks.

Total realistic deployment timeline for a Tier 1 + Tier 2 pilot: **14-20 weeks** from contract signing to pilot start. Tier 3 pilot: **18-28 weeks**.

---

## What this document does not cover

- Specific vendor API documentation. Each integration has its own technical spec written at integration time.
- Pricing for third-party data feeds. Negotiated separately.
- Cybersecurity review and penetration testing. Performed during integration phase.
- Cloud infrastructure choice (AWS / Azure / GCP). Determined by airline preference.

---

## Document version control

| Version | Date | Status | Notes |
|---|---|---|---|
| 1.0 | May 2026 | Pre-pilot | Initial integration map for pilot conversations |

---

*The honest answer to "can this be integrated?" lives in this document. Every input has a source, a fallback, and a degraded mode. Nothing is taken on faith.*
