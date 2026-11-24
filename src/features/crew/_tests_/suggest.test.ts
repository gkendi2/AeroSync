import { describe, expect, it } from '@jest/globals';

import {
  shiftsOverlap,
  suggestHandlers,
  type SuggestAssignment,
  type SuggestAttendance,
  type SuggestHandler,
} from '../suggest';

const TODAY = '2026-11-24';

const handlers: SuggestHandler[] = [
  { uid: 'amina', displayName: 'Amina', role: 'handler' },
  { uid: 'brian', displayName: 'Brian', role: 'handler' },
  { uid: 'carol', displayName: 'Carol', role: 'handler' },
  { uid: 'dan', displayName: 'Dan', role: 'handler' },
];

function assignment(overrides: Partial<SuggestAssignment>): SuggestAssignment {
  return {
    id: Math.random().toString(36).slice(2),
    handlerUid: 'amina',
    flightNumber: 'KQ200',
    shiftDate: TODAY,
    shiftTime: '06:00-10:00',
    status: 'Assigned',
    ...overrides,
  };
}

function suggest(
  assignments: SuggestAssignment[],
  attendance: SuggestAttendance[] = [],
  overrides: Partial<Parameters<typeof suggestHandlers>[0]> = {},
) {
  return suggestHandlers({
    handlers,
    assignments,
    attendance,
    flightNumber: 'KQ100',
    shiftDate: TODAY,
    shiftTime: '08:00-12:00',
    today: TODAY,
    limit: 10,
    ...overrides,
  });
}

const uids = (list: ReturnType<typeof suggest>) => list.map((item) => item.handler.uid);

describe('shiftsOverlap', () => {
  it('detects overlap, allows back-to-back shifts and handles overnight', () => {
    expect(shiftsOverlap('06:00-10:00', '08:00-12:00')).toBe(true);
    expect(shiftsOverlap('06:00-08:00', '08:00-12:00')).toBe(false);
    expect(shiftsOverlap('22:00-02:00', '23:00-23:30')).toBe(true);
    expect(shiftsOverlap('6:00 - 7:00', '06:30-07:30')).toBe(true);
  });

  it('treats an unreadable shift time as overlapping', () => {
    expect(shiftsOverlap('morning', '08:00-12:00')).toBe(true);
  });
});

describe('suggestHandlers', () => {
  it('excludes a handler whose shift overlaps on the same date', () => {
    const result = suggest([assignment({ handlerUid: 'amina', shiftTime: '06:00-09:00' })]);
    expect(uids(result)).not.toContain('amina');
  });

  it('allows a non-overlapping shift on the same day', () => {
    const result = suggest([assignment({ handlerUid: 'amina', shiftTime: '13:00-16:00' })]);
    expect(uids(result)).toContain('amina');
    expect(result.find((item) => item.handler.uid === 'amina')?.tasksThatDay).toBe(1);
  });

  it('ignores cancelled assignments and other dates', () => {
    const result = suggest([
      assignment({ handlerUid: 'amina', status: 'Cancelled' }),
      assignment({ handlerUid: 'brian', shiftDate: '2026-11-25' }),
    ]);
    expect(uids(result)).toEqual(expect.arrayContaining(['amina', 'brian']));
    expect(result.every((item) => item.tasksThatDay === 0)).toBe(true);
  });

  it('excludes a handler already on this flight', () => {
    const result = suggest([
      assignment({ handlerUid: 'carol', flightNumber: 'kq-100', shiftTime: '14:00-15:00' }),
    ]);
    expect(uids(result)).not.toContain('carol');
  });

  it('does not count the assignment being edited', () => {
    const editing = assignment({ id: 'edit-me', handlerUid: 'amina', flightNumber: 'KQ100' });
    expect(uids(suggest([editing], [], { excludeAssignmentId: 'edit-me' }))).toContain('amina');
  });

  it('ranks checked-in handlers first when the shift is today', () => {
    const result = suggest([], [{ handlerUid: 'dan', date: TODAY, status: 'Checked In' }]);
    expect(uids(result)[0]).toBe('dan');
    expect(result[0].reason).toBe('Checked in · no tasks today');
    expect(result[1].reason).toBe('Not checked in yet · no tasks today');
  });

  it('ignores attendance for a future shift date', () => {
    const result = suggest([], [{ handlerUid: 'dan', date: TODAY, status: 'Checked In' }], {
      shiftDate: '2026-11-26',
    });
    expect(uids(result)).toEqual(['amina', 'brian', 'carol', 'dan']);
    expect(result[0].reason).toBe('No tasks that day');
  });

  it('ranks fewer tasks that day higher, then by name', () => {
    const result = suggest([
      assignment({ handlerUid: 'amina', shiftTime: '13:00-14:00' }),
      assignment({ handlerUid: 'amina', shiftTime: '15:00-16:00' }),
      assignment({ handlerUid: 'brian', shiftTime: '13:00-14:00' }),
    ]);
    expect(uids(result)).toEqual(['carol', 'dan', 'brian', 'amina']);
    expect(result[2].reason).toBe('Not checked in yet · 1 other task today');
    expect(result[3].reason).toBe('Not checked in yet · 2 other tasks today');
  });

  it('only suggests approved handlers and returns at most 3 by default', () => {
    const result = suggestHandlers({
      handlers: [...handlers, { uid: 'pending', displayName: 'Aaron', role: 'pending' }],
      assignments: [],
      attendance: [],
      flightNumber: 'KQ100',
      shiftDate: TODAY,
      shiftTime: '08:00-12:00',
      today: TODAY,
    });
    expect(uids(result)).toEqual(['amina', 'brian', 'carol']);
  });

  it('returns an empty list when nobody qualifies', () => {
    const busy = handlers.map((handler) =>
      assignment({ handlerUid: handler.uid, shiftTime: '07:00-13:00' }),
    );
    expect(suggest(busy)).toEqual([]);
  });
});
