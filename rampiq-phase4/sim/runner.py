"""
RampIQ simulator CLI runner.

Usage:
    python -m sim.runner                       # run full day, emit state every minute
    python -m sim.runner --fast                # 200x speed
    python -m sim.runner --snapshot            # produce one snapshot at 14:42
    python -m sim.runner --start 870 --stop 900  # run a specific window only
    python -m sim.runner --output /path/to/state.json
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from .simulator import RampIQSimulator
from . import config as C


def parse_args():
    p = argparse.ArgumentParser(description="RampIQ simulator")
    p.add_argument("--seed", type=int, default=C.DEFAULT_SEED,
                   help="Random seed for reproducibility")
    p.add_argument("--start", type=int, default=None,
                   help="Start minute of day (e.g. 300 for 05:00)")
    p.add_argument("--stop", type=int, default=None,
                   help="Stop minute of day (e.g. 1380 for 23:00)")
    p.add_argument("--fast", action="store_true",
                   help="Run at 200x speed")
    p.add_argument("--instant", action="store_true",
                   help="Run as fast as possible (no sleep)")
    p.add_argument("--snapshot", action="store_true",
                   help="Run to 14:42 (default sim demo time) and produce one snapshot")
    p.add_argument("--quiet", action="store_true", help="Suppress status prints")
    p.add_argument("--output", type=Path, default=None,
                   help="Path to write live state JSON")
    return p.parse_args()


def main():
    args = parse_args()

    # determine output path
    if args.output is None:
        out_dir = Path(__file__).parent / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = out_dir / "state.json"
    else:
        output_path = args.output

    # determine time scale
    if args.instant:
        time_scale = 0
    elif args.fast:
        time_scale = 0.005
    elif args.snapshot:
        time_scale = 0
    else:
        time_scale = C.DEFAULT_TIME_SCALE

    # build simulator
    sim = RampIQSimulator(
        seed=args.seed,
        time_scale=time_scale,
        emit_to_file=output_path,
        verbose=not args.quiet,
    )

    # snapshot mode — fast-forward to 14:42, then emit
    if args.snapshot:
        target_minute = 14 * 60 + 42
        # tick from start (sim already at 5am from init) up to target
        while sim.sim_minute < target_minute:
            sim.tick()
        intel = sim.compute_intelligence()
        sim.emit_state(intel)
        if not args.quiet:
            print(f"\n✓ snapshot at {sim.sim_now.strftime('%H:%M')} written to {output_path}")
        _print_snapshot_summary(intel)
        return

    # full run
    start = args.start if args.start is not None else C.SIM_DAY_START_HOUR * 60
    stop = args.stop if args.stop is not None else C.SIM_DAY_END_HOUR * 60
    sim.sim_minute = start
    sim.sim_now = sim._sim_minute_to_datetime(sim.sim_minute)
    sim.run_until(stop_minute=stop, emit_every=C.STATE_EMIT_INTERVAL_MIN)

    print(f"\nFinal state written to {output_path}")


def _print_snapshot_summary(intel: dict):
    """Pretty-print a snapshot for quick inspection."""
    print("\n" + "═" * 72)
    print(f"  RAMPIQ INTELLIGENCE SNAPSHOT · {intel['sim_time']}")
    print("═" * 72)

    k = intel["kpis"]
    print(f"\n  ACTIVE FLIGHTS  · {k['active_flight_count']:>4}")
    print(f"  AT RISK         · {k['at_risk_count']:>4}  (critical: {k['critical_count']})")
    print(f"  OTP FORECAST    · {k['otp_pct']}%")
    print(f"  COST EXPOSURE   · ${k['cost_exposure_usd']:,.0f}")

    print(f"\n  WEATHER         · {intel['weather']['condition']} · "
          f"GS prob {intel['weather']['ground_stop_probability']:.2f}")

    if intel["irrops"]["active"]:
        print(f"\n  ⚡ IRROPS ACTIVE · triggers: {', '.join(intel['irrops']['triggers_hit'])}")

    print(f"\n  CASCADES        · {len(intel['cascades'])} active")
    for c in intel["cascades"][:3]:
        print(f"    · {c['origin_flight']} (gate {c['origin_gate']}) "
              f"+{c['origin_delay_min']}min · {len(c['chain'])}-step chain · "
              f"{c['estimated_pax']} pax")

    print(f"\n  EQUIP SHORTAGES · {len(intel['equipment_forecast']['shortage_windows'])}")
    for s in intel["equipment_forecast"]["shortage_windows"][:3]:
        print(f"    · {s['equipment_type']:13s} @ {s['depot_name']:24s} "
              f"· {s['status']:8s} · supply {s['supply']} / demand {s['demand']}")

    print(f"\n  TOP RECOMMENDATIONS · {len(intel['recommendations'])}")
    for r in intel["recommendations"][:3]:
        if r["candidates"]:
            top = r["candidates"][0]
            print(f"    · {r['flight_id']} → {top['team_name']:18s} "
                  f"score {top['reco_score']:5.1f} · conf {r['confidence']:.2f}")

    print(f"\n  RECENT EVENTS")
    for e in intel["event_log"][-5:]:
        print(f"    {e}")
    print()


if __name__ == "__main__":
    main()
