
import { FirebaseError } from 'firebase/app';
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

import {
  BaggageStatus,
  HandlingAction,
  planHandling,
} from './handling';

const SAVE_TIMEOUT_MS = 10_000;

export class HandlingError extends Error {}

/**
 * Records a handling event and updates the baggage record
 * in ONE Firestore transaction.
 *
 * The event document ID is also saved on the parent baggage
 * record. Firestore security rules use this ID to verify that
 * the event and parent status update belong to the same
 * transaction.
 */
export async function recordHandlingEvent(
  documentId: string,
  action: HandlingAction,
  handlerUid: string
): Promise<BaggageStatus> {
  const baggageRef = doc(db, 'BaggageRecords', documentId);
  const eventRef = doc(collection(baggageRef, 'handlingEvents'));

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new HandlingError(
            'The server did not confirm this action. Check your connection, then scan the bag again to see whether its status changed.'
          )
        ),
      SAVE_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([
      runTransaction(db, async (tx) => {
        const snapshot = await tx.get(baggageRef);

        if (!snapshot.exists()) {
          throw new HandlingError(
            'This baggage record no longer exists.'
          );
        }

        const data = snapshot.data();
        const plan = planHandling(data.status, action);

        if (!plan.ok) {
          throw new HandlingError(plan.message);
        }

        tx.set(eventRef, {
          action,
          baggageId: data.baggageId || documentId,
          flightId: data.flightId || '',
          handlerUid,
          timestamp: serverTimestamp(),
        });

        tx.update(baggageRef, {
          status: plan.newStatus,
          lastHandlingAction: action,
          lastHandledBy: handlerUid,
          lastHandledAt: serverTimestamp(),
          lastHandlingEventId: eventRef.id,
        });

        return plan.newStatus;
      }),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof HandlingError) {
      throw error;
    }

    if (
      error instanceof FirebaseError &&
      error.code === 'unavailable'
    ) {
      throw new HandlingError(
        'You appear to be offline. Nothing was saved. Reconnect and try again.'
      );
    }

    if (
      error instanceof FirebaseError &&
      error.code === 'permission-denied'
    ) {
      throw new HandlingError(
        'Your account is not allowed to record this action.'
      );
    }

    console.error('Recording handling event failed:', error);

    throw new HandlingError(
      'Could not save this action. Please try again.'
    );
  } finally {
    clearTimeout(timer);
  }
}
