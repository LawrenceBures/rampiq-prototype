"""
RampIQ core algorithms.

Implements the five Phase 3 formulas:
  1. compute_flight_risk          — Flight Difficulty (0-100)
  2. compute_team_suitability     — Per team, per flight (0-100)
  3. predict_delay                — P(on-time) and predicted cause
  4. recommend_assignment         — Top-N candidates with confidence
  5. forecast_equipment           — 90-min shortage forecast

Plus supporting helpers:
  - detect_cascade                — Cascade chain detection
  - check_irrops_triggers         — IRROPS auto-trigger evaluation
  - compute_global_impact         — Counterfactual delta for assignment scoring
"""
from datetime import timedelta
from . import config as C
from .schedule import gate_walking_distance


# ============================================================
# 1) FLIGHT RISK / DIFFICULTY SCORE
# ============================================================

def compute_flight_risk(flight: dict, weather: dict, equipment_fleet: list,
                        all_flights: list, sim_now) -> dict:
    """
    Compute flight risk score 0-100.

    Risk = 0.22*Bag + 0.25*Turn + 0.12*Pax + 0.10*Cargo + 0.15*Equip + 0.16*Upstream
    Multiplicative penalties: cert gap, weather, adjacency

    Returns: {"score": float, "components": dict, "tier": "stable|watch|critical"}
    """
    ac_data = C.AIRCRAFT_TYPES[flight["aircraft_type"]]

    # --- Bag component: how heavy vs aircraft type baseline?
    bag_avg = ac_data["bag_avg"]
    bag_ratio = flight["bag_count_forecast"] / bag_avg if bag_avg > 0 else 1.0
    bag_score = min(100, max(0, (bag_ratio - 0.7) * 110))  # 0.7 of avg = floor, 1.6 = ~100

    # --- Turn component: how tight is the turn vs planned?
    turn_planned = flight["turn_min_planned"]
    minutes_to_dep = (flight["estimated_dt"] - sim_now).total_seconds() / 60
    if minutes_to_dep < 0:
        turn_pressure = 100  # past sched
    elif minutes_to_dep > turn_planned * 1.5:
        turn_pressure = 10
    else:
        turn_pressure = max(0, min(100, (turn_planned * 1.2 - minutes_to_dep) / turn_planned * 100))
    turn_score = turn_pressure

    # --- Pax component: load factor stress
    pax_avg = ac_data["pax_avg"]
    pax_ratio = flight["pax_count"] / pax_avg if pax_avg > 0 else 1.0
    pax_score = min(100, max(0, (pax_ratio - 0.7) * 100))

    # --- Cargo component: relevant for wide-body
    if ac_data["wide_body"]:
        cargo_score = min(100, flight["cargo_tonnes"] * 20)
    else:
        cargo_score = 0

    # --- Equipment component: are required units available?
    equip_score = _equipment_availability_pressure(flight, equipment_fleet)

    # --- Upstream component: crew/inbound delays cascading down
    upstream_score = _upstream_pressure(flight, all_flights, sim_now)

    # --- Linear combination
    w = C.RISK_WEIGHTS
    base = (
        w["bag"] * bag_score
        + w["turn"] * turn_score
        + w["pax"] * pax_score
        + w["cargo"] * cargo_score
        + w["equip"] * equip_score
        + w["upstream"] * upstream_score
    )

    # --- Multiplicative penalties
    final = base
    penalties_applied = []

    if minutes_to_dep <= 30 and minutes_to_dep > 15:
        # cert gap risk modeled as: if no team assigned and T-30, penalty
        if flight["assigned_team"] is None:
            final *= C.RISK_PENALTIES["cert_gap_t30"]
            penalties_applied.append("cert_gap_t30")
    if minutes_to_dep <= 15 and minutes_to_dep > 0:
        if flight["assigned_team"] is None:
            final *= C.RISK_PENALTIES["cert_gap_t15"]
            penalties_applied.append("cert_gap_t15")

    if weather.get("ground_stop_active") or weather.get("convective_threat"):
        final *= C.RISK_PENALTIES["weather"]
        penalties_applied.append("weather")

    if _has_adjacency_conflict(flight, all_flights, sim_now):
        final *= C.RISK_PENALTIES["adjacency"]
        penalties_applied.append("adjacency")

    final = max(0, min(100, final))

    # --- Tier
    if final < C.RISK_THRESHOLDS["watch"]:
        tier = "stable"
    elif final < C.RISK_THRESHOLDS["critical"]:
        tier = "watch"
    else:
        tier = "critical"

    return {
        "score": round(final, 1),
        "tier": tier,
        "components": {
            "bag": round(bag_score, 1),
            "turn": round(turn_score, 1),
            "pax": round(pax_score, 1),
            "cargo": round(cargo_score, 1),
            "equipment": round(equip_score, 1),
            "upstream": round(upstream_score, 1),
        },
        "penalties_applied": penalties_applied,
    }


def _equipment_availability_pressure(flight: dict, fleet: list) -> float:
    """
    For each piece of equipment this flight needs, count how many are
    available in the relevant depot. Pressure rises as availability drops.
    """
    # which depot is relevant? Closest one to the gate.
    terminal = flight.get("terminal", "C")
    depot_for_terminal = {"A": "DEPOT-01", "B": "DEPOT-01", "C": "DEPOT-02",
                          "D": "DEPOT-03", "E": "DEPOT-03"}.get(terminal, "DEPOT-02")

    pressure = 0.0
    component_count = 0

    for equip_type, required in flight["equipment_required"].items():
        if required <= 0:
            continue
        component_count += 1
        avail = sum(1 for u in fleet
                    if u["type"] == equip_type
                    and u["current_depot"] == depot_for_terminal
                    and u["state"] == "available")
        if avail >= required + 2:
            pressure += 10
        elif avail >= required:
            pressure += 30
        elif avail >= 1:
            pressure += 65
        else:
            pressure += 95

    return pressure / max(1, component_count)


def _upstream_pressure(flight: dict, all_flights: list, sim_now) -> float:
    """Count delayed flights in same terminal in the past 30 min."""
    minutes_window = 30
    same_terminal = flight.get("terminal")
    delayed_nearby = 0
    for f in all_flights:
        if f["flight_id"] == flight["flight_id"]:
            continue
        if f.get("terminal") != same_terminal:
            continue
        if f.get("delay_minutes", 0) > 5:
            time_diff = abs((f["scheduled_dt"] - sim_now).total_seconds() / 60)
            if time_diff < minutes_window:
                delayed_nearby += 1
    return min(100, delayed_nearby * 25)


def _has_adjacency_conflict(flight: dict, all_flights: list, sim_now) -> bool:
    """Check if an adjacent gate has a near-simultaneous pushback."""
    if flight["direction"] != "DEP":
        return False
    my_gate = flight["gate"]
    minutes_to_dep = (flight["estimated_dt"] - sim_now).total_seconds() / 60
    if minutes_to_dep < 0 or minutes_to_dep > 20:
        return False
    for f in all_flights:
        if f["flight_id"] == flight["flight_id"]:
            continue
        if f["direction"] != "DEP":
            continue
        # adjacent = same terminal, gate diff <= 2
        if f.get("terminal") != flight.get("terminal"):
            continue
        try:
            gate_diff = abs(f["gate_num"] - flight["gate_num"])
        except (KeyError, TypeError):
            continue
        if gate_diff <= 2:
            other_dep_minutes = (f["estimated_dt"] - sim_now).total_seconds() / 60
            if abs(other_dep_minutes - minutes_to_dep) <= 5:
                return True
    return False


# ============================================================
# 2) TEAM SUITABILITY SCORE
# ============================================================

def compute_team_suitability(team: dict, flight: dict) -> dict:
    """
    Compute 0-100 suitability for assigning team to flight.

    Stage A: hard filters (certs, fatigue, conflicts, crew size)
    Stage B: weighted score
    Hard cap: fatigue > 85 caps suitability at 60.

    Returns: {"score": float, "eligible": bool, "components": dict, "blockers": list, "reasons": list}
    """
    blockers = []
    reasons = []

    # ----- STAGE A: HARD FILTERS

    # Crew size
    if team["crew_size"] < flight["crew_required"]:
        blockers.append(f"crew size {team['crew_size']} < required {flight['crew_required']}")

    # Certs
    needed = []
    if flight["is_wide_body"]:
        needed.append("pushback_widebody")
        ac = flight["aircraft_type"]
        if ac in ("B777",):
            needed.append("heavy_load_b777")
        if ac in ("A330",):
            needed.append("heavy_load_a330")
    else:
        needed.append("pushback_standard")
        if flight["is_heavy_load"]:
            needed.append("heavy_load_b737")
    needed.append("belt_loader")
    if flight["has_hazmat"]:
        needed.append("hazmat_class_3")
    if flight["cargo_tonnes"] > 0:
        needed.append("cargo_handling")

    missing_certs = [c for c in needed if c not in team["certifications"]]
    if missing_certs:
        blockers.append(f"missing certs: {', '.join(missing_certs)}")

    # Already assigned
    if team["current_assignment"] and team["current_assignment"] != flight["flight_id"]:
        blockers.append(f"currently on {team['current_assignment']}")

    # Status
    if team.get("status") == "unavailable":
        blockers.append(f"team unavailable ({team.get('name')})")
    if team["fatigue"] > 95:
        blockers.append(f"fatigue {team['fatigue']:.0f} exceeds duty cap")

    eligible = len(blockers) == 0

    if not eligible:
        return {
            "score": 0,
            "eligible": False,
            "components": {},
            "blockers": blockers,
            "reasons": [],
        }

    # ----- STAGE B: WEIGHTED SCORE

    # 1. Historical turn performance — score 0-10 → scaled to 0-100
    hist_score = team["historical_turn_score"] * 10

    # 2. Heavy-load proficiency
    heavy_score = team["heavy_load_score"] * 10

    # 3. Proximity — closer gate = higher score
    distance = gate_walking_distance(team["current_gate"], flight["gate"])
    proximity_score = max(0, 100 - (distance / 12.0))  # 0 distance = 100, 1200u = 0

    # 4. Fatigue inverse — lower fatigue = higher score
    fatigue_inverse = max(0, 100 - team["fatigue"] * 1.1)

    # 5. Chemistry — 0-1 → 0-100
    chemistry_score = team["chemistry_score"] * 100

    # 6. Error inverse
    error_inverse = max(0, 100 - team["error_rate"] * 1500)

    w = C.SUITABILITY_WEIGHTS
    score = (
        w["historical_turn"]  * hist_score
        + w["heavy_load"]      * heavy_score
        + w["proximity"]       * proximity_score
        + w["fatigue_inverse"] * fatigue_inverse
        + w["chemistry"]       * chemistry_score
        + w["error_inverse"]   * error_inverse
    )

    # Hard cap: fatigue > 85
    if team["fatigue"] > C.FATIGUE_HARD_CAP:
        score = min(score, C.FATIGUE_CAP_SCORE)
        reasons.append(f"fatigue {team['fatigue']:.0f} caps suitability at {C.FATIGUE_CAP_SCORE}")

    score = max(0, min(100, score))

    # Build human-readable reasons (top contributors)
    if hist_score >= 85:
        reasons.append(f"strong historical turn score · {team['historical_turn_score']:.1f} / 10")
    if heavy_score >= 85 and flight["is_heavy_load"]:
        reasons.append(f"high heavy-load proficiency · {team['heavy_load_score']:.1f} / 10")
    if proximity_score >= 80:
        reasons.append(f"close to gate · {distance:.0f}m walking distance")
    elif proximity_score >= 50:
        reasons.append(f"moderate distance · {distance:.0f}m")
    if team["fatigue"] < 35:
        reasons.append(f"low fatigue index · {team['fatigue']:.0f}")
    if team["chemistry_score"] > 0.85:
        reasons.append(f"strong team cohesion · {team['chemistry_score']:.2f}")

    return {
        "score": round(score, 1),
        "eligible": True,
        "components": {
            "historical": round(hist_score, 1),
            "heavy_load": round(heavy_score, 1),
            "proximity": round(proximity_score, 1),
            "fatigue_inverse": round(fatigue_inverse, 1),
            "chemistry": round(chemistry_score, 1),
            "error_inverse": round(error_inverse, 1),
        },
        "distance_m": round(distance, 0),
        "blockers": [],
        "reasons": reasons,
    }


# ============================================================
# 3) DELAY PREDICTION
# ============================================================

def predict_delay(flight: dict, weather: dict, equipment_fleet: list,
                  all_flights: list, sim_now) -> dict:
    """
    Predict delay using independent failure model.

    P(on time) = (1 - P_crew) * (1 - P_equip) * (1 - P_bag) * (1 - P_upstream) * (1 - P_env)

    Returns: {"p_on_time": float, "p_delay": float,
              "predicted_cause": str, "minute_estimate": float, "modules": dict}
    """
    minutes_to_dep = (flight["estimated_dt"] - sim_now).total_seconds() / 60

    # ----- Crew module
    # ARRivals don't have crew assignment risk in the same way — their
    # ramp crew is dispatched on landing; we score them on equipment+upstream
    if flight["direction"] == "ARR":
        p_crew = C.DELAY_BASE_RISK["crew"]
    elif flight["assigned_team"] is None and minutes_to_dep < 30:
        p_crew = 0.55 if minutes_to_dep < 15 else 0.32
    elif flight["assigned_team"] is None:
        p_crew = 0.18
    else:
        p_crew = C.DELAY_BASE_RISK["crew"]

    # ----- Equipment module
    # equip_pressure is 0-100, where 100 = total shortage
    # at baseline (full availability) it should be ~10, contributing ~0.018 above the 0.05 floor
    equip_pressure = _equipment_availability_pressure(flight, equipment_fleet)
    p_equip = C.DELAY_BASE_RISK["equipment"] + max(0, (equip_pressure - 10) / 100) * 0.20

    # ----- Bag/cargo module
    ac_data = C.AIRCRAFT_TYPES[flight["aircraft_type"]]
    bag_ratio = flight["bag_count_forecast"] / max(1, ac_data["bag_avg"])
    if bag_ratio > 1.3:
        p_bag = 0.22
    elif bag_ratio > 1.1:
        p_bag = 0.12
    else:
        p_bag = C.DELAY_BASE_RISK["bag"]

    # ----- Upstream module
    upstream_pressure = _upstream_pressure(flight, all_flights, sim_now)
    p_upstream = C.DELAY_BASE_RISK["upstream"] + (upstream_pressure / 100) * 0.15

    # ----- Environmental module
    if weather.get("ground_stop_active"):
        p_env = 0.65
    elif weather.get("convective_threat"):
        p_env = 0.18
    else:
        p_env = C.DELAY_BASE_RISK["env"]

    # ----- Combine — independent failure
    p_on_time = (1 - p_crew) * (1 - p_equip) * (1 - p_bag) * (1 - p_upstream) * (1 - p_env)
    p_delay = 1 - p_on_time

    # Predicted cause = largest single contributor
    modules = {
        "crew":      p_crew,
        "equipment": p_equip,
        "bag":       p_bag,
        "upstream":  p_upstream,
        "env":       p_env,
    }
    predicted_cause = max(modules, key=modules.get)

    # ETA slip — cause-conditioned regression (simple linear approx)
    cause_slip_factor = {
        "crew": 14, "equipment": 8, "bag": 10, "upstream": 18, "env": 22,
    }
    minute_estimate = round(p_delay * cause_slip_factor[predicted_cause], 1)

    return {
        "p_on_time": round(p_on_time, 3),
        "p_delay": round(p_delay, 3),
        "predicted_cause": predicted_cause,
        "minute_estimate": minute_estimate,
        "modules": {k: round(v, 3) for k, v in modules.items()},
    }


# ============================================================
# 4) ASSIGNMENT OPTIMIZATION
# ============================================================

def recommend_assignment(flight: dict, all_teams: list, all_flights: list,
                         weather: dict, equipment_fleet: list, sim_now,
                         top_n: int = 3) -> dict:
    """
    Recommend best teams for a flight.

    Build candidate set (Stage A pass), compute GlobalImpact (counterfactual),
    RecoScore = 0.60*Suitability + 0.30*GlobalImpact + 0.10*OperationalCost
    Confidence = (top_score - second_score) / top_score * familiarity_factor
    """
    candidates = []
    for team in all_teams:
        suit = compute_team_suitability(team, flight)
        if not suit["eligible"]:
            continue

        # Global impact: simple proxy — penalize pulling a team from another
        # critical assignment
        global_impact = compute_global_impact(team, flight, all_flights, sim_now)

        # Operational cost — proxy for repositioning effort
        distance = suit["distance_m"]
        op_cost = max(0, 100 - distance / 10)  # closer = lower cost = higher score

        w = C.RECO_WEIGHTS
        reco_score = (
            w["suitability"]    * suit["score"]
            + w["global_impact"] * global_impact
            + w["operational"]   * op_cost
        )

        candidates.append({
            "team_id": team["team_id"],
            "team_name": team["name"],
            "tier": team["tier"],
            "fatigue": team["fatigue"],
            "current_gate": team["current_gate"],
            "current_assignment": team["current_assignment"],
            "suitability_score": suit["score"],
            "global_impact_score": round(global_impact, 1),
            "operational_score": round(op_cost, 1),
            "reco_score": round(reco_score, 1),
            "distance_m": suit["distance_m"],
            "reasons": suit["reasons"],
            "components": suit["components"],
        })

    candidates.sort(key=lambda c: c["reco_score"], reverse=True)
    top = candidates[:top_n]

    # Confidence
    if len(candidates) >= 2:
        gap = candidates[0]["reco_score"] - candidates[1]["reco_score"]
        familiarity = min(1.0, candidates[0]["suitability_score"] / 100)
        confidence = (gap / max(1, candidates[0]["reco_score"])) * familiarity
        confidence = max(0.5, min(0.99, 0.65 + confidence * 4))  # rescale to readable range
    elif len(candidates) == 1:
        confidence = 0.85
    else:
        confidence = 0.0

    return {
        "flight_id": flight["flight_id"],
        "candidates": top,
        "confidence": round(confidence, 3),
        "candidate_count_total": len(candidates),
    }


def compute_global_impact(team: dict, target_flight: dict,
                          all_flights: list, sim_now) -> float:
    """
    Counterfactual: if we pull this team from their current assignment to
    target_flight, what's the global delta?
    Returns 0-100 score where higher = better outcome for the system.
    """
    if team["current_assignment"] is None:
        return 90  # no displacement, high score

    # Find the displaced flight
    displaced = None
    for f in all_flights:
        if f["flight_id"] == team["current_assignment"]:
            displaced = f
            break

    if displaced is None:
        return 80

    # If the displaced flight has time slack, displacement is cheap
    minutes_to_displaced_dep = (displaced["estimated_dt"] - sim_now).total_seconds() / 60
    if minutes_to_displaced_dep > 60:
        return 85  # plenty of time to find replacement
    elif minutes_to_displaced_dep > 30:
        return 65
    else:
        return 25  # would create cascading impact


# ============================================================
# 5) EQUIPMENT FORECAST
# ============================================================

def forecast_equipment(equipment_fleet: list, all_flights: list, sim_now,
                       horizon_min: int = None) -> dict:
    """
    Forward simulation: for each (depot, equipment-type) pair, project
    supply vs demand over the next horizon_min minutes.

    Demand model: each flight uses each equipment type for ~25 min, so the
    "concurrent" demand at any moment is the count of overlapping flights
    that need that equipment from that depot. We approximate by bucketing
    flights into 15-min windows and counting concurrent demand within each.

    Returns: {"shortage_windows": [...], "depot_summary": {...}}
    """
    if horizon_min is None:
        horizon_min = C.EQUIPMENT_FORECAST_HORIZON_MIN

    bucket_min = 15
    n_buckets = horizon_min // bucket_min

    shortage_windows = []

    for depot_id in C.DEPOTS:
        for equip_type in C.EQUIPMENT_FLEET:
            # supply = total non-maintenance units at this depot
            supply = sum(1 for u in equipment_fleet
                         if u["current_depot"] == depot_id
                         and u["type"] == equip_type
                         and u["state"] != "maintenance")

            # demand per 15-min bucket = count of DEP flights in that bucket
            # served by this depot needing this equip type. Each flight ties up
            # the equipment for one bucket only (cycling assumption).
            for b in range(n_buckets):
                window_start = sim_now + timedelta(minutes=b * bucket_min)
                window_end = sim_now + timedelta(minutes=(b + 1) * bucket_min)
                demand = 0
                for f in all_flights:
                    fdep = f["estimated_dt"]
                    if not (window_start <= fdep <= window_end):
                        continue
                    if f["direction"] != "DEP":
                        continue
                    terminal = f.get("terminal", "C")
                    serving_depot = {"A": "DEPOT-01", "B": "DEPOT-01", "C": "DEPOT-02",
                                     "D": "DEPOT-03", "E": "DEPOT-03"}.get(terminal, "DEPOT-02")
                    if serving_depot != depot_id:
                        continue
                    demand += f["equipment_required"].get(equip_type, 0)

                if demand > supply:
                    shortage_windows.append({
                        "depot_id": depot_id,
                        "depot_name": C.DEPOTS[depot_id]["name"],
                        "equipment_type": equip_type,
                        "window_start": window_start.isoformat(),
                        "window_end": window_end.isoformat(),
                        "supply": supply,
                        "demand": demand,
                        "deficit": demand - supply,
                        "status": "shortage",
                    })
                elif supply > 0 and demand >= supply * 0.85:
                    shortage_windows.append({
                        "depot_id": depot_id,
                        "depot_name": C.DEPOTS[depot_id]["name"],
                        "equipment_type": equip_type,
                        "window_start": window_start.isoformat(),
                        "window_end": window_end.isoformat(),
                        "supply": supply,
                        "demand": demand,
                        "deficit": 0,
                        "status": "tight",
                    })

    # Depot summary — aggregate state counts
    depot_summary = {}
    for depot_id in C.DEPOTS:
        units = [u for u in equipment_fleet if u["current_depot"] == depot_id]
        depot_summary[depot_id] = {
            "name": C.DEPOTS[depot_id]["name"],
            "total": len(units),
            "available": sum(1 for u in units if u["state"] == "available"),
            "in_use": sum(1 for u in units if u["state"] == "in_use"),
            "in_motion": sum(1 for u in units if u["state"] == "in_motion"),
            "maintenance": sum(1 for u in units if u["state"] == "maintenance"),
            "idle": sum(1 for u in units if u["state"] == "idle"),
        }

    return {
        "shortage_windows": shortage_windows[:8],
        "depot_summary": depot_summary,
        "horizon_min": horizon_min,
    }


# ============================================================
# CASCADE DETECTION
# ============================================================

def detect_cascades(all_flights: list, sim_now) -> list:
    """
    Identify flights whose delay is likely to cascade.
    Returns a list of cascade chains, each with origin flight + chain steps.
    """
    cascades = []
    for f in all_flights:
        if f["status"] in ("airborne", "completed"):
            continue
        if f.get("delay_minutes", 0) < 10:
            continue
        # only examine flights near departure
        minutes_to_dep = (f["estimated_dt"] - sim_now).total_seconds() / 60
        if minutes_to_dep > 90 or minutes_to_dep < -30:
            continue

        chain = _build_cascade_chain(f, all_flights, sim_now)
        if chain:
            cascades.append({
                "origin_flight": f["flight_id"],
                "origin_gate": f["gate"],
                "origin_delay_min": f["delay_minutes"],
                "chain": chain,
                "estimated_pax": sum(step.get("pax_affected", 0) for step in chain),
            })
    return cascades[:5]  # cap


def _build_cascade_chain(origin: dict, all_flights: list, sim_now) -> list:
    """Build a 3-5 step dependency chain starting from the origin flight."""
    chain = []
    # Step 1: origin
    chain.append({
        "step": 1,
        "flight_id": origin["flight_id"],
        "event": f"{origin['flight_id']} departure delayed",
        "detail": f"+{origin['delay_minutes']} min slip · {origin.get('aircraft_type')}",
        "pax_affected": origin["pax_count"],
        "kind": "origin",
    })
    # Step 2: gate occupied — find inbound flights to same gate
    for f in all_flights:
        if f["flight_id"] == origin["flight_id"]:
            continue
        if f["gate"] == origin["gate"] and f["direction"] == "ARR":
            arr_minutes = (f["estimated_dt"] - sim_now).total_seconds() / 60
            if 0 < arr_minutes < 60:
                chain.append({
                    "step": 2,
                    "flight_id": f["flight_id"],
                    "event": f"Gate {origin['gate']} occupied — {f['flight_id']} hold",
                    "detail": f"inbound · ETA T+{int(arr_minutes)}min",
                    "pax_affected": f["pax_count"],
                    "kind": "gate",
                })
                break
    # Step 3 — adjacency conflict
    if origin["direction"] == "DEP":
        for f in all_flights:
            if f["flight_id"] == origin["flight_id"]:
                continue
            if f.get("terminal") == origin.get("terminal") and f["direction"] == "DEP":
                if abs(f.get("gate_num", 0) - origin.get("gate_num", 0)) <= 2:
                    other_dep = (f["estimated_dt"] - sim_now).total_seconds() / 60
                    if 0 < other_dep < 30:
                        chain.append({
                            "step": len(chain) + 1,
                            "flight_id": f["flight_id"],
                            "event": f"Adjacent pushback conflict · gate {f['gate']}",
                            "detail": f"+18% concurrent pushback probability",
                            "pax_affected": f["pax_count"] // 4,
                            "kind": "adjacency",
                        })
                        break
    # Step 4 — bagroom congestion (if origin is heavy-load)
    if origin.get("is_heavy_load"):
        chain.append({
            "step": len(chain) + 1,
            "flight_id": None,
            "event": "Bagroom sort line congestion",
            "detail": "delayed bag transfer · 2 downstream connections at risk",
            "pax_affected": 0,
            "kind": "bag",
        })
    # Step 5 — crew legality risk
    chain.append({
        "step": len(chain) + 1,
        "flight_id": origin["flight_id"],
        "event": "Crew legality risk",
        "detail": f"approaching FAA duty threshold in {41 + origin['delay_minutes']}min",
        "pax_affected": 0,
        "kind": "crew",
    })

    return chain if len(chain) >= 2 else []


# ============================================================
# IRROPS TRIGGERS
# ============================================================

def check_irrops_triggers(all_flights: list, weather: dict, cascades: list,
                          equipment_forecast: dict, all_teams: list) -> dict:
    """
    Evaluate IRROPS auto-trigger conditions. Returns trigger state.
    """
    t = C.IRROPS_TRIGGERS

    # Active critical flights (risk score > 65 + close to dep)
    critical_count = sum(
        1 for f in all_flights
        if f.get("risk_score", 0) > 65 and f.get("delay_minutes", 0) > 5
    )

    # Ground stop probability
    gs_prob = weather.get("ground_stop_probability", 0)

    # Concurrent cascades
    cascade_count = len(cascades)

    # Equipment shortage windows
    shortage_count = sum(1 for w in equipment_forecast.get("shortage_windows", [])
                         if w.get("status") == "shortage")

    # Cert coverage
    cert_total = len(all_teams)
    cert_covered = sum(1 for team in all_teams
                       if "pushback_standard" in team["certifications"])
    cert_pct = cert_covered / max(1, cert_total)

    triggers_hit = []
    if critical_count >= t["active_critical_flights"]:
        triggers_hit.append("active_critical_flights")
    if gs_prob >= t["ground_stop_probability"]:
        triggers_hit.append("ground_stop_probability")
    if cascade_count >= t["concurrent_cascades"]:
        triggers_hit.append("concurrent_cascades")
    if shortage_count >= t["equipment_shortage_windows"]:
        triggers_hit.append("equipment_shortage_windows")
    if cert_pct < t["cert_coverage_pct"]:
        triggers_hit.append("cert_coverage_pct")

    return {
        "active": len(triggers_hit) >= 1,
        "triggers_hit": triggers_hit,
        "metrics": {
            "critical_flights": critical_count,
            "ground_stop_probability": round(gs_prob, 2),
            "concurrent_cascades": cascade_count,
            "shortage_windows": shortage_count,
            "cert_coverage_pct": round(cert_pct, 2),
        },
    }
