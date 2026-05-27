"""
Time-stepping simulator.

Advances simulation 1 minute per tick. At each tick:
  - applies any scheduled disruptions
  - updates flight/crew/equipment state
  - runs the 5 RampIQ algorithms across all in-window flights
  - detects cascades and IRROPS triggers
  - emits a JSON state snapshot
"""
import json
import random
import time
from datetime import datetime, timedelta
from pathlib import Path

from . import config as C
from . import schedule
from . import crews
from . import equipment
from . import weather as wx
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

        self.day_date = day_date
        self.seed = seed
        self.time_scale = time_scale
        self.emit_to_file = Path(emit_to_file) if emit_to_file else None
        self.verbose = verbose

        # initialize state
        self.state = self._initialize_state()
        self.sim_minute = C.SIM_DAY_START_HOUR * 60  # start at 5:00 AM
        self.sim_now = self._sim_minute_to_datetime(self.sim_minute)

        # disruption schedule — make a mutable copy
        self.pending_disruptions = list(disruptor.DEMO_DAY_DISRUPTIONS)
        self.applied_disruptions = []

        # event log
        self.event_log = []

    def _initialize_state(self) -> dict:
        state = {
            "flights":   schedule.generate_flight_schedule(self.day_date, self.seed),
            "teams":     crews.generate_teams(self.seed),
            "equipment": equipment.generate_equipment(self.seed),
            "weather":   wx.initial_weather(),
        }
        return state

    def _auto_assign_runtime(self):
        """
        Each tick, ensure DEP flights within the next 90 minutes have a team assigned
        (representing real-world pre-staging by ramp leadership).

        Releases teams whose flight has departed or is far in the future,
        then assigns available teams to upcoming DEP flights by suitability.
        """
        # 1. Release teams whose assignment is past/airborne or far future, or who became unavailable
        for team in self.state["teams"]:
            if team["current_assignment"] is None:
                continue
            if team["status"] == "unavailable":
                # release on callout
                for f in self.state["flights"]:
                    if f["flight_id"] == team["current_assignment"]:
                        f["assigned_team"] = None
                        break
                team["current_assignment"] = None
                continue
            # find the flight
            for f in self.state["flights"]:
                if f["flight_id"] == team["current_assignment"]:
                    minutes_to_dep = (f["estimated_dt"] - self.sim_now).total_seconds() / 60
                    flight_done = f["status"] in ("airborne", "completed")
                    if flight_done or minutes_to_dep < -8 or minutes_to_dep > 100:
                        # released
                        f["assigned_team"] = None
                        team["current_assignment"] = None
                        # team rests slightly
                        team["fatigue"] = max(15, team["fatigue"] - 5)
                    break

        # 2. Find DEP flights in the upcoming-90-min window without a team
        upcoming_unassigned = []
        for f in self.state["flights"]:
            if f["direction"] != "DEP":
                continue
            if f["assigned_team"] is not None:
                continue
            if f["status"] in ("airborne", "completed"):
                continue
            minutes_to_dep = (f["estimated_dt"] - self.sim_now).total_seconds() / 60
            if 0 <= minutes_to_dep <= 90:
                upcoming_unassigned.append((minutes_to_dep, f))

        # sort by urgency (closest to dep first)
        upcoming_unassigned.sort(key=lambda x: x[0])

        # 3. Assign best-suited available team to each
        for minutes_to_dep, f in upcoming_unassigned:
            best = None
            best_score = -1
            for team in self.state["teams"]:
                if team["current_assignment"] is not None:
                    continue
                if team["status"] != "available":
                    continue
                suit = algo.compute_team_suitability(team, f)
                if not suit["eligible"]:
                    continue
                if suit["score"] > best_score:
                    best_score = suit["score"]
                    best = team
            if best:
                best["current_assignment"] = f["flight_id"]
                f["assigned_team"] = best["team_id"]
                best["current_gate"] = f["gate"]
            # if no team available, leave unassigned — RampIQ will surface a recommendation

    def _auto_assign_baseline_equipment(self, state: dict):
        """
        At init, set some equipment to in_use against active assignments so
        the depot summary shows realistic state (~32% in-use baseline).
        """
        target_in_use = int(len(state["equipment"]) * 0.32)
        in_use_count = sum(1 for u in state["equipment"] if u["state"] == "in_use")
        if in_use_count >= target_in_use:
            return
        avail = [u for u in state["equipment"] if u["state"] == "available"]
        random.shuffle(avail)
        for u in avail[:target_in_use - in_use_count]:
            u["state"] = "in_use"

    def _sim_minute_to_datetime(self, minute: int) -> datetime:
        return self.day_date + timedelta(minutes=minute)

    # ---------------------------------------------------------
    # CORE TICK
    # ---------------------------------------------------------

    def tick(self):
        """Advance the simulation by 1 minute."""
        self.sim_minute += 1
        self.sim_now = self._sim_minute_to_datetime(self.sim_minute)

        # 1. weather
        wx.step_weather(self.state["weather"], self.sim_minute)

        # 2. disruptions
        self._apply_due_disruptions()

        # 3. flight progression
        self._update_flight_states()

        # 4. crew progression
        self._update_crew_states()

        # 5. equipment progression
        self._update_equipment_states()

        # 6. auto-assign teams to upcoming flights (real-world pre-staging)
        self._auto_assign_runtime()

    def _apply_due_disruptions(self):
        still_pending = []
        for offset, kind, params in self.pending_disruptions:
            day_minute = self.sim_minute - C.SIM_DAY_START_HOUR * 60
            if day_minute >= offset:
                desc = disruptor.apply_disruption(self.state, kind, params, self.sim_now)
                if desc:
                    self.applied_disruptions.append({
                        "sim_minute": self.sim_minute,
                        "sim_time": self.sim_now.isoformat(),
                        "kind": kind,
                        "description": desc,
                    })
                    self.event_log.append(f"[{self.sim_now.strftime('%H:%M')}] {desc}")
                    if self.verbose:
                        print(f"⚡ [{self.sim_now.strftime('%H:%M')}] {desc}")
            else:
                still_pending.append((offset, kind, params))
        self.pending_disruptions = still_pending

    def _update_flight_states(self):
        """Advance flight states based on time. Materialize delays based on
        live risk modules, with stronger pressure during active disruption windows."""

        # Are we in a "disruption window"? (any disruption fired in the past 60 sim min)
        disruption_active = False
        for d in self.applied_disruptions:
            if self.sim_minute - d["sim_minute"] < 60:
                disruption_active = True
                break
        # Or: convective threat in flight
        if self.state["weather"].get("convective_threat") or self.state["weather"].get("ground_stop_active"):
            disruption_active = True

        for f in self.state["flights"]:
            minutes_to_dep = (f["estimated_dt"] - self.sim_now).total_seconds() / 60

            if f["status"] == "scheduled":
                if minutes_to_dep <= f["turn_min_planned"] and f["direction"] == "DEP":
                    f["status"] = "boarding"
                elif minutes_to_dep < 0 and f["direction"] == "DEP":
                    f["status"] = "delayed"
                    f["delay_minutes"] = max(f["delay_minutes"], int(-minutes_to_dep))

            elif f["status"] == "boarding":
                # consider slipping if we're close to pushback and conditions are bad
                if 0 < minutes_to_dep <= 12 and f["direction"] == "DEP" and f["delay_minutes"] == 0:
                    self._maybe_materialize_delay(f, disruption_active)
                    if f["status"] == "delayed":
                        continue
                if minutes_to_dep <= 5 and minutes_to_dep > 0:
                    f["status"] = "pushback"
                elif minutes_to_dep < 0:
                    f["status"] = "delayed"
                    f["delay_minutes"] = max(f["delay_minutes"], int(-minutes_to_dep))

            elif f["status"] == "pushback":
                if minutes_to_dep <= -2:
                    f["status"] = "airborne"
                    f["actual_dep_time"] = self.sim_now.isoformat()

            elif f["status"] == "delayed":
                # if assignment exists and equipment is good, recover
                if f["assigned_team"] is not None and minutes_to_dep > -10:
                    if random.random() < 0.05:
                        f["status"] = "boarding"

    def _maybe_materialize_delay(self, flight: dict, disruption_active: bool):
        """
        Decide whether to slip the schedule for a flight in 'boarding' status.

        Uses live delay prediction. During active disruption windows, the
        materialization probability is higher and the slip magnitude grows.
        """
        # compute fresh delay prediction
        d = algo.predict_delay(
            flight, self.state["weather"], self.state["equipment"],
            self.state["flights"], self.sim_now
        )
        p_delay = d["p_delay"]
        delay_estimate = d["minute_estimate"]
        cause = d["predicted_cause"]

        # base materialization probability — random gate at ~p_delay scaled
        # During disruption: gate is much more permissive
        if disruption_active:
            slip_prob = min(0.35, p_delay * 0.6)
            slip_floor_min = 5
            slip_factor = 0.9 + random.random() * 0.7  # 0.9-1.6x
        else:
            slip_prob = min(0.10, p_delay * 0.18)
            slip_floor_min = 6
            slip_factor = 0.6 + random.random() * 0.5  # 0.6-1.1x

        if random.random() > slip_prob:
            return

        actual = int(max(slip_floor_min, delay_estimate * slip_factor))
        if actual < slip_floor_min:
            return

        flight["delay_minutes"] = actual
        flight["estimated_dt"] = flight["estimated_dt"] + timedelta(minutes=actual)
        flight["estimated_time"] = flight["estimated_dt"].isoformat()
        flight["status"] = "delayed"
        flight["predicted_cause"] = cause
        self.event_log.append(
            f"[{self.sim_now.strftime('%H:%M')}] "
            f"{flight['flight_id']} +{actual}min · {cause}")

    def _update_crew_states(self):
        """Update fatigue, duty time, and progress."""
        for team in self.state["teams"]:
            if team["current_assignment"] is not None:
                # accumulate duty time
                team["duty_minutes_today"] += 1
                # fatigue accumulates slowly during normal duty
                # peak during heavy/wide-body work (set elsewhere)
                team["fatigue"] = min(100, team["fatigue"] + 0.025)
            else:
                # available teams recover slowly
                team["fatigue"] = max(15, team["fatigue"] - 0.05)

    def _update_equipment_states(self):
        """Advance equipment between states. Includes lifecycle tied to flights."""
        # First, tie equipment to active flights — a "boarding" or "pushback" DEP
        # should have equipment claimed against it. After "airborne", equipment returns.

        # 1. Free equipment whose flight has departed
        for u in self.state["equipment"]:
            if u["state"] == "in_use" and u.get("assigned_flight"):
                # find the flight
                for f in self.state["flights"]:
                    if f["flight_id"] == u["assigned_flight"]:
                        if f["status"] in ("airborne", "completed"):
                            u["state"] = "available"
                            u["assigned_flight"] = None
                            u["current_gate"] = None
                            u["idle_minutes"] = 0
                        break

        # 2. Claim equipment for newly-boarding flights
        for f in self.state["flights"]:
            if f["status"] not in ("boarding", "pushback"):
                continue
            if f["direction"] != "DEP":
                continue
            terminal = f.get("terminal", "C")
            depot = {"A": "DEPOT-01", "B": "DEPOT-01", "C": "DEPOT-02",
                     "D": "DEPOT-03", "E": "DEPOT-03"}.get(terminal, "DEPOT-02")

            for equip_type, required in f["equipment_required"].items():
                if required <= 0:
                    continue
                # how many are already claimed for this flight?
                already = sum(1 for u in self.state["equipment"]
                              if u.get("assigned_flight") == f["flight_id"]
                              and u["type"] == equip_type)
                need = required - already
                if need <= 0:
                    continue
                # claim from same depot first, then nearest
                pool = [u for u in self.state["equipment"]
                        if u["type"] == equip_type
                        and u["state"] == "available"
                        and u["current_depot"] == depot]
                if len(pool) < need:
                    # cross-depot fallback
                    pool += [u for u in self.state["equipment"]
                             if u["type"] == equip_type
                             and u["state"] == "available"
                             and u["current_depot"] != depot
                             and not any(u2["unit_id"]==u["unit_id"] for u2 in pool)]
                for u in pool[:need]:
                    u["state"] = "in_use"
                    u["assigned_flight"] = f["flight_id"]
                    u["current_gate"] = f["gate"]

        # 3. Standard transit/idle progression
        for u in self.state["equipment"]:
            if u["state"] == "in_motion":
                u["transit_minutes_remaining"] = max(0, u["transit_minutes_remaining"] - 1)
                if u["transit_minutes_remaining"] <= 0:
                    u["state"] = "in_use" if u["assigned_flight"] else "available"
                    if u["destination_gate"]:
                        u["current_gate"] = u["destination_gate"]
                    u["destination_gate"] = None

            if u["state"] == "in_use":
                u["service_hours"] = round(u["service_hours"] + (1/60), 2)

            if u["state"] in ("available", "idle"):
                u["idle_minutes"] += 1
                # we don't auto-transition idle anymore — idle is a soft alert,
                # surfaced when idle_minutes > 30 but the unit remains available
            else:
                u["idle_minutes"] = 0

    # ---------------------------------------------------------
    # ALGORITHM RUN — produces RampIQ intelligence output
    # ---------------------------------------------------------

    def compute_intelligence(self) -> dict:
        """Run all 5 algorithms across the current state and return a snapshot."""
        active_flights = [
            f for f in self.state["flights"]
            if f["status"] not in ("airborne", "completed")
            and abs((f["estimated_dt"] - self.sim_now).total_seconds() / 60) < 180
        ]

        # 1. Risk scores
        for f in active_flights:
            r = algo.compute_flight_risk(
                f, self.state["weather"], self.state["equipment"],
                self.state["flights"], self.sim_now
            )
            f["risk_score"] = r["score"]
            f["risk_tier"] = r["tier"]
            f["risk_components"] = r["components"]
            f["risk_penalties"] = r["penalties_applied"]

        # 2. Delay predictions
        for f in active_flights:
            d = algo.predict_delay(
                f, self.state["weather"], self.state["equipment"],
                self.state["flights"], self.sim_now
            )
            f["p_on_time"] = d["p_on_time"]
            f["p_delay"] = d["p_delay"]
            f["predicted_cause"] = d["predicted_cause"]
            f["delay_minute_estimate"] = d["minute_estimate"]
            f["delay_modules"] = d["modules"]

        # Sort active flights by operational priority for output:
        #   1. DEP flights closer to departure first (ramp lead's primary view)
        #   2. then ARR flights closest to arrival
        def sort_key(f):
            minutes_to_event = (f["estimated_dt"] - self.sim_now).total_seconds() / 60
            # priority bucket: DEP coming up = 0, ARR coming up = 1, past events = 2
            if f["direction"] == "DEP" and minutes_to_event >= -10:
                return (0, abs(minutes_to_event))
            elif f["direction"] == "ARR" and minutes_to_event >= -10:
                return (1, abs(minutes_to_event))
            else:
                return (2, abs(minutes_to_event))
        active_flights.sort(key=sort_key)

        # 3. Cascades
        cascades = algo.detect_cascades(self.state["flights"], self.sim_now)

        # 4. Equipment forecast
        eq_forecast = algo.forecast_equipment(
            self.state["equipment"], self.state["flights"], self.sim_now
        )

        # 5. Top assignment recommendations — pick 3 highest-risk unassigned flights
        unassigned = [f for f in active_flights
                      if f["assigned_team"] is None
                      and f["direction"] == "DEP"
                      and (f["estimated_dt"] - self.sim_now).total_seconds() / 60 < 60]
        unassigned.sort(key=lambda f: f.get("risk_score", 0), reverse=True)
        top_recos = []
        for f in unassigned[:3]:
            r = algo.recommend_assignment(
                f, self.state["teams"], self.state["flights"],
                self.state["weather"], self.state["equipment"], self.sim_now
            )
            top_recos.append(r)

        # 6. IRROPS triggers
        irrops = algo.check_irrops_triggers(
            active_flights, self.state["weather"], cascades, eq_forecast,
            self.state["teams"]
        )

        return {
            "sim_time": self.sim_now.isoformat(),
            "sim_minute": self.sim_minute,
            "wall_time": datetime.now().isoformat(),

            # operational state
            "weather": self.state["weather"],

            # KPIs
            "kpis": self._compute_kpis(active_flights),

            # active flights with all algorithm outputs attached
            "active_flights": [self._flight_summary(f) for f in active_flights[:30]],

            # cascades
            "cascades": cascades,

            # equipment forecast
            "equipment_forecast": eq_forecast,

            # assignment recommendations
            "recommendations": top_recos,

            # IRROPS state
            "irrops": irrops,

            # team state summary
            "team_summary": self._team_summary(),

            # depot summary
            "depot_summary": eq_forecast["depot_summary"],

            # event log (most recent 10)
            "event_log": self.event_log[-10:],
        }

    def _flight_summary(self, f: dict) -> dict:
        """Compact flight representation for output JSON."""
        return {
            "flight_id": f["flight_id"],
            "carrier": f["carrier"],
            "aircraft_type": f["aircraft_type"],
            "direction": f["direction"],
            "origin": f["origin"],
            "destination": f["destination"],
            "scheduled_time": f["scheduled_time"],
            "estimated_time": f["estimated_time"],
            "terminal": f.get("terminal"),
            "gate": f["gate"],
            "bag_count_forecast": f["bag_count_forecast"],
            "pax_count": f["pax_count"],
            "is_heavy_load": f["is_heavy_load"],
            "has_hazmat": f["has_hazmat"],
            "cargo_tonnes": f["cargo_tonnes"],
            "status": f["status"],
            "delay_minutes": f.get("delay_minutes", 0),
            "assigned_team": f.get("assigned_team"),
            "risk_score": f.get("risk_score"),
            "risk_tier": f.get("risk_tier"),
            "p_on_time": f.get("p_on_time"),
            "p_delay": f.get("p_delay"),
            "predicted_cause": f.get("predicted_cause"),
            "delay_minute_estimate": f.get("delay_minute_estimate"),
        }

    def _compute_kpis(self, active_flights: list) -> dict:
        """Aggregate metrics across active flights."""
        # OTP forecast = the expected on-time rate, computed as the mean p_on_time
        # across active flights. This matches how airlines report "expected OTP" in ops.
        if active_flights:
            avg_p_on_time = sum(f.get("p_on_time", 0) for f in active_flights) / len(active_flights)
        else:
            avg_p_on_time = 0
        otp_pct = round(avg_p_on_time * 100, 1)

        # at-risk = watch + critical
        at_risk = sum(1 for f in active_flights
                      if f.get("risk_tier") in ("watch", "critical"))
        critical = sum(1 for f in active_flights if f.get("risk_tier") == "critical")

        delay_avoided = len(self.applied_disruptions) * 14  # rough estimate

        # cost exposure: expected delay minutes × $80/min
        total_expected_delay_min = sum(
            f.get("delay_minute_estimate", 0) * f.get("p_delay", 0)
            for f in active_flights
        )
        cost_exposure = total_expected_delay_min * 80

        # on-time count (using practical 0.65 threshold for "likely on-time")
        on_time = sum(1 for f in active_flights if f.get("p_on_time", 0) >= 0.65)

        return {
            "active_flight_count": len(active_flights),
            "on_time_count": on_time,
            "at_risk_count": at_risk,
            "critical_count": critical,
            "otp_pct": otp_pct,
            "delay_minutes_prevented": delay_avoided,
            "cost_exposure_usd": round(cost_exposure, 0),
        }

    def _team_summary(self) -> dict:
        teams = self.state["teams"]
        return {
            "total": len(teams),
            "available": sum(1 for t in teams
                             if t["status"] == "available" and t["current_assignment"] is None),
            "assigned": sum(1 for t in teams if t["current_assignment"] is not None),
            "high_fatigue": sum(1 for t in teams if t["fatigue"] > C.FATIGUE_HARD_CAP),
            "unavailable": sum(1 for t in teams if t["status"] == "unavailable"),
        }

    # ---------------------------------------------------------
    # RUN LOOP
    # ---------------------------------------------------------

    def emit_state(self, intel: dict):
        """Write current state to file (latest snapshot)."""
        if self.emit_to_file:
            self.emit_to_file.parent.mkdir(parents=True, exist_ok=True)
            self.emit_to_file.write_text(json.dumps(intel, default=str, indent=2))

    def run_until(self, stop_minute: int = None, emit_every: int = None):
        """
        Run the simulator until stop_minute (default: end of operating day).
        emit_every: emit a state snapshot every N simulated minutes.
        """
        if stop_minute is None:
            stop_minute = C.SIM_DAY_END_HOUR * 60
        if emit_every is None:
            emit_every = C.STATE_EMIT_INTERVAL_MIN

        if self.verbose:
            print(f"\n▷ RampIQ simulator starting · {self.sim_now.strftime('%a %b %d · %H:%M')}")
            print(f"  station: DFW · scenario seed: {self.seed}")
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
                time.sleep(self.time_scale * 60 / 1000)  # ms scale for speed

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
