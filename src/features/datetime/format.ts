/**
 * Conversions between Date objects and the date/time strings stored in
 * Firestore: dates as YYYY-MM-DD, times as HH:MM (24-hour), and a shift as
 * "HH:MM-HH:MM". All values are device-local time. Pure functions, unit-tested.
 */

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** YYYY-MM-DD */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** HH:MM, 24-hour */
export function toTimeString(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local midnight on a YYYY-MM-DD date; null if the string is not a real date. */
export function parseDateString(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDateString(date) === value.trim() ? date : null;
}

/** Today at the given HH:MM; null if the string is not a valid 24-hour time. */
export function parseTimeString(value: string): Date | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The stored shiftTime string: "HH:MM-HH:MM". */
export function formatShiftTime(start: string, end: string): string {
  return `${start}-${end}`;
}

/**
 * Splits a stored shiftTime into start and end (each HH:MM). Also reads older
 * values with spaces around the hyphen or single-digit hours. Null if it is
 * not a start–end range.
 */
export function splitShiftTime(value: string): { start: string; end: string } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [startHours, startMinutes, endHours, endMinutes] = match.slice(1).map(Number);
  if (startHours > 23 || endHours > 23 || startMinutes > 59 || endMinutes > 59) return null;

  return {
    start: `${pad(startHours)}:${pad(startMinutes)}`,
    end: `${pad(endHours)}:${pad(endMinutes)}`,
  };
}
