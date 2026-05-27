"""
Crew dataset generator.
Creates 22 synthetic ramp teams with realistic certification distributions,
fatigue patterns, and historical performance metrics.
"""
import random
from . import config as C


def _pick_tier() -> str:
    return random.choices(
        [t for t, _ in C.TEAM_TIER_DIST],
        weights=[w for _, w in C.TEAM_TIER_DIST],
        k=1,
    )[0]


def _pick_certs(tier: str) -> list:
    """Sample a certification set based on tier probabilities."""
    cert_probs = C.CERT_BY_TIER[tier]
    held = []
    for cert, p in cert_probs.items():
        if random.random() < p:
            held.append(cert)
    return held


def _initial_fatigue() -> float:
    """Most crews start a shift well-rested (15-35), some cross-shift carryover up to 55."""
    return round(random.uniform(15, 55), 1)


def _historical_perf() -> dict:
    """Per-team historical scores. These are the inputs to suitability scoring."""
    return {
        "turn_score":      round(random.uniform(6.0, 9.6), 2),  # 0-10 historical turn quality
        "heavy_load_score": round(random.uniform(5.5, 9.5), 2),
        "chemistry":       round(random.uniform(0.65, 0.95), 2), # 0-1 cohesion score
        "error_rate":      round(random.uniform(0.005, 0.04), 4),  # incidents per turn
        "turns_logged":    random.randint(380, 4200),
    }


def generate_teams(seed: int = None) -> list:
    """Generate the synthetic crew roster."""
    if seed is not None:
        random.seed(seed + 1)  # different seed branch from schedule

    teams = []
    for i, name in enumerate(C.TEAM_NAMES[:C.NUM_TEAMS]):
        tier = _pick_tier()
        certs = _pick_certs(tier)
        perf = _historical_perf()

        # crew size depends on tier — masters lead larger crews, apprentice teams smaller
        crew_size = {
            "apprentice": 3, "journeyman": 4, "specialist": 4, "master": 5, "lead": 5
        }[tier]

        # initial position — random gate in concourse area (will be updated as assignments roll in)
        initial_terminal = random.choice(["A", "B", "C", "D", "E"])
        initial_gate_num = random.randint(1, 30)

        team = {
            "team_id": f"TEAM-{name.upper()}",
            "name": f"Team {name}",
            "tier": tier,
            "crew_size": crew_size,
            "certifications": certs,
            "fatigue": _initial_fatigue(),
            "duty_minutes_today": 0,
            "current_assignment": None,        # flight_id when assigned
            "current_gate": f"{initial_terminal}{initial_gate_num}",
            "next_available_minutes": 0,        # minutes until next available

            # historical performance — the 30/25/15/15/10/5 weights of suitability
            "historical_turn_score":      perf["turn_score"],
            "heavy_load_score":           perf["heavy_load_score"],
            "chemistry_score":            perf["chemistry"],
            "error_rate":                 perf["error_rate"],
            "turns_logged":               perf["turns_logged"],

            # career progression (for the agent app demo)
            "tier_progress_pct": random.randint(20, 95),

            # status
            "status": "available",  # available | assigned | break | high_fatigue
        }
        teams.append(team)

    return teams


def get_team_by_id(teams: list, team_id: str) -> dict:
    """Lookup helper."""
    for t in teams:
        if t["team_id"] == team_id:
            return t
    return None
