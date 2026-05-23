"""
RampIQ synthetic data generator.

Consolidates all synthetic-data generation for the simulator into one module:
  - Flight schedule (600-flight DFW operating day)
  - Crew roster (22 ramp teams with realistic certifications and performance)
  - Equipment fleet (~130 GSE units across 3 depots)
  - Weather state (baseline + convective event support)

Each generator is seeded for reproducibility. Different seed offsets are used
per domain so that changing one domain's data doesn't perturb the others.

Public API:
    generate_flight_schedule(day_date, seed) → List[Flight]
    generate_teams(seed)                     → List[Team]
    generate_equipment(seed)                 → List[EquipmentUnit]
    initial_weather()                        → WeatherState
    trigger_convective_event(weather, eta)
    step_weather(weather, sim_minute)
    gate_walking_distance(gate_a, gate_b)    → float
"""
import random
from datetime import datetime, timedelta
from . import config as C


# ============================================================
# INTERNAL HELPERS
# ============================================================

def _weighted_choice(items_with_weights):
    items, weights = zip(*items_with_weights)
    return random.choices(items, weights=weights, k=1)[0]


def _allocate_hourly_counts(total: int) -> dict:
    """Distribute total flights across operating hours by HOURLY_WEIGHTS."""
    weights = C.HOURLY_WEIGHTS
    weight_sum = sum(weights.values())
    counts = {}
    allocated = 0
    for h, w in weights.items():
        c = int(round(total * w / weight_sum))
        counts[h] = c
        allocated += c
    # adjust the largest peak hour to hit exactly `total`
    diff = total - allocated
    if diff != 0:
        peak_h = max(weights, key=lambda x: weights[x])
        counts[peak_h] += diff
    return counts


# ============================================================
# FLIGHT SCHEDULE
# ============================================================

def generate_flight_schedule(day_date: datetime, seed: int = None) -> list:
    """
    Produce a list of Flight dicts for one operating day at DFW.

    600 flights, distributed across hours by HOURLY_WEIGHTS (peaks at 07:00
    and 17:00 matching real DFW ops). Fleet mix and carrier mix are
    probability-weighted per config.
    """
    if seed is not None:
        random.seed(seed)

    flights = []
    counts = _allocate_hourly_counts(C.TOTAL_DAILY_FLIGHTS)
    flight_id_counter = 1000

    for hour, count in counts.items():
        for _ in range(count):
            minute = random.randint(0, 59)
            sched_time = day_date.replace(hour=hour, minute=minute, second=0, microsecond=0)

            ac_type = _weighted_choice(C.FLEET_MIX)
            ac_data = C.AIRCRAFT_TYPES[ac_type]
            carrier = _weighted_choice(C.CARRIERS)
            dest = random.choice(C.DESTINATIONS)
            terminal = random.choice(list(C.TERMINALS.keys()))
            gate_num = random.choice(C.TERMINALS[terminal]["gates"])
            gate_label = f"{terminal}{gate_num}"

            direction = "DEP" if random.random() < 0.55 else "ARR"

            bag_count = max(0, int(random.gauss(ac_data["bag_avg"], ac_data["bag_std"])))
            pax_count = max(0, int(random.gauss(ac_data["pax_avg"], ac_data["pax_avg"] * 0.10)))
            cargo_t = round(random.uniform(0.5, 6.0), 1) if ac_data["wide_body"] else 0.0
            has_hazmat = random.random() < (0.04 if ac_data["wide_body"] else 0.015)
            is_heavy_load = bag_count >= ac_data["bag_avg"] * 1.15

            flight = {
                "flight_id": f"{carrier}{flight_id_counter}",
                "carrier": carrier,
                "flight_num": flight_id_counter,
                "aircraft_type": ac_type,
                "is_wide_body": ac_data["wide_body"],
                "direction": direction,
                "origin": "DFW" if direction == "DEP" else dest,
                "destination": dest if direction == "DEP" else "DFW",
                "scheduled_time": sched_time.isoformat(),
                "scheduled_dt": sched_time,      # datetime object, not in JSON output
                "estimated_time": sched_time.isoformat(),
                "estimated_dt": sched_time,      # datetime object, not in JSON output
                "terminal": terminal,
                "gate_num": gate_num,
                "gate": gate_label,
                "bag_count_forecast": bag_count,
                "bag_count_actual": 0,
                "pax_count": pax_count,
                "cargo_tonnes": cargo_t,
                "has_hazmat": has_hazmat,
                "is_heavy_load": is_heavy_load,
                "crew_required": ac_data["crew_req"],
                "turn_min_planned": ac_data["turn_min"],
                "equipment_required": {
                    "belt_loader":  ac_data["belt_loaders"],
                    "tug":          ac_data["tugs"],
                    "gpu":          ac_data["gpu"],
                    "cargo_loader": ac_data["cargo_loaders"],
                },
                "assigned_team": None,
                "actual_dep_time": None,
                "delay_minutes": 0,
                "status": "scheduled",  # scheduled | boarding | pushback | airborne | delayed
            }
            flights.append(flight)
            flight_id_counter += 1

    flights.sort(key=lambda f: f["scheduled_dt"])
    return flights


def gate_walking_distance(gate_a: str, gate_b: str) -> float:
    """
    Approximate walking distance in unit-grid between two gate labels.
    Same terminal: proportional to gate number difference (~18 units/gate).
    Cross-terminal: Euclidean distance between terminal coordinate centroids.
    """
    if not gate_a or not gate_b:
        return 999.0

    def parse(g):
        terminal = g[0]
        try:
            num = int(g[1:])
        except (ValueError, IndexError):
            num = 0
        return terminal, num

    ta, na = parse(gate_a)
    tb, nb = parse(gate_b)

    if ta == tb:
        return abs(na - nb) * 18.0   # ~18 grid-units per gate position
    else:
        ca = C.TERMINALS.get(ta, {"x": 500, "y": 360})
        cb = C.TERMINALS.get(tb, {"x": 500, "y": 360})
        return ((ca["x"] - cb["x"]) ** 2 + (ca["y"] - cb["y"]) ** 2) ** 0.5


# ============================================================
# CREW ROSTER
# ============================================================

def _pick_tier() -> str:
    return random.choices(
        [t for t, _ in C.TEAM_TIER_DIST],
        weights=[w for _, w in C.TEAM_TIER_DIST],
        k=1,
    )[0]


def _pick_certs(tier: str) -> list:
    """Sample a certification set based on tier probabilities."""
    cert_probs = C.CERT_BY_TIER[tier]
    return [cert for cert, p in cert_probs.items() if random.random() < p]


def generate_teams(seed: int = None) -> list:
    """
    Generate the 22-team synthetic crew roster for DFW.

    Each team has a tier (apprentice → lead), a certification set drawn from
    tier-appropriate probabilities, historical performance scores, and an
    initial fatigue level. Teams start the shift available.
    """
    if seed is not None:
        random.seed(seed + 1)   # separate seed branch from schedule

    teams = []
    for name in C.TEAM_NAMES[:C.NUM_TEAMS]:
        tier = _pick_tier()
        certs = _pick_certs(tier)

        crew_size = {
            "apprentice": 3, "journeyman": 4, "specialist": 4, "master": 5, "lead": 5
        }[tier]

        initial_terminal = random.choice(["A", "B", "C", "D", "E"])
        initial_gate_num = random.randint(1, 30)

        team = {
            "team_id": f"TEAM-{name.upper()}",
            "name": f"Team {name}",
            "tier": tier,
            "crew_size": crew_size,
            "certifications": certs,
            "fatigue": round(random.uniform(15, 55), 1),   # most crews start well-rested
            "duty_minutes_today": 0,
            "current_assignment": None,
            "current_gate": f"{initial_terminal}{initial_gate_num}",
            "next_available_minutes": 0,
            "status": "available",

            # Historical performance — inputs to suitability scoring
            "historical_turn_score": round(random.uniform(6.0, 9.6), 2),
            "heavy_load_score":      round(random.uniform(5.5, 9.5), 2),
            "chemistry_score":       round(random.uniform(0.65, 0.95), 2),
            "error_rate":            round(random.uniform(0.005, 0.04), 4),
            "turns_logged":          random.randint(380, 4200),

            # Career progression (for the agent app demo)
            "tier_progress_pct": random.randint(20, 95),
        }
        teams.append(team)

    return teams


def get_team_by_id(teams: list, team_id: str) -> dict:
    """Lookup a team by team_id. Returns None if not found."""
    for t in teams:
        if t["team_id"] == team_id:
            return t
    return None


# ============================================================
# EQUIPMENT FLEET
# ============================================================

_EQUIP_ID_PREFIX = {
    "tug":          "T",
    "belt_loader":  "BL",
    "gpu":          "G",
    "cargo_loader": "CL",
    "deicing":      "DI",
}


def generate_equipment(seed: int = None) -> list:
    """
    Generate the ~130-unit ground support equipment fleet across 3 depots.

    Fleet counts per type and depot are defined in config.EQUIPMENT_FLEET.
    ~5% of units start in maintenance; the rest are available. Service hours
    are randomised to produce realistic maintenance-threshold variability.
    """
    if seed is not None:
        random.seed(seed + 2)   # separate seed branch

    fleet = []
    for equip_type, depot_counts in C.EQUIPMENT_FLEET.items():
        prefix = _EQUIP_ID_PREFIX[equip_type]
        for depot_id, count in depot_counts.items():
            depot_offset = {"DEPOT-01": 100, "DEPOT-02": 200, "DEPOT-03": 300}[depot_id]
            for i in range(count):
                state = random.choices(["available", "maintenance"], weights=[0.95, 0.05], k=1)[0]
                unit = {
                    "unit_id": f"{prefix}-{depot_offset + i + 1}",
                    "type": equip_type,
                    "home_depot": depot_id,
                    "current_depot": depot_id,
                    "current_gate": None,
                    "state": state,
                    "service_hours": round(random.uniform(40, 380), 1),
                    "service_threshold_hours": 400,
                    "condition": round(random.uniform(0.85, 1.0), 3),
                    "assigned_flight": None,
                    "destination_gate": None,
                    "transit_minutes_remaining": 0,
                    "idle_minutes": random.randint(0, 30) if random.random() < 0.2 else 0,
                }
                fleet.append(unit)

    return fleet


def get_unit_by_id(fleet: list, unit_id: str) -> dict:
    """Lookup an equipment unit by unit_id. Returns None if not found."""
    for u in fleet:
        if u["unit_id"] == unit_id:
            return u
    return None


def units_by_depot_and_type(fleet: list, depot_id: str, equip_type: str,
                             state: str = None) -> list:
    """List units at a depot of a given type, optionally filtered by state."""
    out = [u for u in fleet if u["current_depot"] == depot_id and u["type"] == equip_type]
    if state:
        out = [u for u in out if u["state"] == state]
    return out


# ============================================================
# WEATHER
# ============================================================

def initial_weather() -> dict:
    """Baseline DFW weather — mostly clear with natural wind variability."""
    return {
        "condition": "clear",       # clear | overcast | rain | convective | snow
        "wind_kt": random.randint(5, 15),
        "visibility_sm": 10.0,
        "ceiling_ft": 25000,
        "temp_c": random.randint(18, 32),
        "ground_stop_active": False,
        "ground_stop_probability": 0.05,
        "convective_threat": False,
        "convective_eta_min": None,
        "active_alerts": [],
    }


def trigger_convective_event(weather: dict, eta_minutes: int = 30):
    """Mutate weather state to indicate an inbound convective cell."""
    weather["convective_threat"] = True
    weather["convective_eta_min"] = eta_minutes
    weather["ground_stop_probability"] = 0.42
    weather["active_alerts"].append({
        "kind": "convective_threat",
        "eta_min": eta_minutes,
        "message": f"Convective cell forecast {eta_minutes}min · ground-stop probability rising",
    })


def step_weather(weather: dict, sim_minute: int):
    """
    Advance weather state by 1 simulated minute.

    Ages the convective threat countdown. When ETA reaches zero, a ground stop
    is activated and ground_stop_probability spikes to 0.85. Natural wind
    variability is applied on a 5% per-tick probability.
    """
    if weather["convective_eta_min"] is not None:
        weather["convective_eta_min"] -= 1
        if weather["convective_eta_min"] <= 0:
            weather["ground_stop_active"] = True
            weather["ground_stop_probability"] = 0.85
            weather["condition"] = "convective"
            weather["active_alerts"].append({
                "kind": "ground_stop",
                "message": "ATC ground stop in effect",
            })
            weather["convective_eta_min"] = None
        elif weather["convective_eta_min"] < 10:
            weather["ground_stop_probability"] = 0.62
        elif weather["convective_eta_min"] < 20:
            weather["ground_stop_probability"] = 0.48

    if random.random() < 0.05:
        weather["wind_kt"] = max(0, weather["wind_kt"] + random.randint(-3, 3))
