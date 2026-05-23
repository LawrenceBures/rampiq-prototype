# RampIQ · Architecture

How the simulation modules fit together, and how to extend the system without breaking it.

## Module dependency graph

```
                         config.py
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   models.py        data_generator.py      algorithms.py
   (type hints)    (schedule/crew/         (pure functions)
                   equipment/weather)
                            │                   │
                            └─────────┬─────────┘
                                      │
                                 simulator.py ──── disruptor.py
                                      │
                                  runner.py
                                      │
                                      ▼
                              sim/output/state.json
                                      │
                                      ▼
                        demo/rampiq-live-demo.html
```

`config.py` is the only module everyone imports from. It holds the airport spec, fleet mix, algorithm weights, and simulation parameters. Tuning the system means editing `config.py` and re-running.

`models.py` contains TypedDict definitions that document the expected shape of each domain object. The simulator uses plain dicts for performance; the type hints are for IDE support and documentation.

`data_generator.py` is a single module that replaces the four separate generator modules (schedule, crews, equipment, weather) from earlier phases. All synthetic data generation is in one place.

`algorithms.py` is pure functions — no state, no I/O. Every algorithm takes inputs, returns a result. Individually testable and individually replaceable.

`simulator.py` is the only stateful module. It owns `self.state` (flights, teams, equipment, weather) and advances it one minute at a time. The simulator calls the algorithms during `compute_intelligence()` to produce the JSON snapshot.

## State shape

`self.state` is a dict with four top-level keys:

```python
state = {
    "flights":   [ ...600 flight dicts... ],
    "teams":     [ ...22 team dicts... ],
    "equipment": [ ...~130 unit dicts... ],
    "weather":   { ...weather dict... },
}
```

Each flight, team, and unit is mutable — fields like `assigned_team`, `delay_minutes`, `fatigue`, and `state` are updated in place as the simulation advances. The `compute_intelligence` pass attaches additional fields to flights (`risk_score`, `p_on_time`, `predicted_cause`, etc.) — recomputed each emit, always derived from current state.

## The tick

One simulator tick (= 1 simulated minute) does:

1. **Step weather.** `data_generator.step_weather()` ages the convective threat clock, adjusts wind.
2. **Apply due disruptions.** Any disruption whose offset has been reached is applied via `disruptor.apply_disruption()`.
3. **Update flight states.** Flights transition `scheduled → boarding → pushback → airborne`. Delays are materialized for flights with poor `p_on_time` near pushback.
4. **Update crew states.** Fatigue accumulates during assignment, recovers when available.
5. **Update equipment states.** Units transition `available → in_use` when claimed by a boarding flight, return to `available` when the flight goes airborne.
6. **Auto-assign teams.** Any DEP flight in the next 90 min without a team gets the best-suited available team. Teams whose flight has departed are released.

The expensive work — running the 5 algorithms across all active flights — happens only on `compute_intelligence()` calls, not every tick.

## How to extend

### Add a new aircraft type

Edit `config.py::AIRCRAFT_TYPES`. Add the type with bag/pax/turn/crew/equipment specs. Add it to `FLEET_MIX` with a probability weight. Done.

### Add a new certification

Edit `config.py::CERTIFICATIONS` (add the cert name). Edit `CERT_BY_TIER` to specify which tiers hold it. Edit `compute_team_suitability` in `algorithms.py` to add the certification-required logic in Stage A.

### Add a new disruption type

Edit `disruptor.py`. Add a new `kind` to the `apply_disruption` function. Add a tuple to `DEMO_DAY_DISRUPTIONS` to fire it during the demo day.

### Tune algorithm weights

All weights live in `config.py`:

- `RISK_WEIGHTS` — 6 components of flight risk (must sum to 1.0)
- `RISK_PENALTIES` — multiplicative penalties (cert gap, weather, adjacency)
- `SUITABILITY_WEIGHTS` — 6 components of team suitability (must sum to 1.0)
- `RECO_WEIGHTS` — 3 components of assignment recommendation (must sum to 1.0)
- `DELAY_BASE_RISK` — baseline failure probability per module

Change a weight, run `python3 -m sim.runner --snapshot`, observe the delta.

### Add a new algorithm

Add a pure function to `algorithms.py`. Wire it into `simulator.py::compute_intelligence()`. Surface it in the JSON output and in `demo/rampiq-live-demo.html`. Update `runner.py::_print_snapshot_summary()` for CLI visibility.

### Replace synthetic data with real data

The data_generator module functions return lists of dicts with a defined shape. As long as a real-data ingester returns the same shape, it's a drop-in replacement.

The cleanest path: add a new module `sim/ingester.py` that reads from a real source (FlightAware, AODB CSV export, whatever) and produces flights/teams/equipment in the expected shape. Then in `simulator.py::_initialize_state`, swap `dg.generate_flight_schedule(...)` for `ingester.load_flights(...)`.

## Tuning workflow

```bash
# 1. edit config.py — change a weight
$EDITOR sim/config.py

# 2. snapshot and check the numbers
python3 -m sim.runner --snapshot | tail -20

# 3. inspect the full state
python3 -c "import json; s=json.load(open('sim/output/state.json')); print(s['kpis'])"

# 4. iterate
```

For a more thorough check, run `--fast` to simulate the full day:

```bash
python3 -m sim.runner --fast
```

This takes ~30 seconds wall-clock for a full operating day and prints status every 30 simulated minutes.

## Design constraints worth respecting

- **Algorithms are pure functions.** No side effects. The simulator can call them at any moment without coordination.
- **Equipment lifecycle is tied to flight status.** When a flight goes `boarding`, equipment is claimed. When it goes `airborne`, it returns. This produces realistic depot pressure without explicit dispatch logic.
- **Auto-assignment runs every tick.** As time advances, teams get reassigned naturally from the rolling 90-minute window. There is no pre-computed schedule — it emerges.
- **The state file is the contract.** The demo only knows what's in `state.json`. If you add a field, update both the simulator emit and the demo render.

## What's not yet built

In rough priority order:

- **Cross-day persistence.** The simulator forgets everything when it stops.
- **Multi-station coordination.** Single station only.
- **Operator override capture.** The system surfaces recommendations but doesn't model what happens when a human overrides one.
- **Worker-side mobile app data.** The 22-team roster doesn't yet emit per-agent operational competency data for the crew-side UI.
- **Recovery simulation.** The IRROPS auto-trigger fires correctly but the recovery simulation isn't yet wired to algorithm output.
- **Timeline scrub control.** The demo depends on real-time playback; a scrub-bar would make it more demo-friendly.
