import { NextRequest, NextResponse } from 'next/server';
import { getDemoWeather } from '@/lib/soi-context/weather-context';

/**
 * SOI Weather API
 *
 * Returns weather context for a station.
 * Uses demo data when no weather provider key is configured.
 */

export async function GET(req: NextRequest) {
  const station = req.nextUrl.searchParams.get('station') ?? 'LAX';
  const weather = getDemoWeather(station);
  return NextResponse.json(weather);
}
