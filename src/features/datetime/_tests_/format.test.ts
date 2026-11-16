import { describe, expect, it } from '@jest/globals';

import {
  formatShiftTime,
  parseDateString,
  parseTimeString,
  splitShiftTime,
  toDateString,
  toTimeString,
} from '../format';

describe('stored date format', () => {
  it('writes YYYY-MM-DD with zero padding', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateString(new Date(2026, 10, 16))).toBe('2026-11-16');
  });

  it('round-trips through parseDateString', () => {
    expect(parseDateString('2026-11-16')).toEqual(new Date(2026, 10, 16));
    expect(toDateString(parseDateString('2026-01-05') as Date)).toBe('2026-01-05');
  });

  it('rejects other formats and impossible dates', () => {
    expect(parseDateString('16/11/2026')).toBeNull();
    expect(parseDateString('2026-02-30')).toBeNull();
    expect(parseDateString('')).toBeNull();
  });
});

describe('stored time format', () => {
  it('writes HH:MM in 24-hour time', () => {
    expect(toTimeString(new Date(2026, 10, 16, 6, 5))).toBe('06:05');
    expect(toTimeString(new Date(2026, 10, 16, 18, 30))).toBe('18:30');
    expect(toTimeString(new Date(2026, 10, 16, 0, 0))).toBe('00:00');
  });

  it('round-trips through parseTimeString', () => {
    expect(toTimeString(parseTimeString('18:30') as Date)).toBe('18:30');
    expect(toTimeString(parseTimeString('6:05') as Date)).toBe('06:05');
  });

  it('rejects invalid times', () => {
    expect(parseTimeString('24:00')).toBeNull();
    expect(parseTimeString('12:60')).toBeNull();
    expect(parseTimeString('6 PM')).toBeNull();
    expect(parseTimeString('')).toBeNull();
  });
});

describe('stored shiftTime format', () => {
  it('joins start and end as HH:MM-HH:MM with no spaces', () => {
    expect(formatShiftTime('06:00', '14:00')).toBe('06:00-14:00');
  });

  it('splits the stored format back into start and end', () => {
    expect(splitShiftTime('06:00-14:00')).toEqual({ start: '06:00', end: '14:00' });
  });

  it('reads older values with spaces or single-digit hours', () => {
    expect(splitShiftTime('06:00 - 14:00')).toEqual({ start: '06:00', end: '14:00' });
    expect(splitShiftTime(' 6:00 -14:00 ')).toEqual({ start: '06:00', end: '14:00' });
  });

  it('allows overnight shifts', () => {
    expect(splitShiftTime('22:00-06:00')).toEqual({ start: '22:00', end: '06:00' });
  });

  it('returns null for anything that is not a start–end range', () => {
    expect(splitShiftTime('06:00')).toBeNull();
    expect(splitShiftTime('morning')).toBeNull();
    expect(splitShiftTime('06:00-25:00')).toBeNull();
    expect(splitShiftTime('')).toBeNull();
  });
});
