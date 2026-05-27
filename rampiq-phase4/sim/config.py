"""
RampIQ simulation configuration.

DFW-specific constants and algorithm tuning parameters.
Centralized so the simulator can be re-tuned without touching algorithm code.

Sources for DFW operational characteristics:
  - DFW Airport Authority gate map (2024)
  - BTS T-100 segment data for AA at DFW
  - Public schedule data from FlightAware / Cirium
  - SkyTeam/Star Alliance/oneworld ramp ops procedures (public)
"""
from datetime import time

# ============================================================
# AIRPORT — DFW
# ============================================================

STATION_CODE = "DFW"
STATION_NAME = "Dallas-Fort Worth International"

# Terminals A, B, C, D, E. Coordinates roughly approximate the real DFW layout.
# (x, y) in arbitrary unit-grid; used for walking-distance calculations.
TERMINALS = {
    "A": {"label": "Terminal A", "x": 160, "y": 360, "gates": list(range(1, 38))},
    "B": {"label": "Terminal B", "x": 360, "y": 350, "gates": list(range(1, 41))},
    "C": {"label": "Terminal C", "x": 540, "y": 360, "gates": list(range(1, 40))},
    "D": {"label": "Terminal D", "x": 740, "y": 360, "gates": list(range(1, 45))},
    "E": {"label": "Terminal E", "x": 920, "y": 360, "gates": list(range(1, 39))},
}

# 3 equipment depots — Concourse A central, Concourse C east, Concourse D west
DEPOTS = {
    "DEPOT-01": {"name": "Concourse A · Central", "x": 220, "y": 380},
    "DEPOT-02": {"name": "Concourse C · East",    "x": 620, "y": 380},
    "DEPOT-03": {"name": "Concourse D · West",    "x": 800, "y": 380},
}

# ============================================================
# FLEET — typical AA-at-DFW fleet mix
# ============================================================

# Aircraft type → typical bag count, typical pax, typical turn time (min),
# crew size required, deicing demand factor, equipment requirements
AIRCRAFT_TYPES = {
    "B738": {"bag_avg": 110, "bag_std": 28, "pax_avg": 165, "turn_min": 45,
             "crew_req": 4, "deice_factor": 1.0, "wide_body": False,
             "belt_loaders": 2, "tugs": 1, "gpu": 1, "cargo_loaders": 0},
    "B739": {"bag_avg": 130, "bag_std": 32, "pax_avg": 178, "turn_min": 50,
             "crew_req": 4, "deice_factor": 1.0, "wide_body": False,
             "belt_loaders": 2, "tugs": 1, "gpu": 1, "cargo_loaders": 0},
    "A321": {"bag_avg": 125, "bag_std": 30, "pax_avg": 181, "turn_min": 50,
             "crew_req": 4, "deice_factor": 1.05, "wide_body": False,
             "belt_loaders": 2, "tugs": 1, "gpu": 1, "cargo_loaders": 0},
    "A319": {"bag_avg": 90,  "bag_std": 22, "pax_avg": 128, "turn_min": 40,
             "crew_req": 3, "deice_factor": 0.95, "wide_body": False,
             "belt_loaders": 2, "tugs": 1, "gpu": 1, "cargo_loaders": 0},
    "B777": {"bag_avg": 280, "bag_std": 48, "pax_avg": 280, "turn_min": 90,
             "crew_req": 6, "deice_factor": 1.4, "wide_body": True,
             "belt_loaders": 3, "tugs": 1, "gpu": 1, "cargo_loaders": 2},
    "A330": {"bag_avg": 240, "bag_std": 42, "pax_avg": 240, "turn_min": 80,
             "crew_req": 6, "deice_factor": 1.35, "wide_body": True,
             "belt_loaders": 3, "tugs": 1, "gpu": 1, "cargo_loaders": 2},
    "ERJ":  {"bag_avg": 45,  "bag_std": 12, "pax_avg": 65,  "turn_min": 30,
             "crew_req": 2, "deice_factor": 0.85, "wide_body": False,
             "belt_loaders": 1, "tugs": 1, "gpu": 1, "cargo_loaders": 0},
    "CRJ":  {"bag_avg": 38,  "bag_std": 10, "pax_avg": 50,  "turn_min": 30,
             "crew_req": 2, "deice_factor": 0.85, "wide_body": False,
             "belt_loaders": 1, "tugs": 1, "gpu": 1, "cargo_loaders": 0},
}

# Fleet mix at AA-DFW — narrow-body dominated with some wide-body
FLEET_MIX = [
    ("B738", 0.32),
    ("B739", 0.16),
    ("A321", 0.18),
    ("A319", 0.06),
    ("ERJ",  0.12),
    ("CRJ",  0.08),
    ("B777", 0.04),
    ("A330", 0.04),
]

# ============================================================
# SCHEDULE PROFILE — DFW push patterns
# ============================================================

SIM_DAY_START_HOUR = 5
SIM_DAY_END_HOUR = 23
TOTAL_DAILY_FLIGHTS = 600  # operational, both arrivals and departures

# Hourly weight — peaks at 7am and 5pm match real DFW ops
HOURLY_WEIGHTS = {
    5: 0.4, 6: 1.4, 7: 2.6, 8: 2.2, 9: 1.6, 10: 1.4,
    11: 1.4, 12: 1.6, 13: 1.8, 14: 1.6, 15: 1.5, 16: 1.7,
    17: 2.4, 18: 2.2, 19: 1.6, 20: 1.2, 21: 0.9, 22: 0.5,
}

# Routes — typical AA-DFW destinations
DESTINATIONS = [
    "LAX", "JFK", "ORD", "MIA", "DEN", "SFO", "SEA", "BOS",
    "PHX", "LAS", "ATL", "MSP", "DTW", "PHL", "CLT", "IAH",
    "AUS", "SAN", "SLC", "MCO", "TPA", "FLL", "DCA", "EWR",
    "MSY", "BWI", "STL", "MEM", "OKC", "TUL",
]

# Carrier mix
CARRIERS = [
    ("AA", 0.62), ("UA", 0.10), ("DL", 0.08), ("WN", 0.08),
    ("AS", 0.04), ("F9", 0.04), ("SY", 0.02), ("B6", 0.02),
]

# ============================================================
# CREW
# ============================================================

NUM_TEAMS = 22
TEAM_NAMES = [
    "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel",
    "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa",
    "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor",
]

CERTIFICATIONS = [
    "pushback_standard",
    "pushback_widebody",
    "heavy_load_b737",
    "heavy_load_b777",
    "heavy_load_a330",
    "belt_loader",
    "deicing_type_iv",
    "hazmat_class_3",
    "cargo_handling",
    "recovery_lead",
]

# Tier distribution across teams (apprentice → master)
TEAM_TIER_DIST = [
    ("apprentice",  0.10),
    ("journeyman",  0.50),
    ("specialist",  0.28),
    ("master",      0.10),
    ("lead",        0.02),
]

# Cert availability by tier — what % of teams at each tier hold each cert
CERT_BY_TIER = {
    "apprentice": {"pushback_standard": 0.60, "belt_loader": 1.00},
    "journeyman": {"pushback_standard": 1.00, "belt_loader": 1.00,
                   "heavy_load_b737": 0.85, "hazmat_class_3": 0.40,
                   "cargo_handling": 0.60},
    "specialist": {"pushback_standard": 1.00, "belt_loader": 1.00,
                   "heavy_load_b737": 1.00, "pushback_widebody": 0.70,
                   "hazmat_class_3": 0.85, "cargo_handling": 0.90,
                   "deicing_type_iv": 0.65},
    "master":     {"pushback_standard": 1.00, "belt_loader": 1.00,
                   "heavy_load_b737": 1.00, "pushback_widebody": 1.00,
                   "heavy_load_b777": 0.90, "heavy_load_a330": 0.90,
                   "hazmat_class_3": 1.00, "cargo_handling": 1.00,
                   "deicing_type_iv": 1.00, "recovery_lead": 0.50},
    "lead":       {c: 1.00 for c in CERTIFICATIONS},
}

# ============================================================
# EQUIPMENT
# ============================================================

# Total fleet across all 3 depots
EQUIPMENT_FLEET = {
    "tug":          {"DEPOT-01": 14, "DEPOT-02": 12, "DEPOT-03": 14},
    "belt_loader":  {"DEPOT-01": 16, "DEPOT-02": 14, "DEPOT-03": 14},
    "gpu":          {"DEPOT-01": 10, "DEPOT-02": 10, "DEPOT-03": 10},
    "cargo_loader": {"DEPOT-01":  6, "DEPOT-02":  6, "DEPOT-03":  6},
    "deicing":      {"DEPOT-01":  6, "DEPOT-02":  5, "DEPOT-03":  6},
}

# ============================================================
# ALGORITHM TUNING — Phase 3 formulas
# ============================================================

# 1) Flight Difficulty Formula weights
RISK_WEIGHTS = {
    "bag":      0.22,
    "turn":     0.25,
    "pax":      0.12,
    "cargo":    0.10,
    "equip":    0.15,
    "upstream": 0.16,
}
RISK_PENALTIES = {
    "cert_gap_t30":   1.15,
    "cert_gap_t15":   1.30,
    "weather":        1.10,
    "adjacency":      1.08,
}
RISK_THRESHOLDS = {"watch": 35, "critical": 65}

# 2) Team Suitability Formula weights
SUITABILITY_WEIGHTS = {
    "historical_turn":  0.30,
    "heavy_load":       0.25,
    "proximity":        0.15,
    "fatigue_inverse":  0.15,
    "chemistry":        0.10,
    "error_inverse":    0.05,
}
FATIGUE_HARD_CAP = 85
FATIGUE_CAP_SCORE = 60

# 3) Delay Prediction — independent failure model
# (causal modules: crew, equipment, bag/cargo, upstream, environmental)
DELAY_BASE_RISK = {
    "crew":      0.04,
    "equipment": 0.03,
    "bag":       0.04,
    "upstream":  0.05,
    "env":       0.03,
}

# 4) Assignment Optimization
RECO_WEIGHTS = {
    "suitability":    0.60,
    "global_impact":  0.30,
    "operational":    0.10,
}

# 5) Equipment Readiness
EQUIPMENT_FORECAST_HORIZON_MIN = 90
EQUIPMENT_FORECAST_REFRESH_MIN = 4

# ============================================================
# IRROPS TRIGGERS
# ============================================================

IRROPS_TRIGGERS = {
    "active_critical_flights":    3,    # 3+ critical at once
    "ground_stop_probability":    0.6,  # 60%+ ground stop
    "cert_coverage_pct":          0.65, # cert coverage falls below 65%
    "concurrent_cascades":        2,    # 2+ active cascades
    "equipment_shortage_windows": 2,    # 2+ shortage windows
}

# ============================================================
# SIMULATION
# ============================================================

# Real seconds per simulated minute. Default 1 = real-time.
# Use 0.05 to run a 24-hour simulation in ~72 seconds.
DEFAULT_TIME_SCALE = 1.0

# State emit interval (in simulated minutes)
STATE_EMIT_INTERVAL_MIN = 1

# Random seed for reproducibility
DEFAULT_SEED = 42
