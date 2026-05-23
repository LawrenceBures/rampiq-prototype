"""
RampIQ time-stepping simulator.

Advances simulation 1 minute per tick. At each tick:
  1. steps weather
  2. applies any scheduled disruptions
  3. updates flight states (scheduling → boarding → pushback → airborne / delayed)
  4. updates crew fatigue and duty time
  5. updates equipment states (available ↔ in_use lifecycle)
  6. auto-assigns best-available teams to upcoming departures

On compute_intelligence() — called at each emit interval — runs all 5 RampIQ
algorithms across active flights and returns a structured JSON snapshot.
"""
import json
import os
import random
import time
from datetime import datetime, timedelta
from pathlib import Path

from . import config as C
from . import data_generator as dg
from . import algorithms as algo
from . import disruptor


class RampIQSimulator:
    """The simulation engine."""

    def __init__(self, day_date: datetime = None, seed: int = None,
                 time_scale: float = C.DEFAULT_TIME_SCALE,
                 emit_to_file: Path = None,
                 verbose: bool = True):
        if day_date is None:
            day_date = datetime(2026, 5, 8, 0, 0, 0)
        if seed is None:
            seed = C.DEFAULT_SEED

        self.day_date   = day_date
        self.seed       = seed
        self.time_scale = time_scale
        self.emit_to_file = Path(emit_to_file) if emit_to_file else None
        self.verbose    = verbose

        self.state = self._initialize_state()
        self.sim_minute = C.SIM_DAY_START_HOUR * 60   # start at 05:00
        self.sim_now = self._sim_minute_to_datetime(self.sim_minute)

        self.pending_disruptions  = list(disruptor.DEMO_DAY_DISRUPTIONS)
        self.applied_disruptions  = []
        self.event_log: list = []

    # ------------------------------------------------------------------
    # INITIALIZATION
    # ------------------------------------------------------------------

    def _initialize_state(self) -> dict:
        state = {
            "flights":   dg.generate_flight_schedule(self.day_date, self.seed),
            "teams":     dg.generate_teams(self.seed),
            "equipment": dg.generate_equipment(self.seed),
            "weather":   dg.initial_weather(),
        }
        self._auto_assign_baseline_equipment(state)
        return state

    def _auto_assign_baseline_equipment(self, state: dict):
        """Set ~32% of equipment to in_use at init so the depot summary looks realistic."""
        target_in_use = int(len(state["equipment"]) * 0.32)
        in_use_count  = sum(1 for u in state["equipment"] if u["state"] == "in_use")
        if in_use_count >= target_in_use:
            return
        avail = [u for u in state["equipment"] if u["state"] == "available"]
        random.shuffle(avail)
        for u in avail[:target_in_use - in_use_count]:
            u["state"] = "in_use"

    def _sim_minute_to_datetime(self, minute: int) -> datetime:
        return self.day_date + timedelta(minutes=minute)

    # ------------------------------------------------------------------
    # CORE TICK
    # ------------------------------------------------------------------

    def tick(self):
        """Advance the simulation by 1 simulated minute."""
        self.sim_minute += 1
        self.sim_now = self._sim_minute_to_datetime(self.sim_minute)

        dg.step_weather(self.state["weather"], self.sim_minute)
        self._apply_due_disruptions()
        self._update_flight_states()
        self._update_crew_states()
        self._update_equipment_states()
        self._auto_assign_runtime()

    def _apply_due_disruptions(self):
        still_pending = []
        for offset, kind, params in self.pending_disruptions:
            day_minute = self.sim_minute - C.SIM_DAY_START_HOUR * 60
            if day_minute >= offset:
                desc = disruptor.apply_disruption(self.state, kind, params, self.sim_now)
                if desc:
                    self.applied_disruptions.append({
                        "sim_minute":  self.sim_minute,
                        "sim_time":    self.sim_now.isoformat(),
                        "kind":        kind,
                        "description": desc,
                    })
                    self.event_log.append(f"[{self.sim_now.strftime('%H:%M')}] {desc}")
                    if self.verbose:
                        print(f"⚡ [{self.sim_now.strftime('%H:%M')}] {desc}")
            else:
                still_pending.append((offset, kind, params))
        self.pending_disruptions = still_pending

    def _update_flight_states(self):
        """Advance flight states based on time. Materialize delays near pushback."""
        disruption_active = (
            any(self.sim_minute - d["sim_minute"] < 60 for d in self.applied_disruptions)
            or self.state["weather"].get("convective_threat")
            or self.state["weather"].get("ground_stop_active")
        )

        for f in self.state["flights"]:
            minutes_to_dep = (f["estimated_dt"] - self.sim_now).total_seconds() / 60

            if f["status"] == "scheduled":
                if minutes_to_dep <= f["turn_min_planned"] and f["direction"] == "DEP":
                    f["status"] = "boarding"
                elif minutes_to_dep < 0 and f["direction"] == "DEP":
                    f["status"] = "delayed"
                    f["delay_minutes"] = max(f["delay_minutes"], int(-minutes_to_dep))

            elif f["status"] == "boarding":
                if 0 < minutes_to_dep <= 12 and f["direction"] == "DEP" and f["delay_minutes"] == 0:
                    self._maybe_materialize_delay(f, disruption_active)
                    if f["status"] == "delayed":
                        continue
                if 0 < minutes_to_dep <= 5:
                    f["status"] = "pushback"
                elif minutes_to_dep < 0:
                    f["status"] = "delayed"
                    f["delay_minutes"] = max(f["delay_minutes"], int(-minutes_to_dep))

            elif f["status"] == "pushback":
                if minutes_to_dep <= -2:
                    f["status"] = "airborne"
                    f["actual_dep_time"] = self.sim_now.isoformat()

            elif f["status"] == "delayed":
                if f["assigned_team"] is not None and minutes_to_dep > -10:
                    if random.random() < 0.05:
                        f["status"] = "boarding"

    def _maybe_materialize_delay(self, flight: dict, disruption_active: bool):
        """
        Stochastically decide whether to slip a boarding flight's departure.
        Uses live delay prediction. Probability and magnitude scale with disruption state.
        """
        d = algo.predict_delay(
            flight, self.state["weather"], self.state["equipment"],
            self.state["flights"], self.sim_now
        )
        p_delay       = d["p_delay"]
        delay_estimate = d["minute_estimate"]
        cause         = d["predicted_cause"]

        if disruption_active:
            # floor=10 ensures slips exceed the cascade-detection threshold (≥10 min)
            # factor range 1.0-2.0 produces most delays in the 10-15 min band,
            # with tail cases reaching 20+ min for high-p_delay flights
            slip_prob     = min(0.30, p_delay * 0.55)
            slip_floor    = 10
            slip_factor   = 1.0 + random.random() * 1.0
        else:
            slip_prob     = min(0.10, p_delay * 0.18)
            slip_floor    = 6
            slip_factor   = 0.6 + random.random() * 0.5

        if random.random() > slip_prob:
            return

        actual = int(max(slip_floor, delay_estimate * slip_factor))
        if actual < slip_floor:
            return

        flight["delay_minutes"]  = actual
        flight["estimated_dt"]   = flight["estimated_dt"] + timedelta(minutes=actual)
        flight["estimated_time"] = flight["estimated_dt"].isoformat()
        flight["status"]         = "delayed"
        flight["predicted_cause"] = cause
        self.event_log.append(
            f"[{self.sim_now.strftime('%H:%M')}] "
            f"{flight['flight_id']} +{actual}min · {cause}")

    def _update_crew_states(self):
        """Accumulate fatigue during assignment, recover slowly when available."""
        for team in self.state["teams"]:
            if team["current_assignment"] is not None:
                team["duty_minutes_today"] += 1
                team["fatigue"] = min(100.0, team["fatigue"] + 0.025)
            else:
                team["fatigue"] = max(15.0, team["fatigue"] - 0.05)

    def _update_equipment_states(self):
        """Manage equipment lifecycle tied to flight status."""
        # 1. Free equipment whose flight has gone airborne
        for u in self.state["equipment"]:
            if u["state"] == "in_use" and u.get("assigned_flight"):
                for f in self.state["flights"]:
                    if f["flight_id"] == u["assigned_flight"]:
                        if f["status"] in ("airborne", "completed"):
                            u["state"] = "available"
                            u["assigned_flight"] = None
                            u["current_gate"] = None
                            u["idle_minutes"] = 0
                        break

        # 2. Claim equipment for newly-boarding DEP flights
        for f in self.state["flights"]:
            if f["status"] not in ("boarding", "pushback") or f["direction"] != "DEP":
                continue
            terminal = f.get("terminal", "C")
            depot = {"A": "DEPOT-01", "B": "DEPOT-01", "C": "DEPOT-02",
                     "D": "DEPOT-03", "E": "DEPOT-03"}.get(terminal, "DEPOT-02")

            for equip_type, required in f["equipment_required"].items():
                if required <= 0:
                    continue
                already = sum(1 for u in self.state["equipment"]
                              if u.get("assigned_flight") == f["flight_id"]
                              and u["type"] == equip_type)
                need = required - already
                if need <= 0:
                    continue

                pool = [u for u in self.state["equipment"]
                        if u["type"] == equip_type and u["state"] == "available"
                        and u["current_depot"] == depot]
                if len(pool) < need:
                    pool += [u for u in self.state["equipment"]
                             if u["type"] == equip_type and u["state"] == "available"
                             and u["current_depot"] != depot
                             and not any(u2["unit_id"] == u["unit_id"] for u2 in pool)]
                for u in pool[:need]:
                    u["state"] = "in_use"
                    u["assigned_flight"] = f["flight_id"]
                    u["current_gate"] = f["gate"]

        # 3. Standard state progression
        for u in self.state["equipment"]:
            if u["state"] == "in_motion":
                u["transit_minutes_remaining"] = max(0, u["transit_minutes_remaining"] - 1)
                if u["transit_minutes_remaining"] <= 0:
                    u["state"] = "in_use" if u["assigned_flight"] else "available"
                    if u["destination_gate"]:
                        u["current_gate"] = u["destination_gate"]
                    u["destination_gate"] = None

            if u["state"] == "in_use":
                u["service_hours"] = round(u["service_hours"] + (1 / 60), 2)

            if u["state"] in ("available", "idle"):
                u["idle_minutes"] += 1
            else:
                u["idle_minutes"] = 0

    def _auto_assign_runtime(self):
        """
        Rolling 90-minute team assignment window.

        Each tick: release teams whose flight is past or far in future,
        then assign the best-suited available team to each unassigned DEP
        flight in the next 90 minutes (sorted by urgency).
        """
        # Release teams
        for team in self.state["teams"]:
            if team["current_assignment"] is None:
                continue
            if team["status"] == "unavailable":
                for f in self.state["flights"]:
                    if f["flight_id"] == team["current_assignment"]:
                        f["assigned_team"] = None
                        break
                team["current_assignment"] = None
                continue
            for f in self.state["flights"]:
                if f["flight_id"] == team["current_assignment"]:
                    minutes_to_dep = (f["estimated_dt"] - self.sim_now).total_seconds() / 60
                    if f["status"] in ("airborne", "completed") or \
                       minutes_to_dep < -8 or minutes_to_dep > 100:
                        f["assigned_team"] = None
                        team["current_assignment"] = None
                        team["fatigue"] = max(15.0, team["fatigue"] - 5)
                    break

        # Assign teams to upcoming unassigned DEP flights
        upcoming = sorted(
            [(  (f["estimated_dt"] - self.sim_now).total_seconds() / 60, f)
             for f in self.state["flights"]
             if f["direction"] == "DEP"
             and f["assigned_team"] is None
             and f["status"] not in ("airborne", "completed")
             and 0 <= (f["estimated_dt"] - self.sim_now).total_seconds() / 60 <= 90],
            key=lambda x: x[0]
        )

        for _, f in upcoming:
            best, best_score = None, -1
            for team in self.state["teams"]:
                if team["current_assignment"] is not None or team["status"] != "available":
                    continue
                suit = algo.compute_team_suitability(team, f)
                if suit["eligible"] and suit["score"] > best_score:
                    best_score = suit["score"]
                    best = team
            if best:
                best["current_assignment"] = f["flight_id"]
                f["assigned_team"] = best["team_id"]
                best["current_gate"] = f["gate"]

    # ------------------------------------------------------------------
    # INTELLIGENCE SNAPSHOT
    # ------------------------------------------------------------------

    def compute_intelligence(self) -> dict:
        """Run all 5 algorithms and return a complete intelligence snapshot."""
        active_flights = [
            f for f in self.state["flights"]
            if f["status"] not in ("airborne", "completed")
            and abs((f["estimated_dt"] - self.sim_now).total_seconds() / 60) < 180
        ]

        # 1. Risk scores
        for f in active_flights:
            r = algo.compute_flight_risk(
                f, self.state["weather"], self.state["equipment"],
                self.state["flights"], self.sim_now)
            f["risk_score"]      = r["score"]
            f["risk_tier"]       = r["tier"]
            f["risk_components"] = r["components"]
            f["risk_penalties"]  = r["penalties_applied"]

        # 2. Delay predictions
        for f in active_flights:
            d = algo.predict_delay(
                f, self.state["weather"], self.state["equipment"],
                self.state["flights"], self.sim_now)
            f["p_on_time"]            = d["p_on_time"]
            f["p_delay"]              = d["p_delay"]
            f["predicted_cause"]      = d["predicted_cause"]
            f["delay_minute_estimate"] = d["minute_estimate"]
            f["delay_modules"]        = d["modules"]

        # Sort: DEP soonest → ARR soonest → past events
        def sort_key(f):
            m = (f["estimated_dt"] - self.sim_now).total_seconds() / 60
            if f["direction"] == "DEP" and m >= -10:
                return (0, abs(m))
            elif f["direction"] == "ARR" and m >= -10:
                return (1, abs(m))
            else:
                return (2, abs(m))
        active_flights.sort(key=sort_key)

        # 3. Cascade detection
        cascades = algo.detect_cascades(self.state["flights"], self.sim_now)

        # 4. Equipment forecast
        eq_forecast = algo.forecast_equipment(
            self.state["equipment"], self.state["flights"], self.sim_now)

        # 5. Top assignment recommendations
        unassigned_urgent = sorted(
            [f for f in active_flights
             if f["assigned_team"] is None and f["direction"] == "DEP"
             and (f["estimated_dt"] - self.sim_now).total_seconds() / 60 < 60],
            key=lambda f: f.get("risk_score", 0), reverse=True
        )
        recommendations = [
            algo.recommend_assignment(
                f, self.state["teams"], self.state["flights"],
                self.state["weather"], self.state["equipment"], self.sim_now)
            for f in unassigned_urgent[:3]
        ]

        # 6. IRROPS triggers
        irrops = algo.check_irrops_triggers(
            active_flights, self.state["weather"], cascades, eq_forecast,
            self.state["teams"])

        return {
            "sim_time":   self.sim_now.isoformat(),
            "sim_minute": self.sim_minute,
            "wall_time":  datetime.now().isoformat(),
            "weather":    self.state["weather"],
            "kpis":       self._compute_kpis(active_flights),
            "active_flights":    [self._flight_summary(f) for f in active_flights[:30]],
            "recommendations":   recommendations,
            "cascades":          cascades,
            "equipment_forecast": eq_forecast,
            "irrops":            irrops,
            "team_summary":      self._team_summary(),
            "depot_summary":     eq_forecast["depot_summary"],
            "event_log":         self.event_log[-10:],
            "teams":             [self._team_compact(t) for t in self.state["teams"]],
            "recovery_state":    self._recovery_state_summary(),
        }

    def _recovery_state_summary(self) -> dict:
        """
        Recovery orchestration state. Populated when an accepted recommendation
        is propagating through the operational model. Empty during normal surveillance.

        The UI reads this to render Active Recoveries panels and outcome metrics.
        In live simulation mode (non-demo), this is always the null state.
        Acceptance and propagation is driven by the UI demo patches.
        """
        return {
            "active_recoveries": [],
            "outcome": None,
        }

    def _flight_summary(self, f: dict) -> dict:
        """Compact flight representation for the JSON output."""
        return {
            "flight_id":            f["flight_id"],
            "carrier":              f["carrier"],
            "aircraft_type":        f["aircraft_type"],
            "direction":            f["direction"],
            "origin":               f["origin"],
            "destination":          f["destination"],
            "scheduled_time":       f["scheduled_time"],
            "estimated_time":       f["estimated_time"],
            "terminal":             f.get("terminal"),
            "gate":                 f["gate"],
            "gate_num":             f.get("gate_num"),
            "bag_count_forecast":   f["bag_count_forecast"],
            "pax_count":            f["pax_count"],
            "is_heavy_load":        f["is_heavy_load"],
            "has_hazmat":           f["has_hazmat"],
            "cargo_tonnes":         f["cargo_tonnes"],
            "crew_required":        f["crew_required"],
            "status":               f["status"],
            "delay_minutes":        f.get("delay_minutes", 0),
            "assigned_team":        f.get("assigned_team"),
            "risk_score":           f.get("risk_score"),
            "risk_tier":            f.get("risk_tier"),
            "risk_components":      f.get("risk_components"),
            "p_on_time":            f.get("p_on_time"),
            "p_delay":              f.get("p_delay"),
            "predicted_cause":      f.get("predicted_cause"),
            "delay_minute_estimate": f.get("delay_minute_estimate"),
            "delay_modules":        f.get("delay_modules"),
        }

    def _team_compact(self, team: dict) -> dict:
        """Compact team representation for the JSON output."""
        return {
            "team_id":              team["team_id"],
            "name":                 team["name"],
            "tier":                 team["tier"],
            "crew_size":            team["crew_size"],
            "certifications":       team["certifications"],
            "fatigue":              round(team["fatigue"], 1),
            "status":               team["status"],
            "current_assignment":   team["current_assignment"],
            "current_gate":         team["current_gate"],
            "duty_minutes_today":   team["duty_minutes_today"],
            "historical_turn_score": team["historical_turn_score"],
            "heavy_load_score":     team["heavy_load_score"],
            "chemistry_score":      team["chemistry_score"],
            "error_rate":           team["error_rate"],
            "tier_progress_pct":    team["tier_progress_pct"],
            "turns_logged":         team["turns_logged"],
        }

    def _compute_kpis(self, active_flights: list) -> dict:
        """Aggregate operational metrics across active flights."""
        if active_flights:
            avg_p_on_time = sum(f.get("p_on_time", 0) for f in active_flights) / len(active_flights)
        else:
            avg_p_on_time = 0

        at_risk  = sum(1 for f in active_flights if f.get("risk_tier") in ("watch", "critical"))
        critical = sum(1 for f in active_flights if f.get("risk_tier") == "critical")
        on_time  = sum(1 for f in active_flights if f.get("p_on_time", 0) >= 0.65)

        # cost exposure: expected delay minutes × $80/min (industry average)
        cost_exposure = sum(
            f.get("delay_minute_estimate", 0) * f.get("p_delay", 0)
            for f in active_flights
        ) * 80

        return {
            "active_flight_count":     len(active_flights),
            "on_time_count":           on_time,
            "at_risk_count":           at_risk,
            "critical_count":          critical,
            "otp_pct":                 round(avg_p_on_time * 100, 1),
            "delay_minutes_prevented": len(self.applied_disruptions) * 14,
            "cost_exposure_usd":       round(cost_exposure, 0),
        }

    def _team_summary(self) -> dict:
        teams = self.state["teams"]
        return {
            "total":       len(teams),
            "available":   sum(1 for t in teams
                               if t["status"] == "available" and t["current_assignment"] is None),
            "assigned":    sum(1 for t in teams if t["current_assignment"] is not None),
            "high_fatigue": sum(1 for t in teams if t["fatigue"] > C.FATIGUE_HARD_CAP),
            "unavailable": sum(1 for t in teams if t["status"] == "unavailable"),
        }

    # ------------------------------------------------------------------
    # EMIT + RUN LOOP
    # ------------------------------------------------------------------

    def emit_state(self, intel: dict):
        """Write the current intelligence snapshot to file atomically.

        Writes to a .tmp sibling first, then os.replace() — so the browser
        never reads a partially-written JSON file.
        """
        if self.emit_to_file:
            self.emit_to_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.emit_to_file.with_suffix('.tmp')
            tmp.write_text(json.dumps(intel, default=str, indent=2))
            os.replace(tmp, self.emit_to_file)  # atomic on POSIX and Windows

    def run_until(self, stop_minute: int = None, emit_every: int = None):
        """Run the simulator until stop_minute, emitting state every emit_every ticks."""
        if stop_minute is None:
            stop_minute = C.SIM_DAY_END_HOUR * 60
        if emit_every is None:
            emit_every = C.STATE_EMIT_INTERVAL_MIN

        if self.verbose:
            print(f"\n▷ RampIQ simulator starting · {self.sim_now.strftime('%a %b %d · %H:%M')}")
            print(f"  station: DFW · seed: {self.seed}")
            print(f"  scheduled flights: {len(self.state['flights'])}")
            print(f"  teams: {len(self.state['teams'])} · equipment: {len(self.state['equipment'])}")
            print(f"  pending disruptions: {len(self.pending_disruptions)}")
            print(f"  time scale: {self.time_scale}x · stop at minute {stop_minute}\n")

        last_emit = -1
        last_status_print = -1

        while self.sim_minute < stop_minute:
            self.tick()

            if self.sim_minute - last_emit >= emit_every:
                intel = self.compute_intelligence()
                self.emit_state(intel)
                last_emit = self.sim_minute

            if self.verbose and self.sim_minute - last_status_print >= 30:
                self._print_status()
                last_status_print = self.sim_minute

            if self.time_scale > 0:
                time.sleep(self.time_scale * 60 / 1000)

        if self.verbose:
            print(f"\n✓ simulation complete · {self.sim_now.strftime('%H:%M')}")
            print(f"  events triggered: {len(self.applied_disruptions)}")

    def _print_status(self):
        active = [f for f in self.state["flights"]
                  if f["status"] not in ("airborne", "completed")
                  and abs((f["estimated_dt"] - self.sim_now).total_seconds() / 60) < 60]
        critical = sum(1 for f in active if f.get("risk_tier") == "critical")
        teams_avail = sum(1 for t in self.state["teams"] if t["status"] == "available")
        print(f"  [{self.sim_now.strftime('%H:%M')}] active={len(active):3d} "
              f"critical={critical:2d} avail-teams={teams_avail:2d} "
              f"wx={self.state['weather']['condition']:12s} "
              f"events={len(self.applied_disruptions)}")
