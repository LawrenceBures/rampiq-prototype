"""
Disruption injector.

Programmable events that introduce realistic operational stress into the simulation.
Each disruption is a (sim_minute_offset, kind, params) tuple applied when the
simulator's day-minute counter reaches the offset.

Disruption kinds:
    weather_threat    — convective cell forecast inbound; raises GS probability
    crew_callout      — a team becomes unavailable
    equipment_fault   — a unit goes to maintenance
    bag_surge         — a flight gets a bag count spike
    late_inbound      — an arriving flight is delayed
    cargo_delay       — cargo manifest forces re-inspection
"""
from datetime import timedelta
from . import config as C
from . import data_generator as dg


# Demo day disruption schedule.
# Offsets are in simulated minutes from the start of the operating day (05:00).
# Sequence is designed to produce a mid-IRROPS state by minute 882 (14:42).
DEMO_DAY_DISRUPTIONS = [
    # mid-morning: equipment fault — belt loader DEPOT-02 offline, pressures C/D gates
    (320, "equipment_fault", {"equip_type": "belt_loader", "depot": "DEPOT-02"}),

    # late-morning: bag surge on a near-term departure
    (380, "bag_surge",       {"target_flight_idx": 0, "spike_pct": 0.35}),

    # afternoon: crew callout removes Team Hotel, opens cert gap on nearby flights
    (530, "crew_callout",    {"team_index": 7}),

    # 14:00 — first late inbound: occupies gate, blocks adjacent DEP pushback sequence
    # fires at day_min 540 → sim_minute 840 → 14:00; +20min slip → ETA ~14:25-ish
    (540, "late_inbound",    {"target_flight_idx": 0, "delay_min": 20}),

    # 14:17 — second late inbound: different gate cluster, propagates bagroom congestion
    # fires at day_min 557 → sim_minute 857 → 14:17; +15min slip
    (557, "late_inbound",    {"target_flight_idx": 1, "delay_min": 15}),

    # 14:22 — convective threat — ETA 36 min, GS probability starts rising
    (562, "weather_threat",  {"eta_minutes": 36}),

    # 14:28 — third late inbound: tightens staffing pool in terminal D cluster
    # fires at day_min 568 → sim_minute 868 → 14:28; +12min slip; well within 14:42 snapshot
    (568, "late_inbound",    {"target_flight_idx": 2, "delay_min": 12}),

    # equipment fault in opposite depot during afternoon peak (after snapshot — stress continues)
    (610, "equipment_fault", {"equip_type": "tug", "depot": "DEPOT-03"}),

    # cargo delay forces re-inspection, holds wide-body (after snapshot)
    (645, "cargo_delay",     {"target_flight_idx": 2}),
]


def apply_disruption(state: dict, event_kind: str, params: dict, sim_now) -> str:
    """
    Mutate simulator state in response to a disruption event.
    Returns a human-readable description, or None if the event could not be applied.
    """
    if event_kind == "weather_threat":
        dg.trigger_convective_event(state["weather"], params["eta_minutes"])
        return f"Convective threat injected · ETA {params['eta_minutes']}min"

    if event_kind == "crew_callout":
        idx = params["team_index"]
        if 0 <= idx < len(state["teams"]):
            t = state["teams"][idx]
            t["status"] = "unavailable"
            t["fatigue"] = 95   # fatigue cap kicks in for suitability scoring
            return f"Crew callout · {t['name']} unavailable"
        return None

    if event_kind == "equipment_fault":
        equip_type = params["equip_type"]
        depot = params["depot"]
        for u in state["equipment"]:
            if (u["type"] == equip_type and u["current_depot"] == depot
                    and u["state"] == "available"):
                u["state"] = "maintenance"
                u["service_hours"] = u["service_threshold_hours"] + 5
                return f"Equipment fault · {u['unit_id']} to maintenance"
        return None

    if event_kind == "bag_surge":
        idx = params.get("target_flight_idx", 0)
        candidates = [
            f for f in state["flights"]
            if f["direction"] == "DEP"
            and 5 < (f["estimated_dt"] - sim_now).total_seconds() / 60 < 60
        ]
        if idx < len(candidates):
            f = candidates[idx]
            spike = int(f["bag_count_forecast"] * params.get("spike_pct", 0.30))
            f["bag_count_forecast"] += spike
            f["is_heavy_load"] = True
            return f"Bag surge · {f['flight_id']} +{spike} bags"
        return None

    if event_kind == "late_inbound":
        idx = params.get("target_flight_idx", 0)
        candidates = [
            f for f in state["flights"]
            if f["direction"] == "ARR"
            and 5 < (f["estimated_dt"] - sim_now).total_seconds() / 60 < 90
        ]
        if idx < len(candidates):
            f = candidates[idx]
            delay = params.get("delay_min", 18)
            f["estimated_dt"] = f["estimated_dt"] + timedelta(minutes=delay)
            f["estimated_time"] = f["estimated_dt"].isoformat()
            f["delay_minutes"] = delay
            return f"Late inbound · {f['flight_id']} +{delay}min"
        return None

    if event_kind == "cargo_delay":
        idx = params.get("target_flight_idx", 0)
        candidates = [
            f for f in state["flights"]
            if f["cargo_tonnes"] > 0
            and 0 < (f["estimated_dt"] - sim_now).total_seconds() / 60 < 60
        ]
        if idx < len(candidates):
            f = candidates[idx]
            f["cargo_inspection_pending"] = True
            return f"Cargo delay · {f['flight_id']} re-inspection"
        return None

    return None
