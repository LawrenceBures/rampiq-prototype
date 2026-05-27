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
- **Reality at the typical airline** — honest assessment of how mature the source is, ranging from `mature` (stable APIs, well-documented) to `variable` (some carriers have it, some don't) to `gap` (rarely available).
- **Degraded behavior** — what RampIQ does when this input is missing or stale.

---

## Tier 1 — Minimum viable inputs

These are the inputs without which RampIQ cannot operate. A pilot deployment requires all five.

### Flight schedule

- **Used by.** Every screen, every algorithm. This is the spine of the system.
- **Source system.** Airline operational database (AODB). Standard products: SITA Airport, Amadeus Altea, ARINC AODB, or proprietary (Delta uses its own; American operates a proprietary system layered on Sabre).
- **Integration approach.** Read-only feed. Standard formats: SITA Type-B messaging, ARINC AIM, REST/SOAP API, or scheduled flat-file extract. Airlines vary in which they expose. A modern airline expects a SOAP or REST endpoint; a legacy carrier may insist on SFTP file drops every 60 seconds.
- **Cadence.** 60 seconds for change events, 5 minutes acceptable for full snapshots.
- **Reality.** Mature. Every commercial airline has an AODB, and the data is well-structured. The integration is not technically difficult. The political challenge is access — the airline's IT team may take 6-10 weeks to provision a feed.
- **Degraded behavior.** Without this feed, RampIQ does not operate. There is no fallback.

### Crew assignment and roster

- **Used by.** Team suitability ranking, assignment recommendation, fatigue tracking, mobility intelligence.
- **Source system.** Crew management system. Common products: CrewTrac, Sabre Crew Manager, Jeppesen FOS, AIMS, or proprietary. Ramp crew often lives in a separate workforce-management product (Workbrain, Kronos, Quinyx) rather than the same system as flight crew.
- **Integration approach.** REST API where available. At carriers using older WFM products, this is frequently a database-level read replica or scheduled extract.
- **Cadence.** 5 minutes for active-shift data, 60 minutes acceptable for forward roster.
- **Reality.** Variable. Major carriers have well-structured systems. Some carriers operate ramp crew scheduling out of spreadsheet-based or paper-based systems at smaller stations, and the data quality there is poor. At a hub, this is solid; at a spoke, expect incomplete data.
- **Degraded behavior.** RampIQ falls back to manual roster entry by the ramp lead at shift start. The team suitability algorithm operates with reduced fidelity (no fatigue history, only current-shift data).

### Crew certifications

- **Used by.** Hard filter in team suitability (eligibility check), cert conflict detection, worker-experience cert roadmap.
- **Source system.** Training and qualifications system. Common products: ATA Certification Manager, proprietary internal systems, Workday Learning, or dedicated aviation training platforms (FlightPath, AcftQuals).
- **Integration approach.** Daily extract is sufficient. REST API where available; flat-file extract is more common.
- **Cadence.** 24 hours. Certifications change slowly; same-day expiration is a corner case handled via a soft-fail in the eligibility check.
- **Reality.** Mature at major carriers, variable at regionals. The data exists; the question is whether it's queryable. A surprising number of carriers maintain certifications in spreadsheets or document management systems rather than relational databases.
- **Degraded behavior.** Without cert data, the eligibility filter cannot run and the system falls back to "all available crews" with a clear "cert not verified" flag on every recommendation. This is a survivable but degraded mode.

### Bag count

- **Used by.** Flight risk score (heavy-load weighting), turn-time prediction, equipment forecasting, cascade modeling.
- **Source system.** Two possible sources: the BHS (baggage handling system, e.g. BCS, BagLink) for actual scanned bags, or the departure control system (DCS, e.g. SabreSonic, Altea, Navitaire) for forecasted bags.
- **Integration approach.** BHS feeds are typically real-time message-bus subscriptions (RabbitMQ, Kafka, IBM MQ). DCS feeds are typically REST or SITA Type-B.
- **Cadence.** Forecast: 15 minutes acceptable. Actual scan rate: 60 seconds.
- **Reality.** Mature at major airports. Bag scanning is universally deployed and the data is reliable. The integration is moderately complex because BHS systems vary by station and may be operated by the airport authority rather than the airline (DFW operates its own BHS; LAX has a hybrid).
- **Degraded behavior.** Without bag count, the heavy-load weighting in the risk score is set to a default based on aircraft type and historical averages for the route. Accuracy of risk prediction drops by an estimated 8-12 points.

### Gate map and assignments

- **Used by.** Mobility intelligence, cascade visualization, adjacency-conflict detection, equipment routing.
- **Source system.** AODB, same source as flight schedule.
- **Integration approach.** Static map (gate coordinates, walking distances) is loaded once and updated quarterly. Live gate assignments come through the flight schedule feed.
- **Cadence.** Static: quarterly. Live: same as flight schedule.
- **Reality.** Mature for live assignments. The static map data is sometimes the harder part to obtain — airports treat their facility schematics as proprietary, and the airline may not have a clean digital map of their own gates. RampIQ provides a self-service tool for the ramp leadership to mark up a gate map at deployment.
- **Degraded behavior.** Without the static map, mobility distance calculations fall back to terminal-level approximations (within-terminal: same gate group; cross-terminal: penalty). This is a meaningful degradation but RampIQ remains operational.

---

## Tier 2 — Operational depth inputs

These add equipment intelligence and turn-event awareness. Without them, RampIQ runs but the equipment-forecasting and recovery-simulation features are limited.

### Equipment location and state

- **Used by.** Equipment intelligence screen, shortage forecasting, recovery simulation, assignment cost-of-repositioning.
- **Source system.** This is the biggest gap in the typical airline. Three possible sources, in decreasing order of fidelity:
  - **RTLS (real-time location).** BLE tags, UWB, or GPS on each piece of GSE. Mature solutions: Spinnaker, Saviance, Aeromechanical. Where deployed, this is reliable. Where not deployed, this is a multi-million-dollar capex project per station.
  - **GSE management system.** A digital check-in/check-out system at the depot. Less precise but operationally sufficient. Examples: TBI Aviation, ARINC Multi-User Flight Information Display.
  - **Manual / inferred.** A ramp lead marks equipment as available or in-use through the RampIQ interface itself. Less precise still, but works.
- **Integration approach.** RTLS via vendor API (typically REST or MQTT). GSE management system via REST or database extract. Manual via in-app entry.
- **Cadence.** RTLS: 60 seconds. GSE system: 5 minutes. Manual: at deployment time, treated as best-effort.
- **Reality.** Gap at most stations. The major hubs of the largest carriers have piloted RTLS in pieces, but station-wide deployment is rare. Expect to operate on inferred state at most pilot stations.
- **Degraded behavior.** RampIQ defaults to inferred state from depot check-out logs and assignment history. Equipment shortage forecasting becomes reactive rather than predictive — the system can detect a shortage but not forecast one 30 minutes ahead. Cross-depot rebalancing recommendations become approximate.

### Equipment maintenance schedules

- **Used by.** Equipment availability forecasting, maintenance threshold alerts.
- **Source system.** GSE maintenance management system or paper logs at smaller stations. Common products: Trax, Maintenance Connection, RAMCO Aviation.
- **Integration approach.** Daily extract is sufficient. REST or flat file.
- **Cadence.** 24 hours.
- **Reality.** Variable. Larger carriers and stations have this digitized; smaller ones don't.
- **Degraded behavior.** Without maintenance schedule data, maintenance threshold alerts are unavailable. RampIQ does not predict mechanical failures from usage hours when this data is absent.

### Turnaround events (ACARS / OOOI)

- **Used by.** Cascade detection, delay attribution, turn-time prediction model retraining.
- **Source system.** ACARS or proprietary OOOI feed (Out, Off, On, In). Provided by the airline's communications gateway: ARINC, SITA, or proprietary.
- **Integration approach.** Subscription to message queue. ACARS data is well-standardized.
- **Cadence.** Real-time as events occur.
- **Reality.** Mature. Every carrier has this data. The question is whether they expose it to RampIQ.
- **Degraded behavior.** Without OOOI events, RampIQ uses scheduled times from the flight schedule and makes assumptions about block-on, block-off based on standard turnaround patterns. Cascade detection latency increases by an estimated 3-6 minutes.

### Cargo manifest

- **Used by.** Hazmat handling cert filter, cargo-loader equipment forecasting.
- **Source system.** Cargo management system. Common products: SITA CargoSpot, IBS iCargo, proprietary.
- **Integration approach.** Per-flight pull at flight publication, plus update events on manifest changes.
- **Cadence.** 30 minutes.
- **Reality.** Variable. Major cargo-handling carriers (FedEx, UPS, cargo divisions of passenger carriers) have this. Domestic-only passenger carriers may not run a sophisticated cargo system.
- **Degraded behavior.** Without cargo manifest, hazmat indication falls back to the binary flag in the flight schedule (if the airline includes it). The cargo equipment forecast operates on aircraft-type defaults.

---

## Tier 3 — Predictive layer inputs

These enable IRROPS mode, weather-driven forecasting, and the highest-fidelity crew mobility intelligence.

### Weather feed

- **Used by.** IRROPS auto-trigger, environmental delay risk, deicing demand forecast.
- **Source system.** Third-party weather provider. Standard providers: NOAA (free, lower fidelity), Schneider Electric, Weather Decision Technologies, FlightAware Weather, IBM Weather Operations Center.
- **Integration approach.** REST API.
- **Cadence.** 5 minutes for METAR, 30 minutes for forecasts, real-time for convective alerts.
- **Reality.** Mature. The integration itself is straightforward; the question is which provider the airline uses and whether RampIQ can ride that contract.
- **Degraded behavior.** Without a paid feed, RampIQ falls back to NOAA public data. Convective forecasting is degraded; IRROPS auto-trigger may have higher false-positive rate or higher latency.

### ATC ground-stop and EDCT data

- **Used by.** IRROPS auto-trigger, network-impact forecasting, recovery simulation.
- **Source system.** FAA ASDI feed (commercial subscription) or commercial relays such as FlightAware Firehose, Cirium, or ARINC FlightView.
- **Integration approach.** REST or message-bus subscription.
- **Cadence.** 60 seconds for ground-stop status, real-time for EDCT issuance.
- **Reality.** Mature. The data is straightforward; the question is licensing cost. Commercial relays charge per-station or per-volume.
- **Degraded behavior.** Without this feed, IRROPS auto-trigger relies on internal cascade detection only. Ground-stops are observed when the airline's flight schedule starts showing systemic delays, which adds 5-15 minutes of latency.

### Crew location signal (optional)

- **Used by.** Crew mobility intelligence (visualization), idle-pocket detection, repositioning ETAs.
- **Source system.** Three possible sources:
  - **BLE tags on safety vests.** Reliable, accurate, requires capex on tags and reader infrastructure.
  - **Phone-based assignment-confirmation pings.** Crew member checks in at the assignment via the RampIQ mobile app. Light-touch, no infrastructure, lower fidelity.
  - **Vehicle-mounted GPS on tugs and belt loaders.** Indirect — tracks the equipment, infers the crew. Useful for some crew types only.
- **Integration approach.** Vendor API for tags. Native to RampIQ for app-based pings. Vehicle GPS may already exist as part of equipment RTLS.
- **Cadence.** 60 seconds for tags, on-event for app pings.
- **Reality.** Politically sensitive. Real-time crew location tracking is a deal-killer at unionized stations unless the deployment is structured carefully. The phone-app approach is generally acceptable because the crew member affirmatively checks in. Tag-based tracking requires union agreement.
- **Degraded behavior.** RampIQ operates without this signal by default. Crew location is inferred from current flight assignment and last-known gate. Mobility visualizations show inferred positions with a clear "inferred" indicator. Idle-pocket detection becomes coarser; reposition ETAs become approximations.

---

## Outputs — what RampIQ writes

For completeness, the data RampIQ produces and where it goes.

- **Operational state stream.** JSON feed consumed by the RampIQ interfaces. Internal to the system.
- **Recommendation log.** Every recommendation, override, and outcome. Stored in RampIQ's database, exported to the airline on request.
- **Audit trail.** Every action staged or executed, with timestamp and operator. Exported on request.
- **Aggregate metrics.** Daily and weekly rollups for the executive interface. Exportable in CSV or JSON.

RampIQ does not write to any airline system of record. There is no integration that pushes recommendations into the AODB, the crew system, the BHS, or any other system of record.

---

## Integration work effort estimate

Honest estimates for a typical pilot deployment.

- **Tier 1 integrations.** 6-10 weeks calendar time at the airline, 4-6 weeks of RampIQ engineering. The bottleneck is almost always airline IT provisioning of feed access, not the technical work.
- **Tier 2 integrations.** Adds 4-6 weeks. Equipment data is the wildcard; if the station has no RTLS and no GSE management system, this tier is replaced by manual entry and the calendar shortens.
- **Tier 3 integrations.** Adds 4-8 weeks for weather and ATC feeds. Crew location, if pursued, is a separate workstream with its own union timeline, often 8-12 additional weeks.

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
