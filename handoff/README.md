# RampIQ · Phase 4

A self-contained simulation environment that proves RampIQ's algorithms work, plus the documentation that locks scope before any integration discussion.

There is no real backend, no real airline data, no integration with anyone's AODB. This is a credible simulation — not a production system. The point is to demonstrate that the logic is real and the integration map is honest.

## What's in the box

```
rampiq-phase4/
├── docs/
│   ├── 01-system-boundary.md        # 10-page scope lock document
│   └── 02-data-dependency-map.md    # 10-page integration map
│
├── sim/                             # the simulation environment
│   ├── __init__.py
│   ├── config.py                    # DFW constants, fleet mix, algorithm weights
│   ├── models.py                    # typed data model definitions
│   ├── data_generator.py            # synthetic schedule, crews, equipment, weather
│   ├── algorithms.py                # the 5 RampIQ algorithms
│   ├── disruptor.py                 # programmable disruption injector
│   ├── simulator.py                 # time-stepping engine
│   ├── runner.py                    # CLI entry point
│   └── output/
│       └── state.json               # latest emitted state
│
├── demo/
│   └── rampiq-live-demo.html        # wired demo — fetches state.json, auto-refreshes
│
└── handoff/
    ├── README.md                    # this file
    ├── ARCHITECTURE.md              # how the modules fit together
    └── TUNING_LOG.md                # algorithm weight change history
```

## Quick start

Python 3.9+ required. No third-party packages.

```bash
# from the rampiq-phase4 directory:

# 1. produce a one-shot snapshot of mid-IRROPS state (14:42)
python3 -m sim.runner --snapshot

# 2. run the full operating day at high speed (~30 sec wall-clock)
python3 -m sim.runner --fast

# 3. run the live demo
#    terminal 1 — run simulator, emitting state every simulated minute:
python3 -m sim.runner --fast
#    terminal 2 — serve static files:
python3 -m http.server 8000
#    then open: http://localhost:8000/demo/rampiq-live-demo.html
```

The demo polls `sim/output/state.json` every 3 seconds. As the simulator advances, the UI animates.

## What the algorithms do

Five algorithms produce six classes of operational intelligence:

1. **`compute_flight_risk`** — 0-100 difficulty score per turnaround. Inputs: bag count, turn pressure, pax load, cargo, equipment availability, upstream cascade. Multiplicative penalties: cert gap, weather, adjacency. Tiered `stable | watch | critical`.

2. **`compute_team_suitability`** — per-team-per-flight 0-100 fit score. Stage A hard filters (certifications, fatigue, current assignment); Stage B weighted score (historical turn 30%, heavy-load 25%, proximity 15%, fatigue inverse 15%, chemistry 10%, error inverse 5%).

3. **`predict_delay`** — independent failure model. P(on-time) = product of (1 − module_risk) across crew, equipment, bag, upstream, environmental. Identifies single largest contributor and estimates slip in minutes.

4. **`recommend_assignment`** — top-N candidate teams for a flight. RecoScore = 0.60×Suitability + 0.30×GlobalImpact + 0.10×OperationalCost. Confidence from gap between #1 and #2.

5. **`forecast_equipment`** — 90-minute forward shortage projection, bucketed at 15-min intervals, per (depot, equipment-type) pair.

Plus two supporting layers:
- **`detect_cascades`** — chains origin delay through gate-occupancy, adjacency, bagroom congestion, and crew legality
- **`check_irrops_triggers`** — auto-evaluation of 5 IRROPS conditions for mode escalation

All algorithm tuning weights live in `sim/config.py`. Change a weight, re-run `--snapshot`, see the delta.

## What this does NOT do

- It does not connect to real airline systems.
- It does not predict actual delays for real flights.
- The synthetic data is realistic-looking but generated, not historical.
- Algorithm weights are reasonable starting points, not validated against operational outcomes.
- Cascade chains, while plausible, are heuristic rather than learned from data.

If a buyer asks "is this trained on real ops data?" the honest answer is *not yet — this is the simulation environment that demonstrates the logic is sound; the next phase is integration with a pilot station's data feed.*

## Where to take this next

Three paths, in roughly increasing investment order:

1. **Tighten the demo loop.** Add a "scrub through the day" timeline control. Record a 60x time-lapse video for pitch use.

2. **Stress-test the algorithms.** Run 100 simulated days with different disruption patterns and produce a statistical profile: distribution of OTP forecasts, cascade chain lengths, recommendation confidence levels.

3. **Begin one real integration.** Pick the easiest available data feed (probably FlightAware Firehose for arrival/departure times at a single station) and wire it alongside the synthetic generator.

Path 1 is the right next step.
