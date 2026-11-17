import { describe, expect, it } from '@jest/globals';

import {
  assignedFlightsOn,
  attendanceState,
  bagProgressForTask,
  canStartTask,
  findFlightForTask,
  formatDuration,
  HandlerTask,
  isOverdue,
  parseShiftEnd,
  startBlockedReason,
  summariseDay,
  wrongFlightWarning,
} from '../tasks';

const DAY = '2026-11-16';

function task(overrides: Partial<HandlerTask> = {}): HandlerTask {
  return {
    id: 't1',
    flightNumber: 'KQ901',
    shiftDate: DAY,
    shiftTime: '06:00-14:00',
    activity: 'Loading',
    status: 'Assigned',
    ...overrides,
  };
}

describe('attendance and Start task', () => {
  it('maps the stored attendance status to three states', () => {
    expect(attendanceState(undefined)).toBe('not-checked-in');
    expect(attendanceState(null)).toBe('not-checked-in');
    expect(attendanceState('Checked In')).toBe('on-shift');
    expect(attendanceState('Checked Out')).toBe('checked-out');
  });

  it('allows starting a task only while checked in', () => {
    expect(canStartTask('Checked In')).toBe(true);
    expect(canStartTask(null)).toBe(false);
    expect(canStartTask('Checked Out')).toBe(false);
    expect(startBlockedReason('Checked In')).toBeNull();
    expect(startBlockedReason(null)).toBe('Check in to start your tasks');
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(0)).toBe('0h 0m');
    expect(formatDuration((2 * 60 + 14) * 60000 + 59000)).toBe('2h 14m');
    expect(formatDuration(-1)).toBeNull();
  });
});

describe('parseShiftEnd and isOverdue', () => {
  it('reads the end of the stored HH:MM-HH:MM shift (and spaced older values)', () => {
    expect(parseShiftEnd(DAY, '06:00-14:00')).toEqual(new Date(2026, 10, 16, 14, 0));
    expect(parseShiftEnd(DAY, '6:00 - 14:30')).toEqual(new Date(2026, 10, 16, 14, 30));
  });

  it('puts an end at or before the start on the next day', () => {
    expect(parseShiftEnd(DAY, '22:00-06:00')).toEqual(new Date(2026, 10, 17, 6, 0));
  });

  it('returns null for a single time or malformed values', () => {
    expect(parseShiftEnd(DAY, '06:00')).toBeNull();
    expect(parseShiftEnd('16/11/2026', '06:00-14:00')).toBeNull();
  });

  it('is overdue only after the shift end and while not Completed or Cancelled', () => {
    const beforeEnd = new Date(2026, 10, 16, 13, 59);
    const afterEnd = new Date(2026, 10, 16, 14, 1);

    expect(isOverdue(task(), beforeEnd)).toBe(false);
    expect(isOverdue(task(), afterEnd)).toBe(true);
    expect(isOverdue(task({ status: 'In Progress' }), afterEnd)).toBe(true);
    expect(isOverdue(task({ status: 'Completed' }), afterEnd)).toBe(false);
    expect(isOverdue(task({ status: 'Cancelled' }), afterEnd)).toBe(false);
    expect(isOverdue(task({ shiftTime: '06:00' }), afterEnd)).toBe(false);
  });
});

describe('summariseDay', () => {
  it("counts the day's tasks, leaving out Cancelled and other dates", () => {
    const summary = summariseDay(
      [
        task({ id: 'a', status: 'Assigned' }),
        task({ id: 'b', status: 'In Progress' }),
        task({ id: 'c', status: 'Completed' }),
        task({ id: 'd', status: 'Completed' }),
        task({ id: 'e', status: 'Cancelled' }),
        task({ id: 'f', shiftDate: '2026-11-17' }),
      ],
      DAY,
    );

    expect(summary).toMatchObject({ total: 4, completed: 2, inProgress: 1, assigned: 1 });
    expect(summary.tasks.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('assignedFlightsOn and wrongFlightWarning', () => {
  const tasks = [
    task({ flightNumber: 'kq-902' }),
    task({ flightNumber: 'KQ903', status: 'Completed' }),
    task({ flightNumber: 'KQ902' }),
    task({ flightNumber: 'KQ904', status: 'Cancelled' }),
    task({ flightNumber: 'KQ905', shiftDate: '2026-11-17' }),
  ];

  it('lists distinct normalised flights for the day, Completed included, Cancelled excluded', () => {
    expect(assignedFlightsOn(tasks, DAY)).toEqual(['KQ902', 'KQ903']);
  });

  it('warns only when the bag is for another flight', () => {
    const assigned = assignedFlightsOn(tasks, DAY);

    expect(wrongFlightWarning('KQ 902', assigned)).toBeNull();
    expect(wrongFlightWarning('', assigned)).toBeNull();
    expect(wrongFlightWarning('KQ901', assigned)).toBe(
      "This bag is for KQ901. You're assigned to KQ902, KQ903. Record anyway?",
    );
    expect(wrongFlightWarning('KQ901', [])).toBe(
      'You have no flights assigned today. Record anyway?',
    );
  });
});

describe('findFlightForTask and bagProgressForTask', () => {
  const flights = [
    { id: 'f1', flightNumber: 'KQ901', departureDate: '2026-11-15', departureTime: '14:00' },
    { id: 'f2', flightNumber: 'KQ 901', departureDate: DAY, departureTime: '14:00' },
  ];
  const now = new Date(2026, 10, 16, 12, 0);
  const created = new Date(2026, 10, 16, 9, 0);

  it('matches the flight number and the shift date', () => {
    expect(findFlightForTask(task(), flights)?.id).toBe('f2');
    expect(findFlightForTask(task({ shiftDate: '2026-11-18' }), flights)).toBeNull();
  });

  it('counts Loading and Offloaded bags as loaded, over the 24h before departure', () => {
    const bags = [
      { flightId: 'KQ901', status: 'Loading', createdAt: created },
      { flightId: 'KQ901', status: 'Offloaded', createdAt: created },
      { flightId: 'KQ901', status: 'Registered', createdAt: created },
      { flightId: 'KQ901', status: 'Loading', createdAt: new Date(2026, 10, 14, 9, 0) },
      { flightId: 'KQ902', status: 'Loading', createdAt: created },
    ];

    expect(bagProgressForTask(task(), flights, bags, now)).toEqual({ loaded: 2, total: 3 });
  });

  it('is null when no bags are registered or the flight is unknown', () => {
    expect(bagProgressForTask(task(), flights, [], now)).toBeNull();
    expect(bagProgressForTask(task({ flightNumber: 'KQ999' }), flights, [], now)).toBeNull();
  });
});
