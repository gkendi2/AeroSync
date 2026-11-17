/**
 * Handler task rules shared by Home, My Tasks, Scan QR and Incidents.
 * Pure functions (no Firebase imports), unit-tested.
 *
 *   Start task      only while checked in today (Attendance status 'Checked In').
 *   Overdue         the shift END has passed and the task is not Completed or Cancelled.
 *   Assigned today  the handler's assignments with shiftDate = today, except Cancelled
 *                   (Completed ones still count).
 *   Bags loaded     the approved delay-risk baggage definition (computeFlightInputs).
 */
import { normalizeFlightNumber } from '../baggage/validation';
import { splitShiftTime } from '../datetime/format';
import {
  computeFlightInputs,
  parseLocalDateTime,
  type BaggageRecord,
  type FlightRecord,
} from '../delay-risk/inputs';

export type HandlerTask = {
  id: string;
  flightNumber: string;
  shiftDate: string; // YYYY-MM-DD
  shiftTime: string; // "HH:MM-HH:MM"
  activity: string;
  status: string; // 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled'
};

export type AttendanceState = 'not-checked-in' | 'on-shift' | 'checked-out';

export function attendanceState(status: string | null | undefined): AttendanceState {
  if (status === 'Checked In') return 'on-shift';
  if (status === 'Checked Out') return 'checked-out';
  return 'not-checked-in';
}

/** A task can be started only while the handler is checked in today. */
export function canStartTask(attendanceStatus: string | null | undefined): boolean {
  return attendanceState(attendanceStatus) === 'on-shift';
}

/** Why Start task is disabled; null when it is allowed. */
export function startBlockedReason(attendanceStatus: string | null | undefined): string | null {
  const state = attendanceState(attendanceStatus);
  if (state === 'on-shift') return null;
  if (state === 'checked-out') return "You've checked out for today";
  return 'Check in to start your tasks';
}

/** "Xh Ym" for a non-negative duration; null if negative. */
export function formatDuration(milliseconds: number): string | null {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
  const minutes = Math.floor(milliseconds / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * End of a shift from shiftDate and the end of a "HH:MM-HH:MM" shiftTime.
 * An end at or before the start is the next day (overnight shift).
 * Null when shiftTime is not a start–end range or the date is invalid.
 */
export function parseShiftEnd(shiftDate: string, shiftTime: string): Date | null {
  const range = splitShiftTime(shiftTime);
  if (!range) return null;

  const start = parseLocalDateTime(shiftDate, range.start);
  const end = parseLocalDateTime(shiftDate, range.end);
  if (!start || !end) return null;

  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

export function isOverdue(task: Pick<HandlerTask, 'shiftDate' | 'shiftTime' | 'status'>, now: Date) {
  if (task.status === 'Completed' || task.status === 'Cancelled') return false;
  const end = parseShiftEnd(task.shiftDate, task.shiftTime);
  return end !== null && end.getTime() < now.getTime();
}

/** Today's non-cancelled tasks and their counts. */
export function summariseDay(tasks: HandlerTask[], date: string) {
  const today = tasks.filter(
    (task) => task.shiftDate.trim() === date && task.status !== 'Cancelled',
  );
  const completed = today.filter((task) => task.status === 'Completed').length;
  const inProgress = today.filter((task) => task.status === 'In Progress').length;

  return {
    tasks: today,
    total: today.length,
    completed,
    inProgress,
    assigned: today.length - completed - inProgress,
  };
}

/** Distinct flight numbers (normalised) the handler is assigned to on a date. */
export function assignedFlightsOn(tasks: HandlerTask[], date: string): string[] {
  const flights = new Set<string>();

  for (const task of tasks) {
    const flight = normalizeFlightNumber(task.flightNumber);
    if (flight && task.shiftDate.trim() === date && task.status !== 'Cancelled') {
      flights.add(flight);
    }
  }

  return [...flights];
}

/**
 * Wrong-flight check before recording a handling event. Null when the bag
 * belongs to one of the assigned flights (or carries no flight number).
 */
export function wrongFlightWarning(bagFlight: string, assignedFlights: string[]): string | null {
  const flight = normalizeFlightNumber(bagFlight);
  if (!flight || assignedFlights.includes(flight)) return null;

  if (assignedFlights.length === 0) {
    return 'You have no flights assigned today. Record anyway?';
  }

  return `This bag is for ${flight}. You're assigned to ${assignedFlights.join(', ')}. Record anyway?`;
}

/** The Flights record for a task: same flight number, departing on the shift date. */
export function findFlightForTask<T extends FlightRecord>(
  task: Pick<HandlerTask, 'flightNumber' | 'shiftDate'>,
  flights: T[],
): T | null {
  const number = normalizeFlightNumber(task.flightNumber);
  if (!number) return null;

  return (
    flights.find(
      (flight) =>
        normalizeFlightNumber(flight.flightNumber) === number &&
        flight.departureDate.trim() === task.shiftDate.trim(),
    ) ?? null
  );
}

/**
 * Bags loaded for the task's flight, using the delay-risk baggage definition.
 * Null when the flight is unknown or has no bags registered for this departure.
 */
export function bagProgressForTask(
  task: Pick<HandlerTask, 'flightNumber' | 'shiftDate'>,
  flights: FlightRecord[],
  bags: BaggageRecord[],
  now: Date,
): { loaded: number; total: number } | null {
  const flight = findFlightForTask(task, flights);
  if (!flight) return null;

  const { baggage } = computeFlightInputs(
    flight,
    { bags, assignments: [], attendance: [], incidents: [] },
    now,
  );

  return baggage.total > 0 ? { loaded: baggage.handled, total: baggage.total } : null;
}
