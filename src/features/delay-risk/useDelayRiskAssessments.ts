/**
 * Live delay-risk assessment of every flight: the Firestore listeners and the
 * per-flight calculation, moved unchanged from the delay-risk screen so the
 * screen and the supervisor notifications share them.
 */
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { normalizeFlightNumber } from '@/features/baggage/validation';
import {
  computeFlightInputs,
  FlightLiveInputs,
  isUnresolvedIncidentStatus,
} from '@/features/delay-risk/inputs';
import {
  DelayRiskFeature,
  DelayRiskResult,
  evaluateDelayRisk,
  outOfTrainingRange,
  RiskLevel,
} from '@/features/delay-risk/model';
import { auth, db } from '@/lib/firebase';

const CLOCK_TICK_MS = 30000;

export type Attendance = {
  handlerUid: string;
  date: string;
  status: string;
};

export type Assignment = {
  id: string;
  flightNumber: string;
  handlerUid: string;
  handlerName: string;
  shiftDate: string;
  shiftTime: string;
  activity: string;
  status: string;
};

export type BaggageRecord = {
  id: string;
  baggageId: string;
  flightId: string;
  status: string;
  createdAt: Date | null;
};

export type Flight = {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  status: string;
  isDemo?: boolean;
};

export type Incident = {
  id: string;
  flightId: string;
  flightNumber: string;
  reportCategory: string;
  incidentType: string;
  location: string;
  severity: string;
  description: string;
  status: string;
  reportedAt: Date | null;
};

export type FlightAssessment = {
  flight: Flight;
  live: FlightLiveInputs;
  /** Hybrid model result; null when the flight cannot be scored. */
  result: DelayRiskResult | null;
  risk: RiskLevel | null;
  outOfRange: DelayRiskFeature[];
  unresolvedIncidents: Incident[];
};

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assessFlight(
  flight: Flight,
  assignments: Assignment[],
  baggageRecords: BaggageRecord[],
  incidents: Incident[],
  attendance: Attendance[],
  now: Date,
): FlightAssessment {
  const live = computeFlightInputs(
    flight,
    { bags: baggageRecords, assignments, attendance, incidents },
    now,
  );

  const result = live.modelInputs ? evaluateDelayRisk(live.modelInputs) : null;

  // Same flight match as computeFlightInputs: by Flights document id,
  // falling back to the flight number on older reports.
  const unresolvedIncidents = incidents.filter((item) => {
    const belongs = item.flightId
      ? item.flightId === flight.id
      : normalizeFlightNumber(item.flightNumber) ===
        normalizeFlightNumber(flight.flightNumber);

    return belongs && isUnresolvedIncidentStatus(item.status);
  });

  return {
    flight,
    live,
    result,
    risk: result ? result.riskLevel : null,
    outOfRange: live.modelInputs ? outOfTrainingRange(live.modelInputs) : [],
    unresolvedIncidents,
  };
}

/** Pass enabled = false to skip the listeners (e.g. for handlers). */
export function useDelayRiskAssessments(enabled = true) {
  const [now, setNow] = useState(() => new Date());
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(
    () => enabled && auth.currentUser !== null,
  );

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [baggageRecords, setBaggageRecords] = useState<BaggageRecord[]>([]);
  const [flightsData, setFlightsData] = useState<Flight[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [loadingAssignments, setLoadingAssignments] = useState(enabled);
  const [loadingBaggage, setLoadingBaggage] = useState(enabled);
  const [loadingFlights, setLoadingFlights] = useState(enabled);
  const [loadingIncidents, setLoadingIncidents] = useState(enabled);

  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;

    if (!auth.currentUser) {
      setError('Please sign in to view delay risk.');
      setLoadingAssignments(false);
      setLoadingBaggage(false);
      setLoadingFlights(false);
      setLoadingIncidents(false);
      return;
    }

    const unsubscribeAssignments = onSnapshot(
      collection(db, 'CrewAssignments'),
      (snapshot) => {
        setAssignments(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              flightNumber: data.flightNumber ?? '',
              handlerUid: data.handlerUid ?? '',
              handlerName: data.handlerName ?? 'Unknown handler',
              shiftDate: data.shiftDate ?? '',
              shiftTime: data.shiftTime ?? '',
              activity: data.activity ?? '',
              status: data.status ?? 'Assigned',
            };
          }),
        );
        setLoadingAssignments(false);
      },
      (err) => {
        console.error('Could not load assignments:', err);
        setError('Could not load crew assignment records.');
        setLoadingAssignments(false);
      },
    );

    const unsubscribeBaggage = onSnapshot(
      collection(db, 'BaggageRecords'),
      (snapshot) => {
        setBaggageRecords(
          snapshot.docs.map((item) => {
            // 'estimate' gives a just-registered bag a createdAt straight away.
            const data = item.data({ serverTimestamps: 'estimate' });
            const timestamp = data.createdAt;

            return {
              id: item.id,
              baggageId: data.baggageId ?? item.id,
              flightId: data.flightId ?? '',
              status: data.status ?? 'Unknown',
              createdAt:
                timestamp && typeof timestamp.toDate === 'function'
                  ? timestamp.toDate()
                  : null,
            };
          }),
        );
        setLoadingBaggage(false);
      },
      (err) => {
        console.error('Could not load baggage:', err);
        setError('Could not load baggage records.');
        setLoadingBaggage(false);
      },
    );

    const unsubscribeFlights = onSnapshot(
      collection(db, 'Flights'),
      (snapshot) => {
        setFlightsData(
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
              isDemo: data.isDemo ?? false,
            };
          }),
        );
        setLoadingFlights(false);
      },
      (err) => {
        console.error('Could not load flights:', err);
        setError('Could not load flight records.');
        setLoadingFlights(false);
      },
    );

    const unsubscribeIncidents = onSnapshot(
      collection(db, 'Incidents'),
      (snapshot) => {
        setIncidents(
          snapshot.docs.map((item) => {
            const data = item.data();
            const timestamp = data.reportedAt;

            return {
              id: item.id,
              flightId: data.flightId ?? '',
              flightNumber: data.flightNumber ?? '',
              reportCategory: data.reportCategory ?? '',
              incidentType: data.incidentType ?? '',
              location: data.location ?? '',
              severity: data.severity ?? 'Low',
              description: data.description ?? '',
              status: data.status ?? 'Open',
              reportedAt:
                timestamp && typeof timestamp.toDate === 'function'
                  ? timestamp.toDate()
                  : null,
            };
          }),
        );
        setLoadingIncidents(false);
      },
      (err) => {
        console.error('Could not load incidents:', err);
        setError('Could not load incident records.');
        setLoadingIncidents(false);
      },
    );

    return () => {
      unsubscribeAssignments();
      unsubscribeBaggage();
      unsubscribeFlights();
      unsubscribeIncidents();
    };
  }, [enabled]);

  // Time remaining changes without any Firestore update, so re-score on a timer.
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [enabled]);

  // Today's check-ins. Only today's records can affect staff availability:
  // a shift on a later date has not started yet.
  const todayKey = localDateKey(now);

  useEffect(() => {
    if (!enabled || !auth.currentUser) return;

    const unsubscribeAttendance = onSnapshot(
      query(collection(db, 'Attendance'), where('date', '==', todayKey)),
      (snapshot) => {
        setAttendance(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              handlerUid: data.handlerUid ?? '',
              date: data.date ?? '',
              status: data.status ?? '',
            };
          }),
        );
        setLoadingAttendance(false);
      },
      (err) => {
        console.error('Could not load attendance:', err);
        setError('Could not load attendance records.');
        setLoadingAttendance(false);
      },
    );

    return unsubscribeAttendance;
  }, [todayKey, enabled]);

  // Only real Flights documents are assessed.
  const flights = useMemo(
    () =>
      flightsData.filter(
        (flight) => flight.id && flight.flightNumber.trim(),
      ),
    [flightsData],
  );

  const assessments = useMemo(() => {
    return flights.map((flight) =>
      assessFlight(
        flight,
        assignments,
        baggageRecords,
        incidents,
        attendance,
        now,
      ),
    );
  }, [flights, assignments, baggageRecords, incidents, attendance, now]);

  const loading =
    loadingAssignments ||
    loadingBaggage ||
    loadingFlights ||
    loadingIncidents ||
    loadingAttendance;

  return { assessments, loading, error, now };
}
