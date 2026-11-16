import { describe, expect, it } from '@jest/globals';

import {
  AssignmentRecord,
  AttendanceRecord,
  BaggageRecord,
  computeFlightInputs,
  IncidentRecord,
  parseLocalDateTime,
  parseShiftStart,
} from '../inputs';

// Flight departs 2026-11-16 14:00 local; "now" is 12:00 unless a test says otherwise.
const flight = {
  id: 'flight-doc-1',
  flightNumber: 'KQ901',
  departureDate: '2026-11-16',
  departureTime: '14:00',
};

const at = (hours: number, minutes = 0, day = 16) => new Date(2026, 10, day, hours, minutes);
const NOON = at(12);

const bag = (status: string, createdAt: Date | null = at(9), flightId = 'KQ901'): BaggageRecord => ({
  flightId,
  status,
  createdAt,
});

const assignment = (
  handlerUid: string,
  status = 'Assigned',
  shiftTime = '08:00 - 16:00',
  overrides: Partial<AssignmentRecord> = {},
): AssignmentRecord => ({
  flightNumber: 'KQ901',
  handlerUid,
  shiftDate: '2026-11-16',
  shiftTime,
  status,
  ...overrides,
});

const attendance = (handlerUid: string, status = 'Checked In', date = '2026-11-16'): AttendanceRecord => ({
  handlerUid,
  date,
  status,
});

const incident = (status: string, overrides: Partial<IncidentRecord> = {}): IncidentRecord => ({
  flightId: 'flight-doc-1',
  flightNumber: 'KQ901',
  status,
  ...overrides,
});

function compute(
  records: Partial<Parameters<typeof computeFlightInputs>[1]>,
  now = NOON,
  f = flight,
) {
  return computeFlightInputs(
    f,
    { bags: [], assignments: [], attendance: [], incidents: [], ...records },
    now,
  );
}

describe('parsing', () => {
  it('reads local departure date and time', () => {
    expect(parseLocalDateTime('2026-11-16', '14:00')).toEqual(at(14));
    expect(parseLocalDateTime('16/11/2026', '14:00')).toBeNull();
    expect(parseLocalDateTime('2026-11-16', '25:00')).toBeNull();
    expect(parseLocalDateTime('2026-11-16', '')).toBeNull();
  });

  it('reads the shift start from a range, a single time or AM/PM', () => {
    expect(parseShiftStart('2026-11-16', '08:00 - 16:00')).toEqual(at(8));
    expect(parseShiftStart('2026-11-16', '13:30')).toEqual(at(13, 30));
    expect(parseShiftStart('2026-11-16', '1:30 PM')).toEqual(at(13, 30));
    expect(parseShiftStart('2026-11-16', 'morning')).toBeNull();
    expect(parseShiftStart('', '08:00 - 16:00')).toBeNull();
  });
});

describe('time_remaining_minutes', () => {
  it('is the minutes from now to scheduled departure', () => {
    expect(compute({}).timeRemainingMinutes).toBe(120);
    expect(compute({}, at(13, 35)).timeRemainingMinutes).toBe(25);
  });

  it('marks flights past scheduled departure as not scored', () => {
    const result = compute({ bags: [bag('Loading')], assignments: [assignment('h1')] }, at(14, 1));
    expect(result.notScored).toEqual(['past-departure']);
    expect(result.modelInputs).toBeNull();
  });

  it('marks flights with no readable departure as not scored', () => {
    const result = compute({}, NOON, { ...flight, departureTime: '' });
    expect(result.timeRemainingMinutes).toBeNull();
    expect(result.notScored).toContain('no-departure-time');
  });
});

describe('baggage_progress_pct', () => {
  it('is 100 × (Loading or Offloaded) ÷ all bags for the departure', () => {
    const result = compute({
      bags: [bag('Registered'), bag('Loading'), bag('Offloaded'), bag('Registered')],
    });
    expect(result.baggage).toEqual({ total: 4, handled: 2, pct: 50 });
  });

  it('counts unknown statuses in the total only', () => {
    expect(compute({ bags: [bag('Loading'), bag('Lost')] }).baggage.pct).toBe(50);
  });

  it('matches flight numbers after normalising', () => {
    const result = compute({ bags: [bag('Loading')] }, NOON, { ...flight, flightNumber: 'kq-901' });
    expect(result.baggage.total).toBe(1);
  });

  it('does not match on the Flights document id or other flights', () => {
    const result = compute({ bags: [bag('Loading', at(9), 'flight-doc-1'), bag('Loading', at(9), 'KQ902')] });
    expect(result.baggage.total).toBe(0);
  });

  it('only counts bags created in the 24 hours before departure', () => {
    const result = compute({
      bags: [
        bag('Offloaded', at(13, 59, 15)), // yesterday, just over 24h before
        bag('Registered', at(14, 0, 15)), // exactly 24h before
        bag('Loading', at(9)),
        bag('Registered', at(14, 30)), // after departure
        bag('Loading', null), // no createdAt
      ],
    });
    expect(result.baggage).toEqual({ total: 2, handled: 1, pct: 50 });
  });

  it('is not scored when no bags are registered', () => {
    const result = compute({ assignments: [assignment('h1')], attendance: [attendance('h1')] });
    expect(result.baggage.pct).toBeNull();
    expect(result.notScored).toEqual(['no-baggage']);
    expect(result.modelInputs).toBeNull();
  });
});

describe('staff_availability_pct', () => {
  it('counts a handler whose shift has not started as available', () => {
    const result = compute({ assignments: [assignment('h1', 'Assigned', '13:00 - 18:00')] });
    expect(result.staff).toEqual({ assigned: 1, available: 1, pct: 100 });
  });

  it('counts a handler whose shift started and who has not checked in as unavailable', () => {
    const result = compute({ assignments: [assignment('h1', 'Assigned', '08:00 - 16:00')] });
    expect(result.staff).toEqual({ assigned: 1, available: 0, pct: 0 });
  });

  it('applies the check-in rule from the exact shift start', () => {
    const result = compute({ assignments: [assignment('h1', 'Assigned', '12:00 - 18:00')] });
    expect(result.staff.available).toBe(0);
  });

  it('counts a checked-in handler as available', () => {
    const result = compute({ assignments: [assignment('h1')], attendance: [attendance('h1')] });
    expect(result.staff.pct).toBe(100);
  });

  it('counts a handler who completed their work and checked out as available', () => {
    const result = compute({
      assignments: [assignment('h1', 'Completed')],
      attendance: [attendance('h1', 'Checked Out')],
    });
    expect(result.staff).toEqual({ assigned: 1, available: 1, pct: 100 });
  });

  it('is 100% when every handler has completed all assignments, with no check-ins', () => {
    const result = compute({
      assignments: [
        assignment('h1', 'Completed'),
        assignment('h1', 'Completed', '10:00 - 11:00'),
        assignment('h2', 'Completed'),
      ],
    });
    expect(result.staff).toEqual({ assigned: 2, available: 2, pct: 100 });
  });

  it('counts a checked-out handler with unfinished work as unavailable', () => {
    const result = compute({
      assignments: [assignment('h1', 'Completed'), assignment('h1', 'In Progress', '10:00 - 11:00')],
      attendance: [attendance('h1', 'Checked Out')],
    });
    expect(result.staff.pct).toBe(0);
  });

  it('falls back to the check-in rule when shiftTime cannot be parsed', () => {
    const notCheckedIn = compute({ assignments: [assignment('h1', 'Assigned', 'afternoon')] });
    const checkedIn = compute({
      assignments: [assignment('h1', 'Assigned', 'afternoon')],
      attendance: [attendance('h1')],
    });
    expect(notCheckedIn.staff.available).toBe(0);
    expect(checkedIn.staff.available).toBe(1);
  });

  it('counts distinct handlers and ignores cancelled, other-day and other-flight assignments', () => {
    const result = compute({
      assignments: [
        assignment('h1'),
        assignment('h1', 'Assigned', '09:00 - 10:00'),
        assignment('h2'),
        assignment('h3', 'Cancelled'),
        assignment('h4', 'Assigned', '08:00 - 16:00', { shiftDate: '2026-11-15' }),
        assignment('h5', 'Assigned', '08:00 - 16:00', { flightNumber: 'KQ902' }),
      ],
      attendance: [attendance('h1'), attendance('h2', 'Checked In', '2026-11-15')],
    });
    expect(result.staff).toEqual({ assigned: 2, available: 1, pct: 50 });
  });

  it('flags a flight with no crew assigned', () => {
    const result = compute({ bags: [bag('Loading')] });
    expect(result.staff.pct).toBeNull();
    expect(result.notScored).toEqual(['no-crew']);
  });
});

describe('unresolved_incidents', () => {
  it('counts Open and Under Investigation incidents for the flight', () => {
    const result = compute({
      incidents: [
        incident('Open'),
        incident('Under Investigation'),
        incident('Resolved'),
        incident('Open', { flightId: 'another-flight' }),
        incident('Open', { flightId: '', flightNumber: 'KQ-901' }),
        incident('Open', { flightId: '', flightNumber: 'KQ902' }),
      ],
    });
    expect(result.unresolvedIncidents).toBe(3);
  });
});

describe('modelInputs', () => {
  it('holds the four unrounded inputs when the flight can be scored', () => {
    const result = compute({
      bags: [bag('Loading'), bag('Registered'), bag('Registered')],
      assignments: [assignment('h1'), assignment('h2'), assignment('h3')],
      attendance: [attendance('h1'), attendance('h2')],
      incidents: [incident('Open')],
    });

    expect(result.notScored).toEqual([]);
    expect(result.modelInputs).toEqual({
      time_remaining_minutes: 120,
      baggage_progress_pct: 100 / 3,
      staff_availability_pct: 200 / 3,
      unresolved_incidents: 1,
    });
  });
});
