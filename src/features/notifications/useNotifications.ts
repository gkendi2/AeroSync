/**
 * Live notifications for the signed-in user, built from existing data.
 * Stored state: NotificationState/{uid}.lastSeenAt on the server, and (for
 * supervisors) the High-risk flights seen at the last visit, per device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { toDateString } from '@/features/datetime/format';
import { useDelayRiskAssessments } from '@/features/delay-risk/useDelayRiskAssessments';
import { useFlights } from '@/features/handler/hooks';
import { memberKeyFor } from '@/features/messages/membership';
import { ADMIN_UID } from '@/lib/admin';
import { auth, db } from '@/lib/firebase';

import {
  buildHandlerNotifications,
  buildSupervisorNotifications,
  NOTIFICATION_WINDOW_DAYS,
  unreadCount,
  type NotifyAssignment,
  type NotifyIncident,
  type NotifyMessage,
} from './build';

type Role = 'supervisor' | 'handler' | null;

const toDate = (value: unknown): Date | null =>
  value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : null;

const seenHighRiskKey = (uid: string) => `aerosync.seenHighRisk.${uid}`;

function toIncident(id: string, data: DocumentData): NotifyIncident {
  const title = data.incidentType || data.reportCategory || 'Incident';
  return {
    id,
    title: data.flightNumber ? `${title} – ${data.flightNumber}` : title,
    severity: data.severity ?? 'Low',
    status: data.status ?? 'Open',
    reportedBy: data.reportedBy ?? '',
    reportedAt: toDate(data.reportedAt),
    statusUpdatedAt: toDate(data.statusUpdatedAt),
    supervisorNotes: data.supervisorNotes ?? '',
    supervisorNotesUpdatedAt: toDate(data.supervisorNotesUpdatedAt),
  };
}

function toMessage(id: string, data: DocumentData): NotifyMessage {
  return {
    id,
    flightId: data.flightId ?? '',
    flightNumber: data.flightNumber ?? '',
    senderUid: data.senderUid ?? '',
    senderName: data.senderName ?? 'Unknown',
    senderRole: data.senderRole ?? '',
    text: data.text ?? '',
    createdAt: toDate(data.createdAt),
  };
}

/** 'supervisor' for the admin and approved supervisors, 'handler' for handlers. */
export function useUserRole(): Role {
  const [role, setRole] = useState<Role>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    if (uid === ADMIN_UID) {
      setRole('supervisor');
      return;
    }

    getDoc(doc(db, 'users', uid))
      .then((snapshot) => {
        const value = snapshot.exists() ? snapshot.data().role : '';
        setRole(value === 'supervisor' ? 'supervisor' : value === 'handler' ? 'handler' : null);
      })
      .catch((error) => console.error('Could not load role:', error));
  }, [uid]);

  return role;
}

export function useNotifications() {
  const uid = auth.currentUser?.uid ?? '';
  const role = useUserRole();
  const isSupervisor = role === 'supervisor';
  const isHandler = role === 'handler';

  const [now, setNow] = useState(() => new Date());
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [lastSeenLoaded, setLastSeenLoaded] = useState(false);
  const [assignments, setAssignments] = useState<(NotifyAssignment & { handlerUid: string })[]>([]);
  const [incidents, setIncidents] = useState<NotifyIncident[]>([]);
  const [messagesByFlight, setMessagesByFlight] = useState<Record<string, NotifyMessage[]>>({});
  const [allMessages, setAllMessages] = useState<NotifyMessage[]>([]);
  const [seenHighRisk, setSeenHighRisk] = useState<Set<string>>(new Set());

  const flights = useFlights();
  const risk = useDelayRiskAssessments(isSupervisor);

  // Keep the 7-day window moving.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'NotificationState', uid),
      (snapshot) => {
        // 'estimate' applies a just-written lastSeenAt straight away.
        setLastSeen(toDate(snapshot.data({ serverTimestamps: 'estimate' })?.lastSeenAt));
        setLastSeenLoaded(true);
      },
      (error) => {
        console.error('Could not load notification state:', error);
        setLastSeenLoaded(true);
      },
    );
  }, [uid]);

  // Supervisors: High-risk flights seen at the last visit, on this device.
  useEffect(() => {
    if (!uid || !isSupervisor) return;
    AsyncStorage.getItem(seenHighRiskKey(uid))
      .then((value) => setSeenHighRisk(new Set(value ? (JSON.parse(value) as string[]) : [])))
      .catch((error) => console.error('Could not read seen High-risk flights:', error));
  }, [uid, isSupervisor]);

  // Handlers: own assignments and own incident reports.
  useEffect(() => {
    if (!uid || !isHandler) return;

    const stopAssignments = onSnapshot(
      query(collection(db, 'CrewAssignments'), where('handlerUid', '==', uid)),
      (snapshot) =>
        setAssignments(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              handlerUid: data.handlerUid ?? '',
              flightNumber: data.flightNumber ?? '',
              activity: data.activity ?? '',
              shiftDate: data.shiftDate ?? '',
              shiftTime: data.shiftTime ?? '',
              status: data.status ?? 'Assigned',
              createdAt: toDate(data.createdAt),
            };
          }),
        ),
      (error) => console.error('Could not load assignments for notifications:', error),
    );

    const stopIncidents = onSnapshot(
      query(collection(db, 'Incidents'), where('reportedBy', '==', uid)),
      (snapshot) => setIncidents(snapshot.docs.map((item) => toIncident(item.id, item.data()))),
      (error) => console.error('Could not load reports for notifications:', error),
    );

    return () => {
      stopAssignments();
      stopIncidents();
    };
  }, [uid, isHandler]);

  // Handlers: the flights whose threads they belong to (same rule as membership).
  const handlerFlightIds = useMemo(() => {
    if (!isHandler) return '';
    const ids = new Set<string>();
    for (const assignment of assignments) {
      const key = memberKeyFor(assignment, flights);
      if (key) ids.add(key.flightId);
    }
    return [...ids].sort().join(',');
  }, [isHandler, assignments, flights]);

  // The query bound only needs to move once a day (the builder applies the exact window).
  const dayKey = toDateString(now);
  const windowStart = useMemo(
    () => new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 86400000),
    [dayKey],
  );

  useEffect(() => {
    if (!isHandler || !handlerFlightIds) {
      setMessagesByFlight({});
      return;
    }

    const stops = handlerFlightIds.split(',').map((flightId) =>
      onSnapshot(
        query(
          collection(db, 'FlightMessages', flightId, 'messages'),
          where('createdAt', '>=', windowStart),
        ),
        (snapshot) =>
          setMessagesByFlight((current) => ({
            ...current,
            [flightId]: snapshot.docs.map((item) => toMessage(item.id, item.data())),
          })),
        // e.g. membership not rebuilt yet: no notifications from that flight.
        (error) => console.warn(`No message access for flight ${flightId}:`, error.code),
      ),
    );

    return () => stops.forEach((stop) => stop());
  }, [isHandler, handlerFlightIds, windowStart]);

  // Supervisors: every incident and every flight's messages.
  useEffect(() => {
    if (!uid || !isSupervisor) return;

    const stopIncidents = onSnapshot(
      collection(db, 'Incidents'),
      (snapshot) => setIncidents(snapshot.docs.map((item) => toIncident(item.id, item.data()))),
      (error) => console.error('Could not load incidents for notifications:', error),
    );

    // Unfiltered collection-group query: needs no extra index.
    const stopMessages = onSnapshot(
      collectionGroup(db, 'messages'),
      (snapshot) => setAllMessages(snapshot.docs.map((item) => toMessage(item.id, item.data()))),
      (error) => console.error('Could not load messages for notifications:', error),
    );

    return () => {
      stopIncidents();
      stopMessages();
    };
  }, [uid, isSupervisor]);

  const highRiskFlights = useMemo(
    () =>
      isSupervisor
        ? risk.assessments
            .filter((item) => item.risk === 'High')
            .map((item) => ({
              id: item.flight.id,
              flightNumber: item.flight.flightNumber,
              departureDate: item.flight.departureDate,
              departureTime: item.flight.departureTime,
            }))
        : [],
    [isSupervisor, risk.assessments],
  );

  const notifications = useMemo(() => {
    if (isSupervisor) {
      return buildSupervisorNotifications({
        uid,
        incidents,
        messages: allMessages,
        highRiskFlights,
        seenHighRiskIds: seenHighRisk,
        lastSeen,
        now,
      });
    }

    if (isHandler) {
      return buildHandlerNotifications({
        uid,
        assignments,
        incidents,
        messages: Object.values(messagesByFlight).flat(),
        lastSeen,
        now,
      });
    }

    return [];
  }, [
    isSupervisor,
    isHandler,
    uid,
    incidents,
    allMessages,
    highRiskFlights,
    seenHighRisk,
    lastSeen,
    now,
    assignments,
    messagesByFlight,
  ]);

  /** Marks everything read: lastSeenAt = server time, and remembers today's High-risk flights. */
  const markAllRead = useCallback(async () => {
    if (!uid) return;

    try {
      await setDoc(doc(db, 'NotificationState', uid), { lastSeenAt: serverTimestamp() });
    } catch (error) {
      console.error('Could not save notification state:', error);
    }

    if (isSupervisor) {
      const ids = highRiskFlights.map((flight) => flight.id);
      setSeenHighRisk(new Set(ids));
      AsyncStorage.setItem(seenHighRiskKey(uid), JSON.stringify(ids)).catch((error) =>
        console.error('Could not save seen High-risk flights:', error),
      );
    }
  }, [uid, isSupervisor, highRiskFlights]);

  return {
    role,
    notifications,
    unread: unreadCount(notifications),
    ready: lastSeenLoaded && role !== null,
    markAllRead,
  };
}
