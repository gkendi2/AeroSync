/**
 * "Suggested handlers" for the crew assignment form. Pure function,
 * unit-tested. Suggestions only: the supervisor still chooses.
 *
 *   1. Approved handlers only (role 'handler').
 *   2. Not free: a non-cancelled assignment on the same shift date whose
 *      shift time overlaps the new shift. A shift whose time can't be read is
 *      treated as overlapping, so a possibly busy handler is not suggested.
 *   3. Not already assigned (non-cancelled) to this same flight on that date.
 *   4. Order: checked in today first (only when the shift date is today),
 *      then fewest non-cancelled assignments on the shift date, then name.
 */
import { normalizeFlightNumber } from '../baggage/validation';
import { splitShiftTime } from '../datetime/format';

export const MAX_SUGGESTIONS = 3;

export type SuggestHandler = {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
};

export type SuggestAssignment = {
  id: string;
  handlerUid: string;
  flightNumber: string;
  shiftDate: string; // YYYY-MM-DD
  shiftTime: string; // "HH:MM-HH:MM"
  status: string;
};

export type SuggestAttendance = {
  handlerUid: string;
  date: string; // YYYY-MM-DD
  status: string; // 'Checked In' | 'Checked Out'
};

export type HandlerSuggestion<H extends SuggestHandler = SuggestHandler> = {
  handler: H;
  checkedIn: boolean;
  tasksThatDay: number;
  reason: string;
};

/** Minutes from midnight; an end at or before the start runs past midnight. */
function shiftMinutes(shiftTime: string): { start: number; end: number } | null {
  const range = splitShiftTime(shiftTime);
  if (!range) return null;

  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const start = toMinutes(range.start);
  let end = toMinutes(range.end);
  if (end <= start) end += 24 * 60;

  return { start, end };
}

/** True when two shifts on the same date overlap (touching ends do not). */
export function shiftsOverlap(a: string, b: string): boolean {
  const first = shiftMinutes(a);
  const second = shiftMinutes(b);
  if (!first || !second) return true;
  return first.start < second.end && second.start < first.end;
}

export function handlerName(handler: SuggestHandler) {
  return handler.displayName || handler.email || 'Name not provided';
}

function describe(checkedIn: boolean, tasks: number, isToday: boolean) {
  const day = isToday ? 'today' : 'that day';
  const tasksText =
    tasks === 0 ? `no tasks ${day}` : `${tasks} other ${tasks === 1 ? 'task' : 'tasks'} ${day}`;

  if (!isToday) return tasksText.charAt(0).toUpperCase() + tasksText.slice(1);
  return `${checkedIn ? 'Checked in' : 'Not checked in yet'} · ${tasksText}`;
}

export function suggestHandlers<H extends SuggestHandler>({
  handlers,
  assignments,
  attendance,
  flightNumber,
  shiftDate,
  shiftTime,
  today,
  excludeAssignmentId,
  limit = MAX_SUGGESTIONS,
}: {
  handlers: H[];
  assignments: SuggestAssignment[];
  attendance: SuggestAttendance[];
  flightNumber: string;
  shiftDate: string;
  shiftTime: string;
  /** Today's date, YYYY-MM-DD. */
  today: string;
  /** The assignment being edited, which must not count against its handler. */
  excludeAssignmentId?: string;
  limit?: number;
}): HandlerSuggestion<H>[] {
  const date = shiftDate.trim();
  const flight = normalizeFlightNumber(flightNumber);
  const isToday = date === today;

  const sameDay = assignments.filter(
    (assignment) =>
      assignment.id !== excludeAssignmentId &&
      assignment.status !== 'Cancelled' &&
      assignment.shiftDate.trim() === date,
  );

  const candidates = handlers
    .filter((handler) => handler.role === 'handler')
    .filter((handler) => {
      const theirs = sameDay.filter((assignment) => assignment.handlerUid === handler.uid);

      const onThisFlight = theirs.some(
        (assignment) => flight !== '' && normalizeFlightNumber(assignment.flightNumber) === flight,
      );
      const clash = theirs.some((assignment) => shiftsOverlap(assignment.shiftTime, shiftTime));

      return !onThisFlight && !clash;
    })
    .map((handler) => {
      const checkedIn =
        isToday &&
        attendance.some(
          (record) =>
            record.handlerUid === handler.uid &&
            record.date.trim() === today &&
            record.status === 'Checked In',
        );
      const tasksThatDay = sameDay.filter((assignment) => assignment.handlerUid === handler.uid).length;

      return { handler, checkedIn, tasksThatDay, reason: describe(checkedIn, tasksThatDay, isToday) };
    });

  return candidates
    .sort(
      (a, b) =>
        Number(b.checkedIn) - Number(a.checkedIn) ||
        a.tasksThatDay - b.tasksThatDay ||
        handlerName(a.handler).localeCompare(handlerName(b.handler)),
    )
    .slice(0, limit);
}
