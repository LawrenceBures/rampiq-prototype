# RampIQ · Algorithm Tuning Log

A running record of algorithm weight changes, the rationale, and the observed effect on snapshot metrics. New entries go at the top.

Format per entry:
```
## YYYY-MM-DD · <short description>
Changed:   <what changed in config.py>
Rationale: <why>
Before:    <relevant snapshot numbers>
After:     <relevant snapshot numbers>
Notes:     <anything worth remembering>
```

---

## 2026-05-08 · Phase 4 baseline

**Changed:** Initial configuration — no changes from shipped defaults.

**Weights as of this baseline:**

```python
# Flight Risk
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

# Team Suitability
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

# Delay Prediction
DELAY_BASE_RISK = {
    "crew":      0.04,
    "equipment": 0.03,
    "bag":       0.04,
    "upstream":  0.05,
    "env":       0.03,
}

# Assignment Optimization
RECO_WEIGHTS = {
    "suitability":    0.60,
    "global_impact":  0.30,
    "operational":    0.10,
}
```

**Snapshot at 14:42 (seed 42, demo day disruptions active):**

| Metric | Value |
|---|---|
| Active flights | 186 |
| OTP forecast | ~49% |
| At-risk | ~124 |
| Critical | ~19 |
| Cost exposure | ~$38,800 |
| Cascades | 0 |
| Recommendations | 3 |

**Notes:** Baseline established from Phase 3 simulation results. Turn-pressure weight (0.25) is the dominant risk driver for narrow-body aircraft with short planned turns. Upstream weight (0.16) amplifies during high-disruption periods — watch this during weather events.

---

## 2026-05-08 · Cascade visibility + OTP calibration

**Changed:**

`config.py`:
- `RISK_WEIGHTS["upstream"]`: 0.16 → 0.12 (reduce terminal-wide propagation noise)
- `RISK_WEIGHTS["bag"]`: 0.22 → 0.24, `RISK_WEIGHTS["turn"]`: 0.25 → 0.27 (rebalance to gate-local signals; sum stays 1.00)
- `RISK_THRESHOLDS`: watch 35→52, critical 65→76 (focus on genuinely stressed departures)
- `RISK_PENALTIES["weather"]`: 1.10 → 1.06 (convective threat at T-36 is elevated, not overhead)
- `DELAY_BASE_RISK`: all values reduced by 0.01 (cleaner baseline on undisrupted flights)

`algorithms.py`:
- `_upstream_pressure` multiplier: 25 → 16 (each delayed neighbour adds 16pts; caps at 7 delays)
- `p_equip` transfer coefficient in `predict_delay`: 0.20 → 0.12 (equipment shortage already captured in risk score)
- `p_upstream` transfer coefficient in `predict_delay`: 0.15 → 0.10
- convective `p_env` in `predict_delay`: 0.18 → 0.12 (36min ETA, not yet overhead)

`disruptor.py`:
- Replaced single late_inbound at offset 590 (fired 8min after snapshot) with three staged late inbounds:
  - Offset 540: AA1314 +20min (14:00 — anchor cascade, gate occupancy ripple)
  - Offset 557: UA1312 +15min (14:17 — bagroom congestion chain)
  - Offset 568: AA1318 +12min (14:28 — staffing pool tightener)
- Weather threat moved from offset 560 → 562 (minor, to clear slot)

`simulator.py` `_maybe_materialize_delay` during disruption:
- `slip_floor`: 5 → 10 (ensures materialized slips exceed the 10min cascade detection threshold)
- `slip_factor` range: 0.9–1.6 → 1.0–2.0 (most delays 10-15min, occasional 20+)
- `slip_prob`: min(0.35, p_delay*0.60) → min(0.30, p_delay*0.55) (slightly less aggressive)

**Rationale:** Three problems: (1) zero cascades because the only late_inbound fired 8min after the snapshot; (2) at-risk count of 135 because upstream amplification treated every flight in a disrupted terminal as watch-tier; (3) OTP of 48% because equipment shortage was contributing p_equip≈0.19 to every Terminal C flight. Fix was to localize disruption spread (gate-adjacent and direct neighbors, not whole terminal), stage the inbound delays before the snapshot window, and anchor cascade chains with 10min+ floor on materialized slips.

**Before:**

| Metric | Value |
|---|---|
| OTP forecast | 48.3% |
| At-risk | 135 |
| Critical | 26 |
| Cascades | 0 |
| Cost exposure | $39,752 |

**After:**

| Metric | Value |
|---|---|
| OTP forecast | 58.7% |
| At-risk | 74 |
| Critical | 8 |
| Cascades | 5 |
| Cost exposure | $28,340 |

**Notes:**
- Top 3 delay causes: env (convective threat — 4 flights), equipment (DEPOT-02 belt loader fault — 4 flights), upstream (late inbound propagation — 3 chains)
- Cascade chains: AA1314 E32 +20min, UA1312 B15 +15min, AA1330 D18 +10min (adjacency); plus 2 equipment-delayed DEP chains
- `cert_gap_t15` (1.30) is still the most sensitive penalty — the 8 critical flights are all unassigned within T-15

---

## Tuning guidance

### When to tune

Run a fresh `--snapshot` before and after any weight change to see the delta. Run `--fast` to validate behavior across the full operating day trajectory — some weight changes look good at 14:42 but produce unrealistic early-morning or late-evening states.

### What to watch

- **OTP forecast** should land 45-65% during mid-afternoon disruption windows, 70-85% during calm morning operations.
- **Critical count** should be 10-30 at peak. Below 5 means the thresholds are too loose; above 40 means the system is generating noise.
- **Recommendation confidence** should average 0.65-0.85. Below 0.60 means the algorithm can't differentiate between candidates — proximity weight may be too high.
- **Cost exposure** should scale plausibly with disruption intensity. The $80/min figure is from the industry standard delay cost model; adjust in `_compute_kpis()` in `simulator.py` if the airline uses a different rate.

### Known tuning sensitivities

- `cert_gap_t15` (1.30) is the most aggressive penalty. Raising it above 1.5 produces unrealistically high critical counts because many narrow-body flights have imperfect cert coverage. Lowering it below 1.15 reduces the urgency signal in the demo.
- `upstream` weight (0.16) cascades quickly during terminal-wide disruptions. If the demo is showing too many simultaneous at-risk flights during weather events, reduce this to 0.12.
- `FATIGUE_HARD_CAP` (85) is based on FAA duty-time research. Don't lower below 75 — it creates a cliff effect that makes too many teams eligible for the cap.

### Weights to leave alone

- `DELAY_BASE_RISK` values are calibrated to produce realistic baseline P(delay) of 12-18% for a well-managed departure. Changing these without understanding the independent failure model interaction will produce non-intuitive results.
- `RECO_WEIGHTS` sum must equal 1.0. Global impact (0.30) is high by design — the assignment optimization is meant to be system-aware, not just locally greedy.

---

*Add a new entry each time weights are changed. The log is the institutional memory for why the numbers are what they are.*
