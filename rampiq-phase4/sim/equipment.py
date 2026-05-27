"""
Equipment fleet generator.
Creates 94 units of ground support equipment across 3 depots
with realistic state, maintenance, and usage characteristics.
"""
import random
from . import config as C


def _id_prefix(equip_type: str) -> str:
    """Map equipment types to ID prefixes."""
    return {
        "tug":          "T",
        "belt_loader":  "BL",
        "gpu":          "G",
        "cargo_loader": "CL",
        "deicing":      "DI",
    }[equip_type]


def _initial_state() -> str:
    """Most equipment starts available; small % maintenance for realism."""
    return random.choices(
        ["available", "maintenance"],
        weights=[0.95, 0.05],
        k=1,
    )[0]


def generate_equipment(seed: int = None) -> list:
    """Generate full equipment fleet."""
    if seed is not None:
        random.seed(seed + 2)  # separate seed branch

    fleet = []

    for equip_type, depot_counts in C.EQUIPMENT_FLEET.items():
        prefix = _id_prefix(equip_type)
        unit_id_counter = 1

        for depot_id, count in depot_counts.items():
            # depot offset — different ID ranges per depot for visual clarity
            depot_offset = {"DEPOT-01": 100, "DEPOT-02": 200, "DEPOT-03": 300}[depot_id]
            for i in range(count):
                unit = {
                    "unit_id": f"{prefix}-{depot_offset + i + 1}",
                    "type": equip_type,
                    "home_depot": depot_id,
                    "current_depot": depot_id,
                    "current_gate": None,
                    "state": _initial_state(),

                    # usage hours — drives maintenance threshold
                    "service_hours": round(random.uniform(40, 380), 1),
                    "service_threshold_hours": 400,

                    # condition score 0-1 — affects readiness in algorithm
                    "condition": round(random.uniform(0.85, 1.0), 3),

                    # if in_use, which flight
                    "assigned_flight": None,

                    # if in_motion, where it's going (gate label)
                    "destination_gate": None,
                    "transit_minutes_remaining": 0,

                    # idle tracker — used to detect "idle too long"
                    "idle_minutes": random.randint(0, 30) if random.random() < 0.2 else 0,
                }
                fleet.append(unit)

    return fleet


def get_unit_by_id(fleet: list, unit_id: str) -> dict:
    for u in fleet:
        if u["unit_id"] == unit_id:
            return u
    return None


def units_by_depot_and_type(fleet: list, depot_id: str, equip_type: str, state: str = None) -> list:
    """Helper: list of units at a depot of a given type, optionally filtered by state."""
    out = [u for u in fleet if u["current_depot"] == depot_id and u["type"] == equip_type]
    if state:
        out = [u for u in out if u["state"] == state]
    return out
