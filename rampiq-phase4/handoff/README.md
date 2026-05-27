# RampIQ · Phase 4 Handoff

This is the working state of the RampIQ Phase 4 build, ready for handoff to Claude Code.

## What this is

A self-contained simulation environment that proves RampIQ's algorithms work, plus the documentation that locks scope before any integration discussion. Together these answer the question *"could this actually run?"*

There is no real backend, no real airline data, no integration with anyone's AODB. This is a credible simulation, not a production system. The point is to demonstrate that the logic is real and the integration map is honest — not to pretend the product is shipping.

## What's in the box

```
rampiq-phase4/
├── docs/
│   ├── 01-system-boundary.md        # 10-page scope lock document
│   ├── 01-system-boundary.pdf       # branded, print-ready
│   ├── 02-data-dependency-map.md    # 10-page integration map
│   ├── 02-data-dependency-map.pdf   # branded, print-ready
│   ├── style.css                    # PDF stylesheet (RampIQ design language)
│   └── build_pdfs.py                # markdown → branded PDF builder
│
├── sim/                             # the simulation environment
│   ├── __init__.py
│   ├── config.py                    # DFW constants, fleet mix, algorithm weights
│   ├── schedule.py                  # synthetic 600-flight DFW day
│   ├── crews.py                     # 22-team synthetic roster
│   ├── equipment.py                 # ~130-unit GSE fleet across 3 depots
│   ├── weather.py                   # baseline weather + convective triggers
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
    └── CLAUDE-CODE-PROMPTS.md       # exact prompts to paste into Claude Code
```

## Quick start

You need Python 3.9+ and `weasyprint` (for the PDF builder; not needed to run the simulator).

```bash
# from the rampiq-phase4 directory:

# 1. produce a one-shot snapshot of mid-IRROPS state
python3 -m sim.runner --snapshot

# 2. run the full operating day at high speed
python3 -m sim.runner --fast

# 3. run the live demo
#    (in one terminal) start the simulator emitting every minute:
python3 -m sim.runner --fast
#    (in another terminal) serve the static files:
python3 -m http.server 8000
#    then open http://localhost:8000/demo/rampiq-live-demo.html
```

The demo polls `sim/output/state.json` every 3 seconds. As the simulator advances, the UI animates.

## What the algorithms do

Five algorithms produce six classes of operational intelligence:

1. **`compute_flight_risk`** — 0-100 difficulty score per turnaround. Inputs: bag count, turn pressure, pax load, cargo, equipment availability, upstream cascade. Multiplicative penalties: cert gap, weather, adjacency. Tiered `stable | watch | critical`.
2. **`compute_team_suitability`** — per-team-per-flight 0-100 fit score. Stage A hard filters (certifications, fatigue, current assignment); Stage B weighted score (historical turn, heavy-load proficiency, proximity, fatigue inverse, chemistry, error inverse).
3. **`predict_delay`** — independent failure model. P(on-time) = product of (1 − module_risk) across crew, equipment, bag, upstream, environmental. Identifies single largest contributor and estimates slip in minutes.
4. **`recommend_assignment`** — top-N candidate teams for a flight. RecoScore = 0.60×Suitability + 0.30×GlobalImpact + 0.10×OperationalCost. Confidence from gap between #1 and #2.
5. **`forecast_equipment`** — 90-minute forward shortage projection, bucketed at 15-min intervals, per (depot, equipment-type) pair.

Plus two supporting layers:

- **`detect_cascades`** — chains origin delay through gate-occupancy, adjacency, bagroom congestion, and crew legality
- **`check_irrops_triggers`** — auto-evaluation of 5 IRROPS conditions for mode escalation

All algorithm tuning weights live in `sim/config.py` so iteration is fast — change a weight, re-run snapshot, see the delta.

## What this does NOT do

- It does not connect to real airline systems
- It does not predict actual delays for real flights
- The synthetic data is realistic-looking but is generated, not historical
- Algorithm weights are reasonable starting points, not validated against operational outcomes
- The cascade chains, while plausible, are heuristic rather than learned from data

If a buyer asks "is this trained on real ops data?" the honest answer is *not yet — this is the simulation environment that demonstrates the logic is sound; the next phase is integration with a pilot station's data feed.*

## Where to take this next

Three paths, each viable, in roughly increasing investment order:

1. **Tighten the demo loop.** Add the desktop-v2 visual layer over the wired demo (it currently renders a clean console; the original visual mockup has more design polish). Add a "scrub through the day" timeline control so the demo doesn't depend on real-time playback. Record a 60x time-lapse video for pitch use.

2. **Stress-test the algorithms.** Run 100 simulated days with different disruption patterns and produce a statistical profile: distribution of OTP forecasts, cascade chain lengths, recommendation confidence levels. This is the data that makes a pilot pitch credible — not "here's what RampIQ does" but "here's how it behaves across a thousand scenarios."

3. **Begin one real integration.** Pick the easiest available data feed (probably FlightAware Firehose for arrival/departure times at a single station) and wire it as an input alongside the synthetic generator. This is the "this could actually run" proof that converts a buyer.

Path 1 is the right next step. See `CLAUDE-CODE-PROMPTS.md` for ready-to-paste prompts.
