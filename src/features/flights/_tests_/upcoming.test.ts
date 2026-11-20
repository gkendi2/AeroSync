import { describe, expect, it } from '@jest/globals';

import { isCompletedFlight, suggestShiftTimes, upcomingFlights } from '../upcoming';

describe('suggestShiftTimes', () => {
  it('starts 2 hours before departure and ends 30 minutes after', () => {
    expect(suggestShiftTimes('14:00')).toEqual({ start: '12:00', end: '14:30' });
    expect(suggestShiftTimes('09:45')).toEqual({ start: '07:45', end: '10:15' });
  });

  it('clamps an early-morning start to 00:00', () => {
    expect(suggestShiftTimes('01:30')).toEqual({ start: '00:00', end: '02:00' });
    expect(suggestShiftTimes('00:10')).toEqual({ start: '00:00', end: '00:40' });
  });

  it('clamps a late end to 23:59', () => {
    expect(suggestShiftTimes('23:45')).toEqual({ start: '21:45', end: '23:59' });
    expect(suggestShiftTimes('23:29')).toEqual({ start: '21:29', end: '23:59' });
  });

  it('accepts a single-digit hour and rejects invalid times', () => {
    expect(suggestShiftTimes('7:05')).toEqual({ start: '05:05', end: '07:35' });
    expect(suggestShiftTimes('')).toBeNull();
    expect(suggestShiftTimes('24:00')).toBeNull();
    expect(suggestShiftTimes('2 PM')).toBeNull();
  });
});

describe('upcomingFlights', () => {
  const now = new Date(2026, 10, 19, 12, 0);
  const flight = (id: string, departureDate: string, departureTime: string, status = 'Scheduled') => ({
    id,
    flightNumber: `KQ${id}`,
    departureDate,
    departureTime,
    status,
  });

  it('keeps flights not yet departed, not cancelled or completed, soonest first', () => {
    const result = upcomingFlights(
      [
        flight('3', '2026-11-20', '08:00'),
        flight('1', '2026-11-19', '13:00'),
        flight('past', '2026-11-19', '11:00'),
        flight('cx', '2026-11-19', '15:00', 'Cancelled'),
        flight('dep', '2026-11-19', '15:00', 'Departed'),
        flight('notime', '2026-11-19', ''),
        flight('yesterday', '2026-11-18', ''),
      ],
      now,
    );

    expect(result.map((item) => item.id)).toEqual(['notime', '1', '3']);
  });

  it('matches the Completed tab wording', () => {
    expect(isCompletedFlight('Landed')).toBe(true);
    expect(isCompletedFlight('Boarding')).toBe(false);
  });
});
