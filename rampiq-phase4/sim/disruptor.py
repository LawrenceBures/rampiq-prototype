"""
Disruption injector.
Programmable events that introduce realistic operational stress into the simulation.
"""
import random
from datetime import timedelta
from . import config as C
from . import weather as wx


# A disruption event is a (sim_minute_offset, kind, params) tuple.
# These are pre-defined for the demo day to produce a realistic narrative.
#
# kinds:
#   weather_threat        — convective cell forecast inbound
#   crew_callout          — a team becomes unavailable
#   equipment_fault       — a unit goes to maintenance
#   bag_surge             — a flight gets a bag count spike
#   late_inbound          — an arrival is delayed
#   cargo_delay           — cargo manifest forces re-inspection

DEMO_DAY_DISRUPTIONS = [
    # mid-morning: equipment fault (compounding pressure)
    (320, "equipment_fault",  {"equip_type": "belt_loader", "depot": "DEPOT-02"}),

    # late-morning: bag surge on a heavy-load flight
    (380, "bag_surge",        {"target_flight_idx": 0, "spike_pct": 0.35}),

    # afternoon: crew callout
    (530, "crew_callout",     {"team_index": 7}),

    # mid-afternoon: weather threat that builds toward IRROPS
    (560, "weather_threat",   {"eta_minutes": 36}),

    # late-afternoon: late inbound triggers cascade
    (590, "late_inbound",     {"target_flight_idx": 1, "delay_min": 22}),

    # equipment fault in opposite depot during peak
    (610, "equipment_fault",  {"equip_type": "tug", "depot": "DEPOT-03"}),

    # cargo delay
    (645, "cargo_delay",      {"target_flight_idx": 2}),
]


def apply_disruption(state: dict, event_kind: str, params: dict, sim_now):
    """
    Mutate the simulator state in response to a disruption event.
    Returns a human-readable description of what was applied.
    """
    if event_kind == "weather_threat":
        wx.trigger_convective_event(state["weather"], params["eta_minutes"])
        return f"Convective threat injected · ETA {params['eta_minutes']}min"

    if event_kind == "crew_callout":
        team_idx = params["team_index"]
        if 0 <= team_idx < len(state["teams"]):
            t = state["teams"][team_idx]
            t["status"] = "unavailable"
            t["fatigue"] = 95  # so suitability cap kicks in
            return f"Crew callout · {t['name']} unavailable"
        return None

    if event_kind == "equipment_fault":
        equip_type = params["equip_type"]
        depot = params["depot"]
        # find first available unit of that type at that depot, send to maintenance
        for u in state["equipment"]:
            if (u["type"] == equip_type and u["current_depot"] == depot
                    and u["state"] == "available"):
                u["state"] = "maintenance"
                u["service_hours"] = u["service_threshold_hours"] + 5
                return f"Equipment fault · {u['unit_id']} to maintenance"
        return None

    if event_kind == "bag_surge":
        # find a near-term DEP flight and spike its bag count
        idx = params.get("target_flight_idx", 0)
        candidates = [f for f in state["flights"]
                      if f["direction"] == "DEP"
                      and (f["estimated_dt"] - sim_now).total_seconds() / 60 < 60
                      and (f["estimated_dt"] - sim_now).total_seconds() / 60 > 5]
        if idx < len(candidates):
            f = candidates[idx]
            spike = int(f["bag_count_forecast"] * params.get("spike_pct", 0.3))
            f["bag_count_forecast"] += spike
            f["is_heavy_load"] = True
            return f"Bag surge · {f['flight_id']} +{spike} bags"
        return None

    if event_kind == "late_inbound":
        idx = params.get("target_flight_idx", 0)
        candidates = [f for f in state["flights"]
                      if f["direction"] == "ARR"
                      and (f["estimated_dt"] - sim_now).total_seconds() / 60 < 90
                      and (f["estimated_dt"] - sim_now).total_seconds() / 60 > 5]
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
        candidates = [f for f in state["flights"]
                      if f["cargo_tonnes"] > 0
                      and (f["estimated_dt"] - sim_now).total_seconds() / 60 < 60
                      and (f["estimated_dt"] - sim_now).total_seconds() / 60 > 0]
        if idx < len(candidates):
            f = candidates[idx]
            f["cargo_inspection_pending"] = True
            return f"Cargo delay · {f['flight_id']} re-inspection"
        return None

    return None
