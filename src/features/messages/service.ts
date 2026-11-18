/**
 * Firestore writes for flight messages.
 *
 * Crew-assignment writes that can change thread membership run in ONE
 * transaction with the member document(s), so the assignment and its
 * message access never disagree.
 */
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  Transaction,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore';

import type { FlightRecord } from '@/features/delay-risk/inputs';
import { ADMIN_UID } from '@/lib/admin';
import { auth, db } from '@/lib/firebase';

import {
  desiredMemberships,
  memberKeyFor,
  sameMemberKey,
  updateAssignmentIds,
  type MembershipAssignment,
} from './membership';

type MemberKey = { flightId: string; handlerUid: string };

function memberRef(key: MemberKey) {
  return doc(db, 'FlightMessages', key.flightId, 'members', key.handlerUid);
}

/** Adds or removes one assignment ID on a member document read in this transaction. */
function writeMember(
  tx: Transaction,
  key: MemberKey,
  snapshot: DocumentSnapshot,
  assignmentId: string,
  change: 'add' | 'remove',
  uid: string,
) {
  const current: string[] = snapshot.exists() ? snapshot.data().assignmentIds ?? [] : [];
  const next = updateAssignmentIds(current, assignmentId, change);

  if (next.length === 0) {
    if (snapshot.exists()) tx.delete(memberRef(key));
    return;
  }

  tx.set(memberRef(key), {
    handlerUid: key.handlerUid,
    assignmentIds: next,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
}

/** Creates a crew assignment and its thread membership together. */
export async function createAssignmentWithAccess(
  data: Record<string, unknown> & Omit<MembershipAssignment, 'id' | 'status'>,
  flights: FlightRecord[],
  uid: string,
) {
  const assignmentRef = doc(collection(db, 'CrewAssignments'));
  const key = memberKeyFor({ ...data, status: 'Assigned' }, flights);

  await runTransaction(db, async (tx) => {
    const member = key ? await tx.get(memberRef(key)) : null;

    tx.set(assignmentRef, data);
    if (key && member) writeMember(tx, key, member, assignmentRef.id, 'add', uid);
  });
}

/**
 * Updates a crew assignment (edit or cancel) and moves its thread membership
 * when the flight or handler changes, or removes it when cancelled.
 */
export async function updateAssignmentWithAccess(
  assignmentId: string,
  before: Omit<MembershipAssignment, 'id'>,
  changes: Record<string, unknown> & Partial<Omit<MembershipAssignment, 'id'>>,
  flights: FlightRecord[],
  uid: string,
) {
  const oldKey = memberKeyFor(before, flights);
  const newKey = memberKeyFor({ ...before, ...changes }, flights);
  const moved = !sameMemberKey(oldKey, newKey);

  await runTransaction(db, async (tx) => {
    // All reads before any write.
    const oldMember = oldKey && moved ? await tx.get(memberRef(oldKey)) : null;
    const newMember = newKey ? await tx.get(memberRef(newKey)) : null;

    tx.update(doc(db, 'CrewAssignments', assignmentId), changes);

    if (oldKey && oldMember) writeMember(tx, oldKey, oldMember, assignmentId, 'remove', uid);
    // Also adds assignments created before membership existed.
    if (newKey && newMember) writeMember(tx, newKey, newMember, assignmentId, 'add', uid);
  });
}

/**
 * Rebuilds every member document from the current assignments (admin tool).
 * Safe to run again at any time. Returns how many documents were written and removed.
 */
export async function rebuildMessageAccess(uid: string) {
  const [assignmentSnap, flightSnap, handlerSnap, memberSnap] = await Promise.all([
    getDocs(collection(db, 'CrewAssignments')),
    getDocs(collection(db, 'Flights')),
    getDocs(query(collection(db, 'users'), where('role', '==', 'handler'))),
    getDocs(collectionGroup(db, 'members')),
  ]);

  const assignments: MembershipAssignment[] = assignmentSnap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      handlerUid: data.handlerUid ?? '',
      flightNumber: data.flightNumber ?? '',
      shiftDate: data.shiftDate ?? '',
      status: data.status ?? 'Assigned',
    };
  });

  const flights: FlightRecord[] = flightSnap.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      flightNumber: data.flightNumber ?? '',
      departureDate: data.departureDate ?? '',
      departureTime: data.departureTime ?? '',
    };
  });

  const desired = desiredMemberships(
    assignments,
    flights,
    new Set(handlerSnap.docs.map((item) => item.id)),
  );

  type Write = { kind: 'set' | 'delete'; key: MemberKey; assignmentIds?: string[] };
  const writes: Write[] = [];
  const existing = new Map<string, string[]>();

  for (const member of memberSnap.docs) {
    const flightId = member.ref.parent.parent?.id;
    if (!flightId || member.ref.parent.parent?.parent.id !== 'FlightMessages') continue;

    const mapKey = `${flightId}/${member.id}`;
    existing.set(mapKey, member.data().assignmentIds ?? []);
    if (!desired.has(mapKey)) {
      writes.push({ kind: 'delete', key: { flightId, handlerUid: member.id } });
    }
  }

  for (const [mapKey, entry] of desired) {
    const current = existing.get(mapKey);
    const unchanged =
      current &&
      current.length === entry.assignmentIds.length &&
      entry.assignmentIds.every((id) => current.includes(id));

    if (!unchanged) {
      writes.push({ kind: 'set', key: entry, assignmentIds: entry.assignmentIds });
    }
  }

  // Firestore batches hold at most 500 writes.
  for (let start = 0; start < writes.length; start += 400) {
    const batch = writeBatch(db);

    for (const write of writes.slice(start, start + 400)) {
      if (write.kind === 'delete') {
        batch.delete(memberRef(write.key));
      } else {
        batch.set(memberRef(write.key), {
          handlerUid: write.key.handlerUid,
          assignmentIds: write.assignmentIds,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  }

  return {
    written: writes.filter((write) => write.kind === 'set').length,
    removed: writes.filter((write) => write.kind === 'delete').length,
    members: desired.size,
  };
}

/** Adds a message to a flight's thread. Text must already be checked. */
export async function sendFlightMessage(
  flight: { id: string; flightNumber: string },
  text: string,
  sender: { uid: string; name: string; role: 'supervisor' | 'handler' },
) {
  await addDoc(collection(db, 'FlightMessages', flight.id, 'messages'), {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    senderUid: sender.uid,
    senderName: sender.name,
    senderRole: sender.role,
    text,
    createdAt: serverTimestamp(),
  });
}

/** Name and role stored on the user's messages; the rules check the role. */
export async function getSenderProfile() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');

  const profile = await getDoc(doc(db, 'users', user.uid));
  const data = profile.exists() ? profile.data() : {};

  const role: 'supervisor' | 'handler' =
    user.uid === ADMIN_UID || data.role === 'supervisor' ? 'supervisor' : 'handler';

  const name = (
    data.displayName ||
    user.displayName ||
    user.email?.split('@')[0] ||
    (role === 'supervisor' ? 'Supervisor' : 'Handler')
  )
    .toString()
    .trim()
    .slice(0, 80);

  return { uid: user.uid, name, role };
}
