"""
RampIQ simulation environment.

A self-contained operational simulator for one day at DFW.
Generates synthetic but realistic flight schedule, crew, and equipment data,
runs the 5 RampIQ algorithms in real-time, and emits a JSON state stream
that drives the demo UI.

Modules:
    config        — DFW-specific constants and tuning parameters
    schedule      — synthetic flight schedule generator
    crews         — synthetic crew dataset generator
    equipment     — synthetic equipment fleet generator
    weather       — synthetic weather and disruption generator
    algorithms    — the 5 core RampIQ algorithms
    disruptor     — programmable disruption injector
    simulator     — time-stepping engine that ties it all together
    runner        — CLI entry point
"""
__version__ = "1.0.0"
