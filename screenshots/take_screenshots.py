"""
Playwright screenshot script for RampIQ recovery demo.
Captures all 8 demo beats at 1440×900 viewport.

Usage:
    python3 screenshots/take_screenshots.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL  = "http://localhost:8001/demo/rampiq-live-v2.html"
OUT_DIR   = Path(__file__).parent / "recovery-demo"
VIEWPORT  = {"width": 1440, "height": 900}

STEPS = [
    ("01-baseline",          "Baseline Operations"),
    ("02-equipment-fault",   "Equipment Fault Detected"),
    ("03-cascade",           "Cascade Propagation"),
    ("04-recommendation",    "Recovery Recommendation"),
    ("05-initiated",         "Recovery Sequence Initiated"),
    ("06-stabilizing",       "Stabilization in Progress"),
    ("07-contained",         "Cascade Contained"),
    ("08-outcome",           "Outcome Measured"),
]

async def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page    = await browser.new_page(viewport=VIEWPORT)

        print(f"Opening {BASE_URL}")
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(1500)  # let first state.json load render

        # Enable demo mode
        await page.click("#demo-toggle")
        await page.wait_for_timeout(800)

        for i, (slug, title) in enumerate(STEPS):
            # Navigate to the correct step via pip dots (index i)
            await page.evaluate(f"jumpDemoStep({i})")
            await page.wait_for_timeout(1000)  # let CSS transitions settle

            out_path = OUT_DIR / f"{slug}.png"
            await page.screenshot(path=str(out_path), full_page=False)
            print(f"  ✓ Step {i+1}: {title} → {out_path.name}")

        await browser.close()
    print(f"\nScreenshots saved to {OUT_DIR}/")

asyncio.run(main())
