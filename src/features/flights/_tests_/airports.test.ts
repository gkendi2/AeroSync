import { describe, expect, it } from '@jest/globals';

import {
  AIRPORTS,
  fallbackCode,
  findAirport,
  formatAirport,
  normalizeAirportCode,
  searchAirports,
} from '../airports';

describe('generated airport list', () => {
  it('holds 79 airports with unique 3-letter codes, 24 of them in Kenya', () => {
    expect(AIRPORTS).toHaveLength(79);
    expect(new Set(AIRPORTS.map((a) => a.code)).size).toBe(79);
    expect(AIRPORTS.every((a) => /^[A-Z]{3}$/.test(a.code))).toBe(true);
    expect(AIRPORTS.filter((a) => a.country === 'Kenya')).toHaveLength(24);
  });

  it('lists Kenyan airports first', () => {
    const firstForeign = AIRPORTS.findIndex((a) => a.country !== 'Kenya');
    expect(AIRPORTS.slice(firstForeign).every((a) => a.country !== 'Kenya')).toBe(true);
  });

  it('strips a trailing " Airport" from names', () => {
    expect(AIRPORTS.some((a) => / Airport$/i.test(a.name))).toBe(false);
  });
});

describe('findAirport and formatAirport', () => {
  it('finds by code, ignoring case and spaces', () => {
    expect(findAirport(' nbo ')?.city).toBe('Nairobi');
    expect(findAirport('XYZ')).toBeNull();
  });

  it('formats code, city, name and country', () => {
    expect(formatAirport(findAirport('NBO')!)).toBe(
      'NBO · Nairobi · Jomo Kenyatta International · Kenya',
    );
  });
});

describe('searchAirports', () => {
  it('matches code, city or airport name', () => {
    expect(searchAirports('mba').map((a) => a.code)).toContain('MBA');
    expect(searchAirports('mombasa').map((a) => a.code)).toContain('MBA');
    expect(searchAirports('jomo kenyatta').map((a) => a.code)).toEqual(['NBO']);
  });

  it('puts an exact code match first, then Kenyan airports', () => {
    const results = searchAirports('nbo');
    expect(results[0].code).toBe('NBO');

    const international = searchAirports('international');
    const firstForeign = international.findIndex((a) => a.country !== 'Kenya');
    expect(firstForeign).toBeGreaterThan(0);
    expect(international.slice(firstForeign).every((a) => a.country !== 'Kenya')).toBe(true);
  });

  it('returns the whole list for an empty query', () => {
    expect(searchAirports('  ')).toHaveLength(AIRPORTS.length);
  });
});

describe('fallbackCode', () => {
  it('offers three typed letters only when nothing matches', () => {
    expect(fallbackCode('jfk', searchAirports('jfk'))).toBe('JFK');
    expect(fallbackCode('NBO', searchAirports('NBO'))).toBeNull();
    expect(fallbackCode('JF', [])).toBeNull();
    expect(fallbackCode('JFK1', [])).toBeNull();
    expect(fallbackCode('J K', [])).toBeNull();
  });

  it('normalises like the stored value', () => {
    expect(normalizeAirportCode(' jfk ')).toBe('JFK');
  });
});
