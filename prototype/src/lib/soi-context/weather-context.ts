/**
 * SOI Context — Weather Context
 *
 * Provides weather awareness for operational reasoning.
 * Uses demo weather when no provider key is available.
 */

// ============================================================
// TYPES
// ============================================================

export interface WeatherContext {
  station: string;
  condition: string;
  temperature: string;
  wind: string;
  visibility: string;
  ceiling: string;
  operationalImpact: 'none' | 'low' | 'moderate' | 'high';
  impactDescription: string;
  isDemo: boolean;
  timestamp: number;
}

// ============================================================
// DEMO WEATHER
// ============================================================

export function getDemoWeather(station: string): WeatherContext {
  return {
    station,
    condition: 'Clear',
    temperature: '72°F / 22°C',
    wind: 'W at 12 kt, gusting 18 kt',
    visibility: '10+ miles',
    ceiling: 'Clear above 25,000 ft',
    operationalImpact: 'none',
    impactDescription: 'No weather-driven disruption currently modeled. Current operational pressure appears operational, not weather-led.',
    isDemo: true,
    timestamp: Date.now(),
  };
}

/**
 * Generate an operational weather answer from weather context.
 */
export function generateWeatherAnswer(weather: WeatherContext, question: string): {
  title: string;
  answer: string;
  bullets: string[];
} {
  const lower = question.toLowerCase();
  const isImpactQuestion = /affect|impact|explain|delay|disrupt|causing/i.test(lower);
  const isWindQuestion = /wind/i.test(lower);

  const bullets = [
    `${weather.station}: ${weather.condition}, ${weather.temperature}`,
    `Wind: ${weather.wind}`,
    `Visibility: ${weather.visibility}`,
    `Ceiling: ${weather.ceiling}`,
  ];

  if (weather.isDemo) {
    bullets.push('Demo weather context — not live data');
  }

  let answer: string;
  if (isImpactQuestion) {
    answer = weather.operationalImpact === 'none'
      ? `${weather.station} weather is ${weather.condition.toLowerCase()} with ${weather.wind.toLowerCase()}. ${weather.impactDescription}`
      : `Weather impact at ${weather.station}: ${weather.operationalImpact}. ${weather.impactDescription}`;
  } else if (isWindQuestion) {
    answer = `Wind at ${weather.station}: ${weather.wind}. ${
      weather.operationalImpact === 'none'
        ? 'Current wind conditions are within operational limits.'
        : `Wind is contributing to ${weather.operationalImpact} operational impact.`
    }`;
  } else {
    answer = `${weather.station} weather: ${weather.condition}, ${weather.temperature}. Wind ${weather.wind}. Visibility ${weather.visibility}. ${weather.impactDescription}`;
  }

  return { title: `Weather — ${weather.station}`, answer, bullets };
}

/**
 * Check if a question is weather-related.
 */
export function isWeatherQuestion(input: string): boolean {
  return /\b(?:weather|wind|rain|storm|fog|visibility|ceiling|temperature|temp|hot|cold|ice|snow|thunder)\b/i.test(input);
}
