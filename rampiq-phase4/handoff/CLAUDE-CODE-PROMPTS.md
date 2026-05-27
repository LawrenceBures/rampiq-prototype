# RampIQ · Claude Code Prompts

These are exact prompts to paste into Claude Code when you're ready to continue the build. Each is self-contained — Claude Code can run, observe, fix, and re-run inside its own loop without using your conversation budget.

The prompts are ordered from highest leverage / lowest risk to most ambitious. Don't feel obligated to run them all. Pick the ones that match what you actually need next.

Before running any prompt, make sure you're in the project root:

```bash
cd /path/to/rampiq-phase4
```

---

## Prompt 1 · Set up the simulation environment locally

Use this first time you sit down with Claude Code on this project. It verifies everything runs and produces a fresh snapshot.

```
You're picking up the RampIQ Phase 4 build. The project is in this directory.
Read handoff/README.md and handoff/ARCHITECTURE.md first to orient yourself.

Then verify the environment works:
  1. Confirm Python 3.9+ is available
  2. Run: python3 -m sim.runner --snapshot
  3. Confirm sim/output/state.json was written and contains the expected keys
     (sim_time, kpis, active_flights, recommendations, cascades,
     equipment_forecast, irrops, team_summary, depot_summary, event_log)
  4. Start a simple HTTP server: python3 -m http.server 8000
  5. Confirm the demo loads at http://localhost:8000/demo/rampiq-live-demo.html
     by fetching it with curl and checking the response is valid HTML

If anything fails, diagnose and fix. Report back what you found.
```

---

## Prompt 2 · Tune cascade visibility for the demo

The simulator currently shows 0 cascades at the 14:42 snapshot because delay materialization is conservative. During the convective threat window (14:20-15:00) we want 3-5 cascade chains visible to make the demo compelling.

```
The simulator's cascade detection is too quiet during the disruption window.
At the 14:42 snapshot, only 0-2 flights have delays and no cascades fire.

The relevant logic is in:
  - sim/simulator.py::_maybe_materialize_delay (decides which flights slip)
  - sim/algorithms.py::detect_cascades (currently requires delay >= 7 min)
  - sim/algorithms.py::_build_cascade_chain (constructs the 3-5 step chain)

I want the 14:42 snapshot to show 3-5 cascade chains, each 3-5 steps long,
with realistic delay distribution (most slips 8-15 min, a few 20+ min).

Tasks:
  1. Run python3 -m sim.runner --snapshot and inspect state.json
  2. Identify why cascades aren't firing (probably: too few flights with
     delay >= 7, or detect_cascades's adjacency/gate matching is too strict)
  3. Loosen the materialization criteria during disruption windows so 8-15
     flights have meaningful delays at 14:42
  4. Re-run snapshot and confirm 3+ cascades visible
  5. Make sure baseline (09:00 snapshot, pre-disruption) still shows 0-1
     cascades — we don't want false positives in clean conditions

Add a brief test command at the end:
  python3 -c "import json; s=json.load(open('sim/output/state.json')); \
    print('cascades:', len(s['cascades'])); \
    print('delayed:', sum(1 for f in s['active_flights'] if f.get('delay_minutes',0) > 0))"

When done, summarize what you changed and what the new numbers look like.
```

---

## Prompt 3 · Run a 100-day stress test

This produces the credibility data — "here's what RampIQ looks like across a thousand scenarios."

```
Build a stress-test runner at sim/stress_test.py that runs the simulator 100
times with different seeds and produces a statistical profile.

For each run:
  - Seed: range from 1 to 100
  - Run from 05:00 to 23:00 with default disruption schedule
  - Capture peak metrics during the 14:00-16:00 IRROPS window:
      * minimum OTP forecast
      * maximum at-risk count
      * maximum critical count
      * maximum cost exposure
      * peak number of cascade chains
      * peak number of equipment shortage windows
      * total delay minutes materialized
      * total flights with assigned_team

After all 100 runs:
  - Compute distributions: mean, median, p10, p90 for each metric
  - Output a CSV at sim/output/stress_test.csv with one row per run
  - Output a summary JSON at sim/output/stress_test_summary.json with the
    aggregate statistics
  - Print a concise text summary to stdout

The runner should support --quick (10 runs only, for fast iteration) and
--seeds N,M (run specific seeds for reproducing a specific scenario).

Don't print per-run progress unless --verbose; this should run quietly.
A 100-run test should take under 5 minutes wall-clock.
```

---

## Prompt 4 · Add a timeline scrub control to the demo

The current demo shows live state. For pitch use, we need to scrub through the day to show the disruption arc.

```
Modify demo/rampiq-live-demo.html to support timeline scrubbing alongside
live mode.

Add a new mode toggle in the header — "LIVE" vs "REPLAY". In REPLAY mode:
  - Show a horizontal timeline at the bottom of the screen, 05:00 to 23:00
  - Mark the 7 disruption events from sim/disruptor.py::DEMO_DAY_DISRUPTIONS
    as labeled ticks on the timeline
  - User can drag the playhead to any time
  - On drag: fetch sim/output/replay/HHMM.json (e.g. replay/1442.json)
  - Auto-play button advances the playhead 30 seconds per second

Also add a sim mode that emits the replay snapshots:
  python3 -m sim.runner --record-replay
This runs the full day and emits a snapshot every 5 simulated minutes to
sim/output/replay/HHMM.json (filename pattern: zero-padded HH+MM).

Keep the LIVE mode working exactly as it does today.

When done, demonstrate by:
  1. Running --record-replay
  2. Confirming sim/output/replay/ has ~220 files
  3. Loading the demo and switching to REPLAY mode
  4. Scrubbing to 14:42 and verifying the snapshot displays correctly
```

---

## Prompt 5 · Wire the desktop-v2 visual layer

The current wired demo (rampiq-live-demo.html) is a working but plain console. The phase 3 mockup (rampiq-desktop-v2.html, if you have it) has the full design polish — gate map, mobility traces, the editorial typography. Bring those together.

```
There's a phase 3 mockup file rampiq-desktop-v2.html that has the full
visual design (dark ops console, neon-lime accents, gate map visualization,
mobility traces, etc.). The current wired demo
(demo/rampiq-live-demo.html) has working data flow but minimal visual
polish.

Build a new file at demo/rampiq-live-v2.html that combines them:
  - Take the visual structure from rampiq-desktop-v2.html
  - Replace static data with the same fetch loop from rampiq-live-demo.html
  - Bind every numeric/textual field to the corresponding state.json field
  - Preserve the design language exactly: JetBrains Mono for numerics,
    Inter Tight for body, Instrument Serif italic for editorial moments,
    #c9ff3a lime accent only for intelligence/recommendation moments,
    1px hairlines instead of cards

If rampiq-desktop-v2.html is not in the project, ask me where it is before
proceeding. Don't recreate the visual design from scratch — that work is
already done and locked.

Keep rampiq-live-demo.html unchanged as the simple version.
```

---

## Prompt 6 · Build the executive summary deck

For pitch use — a 6-8 slide deck that summarizes everything.

```
Build a single-file HTML presentation at demo/rampiq-pitch-deck.html
covering:

  1. Cover slide — RampIQ + tagline + station: DFW
  2. The problem — ramp ops as the unrecognized critical path
  3. The product — six output classes with icons
  4. The 5 algorithms — one per slide showing the formula and a sample
     output read directly from sim/output/state.json
  5. The simulation results — pull stress_test_summary.json (if available)
     and show the OTP distribution, cost-exposure spread, etc.
  6. What it takes to deploy — three integration tiers from
     docs/02-data-dependency-map.md, with timeline estimates
  7. Closing slide — pilot terms (90 days, single station, read-only)
     pulled from docs/01-system-boundary.md

Use the same design language as the other surfaces: dark bg, JetBrains Mono
for numerics, Instrument Serif italic for editorial. Each slide is a full
viewport, advance with arrow keys or click, escape to overview.

Make it self-contained — no external assets except Google Fonts.
The deck should look like it came from the same product, not a separate
marketing exercise.
```

---

## Prompt 7 · Generate a station-specific integration spec

When you have a specific airline pilot conversation, run this prompt to produce a tailored integration document.

```
Generate a station-specific integration specification for the airline /
station combination I'll provide. Output: docs/03-integration-spec-{STATION}.md
plus a branded PDF.

The spec should:
  1. Open with the System Boundary scope
  2. For each Tier 1, 2, 3 input from docs/02-data-dependency-map.md:
     - Identify the specific source system at this airline (research the
       airline's known IT stack — public info only, no speculation about
       what they "probably" have)
     - Specify the integration approach (REST/SOAP/file/MQ)
     - Estimate effort in weeks for this specific carrier
  3. Document the deployment timeline as a Gantt-style table
  4. List open questions that need answers from the airline's IT team
  5. Specify the SOW for a 90-day pilot

I'll provide the airline name and station code in my next message. Until
then, outline the document structure so I can review the approach.
```

---

## Prompt 8 · Add the second algorithm tuning iteration

Once you've run the stress test and seen real distributions, this prompt loops back to retune.

```
Re-tune algorithm weights based on the stress test results.

  1. Load sim/output/stress_test_summary.json
  2. Compare actual baseline OTP (clean morning, pre-disruption) to target
     range of 78-85% (matching real airline OTP)
  3. Compare actual mid-IRROPS OTP to target range of 55-65%
  4. Compare actual cost exposure delta (clean → IRROPS) to target 3-4x
  5. If baselines are off, adjust DELAY_BASE_RISK in sim/config.py
  6. If the IRROPS delta is off, adjust the disruption-window slip
     probability in sim/simulator.py::_maybe_materialize_delay
  7. After each adjustment, re-run --quick stress test (10 runs) to verify
  8. When all targets are within range, run a full 100-run test and
     update sim/output/stress_test_summary.json

Don't change algorithm structure — only weights. The structure is locked.

Document the final tuning rationale at handoff/TUNING_LOG.md so future
adjustments have context.
```

---

## Notes on working with these prompts

Each prompt is intentionally self-contained — Claude Code can read its own context (the README, the ARCHITECTURE doc, the source) and execute without further explanation. The more specific the success criteria, the better the output.

If a prompt produces something that's not quite right, the follow-up is usually short:

- "The cascade visualization is firing but the chain explanations don't match what's in the chain steps. Fix that."
- "The stress test is running but takes 18 minutes — speed it up by skipping the snapshot emit on intermediate ticks."
- "The pitch deck looks good but slide 5 is empty because stress_test_summary.json doesn't exist yet. Generate it first."

Claude Code is good at iterating on these tight loops. Use it for any task that involves running, observing, fixing, re-running. Save your conversation context for design decisions and direction.

---

## What to NOT use Claude Code for

A short list of things to keep in conversation:

- **Scope changes.** If you're considering adding multi-station support or a new algorithm, that's a design decision worth thinking through together first.
- **Pitch positioning.** How RampIQ is described, what the tagline is, what the deployment terms look like — those are voice decisions that benefit from back-and-forth.
- **Hard ethical lines.** The worker-experience boundary in docs/01-system-boundary.md is locked deliberately. Don't let Claude Code "improve" it without explicit direction.
- **The first read of any pilot airline's reaction.** When a real conversation happens, debrief together before instructing Claude Code to produce the follow-up.
