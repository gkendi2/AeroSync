/**
 * Read-only Firestore listeners used by the handler screens.
 * The rules let approved staff read Flights and BaggageRecords, and a handler
 * read their own Attendance document.
 */
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { BaggageRecord, FlightRecord } from '@/features/delay-risk/inputs';
import { db } from '@/lib/firebase';

export type HandlerFlight = FlightRecord & { origin: string; destination: string; status: string };

export function flightRoute(flight: HandlerFlight | null | undefined) {
  if (!flight || (!flight.origin && !flight.destination)) return undefined;
  return `${flight.origin || '?'} → ${flight.destination || '?'}`;
}

export function useFlights() {
  const [flights, setFlights] = useState<HandlerFlight[]>([]);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'Flights'),
        (snapshot) =>
          setFlights(
            snapshot.docs.map((item) => {
              const data = item.data();
              return {
                id: item.id,
                flightNumber: data.flightNumber ?? '',
                origin: data.origin ?? '',
                destination: data.destination ?? '',
                departureDate: data.departureDate ?? '',
                departureTime: data.departureTime ?? '',
                status: data.status ?? '',
              };
            }),
          ),
        (error) => console.error('Could not load flights:', error),
      ),
    [],
  );

  return flights;
}

export function useBaggage(enabled: boolean) {
  const [bags, setBags] = useState<BaggageRecord[]>([]);

  useEffect(() => {
    if (!enabled) return;

    return onSnapshot(
      collection(db, 'BaggageRecords'),
      (snapshot) =>
        setBags(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              flightId: data.flightId ?? '',
              status: data.status ?? '',
              createdAt: data.createdAt?.toDate?.() ?? null,
            };
          }),
        ),
      (error) => console.error('Could not load baggage:', error),
    );
  }, [enabled]);

  return bags;
}

/** Status of the handler's Attendance document for a date ('Checked In' / 'Checked Out' / null). */
export function useAttendanceStatus(uid: string | undefined, date: string) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    return onSnapshot(
      doc(db, 'Attendance', `${uid}_${date}`),
      (snapshot) => {
        setStatus(snapshot.exists() ? (snapshot.data().status ?? 'Checked In') : null);
        setLoading(false);
      },
      (error) => {
        console.error('Could not load attendance:', error);
        setLoading(false);
      },
    );
  }, [uid, date]);

  return { status, loading };
}
