/**
 * Flights offered in "Select an upcoming flight" pickers, and the suggested
 * crew shift for a flight. Pure functions, unit-tested.
 */
import { parseDateString, parseTimeString, toDateString } from '../datetime/format';

type PickableFlight = {
  flightNumber: string;
  status: string;
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
};

/** Same test as the flights screen's Completed tab. */
export function isCompletedFlight(status: string) {
  const value = status.toLowerCase();
  return (
    value.includes('complete') ||
    value.includes('departed') ||
    value.includes('arrived') ||
    value.includes('landed')
  );
}

/**
 * Flights that have not departed yet and are not cancelled or completed,
 * soonest first. A flight without a readable time stays while its date is
 * today or later.
 */
export function upcomingFlights<T extends PickableFlight>(flights: T[], now = new Date()): T[] {
  return flights
    .filter((flight) => {
      if (!flight.flightNumber.trim()) return false;
      if (flight.status.toLowerCase().includes('cancel')) return false;
      if (isCompletedFlight(flight.status)) return false;

      const day = parseDateString(flight.departureDate);
      if (!day) return false;

      const time = parseTimeString(flight.departureTime);
      if (!time) return flight.departureDate >= toDateString(now);

      day.setHours(time.getHours(), time.getMinutes(), 0, 0);
      return day.getTime() >= now.getTime();
    })
    .sort((a, b) =>
      `${a.departureDate} ${a.departureTime}`.localeCompare(`${b.departureDate} ${b.departureTime}`),
    );
}

export const SHIFT_START_BEFORE_MINUTES = 120;
export const SHIFT_END_AFTER_MINUTES = 30;

const LAST_MINUTE_OF_DAY = 23 * 60 + 59;

function toClock(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Suggested shift for a departure time: 2 hours before to 30 minutes after,
 * kept on the same date (clamped to 00:00 and 23:59). Null if the departure
 * time is not a valid 24-hour HH:MM.
 */
export function suggestShiftTimes(departureTime: string): { start: string; end: string } | null {
  const match = departureTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const departure = hours * 60 + minutes;

  return {
    start: toClock(Math.max(0, departure - SHIFT_START_BEFORE_MINUTES)),
    end: toClock(Math.min(LAST_MINUTE_OF_DAY, departure + SHIFT_END_AFTER_MINUTES)),
  };
}
