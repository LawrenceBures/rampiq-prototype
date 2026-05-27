"""
Schedule generator.
Builds a synthetic but realistic 24-hour flight schedule for DFW.
"""
import random
from datetime import datetime, timedelta
from . import config as C


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
    # adjust the largest peak to hit exactly `total`
    diff = total - allocated
    if diff != 0:
        peak_h = max(weights, key=lambda x: weights[x])
        counts[peak_h] += diff
    return counts


def _pick_aircraft_type():
    return _weighted_choice(C.FLEET_MIX)


def _pick_carrier():
    return _weighted_choice(C.CARRIERS)


def _pick_destination():
    return random.choice(C.DESTINATIONS)


def _pick_gate():
    """Pick a gate at random across all terminals.
    Returns (terminal, gate_num, gate_label)."""
    terminal = random.choice(list(C.TERMINALS.keys()))
    gate = random.choice(C.TERMINALS[terminal]["gates"])
    return terminal, gate, f"{terminal}{gate}"


def generate_flight_schedule(day_date: datetime, seed: int = None) -> list:
    """Produce a list of flight dicts for one operating day."""
    if seed is not None:
        random.seed(seed)

    flights = []
    counts = _allocate_hourly_counts(C.TOTAL_DAILY_FLIGHTS)
    flight_id_counter = 1000

    for hour, count in counts.items():
        for _ in range(count):
            # random minute within the hour
            minute = random.randint(0, 59)
            sched_time = day_date.replace(hour=hour, minute=minute, second=0, microsecond=0)

            ac_type = _pick_aircraft_type()
            ac_data = C.AIRCRAFT_TYPES[ac_type]
            carrier = _pick_carrier()
            dest = _pick_destination()
            terminal, gate_num, gate_label = _pick_gate()

            # ~50/50 split arrivals vs departures (we'll bias slightly toward depart for the demo)
            direction = "DEP" if random.random() < 0.55 else "ARR"

            # bag count and pax — sampled from aircraft type distribution
            bag_count = max(0, int(random.gauss(ac_data["bag_avg"], ac_data["bag_std"])))
            pax_count = max(0, int(random.gauss(ac_data["pax_avg"], ac_data["pax_avg"] * 0.10)))

            # cargo manifest in tonnes for wide-body
            cargo_t = round(random.uniform(0.5, 6.0), 1) if ac_data["wide_body"] else 0.0

            # hazmat indicator
            has_hazmat = random.random() < 0.04 if ac_data["wide_body"] else random.random() < 0.015

            # heavy load flag
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
                "scheduled_dt": sched_time,
                "estimated_time": sched_time.isoformat(),
                "estimated_dt": sched_time,
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

                # operational state — initialized
                "assigned_team": None,
                "actual_dep_time": None,
                "delay_minutes": 0,
                "status": "scheduled",  # scheduled | boarding | pushback | airborne | delayed
            }
            flights.append(flight)
            flight_id_counter += 1

    # sort by scheduled time
    flights.sort(key=lambda f: f["scheduled_dt"])
    return flights


def gate_walking_distance(gate_a: str, gate_b: str) -> float:
    """Approximate walking distance in unit-grid between two gates.
    Simple model: same terminal = small distance, cross-terminal = large."""
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
        # within terminal — diff by gate number
        return abs(na - nb) * 18.0  # ~18 units per gate
    else:
        # cross terminal — use coordinates
        ca = C.TERMINALS.get(ta, {"x": 500, "y": 360})
        cb = C.TERMINALS.get(tb, {"x": 500, "y": 360})
        return ((ca["x"] - cb["x"]) ** 2 + (ca["y"] - cb["y"]) ** 2) ** 0.5
