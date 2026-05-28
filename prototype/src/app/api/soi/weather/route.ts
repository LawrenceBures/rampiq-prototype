import { NextRequest, NextResponse } from 'next/server';
import { getDemoWeather, type WeatherContext } from '@/lib/soi-context/weather-context';

/**
 * SOI Weather API
 *
 * Fetches live weather from Open-Meteo (no key needed).
 * Falls back to demo weather on failure.
 */

// LAX coordinates
const STATION_COORDS: Record<string, { lat: number; lon: number }> = {
  LAX: { lat: 33.9425, lon: -118.408 },
};

export async function GET(req: NextRequest) {
  const station = req.nextUrl.searchParams.get('station') ?? 'LAX';
  const coords = STATION_COORDS[station];

  if (!coords) {
    return NextResponse.json(getDemoWeather(station));
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility&temperature_unit=fahrenheit&wind_speed_unit=kn&timezone=America/Los_Angeles`;

    const res = await fetch(url, { next: { revalidate: 600 } }); // cache 10 min
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);

    const data = await res.json();
    const c = data.current;

    const windDir = degreesToCardinal(c.wind_direction_10m);
    const windSpeed = Math.round(c.wind_speed_10m);
    const gustSpeed = Math.round(c.wind_gusts_10m);
    const tempF = Math.round(c.temperature_2m);
    const tempC = Math.round((tempF - 32) * 5 / 9);
    const condition = weatherCodeToCondition(c.weather_code);
    const visibility = c.visibility != null ? `${Math.round(c.visibility / 1609)} miles` : 'unknown';
    const precip = c.precipitation ?? 0;

    // Operational impact assessment
    let impact: WeatherContext['operationalImpact'] = 'none';
    let impactDesc = 'No weather-driven disruption currently modeled. Current operational pressure appears operational, not weather-led.';

    if (gustSpeed > 35 || windSpeed > 25) {
      impact = 'high';
      impactDesc = `High wind conditions (gusting ${gustSpeed} kt) may affect ground operations, pushback timing, and equipment stability.`;
    } else if (gustSpeed > 25 || precip > 2) {
      impact = 'moderate';
      impactDesc = `Moderate weather impact. ${gustSpeed > 25 ? `Wind gusting to ${gustSpeed} kt.` : ''} ${precip > 2 ? `Precipitation at ${precip} mm/hr.` : ''} Monitor for gate-side delays.`;
    } else if (precip > 0 || gustSpeed > 18) {
      impact = 'low';
      impactDesc = `Minor weather factors present. ${precip > 0 ? 'Light precipitation.' : ''} ${gustSpeed > 18 ? `Gusts to ${gustSpeed} kt.` : ''} No significant operational impact expected.`;
    }

    const weather: WeatherContext = {
      station,
      condition,
      temperature: `${tempF}°F / ${tempC}°C`,
      wind: `${windDir} at ${windSpeed} kt${gustSpeed > windSpeed + 5 ? `, gusting ${gustSpeed} kt` : ''}`,
      visibility,
      ceiling: condition.includes('Overcast') ? 'Overcast' : condition.includes('Cloud') ? 'Partly cloudy' : 'Clear',
      operationalImpact: impact,
      impactDescription: impactDesc,
      isDemo: false,
      timestamp: Date.now(),
    };

    return NextResponse.json(weather);
  } catch (err) {
    console.error('[SOI Weather] fetch error:', err);
    const fallback = getDemoWeather(station);
    fallback.impactDescription = 'Live weather unavailable — using demo weather. ' + fallback.impactDescription;
    return NextResponse.json(fallback);
  }
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function weatherCodeToCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 49) return 'Foggy';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code <= 99) return 'Thunderstorm with hail';
  return 'Unknown';
}
