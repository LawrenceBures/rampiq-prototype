"""
Weather and environmental state.
Generates a baseline weather profile for the day plus optional convective events
that the disruptor module can trigger.
"""
import random
from datetime import timedelta


def initial_weather() -> dict:
    """Baseline weather — mostly clear with some variability."""
    return {
        "condition": "clear",       # clear | overcast | rain | convective | snow
        "wind_kt": random.randint(5, 15),
        "visibility_sm": 10.0,
        "ceiling_ft": 25000,
        "temp_c": random.randint(18, 32),
        "ground_stop_active": False,
        "ground_stop_probability": 0.05,
        "convective_threat": False,
        "convective_eta_min": None,  # if a cell is forecast inbound
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
    """Tick weather forward by 1 simulated minute. Mostly stable."""
    if weather["convective_eta_min"] is not None:
        weather["convective_eta_min"] -= 1
        if weather["convective_eta_min"] <= 0:
            # event arrived — ground stop probability spikes
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

    # natural variability
    if random.random() < 0.05:
        weather["wind_kt"] = max(0, weather["wind_kt"] + random.randint(-3, 3))
