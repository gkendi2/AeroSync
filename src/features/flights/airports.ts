/**
 * Airport lookup and search for the flight form. Pure functions, unit-tested.
 * Flights store origin and destination as the 3-letter IATA code ("NBO").
 */
import { AIRPORTS, type Airport } from './airports.generated';

export type { Airport };
export { AIRPORTS };

const CODE_PATTERN = /^[A-Z]{3}$/;

/** As stored: trimmed and uppercase (the form always saved it this way). */
export function normalizeAirportCode(raw: string) {
  return raw.trim().toUpperCase();
}

export function findAirport(code: string, list: readonly Airport[] = AIRPORTS) {
  const wanted = normalizeAirportCode(code);
  return list.find((airport) => airport.code === wanted) ?? null;
}

/** "NBO · Nairobi · Jomo Kenyatta International · Kenya" */
export function formatAirport(airport: Airport) {
  return [airport.code, airport.city, airport.name, airport.country].filter(Boolean).join(' · ');
}

/**
 * Airports whose code, city or name contains the query (case-insensitive).
 * Order: exact code match, code starting with the query, then Kenyan airports,
 * then by city. An empty query returns the whole list, Kenya first.
 */
export function searchAirports(query: string, list: readonly Airport[] = AIRPORTS): Airport[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...list];

  const rank = (airport: Airport) => {
    const code = airport.code.toLowerCase();
    if (code === term) return 0;
    if (code.startsWith(term)) return 1;
    return 2;
  };

  return list
    .filter((airport) =>
      [airport.code, airport.city, airport.name].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.country === 'Kenya') - Number(a.country === 'Kenya') ||
        a.city.localeCompare(b.city),
    );
}

/**
 * For airports missing from the list (the route data stops in 2014): when a
 * search matches nothing and is exactly three letters, that code can be used.
 */
export function fallbackCode(query: string, results: readonly Airport[]) {
  const code = normalizeAirportCode(query);
  return results.length === 0 && CODE_PATTERN.test(code) ? code : null;
}
