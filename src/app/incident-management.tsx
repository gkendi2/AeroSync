
import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon, { type AppIconName } from '@/components/icon';
import { goBackOrHome } from '@/lib/navigation';
import { useRouter } from 'expo-router';

type IncidentStatus =
  | 'Open'
  | 'Under Review'
  | 'Resolved'
  | 'Closed';

type Incident = {
  id: string;
  reportCategory: string;
  incidentType: string;
  flightNumber: string;
  flightRoute: string;
  location: string;
  severity: string;
  description: string;
  immediateAction: string;
  injuryReported: string;
  injuryDetails: string;
  reportedBy: string;
  reportedAt?: {
    toDate?: () => Date;
  } | null;
  status: string;
  /** Corrective action written by a supervisor; shown to the reporter. */
  supervisorNotes: string;
};

type FilterStatus = 'All' | 'Open' | 'In Review' | 'Closed';

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

const RED = '#C8102E';
const DARK = '#252525';
const MUTED = '#777777';
const BG = '#F5F5F6';
const WHITE = '#FFFFFF';
const BORDER = '#EAEAEA';
const GREEN = '#16805C';
const AMBER = '#A86B08';

const FILTERS: FilterStatus[] = [
  'All',
  'Open',
  'In Review',
  'Closed',
];

function getDate(value?: Incident['reportedAt']): Date | null {
  if (!value?.toDate) return null;

  try {
    return value.toDate();
  } catch {
    return null;
  }
}

function formatIncidentDate(value?: Incident['reportedAt']) {
  const date = getDate(value);
  if (!date) return 'Date unavailable';

  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (date.toDateString() === now.toDateString()) {
    return `Today, ${time}`;
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${time}`;
  }

  return `${date.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
  })}, ${time}`;
}

function formatFullDate(value?: Incident['reportedAt']) {
  const date = getDate(value);
  return date ? date.toLocaleString() : 'Not available';
}

function getSeverityColors(severity: string) {
  switch (severity.toLowerCase()) {
    case 'critical':
    case 'high':
      return { background: '#FCE8EB', text: RED };

    case 'medium':
      return { background: '#FFF2DA', text: AMBER };

    default:
      return { background: '#EEEEF0', text: DARK };
  }
}

function getIncidentIcon(incident: Incident) {
  if (
    incident.status === 'Resolved' ||
    incident.status === 'Closed'
  ) {
    return { icon: 'check' as AppIconName, color: GREEN };
  }

  if (
    incident.severity === 'Critical' ||
    incident.severity === 'High'
  ) {
    return { icon: 'incidents' as AppIconName, color: RED };
  }

  if (incident.severity === 'Medium') {
    return { icon: 'incidents' as AppIconName, color: AMBER };
  }

  return { icon: 'incidents' as AppIconName, color: MUTED };
}

function getNextAction(status: string) {
  switch (status) {
    case 'Open':
      return {
        label: 'Start review',
        nextStatus: 'Under Review' as IncidentStatus,
      };

    case 'Under Review':
      return {
        label: 'Mark resolved',
        nextStatus: 'Resolved' as IncidentStatus,
      };

    case 'Resolved':
      return {
        label: 'Close report',
        nextStatus: 'Closed' as IncidentStatus,
      };

    case 'Closed':
      return {
        label: 'Reopen report',
        nextStatus: 'Open' as IncidentStatus,
      };

    default:
      return null;
  }
}

function getDisplayTitle(incident: Incident) {
  const title =
    incident.incidentType ||
    incident.reportCategory ||
    'Incident';

  return incident.flightNumber
    ? `${title} – ${incident.flightNumber}`
    : title;
}

export default function IncidentManagementScreen() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Unsaved corrective-action text, per incident.
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});

  function notesFor(incident: Incident) {
    return notesDrafts[incident.id] ?? incident.supervisorNotes;
  }

  function clearDraft(id: string) {
    setNotesDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setError('Please sign in to continue.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function verifySupervisorAndLoad() {
      try {
        const profileSnapshot = await getDoc(
          doc(db, 'users', user!.uid)
        );

        if (cancelled) return;

        const role = profileSnapshot.exists()
          ? profileSnapshot.data().role
          : '';

        const isSupervisor =
          user!.uid === ADMIN_UID || role === 'supervisor';

        if (!isSupervisor) {
          setError(
            'Only authorised supervisors can manage incidents.'
          );
          setLoading(false);
          return;
        }

        const incidentsQuery = query(
          collection(db, 'Incidents'),
          orderBy('reportedAt', 'desc')
        );

        unsubscribe = onSnapshot(
          incidentsQuery,
          (snapshot) => {
            if (cancelled) return;

            const loaded: Incident[] = snapshot.docs.map((item) => {
              const data = item.data();

              return {
                id: item.id,
                reportCategory: data.reportCategory ?? 'Incident',
                incidentType: data.incidentType ?? 'Other',
                flightNumber: data.flightNumber ?? '',
                flightRoute: data.flightRoute ?? '',
                location: data.location ?? '',
                severity: data.severity ?? 'Low',
                description: data.description ?? '',
                immediateAction: data.immediateAction ?? '',
                injuryReported: data.injuryReported ?? 'No',
                injuryDetails: data.injuryDetails ?? '',
                reportedBy: data.reportedBy ?? '',
                reportedAt: data.reportedAt ?? null,
                status: data.status ?? 'Open',
                supervisorNotes: data.supervisorNotes ?? '',
              };
            });

            setIncidents(loaded);
            setError('');
            setLoading(false);
          },
          (snapshotError) => {
            console.error('Could not load incidents:', snapshotError);
            setError(
              'Could not load incident reports. Check your connection and Firebase permissions.'
            );
            setLoading(false);
          }
        );
      } catch (verificationError) {
        console.error(
          'Supervisor verification failed:',
          verificationError
        );

        if (!cancelled) {
          setError('Could not verify your supervisor account.');
          setLoading(false);
        }
      }
    }

    verifySupervisorAndLoad();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const counts = useMemo(() => ({
    All: incidents.length,
    Open: incidents.filter((item) => item.status === 'Open').length,
    'In Review': incidents.filter(
      (item) => item.status === 'Under Review'
    ).length,
    Closed: incidents.filter(
      (item) =>
        item.status === 'Resolved' ||
        item.status === 'Closed'
    ).length,
  }), [incidents]);

  const filteredIncidents = useMemo(() => {
    switch (filter) {
      case 'Open':
        return incidents.filter((item) => item.status === 'Open');

      case 'In Review':
        return incidents.filter(
          (item) => item.status === 'Under Review'
        );

      case 'Closed':
        return incidents.filter(
          (item) =>
            item.status === 'Resolved' ||
            item.status === 'Closed'
        );

      default:
        return incidents;
    }
  }, [incidents, filter]);

  function showMessage(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function changeStatus(
    incident: Incident,
    nextStatus: IncidentStatus
  ) {
    if (updatingId) return;

    const user = auth.currentUser;

    if (!user) {
      showMessage('Not signed in', 'Please sign in again.');
      return;
    }

    const notes = notesFor(incident).trim();

    if (nextStatus === 'Resolved' && !notes) {
      showMessage(
        'Corrective action required',
        'Describe the corrective action taken before marking this incident resolved.'
      );
      return;
    }

    const confirmationMessage =
      nextStatus === 'Resolved'
        ? 'Confirm that the reported issue has been addressed.'
        : nextStatus === 'Closed'
          ? 'Close this report? No further action should be required.'
          : nextStatus === 'Open'
            ? 'Reopen this incident for further attention?'
            : 'Move this report into review?';

    const confirmUpdate = async () => {
      setUpdatingId(incident.id);

      try {
        await updateDoc(
          doc(db, 'Incidents', incident.id),
          {
            status: nextStatus,
            statusUpdatedAt: serverTimestamp(),
            statusUpdatedBy: user.uid,
            // Save the corrective action with the status when it was edited.
            ...(notes !== incident.supervisorNotes.trim()
              ? { supervisorNotes: notes }
              : {}),
          }
        );

        clearDraft(incident.id);
        setExpandedId(null);
      } catch (updateError) {
        console.error(
          'Incident status update failed:',
          updateError
        );

        showMessage(
          'Update failed',
          'The incident status could not be changed. Check your connection and Firebase permissions.'
        );
      } finally {
        setUpdatingId(null);
      }
    };

    const message =
      `Change status to ${nextStatus}?\n\n${confirmationMessage}`;

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await confirmUpdate();
      }
    } else {
      Alert.alert(`Change status to ${nextStatus}?`, confirmationMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => void confirmUpdate(),
        },
      ]);
    }
  }

  async function saveNotes(incident: Incident) {
    if (updatingId) return;

    setUpdatingId(incident.id);

    try {
      await updateDoc(doc(db, 'Incidents', incident.id), {
        supervisorNotes: notesFor(incident).trim(),
      });
      clearDraft(incident.id);
    } catch (updateError) {
      console.error('Saving corrective action failed:', updateError);
      showMessage(
        'Save failed',
        'The corrective action could not be saved. Check your connection and Firebase permissions.'
      );
    } finally {
      setUpdatingId(null);
    }
  }

  function renderFilter(status: FilterStatus) {
    const selected = filter === status;

    return (
      <Pressable
        key={status}
        onPress={() => {
          setFilter(status);
          setExpandedId(null);
        }}
        style={[
          styles.filterButton,
          selected && styles.filterButtonSelected,
        ]}
      >
        <Text
          style={[
            styles.filterText,
            selected && styles.filterTextSelected,
          ]}
          numberOfLines={1}
        >
          {status} ({counts[status]})
        </Text>
      </Pressable>
    );
  }

  function renderIncident({ item }: { item: Incident }) {
    const expanded = expandedId === item.id;
    const severityColors = getSeverityColors(item.severity);
    const incidentIcon = getIncidentIcon(item);
    const nextAction = getNextAction(item.status);
    const isUpdating = updatingId === item.id;
    const notes = notesFor(item);
    const notesChanged = notes.trim() !== item.supervisorNotes.trim();

    const displayStatus =
      item.status === 'Under Review' ? 'In Review' : item.status;

    return (
      <View style={styles.incidentItem}>
        <Pressable
          style={styles.incidentRow}
          onPress={() =>
            setExpandedId(expanded ? null : item.id)
          }
        >
          <View
            style={[
              styles.incidentIcon,
              { borderColor: incidentIcon.color },
            ]}
          >
            <Icon name={incidentIcon.icon} size={20} color={incidentIcon.color} />
          </View>

          <View style={styles.incidentInfo}>
            <Text style={styles.incidentTitle} numberOfLines={1}>
              {getDisplayTitle(item)}
            </Text>

            <Text style={styles.incidentSubtitle} numberOfLines={1}>
              {displayStatus} · {formatIncidentDate(item.reportedAt)}
            </Text>
          </View>

          <View
            style={[
              styles.severityBadge,
              { backgroundColor: severityColors.background },
            ]}
          >
            <Text
              style={[
                styles.severityText,
                { color: severityColors.text },
              ]}
            >
              {item.severity}
            </Text>
          </View>

          <Icon name={expanded ? 'expand' : 'forward'} size={22} color={MUTED} />
        </Pressable>

        {expanded && (
          <View style={styles.details}>
            <Detail label="INCIDENT TYPE" value={item.incidentType} />
            <Detail label="REPORT CATEGORY" value={item.reportCategory} />

            {!!item.flightNumber && (
              <Detail
                label="FLIGHT"
                value={`${item.flightNumber}${
                  item.flightRoute ? ` · ${item.flightRoute}` : ''
                }`}
              />
            )}

            <Detail
              label="LOCATION"
              value={item.location || 'Not specified'}
            />

            <Detail
              label="DESCRIPTION"
              value={item.description || 'No description provided.'}
            />

            {!!item.immediateAction && (
              <Detail
                label="IMMEDIATE ACTION TAKEN"
                value={item.immediateAction}
              />
            )}

            <Detail
              label="INJURY REPORTED"
              value={
                item.injuryReported === 'Yes' && item.injuryDetails
                  ? `Yes – ${item.injuryDetails}`
                  : item.injuryReported || 'No'
              }
            />

            <Detail
              label="REPORTED BY"
              value={item.reportedBy || 'Not available'}
            />

            <Detail
              label="DATE REPORTED"
              value={formatFullDate(item.reportedAt)}
            />

            <Detail label="CURRENT STATUS" value={displayStatus} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>CORRECTIVE ACTION</Text>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={(text) =>
                  setNotesDrafts((current) => ({ ...current, [item.id]: text }))
                }
                placeholder="What was done to fix or prevent this? The reporter will see this."
                placeholderTextColor={MUTED}
                multiline
                textAlignVertical="top"
                editable={!updatingId}
              />
              {item.status === 'Under Review' && !notes.trim() && (
                <Text style={styles.notesHint}>
                  Required before marking resolved.
                </Text>
              )}
              {notesChanged && (
                <Pressable
                  style={[styles.saveNotesButton, !!updatingId && styles.disabledButton]}
                  disabled={!!updatingId}
                  onPress={() => saveNotes(item)}
                >
                  <Text style={styles.saveNotesText}>Save corrective action</Text>
                </Pressable>
              )}
            </View>

            {nextAction && (
              <Pressable
                style={[
                  styles.updateButton,
                  isUpdating && styles.disabledButton,
                ]}
                disabled={!!updatingId}
                onPress={() =>
                  changeStatus(item, nextAction.nextStatus)
                }
              >
                {isUpdating ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.updateButtonText}>
                    {nextAction.label}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => goBackOrHome(router)}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <Icon name="back" size={30} color={DARK} />
          </Pressable>

          <Text style={styles.heading}>Incidents</Text>
        </View>

        {/* Filters: fixed-height row directly under header */}
        <View style={styles.filters}>
          {FILTERS.map(renderFilter)}
        </View>

        {/* List begins immediately below filters */}
        {loading ? (
          <View style={styles.messageContainer}>
            <ActivityIndicator color={RED} size="large" />
            <Text style={styles.messageText}>
              Loading incidents...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.messageContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredIncidents}
            keyExtractor={(item) => item.id}
            renderItem={renderIncident}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  No incidents found
                </Text>
                <Text style={styles.messageText}>
                  There are no reports in this category.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },

  page: {
    flex: 1,
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    backgroundColor: BG,
  },

  header: {
    height: 62,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
    backgroundColor: WHITE,
  },

  backButton: {
    width: 30,
    height: 42,
    justifyContent: 'center',
  },

  backText: {
    fontSize: 34,
    lineHeight: 38,
    color: DARK,
  },

  heading: {
    color: DARK,
    fontSize: 21,
    fontWeight: '800',
  },

  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexShrink: 0,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  filterButton: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    borderRadius: 22,
    paddingHorizontal: 3,
    paddingVertical: 10,
  },

  filterButtonSelected: {
    borderColor: RED,
    backgroundColor: '#FFF5F6',
  },

  filterText: {
    color: DARK,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  filterTextSelected: {
    color: RED,
    fontWeight: '800',
  },

  list: {
    flex: 1,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 24,
    flexGrow: 1,
  },

  incidentItem: {
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  incidentRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
    gap: 10,
  },

  incidentIcon: {
    width: 38,
    height: 38,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  incidentIconText: {
    fontSize: 21,
    fontWeight: '800',
  },

  incidentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },

  incidentTitle: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },

  incidentSubtitle: {
    color: MUTED,
    fontSize: 11,
  },

  severityBadge: {
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  severityText: {
    fontSize: 11,
    fontWeight: '800',
  },

  chevron: {
    color: DARK,
    fontSize: 25,
    paddingLeft: 1,
  },

  details: {
    paddingHorizontal: 51,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 11,
  },

  detailRow: {
    gap: 4,
  },

  detailLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  detailValue: {
    color: DARK,
    fontSize: 12,
    lineHeight: 18,
  },

  notesInput: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    backgroundColor: WHITE,
    color: DARK,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },

  notesHint: {
    color: AMBER,
    fontSize: 11,
    fontWeight: '700',
  },

  saveNotesButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },

  saveNotesText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },

  updateButton: {
    minHeight: 43,
    backgroundColor: RED,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
    paddingHorizontal: 14,
  },

  updateButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '800',
  },

  disabledButton: {
    opacity: 0.55,
  },

  messageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },

  messageText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },

  errorText: {
    color: RED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 55,
    gap: 8,
  },

  emptyTitle: {
    color: DARK,
    fontSize: 16,
    fontWeight: '800',
  },
});
