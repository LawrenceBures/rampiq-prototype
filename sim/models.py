"""
RampIQ data models.

Typed dictionaries describing the shape of each core domain object.
These are documentation-grade type hints — the simulator uses plain dicts
for performance, but these TypedDicts make the expected schema explicit
and enable IDE support.

Every field listed here is guaranteed to be present after the generator
produces the object. Fields added later by the algorithms (risk_score,
p_on_time, etc.) are annotated separately as AlgorithmOutputFlight.
"""
from __future__ import annotations
from typing import Dict, List, Optional
try:
    from typing import TypedDict
except ImportError:
    from typing_extensions import TypedDict


# ============================================================
# FLIGHT
# ============================================================

class EquipmentRequired(TypedDict):
    belt_loader:  int
    tug:          int
    gpu:          int
    cargo_loader: int


class Flight(TypedDict):
    # Identity
    flight_id:        str    # e.g. "AA1042"
    carrier:          str    # e.g. "AA"
    flight_num:       int
    aircraft_type:    str    # e.g. "B738"
    is_wide_body:     bool

    # Route
    direction:        str    # "DEP" | "ARR"
    origin:           str    # IATA code
    destination:      str    # IATA code

    # Timing
    scheduled_time:   str    # ISO-8601
    estimated_time:   str    # ISO-8601 (updated on delay)
    actual_dep_time:  Optional[str]

    # Gate
    terminal:         str    # "A" | "B" | "C" | "D" | "E"
    gate_num:         int
    gate:             str    # e.g. "C14"

    # Bag / pax / cargo
    bag_count_forecast: int
    bag_count_actual:   int
    pax_count:          int
    cargo_tonnes:       float
    has_hazmat:         bool
    is_heavy_load:      bool

    # Crew & equipment
    crew_required:       int
    turn_min_planned:    int
    equipment_required:  EquipmentRequired

    # Operational state
    assigned_team:   Optional[str]  # team_id or None
    delay_minutes:   int
    status:          str  # scheduled | boarding | pushback | airborne | delayed


class AlgorithmOutputFlight(TypedDict):
    """Fields appended to Flight dicts during compute_intelligence()."""
    risk_score:           float
    risk_tier:            str    # stable | watch | critical
    risk_components:      Dict[str, float]
    risk_penalties:       List[str]
    p_on_time:            float
    p_delay:              float
    predicted_cause:      str
    delay_minute_estimate: float
    delay_modules:        Dict[str, float]


# ============================================================
# TEAM
# ============================================================

class Team(TypedDict):
    # Identity
    team_id:   str    # e.g. "TEAM-ALPHA"
    name:      str    # e.g. "Team Alpha"
    tier:      str    # apprentice | journeyman | specialist | master | lead

    # Capability
    crew_size:      int
    certifications: List[str]

    # Operational state
    fatigue:               float   # 0-100
    duty_minutes_today:    int
    current_assignment:    Optional[str]   # flight_id or None
    current_gate:          str
    next_available_minutes: int
    status:                str    # available | assigned | break | high_fatigue

    # Historical performance (inputs to suitability scoring)
    historical_turn_score: float   # 0-10
    heavy_load_score:      float   # 0-10
    chemistry_score:       float   # 0-1
    error_rate:            float   # incidents per turn
    turns_logged:          int

    # Career progression
    tier_progress_pct: int


# ============================================================
# EQUIPMENT UNIT
# ============================================================

class EquipmentUnit(TypedDict):
    # Identity
    unit_id:      str    # e.g. "BL-201"
    type:         str    # tug | belt_loader | gpu | cargo_loader | deicing

    # Location
    home_depot:     str   # DEPOT-01 | DEPOT-02 | DEPOT-03
    current_depot:  str
    current_gate:   Optional[str]

    # State
    state:          str   # available | in_use | in_motion | maintenance | idle

    # Usage
    service_hours:            float
    service_threshold_hours:  float
    condition:                float   # 0-1

    # Assignment
    assigned_flight:           Optional[str]
    destination_gate:          Optional[str]
    transit_minutes_remaining: int
    idle_minutes:              int


# ============================================================
# WEATHER
# ============================================================

class WeatherState(TypedDict):
    condition:               str    # clear | overcast | rain | convective | snow
    wind_kt:                 int
    visibility_sm:           float
    ceiling_ft:              int
    temp_c:                  int
    ground_stop_active:      bool
    ground_stop_probability: float
    convective_threat:       bool
    convective_eta_min:      Optional[int]
    active_alerts:           List[dict]


# ============================================================
# SIMULATOR STATE
# ============================================================

class SimulatorState(TypedDict):
    flights:   List[Flight]
    teams:     List[Team]
    equipment: List[EquipmentUnit]
    weather:   WeatherState


# ============================================================
# SNAPSHOT OUTPUT (state.json top-level keys)
# ============================================================

class KPIs(TypedDict):
    active_flight_count:      int
    on_time_count:            int
    at_risk_count:            int
    critical_count:           int
    otp_pct:                  float
    delay_minutes_prevented:  int
    cost_exposure_usd:        float


class TeamSummary(TypedDict):
    total:       int
    available:   int
    assigned:    int
    high_fatigue: int
    unavailable: int


class IntelSnapshot(TypedDict):
    """The shape written to sim/output/state.json."""
    sim_time:           str
    sim_minute:         int
    wall_time:          str
    weather:            WeatherState
    kpis:               KPIs
    active_flights:     List[dict]   # Flight + AlgorithmOutputFlight (compact subset)
    recommendations:    List[dict]
    cascades:           List[dict]
    equipment_forecast: dict
    irrops:             dict
    team_summary:       TeamSummary
    depot_summary:      dict
    event_log:          List[str]
