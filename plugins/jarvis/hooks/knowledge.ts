// Web and knowledge: how Alfred answers questions about the world, and a weather tool
// backed by Open-Meteo (free, no account or key).

export const knowledgeSection = (name: string, title: string, homeCity: string) => `# ${name} on the world outside

For anything current or factual you cannot be sure of from memory (weather, news, prices,
scores, opening hours, travel, people in the news, "what is…", "summarise this page"), look it
up rather than guess: the weather tool for weather, WebSearch for news and facts, WebFetch to
read a page or article the person names. Today's date matters: search for the latest.

Answer as you would aloud to ${title} in the study:
- The first sentence IS the answer, short enough to say in one breath, with the number or the
  verdict in it ("It's 31 degrees and close, ${title}; storms likely after three.").
- Then at most a few short lines of detail on screen, and the sources as plain links.
- Summaries: three to five plain sentences unless asked for more; say what kind of piece it
  is and who wrote it, then the gist, then anything that matters to ${title}.
- News: the few stories that matter, one line each, newest first; no hype.
${homeCity ? `- "Here", "outside" or no place given means ${homeCity}.` : `- If no place is given for weather and none is in your notes, ask once which city is home, then remember it.`}`

/** Open-Meteo weather codes in words. */
const WEATHER: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'freezing fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  56: 'freezing drizzle',
  57: 'heavy freezing drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'heavy freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'light showers',
  81: 'showers',
  82: 'violent showers',
  85: 'snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorms',
  96: 'thunderstorms with hail',
  99: 'severe thunderstorms with hail',
}
export const weatherWords = (code: number) => WEATHER[code] ?? 'unsettled weather'

export const geocodeUrl = (place: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`

export const forecastUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
  '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
  '&timezone=auto&forecast_days=3'

type Place = { name: string; country?: string; admin1?: string; latitude: number; longitude: number }
type Forecast = {
  current?: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; precipitation: number }
  daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; sunrise: string[]; sunset: string[] }
}

export function placeFrom(geocodeJson: string): Place | undefined {
  try {
    const r = (JSON.parse(geocodeJson) as { results?: Place[] }).results?.[0]
    return r && typeof r.latitude === 'number' ? r : undefined
  } catch {
    return undefined
  }
}

/** The forecast as a short report the model can turn into one spoken sentence. */
export function weatherReport(place: Place, forecastJson: string): string {
  const f = JSON.parse(forecastJson) as Forecast
  const where = [place.name, place.admin1, place.country].filter(Boolean).join(', ')
  const lines = [`Weather for ${where} (Open-Meteo):`]
  const c = f.current
  if (c) {
    lines.push(
      `Now: ${Math.round(c.temperature_2m)}°C (feels like ${Math.round(c.apparent_temperature)}°C), ${weatherWords(c.weather_code)}, humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h${c.precipitation > 0 ? `, ${c.precipitation} mm precipitation` : ''}.`,
    )
  }
  const d = f.daily
  if (d) {
    const label = ['Today', 'Tomorrow', 'Day after']
    d.time.forEach((day, i) => {
      lines.push(
        `${label[i] ?? day} (${day}): ${weatherWords(d.weather_code[i] ?? -1)}, ${Math.round(d.temperature_2m_min[i] ?? 0)}–${Math.round(d.temperature_2m_max[i] ?? 0)}°C, chance of rain ${d.precipitation_probability_max[i] ?? 0}%` +
          (i === 0 ? `, sunrise ${(d.sunrise[0] ?? '').slice(11)}, sunset ${(d.sunset[0] ?? '').slice(11)}.` : '.'),
      )
    })
  }
  return lines.join('\n')
}
