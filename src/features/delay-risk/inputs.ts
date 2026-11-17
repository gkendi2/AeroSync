/**
 * Computes the live model inputs for one flight from Firestore records.
 * Pure functions (no Firebase imports), unit-tested. Definitions:
 *
 *   time_remaining_minutes = minutes from now to departureDate + departureTime (local time)
 *   baggage_progress_pct   = 100 × (bags Loading or Offloaded) ÷ (bags for this departure)
 *   staff_availability_pct = 100 × (assigned handlers available) ÷ (assigned handlers)
 *   unresolved_incidents   = incidents for the flight whose status is anything but Resolved or Closed
 *
 * Flight numbers are compared after normalising both sides (uppercase, no spaces/hyphens).
 */
import { normalizeFlightNumber } from '../baggage/validation';
import type { DelayRiskInputs } from './model';

export type FlightRecord = {
  id: string;
  flightNumber: string;
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
};

export type BaggageRecord = {
  flightId: string; // holds the flight NUMBER, as stored at registration
  status: string;
  createdAt: Date | null;
};

export type AssignmentRecord = {
  flightNumber: string;
  handlerUid: string;
  shiftDate: string; // YYYY-MM-DD
  shiftTime: string; // "HH:MM - HH:MM" or "HH:MM", optional AM/PM
  status: string;
};

export type AttendanceRecord = {
  handlerUid: string;
  date: string; // YYYY-MM-DD
  status: string; // 'Checked In' | 'Checked Out'
};

export type IncidentRecord = {
  flightId: string; // Flights document id
  flightNumber: string;
  status: string;
};

export type NotScoredReason =
  | 'no-departure-time'
  | 'past-departure'
  | 'no-baggage'
  | 'no-crew';

export const NOT_SCORED_LABELS: Record<NotScoredReason, string> = {
  'no-departure-time': 'No scheduled departure time',
  'past-departure': 'Past scheduled departure',
  'no-baggage': 'No baggage registered',
  'no-crew': 'No crew assigned',
};

export type FlightLiveInputs = {
  timeRemainingMinutes: number | null;
  baggage: { total: number; handled: number; pct: number | null };
  staff: { assigned: number; available: number; pct: number | null };
  unresolvedIncidents: number;
  /** Why the flight cannot be scored; empty when `modelInputs` is set. */
  notScored: NotScoredReason[];
  modelInputs: DelayRiskInputs | null;
};

const BAGGAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const HANDLED_BAG_STATUSES = ['loading', 'offloaded'];
// The app writes Open, Under Review, Resolved and Closed. Every status except
// the two finished ones counts as unresolved.
const RESOLVED_INCIDENT_STATUSES = ['resolved', 'closed'];

export function isUnresolvedIncidentStatus(status: string): boolean {
  return !RESOLVED_INCIDENT_STATUSES.includes(lower(status));
}

function sameFlightNumber(a: string, b: string) {
  const left = normalizeFlightNumber(a);
  return left !== '' && left === normalizeFlightNumber(b);
}

function lower(value: string) {
  return value.trim().toLowerCase();
}

/** Local date-time from 'YYYY-MM-DD' and 'HH:MM'; null if either is malformed. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const d = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;

  const hours = Number(t[1]);
  const minutes = Number(t[2]);
  if (hours > 23 || minutes > 59) return null;

  const result = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hours, minutes);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** Start of a shift from shiftDate and the first time in shiftTime; null if unparseable. */
export function parseShiftStart(shiftDate: string, shiftTime: string): Date | null {
  const match = shiftTime.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const period = match[3]?.toUpperCase();

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'AM' && hours === 12) hours = 0;
    if (period === 'PM' && hours !== 12) hours += 12;
  }

  return parseLocalDateTime(shiftDate, `${hours}:${match[2]}`);
}

function baggageProgress(flight: FlightRecord, departure: Date | null, bags: BaggageRecord[]) {
  // Bags carry no flight date, so only those created in the 24 hours before
  // scheduled departure belong to this departure.
  const forDeparture = departure
    ? bags.filter((bag) => {
        if (!sameFlightNumber(bag.flightId, flight.flightNumber) || !bag.createdAt) return false;
        const age = departure.getTime() - bag.createdAt.getTime();
        return age >= 0 && age <= BAGGAGE_WINDOW_MS;
      })
    : [];

  const total = forDeparture.length;
  const handled = forDeparture.filter((bag) =>
    HANDLED_BAG_STATUSES.includes(lower(bag.status)),
  ).length;

  return { total, handled, pct: total > 0 ? (100 * handled) / total : null };
}

function staffAvailability(
  flight: FlightRecord,
  assignments: AssignmentRecord[],
  attendance: AttendanceRecord[],
  now: Date,
) {
  const byHandler = new Map<string, AssignmentRecord[]>();

  for (const assignment of assignments) {
    if (
      !assignment.handlerUid ||
      !sameFlightNumber(assignment.flightNumber, flight.flightNumber) ||
      assignment.shiftDate.trim() !== flight.departureDate.trim() ||
      lower(assignment.status) === 'cancelled'
    ) {
      continue;
    }

    const list = byHandler.get(assignment.handlerUid) ?? [];
    list.push(assignment);
    byHandler.set(assignment.handlerUid, list);
  }

  let available = 0;

  for (const [handlerUid, handlerAssignments] of byHandler) {
    // Not due yet: every assignment has a readable start time that is still ahead.
    const starts = handlerAssignments.map((a) => parseShiftStart(a.shiftDate, a.shiftTime));
    const notStarted = starts.every((start) => start !== null && now.getTime() < start.getTime());

    const checkedIn = attendance.some(
      (record) =>
        record.handlerUid === handlerUid &&
        record.date.trim() === flight.departureDate.trim() &&
        lower(record.status) === 'checked in',
    );

    const allCompleted = handlerAssignments.every((a) => lower(a.status) === 'completed');

    if (notStarted || checkedIn || allCompleted) available += 1;
  }

  const assigned = byHandler.size;
  return { assigned, available, pct: assigned > 0 ? (100 * available) / assigned : null };
}

function countUnresolvedIncidents(flight: FlightRecord, incidents: IncidentRecord[]) {
  return incidents.filter((incident) => {
    const belongs = incident.flightId
      ? incident.flightId === flight.id
      : sameFlightNumber(incident.flightNumber, flight.flightNumber);

    return belongs && isUnresolvedIncidentStatus(incident.status);
  }).length;
}

export function computeFlightInputs(
  flight: FlightRecord,
  records: {
    bags: BaggageRecord[];
    assignments: AssignmentRecord[];
    attendance: AttendanceRecord[];
    incidents: IncidentRecord[];
  },
  now: Date,
): FlightLiveInputs {
  const departure = parseLocalDateTime(flight.departureDate, flight.departureTime);
  const timeRemainingMinutes = departure
    ? (departure.getTime() - now.getTime()) / 60000
    : null;

  const baggage = baggageProgress(flight, departure, records.bags);
  const staff = staffAvailability(flight, records.assignments, records.attendance, now);
  const unresolvedIncidents = countUnresolvedIncidents(flight, records.incidents);

  const notScored: NotScoredReason[] = [];
  if (timeRemainingMinutes === null) notScored.push('no-departure-time');
  else if (timeRemainingMinutes < 0) notScored.push('past-departure');
  if (timeRemainingMinutes !== null && baggage.pct === null) notScored.push('no-baggage');
  if (staff.pct === null) notScored.push('no-crew');

  const modelInputs: DelayRiskInputs | null =
    notScored.length === 0 &&
    timeRemainingMinutes !== null &&
    baggage.pct !== null &&
    staff.pct !== null
      ? {
          time_remaining_minutes: timeRemainingMinutes,
          baggage_progress_pct: baggage.pct,
          staff_availability_pct: staff.pct,
          unresolved_incidents: unresolvedIncidents,
        }
      : null;

  return { timeRemainingMinutes, baggage, staff, unresolvedIncidents, notScored, modelInputs };
}
