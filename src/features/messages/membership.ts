/**
 * Who may use a flight's message thread. Pure functions, unit-tested.
 *
 * A handler is a member of the thread of a Flights document while they have
 * at least one non-cancelled crew assignment for it (Completed still counts).
 * An assignment belongs to a Flights document when the flight numbers match
 * (ignoring case, spaces and hyphens) and shiftDate = departureDate, the same
 * match the delay-risk inputs use.
 *
 * Member documents: FlightMessages/{flightId}/members/{handlerUid}
 *   { handlerUid, assignmentIds: string[], updatedBy, updatedAt }
 */
import type { FlightRecord } from '../delay-risk/inputs';
import { findFlightForTask } from '../handler/tasks';

export const MAX_MESSAGE_LENGTH = 500;

export type MembershipAssignment = {
  id: string;
  handlerUid: string;
  flightNumber: string;
  shiftDate: string;
  status: string;
};

/** The member document an assignment grants; null if cancelled or no flight matches. */
export function memberKeyFor(
  assignment: Omit<MembershipAssignment, 'id'>,
  flights: FlightRecord[],
): { flightId: string; handlerUid: string } | null {
  if (!assignment.handlerUid || assignment.status === 'Cancelled') return null;

  const flight = findFlightForTask(assignment, flights);
  return flight ? { flightId: flight.id, handlerUid: assignment.handlerUid } : null;
}

export function sameMemberKey(
  a: { flightId: string; handlerUid: string } | null,
  b: { flightId: string; handlerUid: string } | null,
) {
  return !!a && !!b && a.flightId === b.flightId && a.handlerUid === b.handlerUid;
}

/** Assignment IDs after adding or removing one; keeps order, no duplicates. */
export function updateAssignmentIds(current: string[], id: string, change: 'add' | 'remove') {
  const without = current.filter((item) => item !== id);
  return change === 'add' ? [...without, id] : without;
}

/**
 * Every member document the assignments call for, keyed "flightId/handlerUid",
 * for rebuilding access from scratch. Handlers outside `handlerUids` (no longer
 * approved handlers) are left out.
 */
export function desiredMemberships(
  assignments: MembershipAssignment[],
  flights: FlightRecord[],
  handlerUids: Set<string>,
) {
  const result = new Map<string, { flightId: string; handlerUid: string; assignmentIds: string[] }>();

  for (const assignment of assignments) {
    const key = memberKeyFor(assignment, flights);
    if (!key || !handlerUids.has(key.handlerUid)) continue;

    const mapKey = `${key.flightId}/${key.handlerUid}`;
    const entry = result.get(mapKey) ?? { ...key, assignmentIds: [] };
    entry.assignmentIds.push(assignment.id);
    result.set(mapKey, entry);
  }

  return result;
}

/** Message text as it will be stored, or an error to show. */
export function checkMessageText(
  raw: string,
): { ok: true; text: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'Type a message first.' };
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.` };
  }
  return { ok: true, text };
}
