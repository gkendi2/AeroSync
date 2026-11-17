import { doc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';

/**
 * Moves a handler's own assignment one step: Assigned → In Progress → Completed.
 * Same single-field update My Tasks always made (allowed by the CrewAssignments rule).
 */
export async function advanceTask(assignmentId: string, currentStatus: string) {
  const nextStatus =
    currentStatus === 'Assigned'
      ? 'In Progress'
      : currentStatus === 'In Progress'
        ? 'Completed'
        : null;

  if (!nextStatus) return;

  await updateDoc(doc(db, 'CrewAssignments', assignmentId), { status: nextStatus });
}
