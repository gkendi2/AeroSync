import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import Icon, { type AppIconName } from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';
import { toTimeString } from '@/features/datetime/format';
import { db } from '@/lib/firebase';

type HandlingEvent = {
  id: string;
  action: string;
  handlerUid: string;
  timestamp: Date | null;
};

type TimelineEntry = {
  key: string;
  label: string;
  person: string;
  time: Date | null;
  icon: AppIconName;
};

function toDate(value: unknown): Date | null {
  return value && typeof (value as { toDate?: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate()
    : null;
}

function formatWhen(time: Date | null) {
  if (!time) return 'Time not recorded';
  return `${time.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}, ${toTimeString(time)}`;
}

/**
 * A bag's history for supervisors: when it was registered and by whom, then
 * each handling event (BaggageRecords/{id}/handlingEvents), oldest first.
 */
export default function BagHistory({
  bagId,
  createdAt,
  registeredBy,
}: {
  bagId: string;
  createdAt: unknown;
  registeredBy?: string;
}) {
  const [events, setEvents] = useState<HandlingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  // Users already looked up (or being looked up), so each is fetched once.
  const requested = useRef(new Set<string>());

  useEffect(() => {
    setLoading(true);
    setError('');

    return onSnapshot(
      query(collection(db, 'BaggageRecords', bagId, 'handlingEvents'), orderBy('timestamp', 'asc')),
      (snapshot) => {
        setEvents(
          snapshot.docs.map((item) => {
            const data = item.data({ serverTimestamps: 'estimate' });
            return {
              id: item.id,
              action: data.action ?? '',
              handlerUid: data.handlerUid ?? '',
              timestamp: toDate(data.timestamp),
            };
          }),
        );
        setLoading(false);
      },
      (snapshotError) => {
        console.error('Could not load bag history:', snapshotError);
        setError(
          snapshotError.code === 'permission-denied'
            ? 'Bag history is not available. The updated Firestore rules may not be published yet.'
            : 'Could not load bag history. Check your connection.',
        );
        setLoading(false);
      },
    );
  }, [bagId]);

  // Look up each person once (supervisors can read user profiles).
  useEffect(() => {
    const uids = [registeredBy, ...events.map((event) => event.handlerUid)].filter(
      (uid): uid is string => !!uid && !requested.current.has(uid),
    );

    for (const uid of new Set(uids)) {
      requested.current.add(uid);
      getDoc(doc(db, 'users', uid))
        .then((snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : null;
          const name = (data?.displayName || data?.email || '').toString().trim();
          setNames((current) => ({ ...current, [uid]: name }));
        })
        .catch((lookupError) => {
          console.error('Could not look up user:', lookupError);
          setNames((current) => ({ ...current, [uid]: '' }));
        });
    }
  }, [events, registeredBy]);

  const entries: TimelineEntry[] = [
    {
      key: 'registered',
      label: 'Registered',
      person: (registeredBy && names[registeredBy]) || 'Unknown user',
      time: toDate(createdAt),
      icon: 'baggage',
    },
    ...events.map((event) => ({
      key: event.id,
      label: event.action === 'Offloading' ? 'Offloading' : event.action === 'Loading' ? 'Loading' : event.action || 'Handled',
      person: names[event.handlerUid] || 'Unknown handler',
      time: event.timestamp,
      icon: (event.action === 'Offloading' ? 'checkCircle' : 'airplane') as AppIconName,
    })),
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>History</Text>

      {entries.map((entry, index) => (
        <View key={entry.key} style={styles.entry}>
          <View style={styles.rail}>
            <View style={styles.dot}>
              <Icon name={entry.icon} size={14} color={AeroSyncColors.white} />
            </View>
            {index < entries.length - 1 && <View style={styles.line} />}
          </View>

          <View style={styles.copy}>
            <Text style={styles.label}>{entry.label}</Text>
            <Text style={styles.meta}>
              {entry.person} · {formatWhen(entry.time)}
            </Text>
          </View>
        </View>
      ))}

      {loading && <ActivityIndicator color={AeroSyncColors.primaryDark} style={styles.loading} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!loading && !error && events.length === 0 && (
        <Text style={styles.meta}>No handling events yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: AeroSyncColors.white,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    borderRadius: 14,
    padding: 16,
  },
  title: {
    color: AeroSyncColors.text,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  entry: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    alignItems: 'center',
    width: 26,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AeroSyncColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: AeroSyncColors.border,
  },
  copy: {
    flex: 1,
    paddingBottom: 16,
    gap: 2,
  },
  label: {
    color: AeroSyncColors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  meta: {
    color: AeroSyncColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  loading: {
    marginTop: 4,
  },
  error: {
    color: AeroSyncColors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
});
