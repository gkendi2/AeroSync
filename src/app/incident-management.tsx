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
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
};

type FilterStatus =
  | 'All'
  | IncidentStatus;

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

const RED = '#C8102E';
const DARK_RED = '#A20D25';
const BACKGROUND = '#F4F3F3';
const WHITE = '#FFFFFF';
const TEXT = '#252525';
const MUTED = '#777777';
const BORDER = '#E7E7E9';
const GREEN = '#16805C';
const AMBER = '#A86B08';

const FILTERS: FilterStatus[] = [
  'All',
  'Open',
  'Under Review',
  'Resolved',
  'Closed',
];

function formatDate(value?: { toDate?: () => Date } | null) {
  if (!value?.toDate) return 'Time unavailable';

  try {
    return value.toDate().toLocaleString();
  } catch {
    return 'Time unavailable';
  }
}

function getSeverityColors(severity: string) {
  switch (severity) {
    case 'Critical':
      return { background: '#FCE4E4', text: '#B42318' };
    case 'High':
      return { background: '#FDEBEC', text: RED };
    case 'Medium':
      return { background: '#FFF2DA', text: AMBER };
    default:
      return { background: '#E8F4ED', text: GREEN };
  }
}

function getStatusColors(status: string) {
  switch (status) {
    case 'Resolved':
    case 'Closed':
      return { background: '#E8F4ED', text: GREEN };
    case 'Under Review':
      return { background: '#FFF2DA', text: AMBER };
    default:
      return { background: '#FCEBED', text: RED };
  }
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

export default function IncidentManagementScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setError('Please sign in to continue.');
      setLoading(false);
      return;
    }

    let unsubscribeIncidents: (() => void) | undefined;
    let cancelled = false;

    async function verifySupervisorAndLoad() {
      try {
        const profileSnapshot = await getDoc(
          doc(db, 'users', user.uid),
        );

        if (cancelled) return;

        const role = profileSnapshot.exists()
          ? profileSnapshot.data().role
          : '';

        const isSupervisor =
          user.uid === ADMIN_UID || role === 'supervisor';

        if (!isSupervisor) {
          setError(
            'Only authorised supervisors can manage incidents.',
          );
          setLoading(false);
          return;
        }

        const incidentsQuery = query(
          collection(db, 'Incidents'),
          orderBy('reportedAt', 'desc'),
        );

        unsubscribeIncidents = onSnapshot(
          incidentsQuery,
          snapshot => {
            const loaded: Incident[] = snapshot.docs.map(item => {
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
              };
            });

            setIncidents(loaded);
            setError('');
            setLoading(false);
          },
          snapshotError => {
            console.error(
              'Could not load incidents:',
              snapshotError,
            );
            setError(
              'Could not load incident reports. Check your connection and Firebase permissions.',
            );
            setLoading(false);
          },
        );
      } catch (verificationError) {
        console.error(
          'Supervisor verification failed:',
          verificationError,
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
      unsubscribeIncidents?.();
    };
  }, []);

  const filteredIncidents = useMemo(() => {
    if (filter === 'All') return incidents;

    return incidents.filter(
      incident => incident.status === filter,
    );
  }, [incidents, filter]);

  const openCount = incidents.filter(
    item => item.status === 'Open',
  ).length;

  const reviewCount = incidents.filter(
    item => item.status === 'Under Review',
  ).length;

  const resolvedCount = incidents.filter(
    item =>
      item.status === 'Resolved' ||
      item.status === 'Closed',
  ).length;

  async function changeStatus(
    incident: Incident,
    nextStatus: IncidentStatus,
  ) {
    if (updatingId) return;

    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Not signed in', 'Please sign in again.');
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

    Alert.alert(
      `Change status to ${nextStatus}?`,
      confirmationMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setUpdatingId(incident.id);

            try {
              await updateDoc(
                doc(db, 'Incidents', incident.id),
                {
                  status: nextStatus,
                  statusUpdatedAt: serverTimestamp(),
                  statusUpdatedBy: user.uid,
                },
              );
            } catch (updateError) {
              console.error(
                'Incident status update failed:',
                updateError,
              );

              Alert.alert(
                'Update failed',
                'The incident status could not be changed. Check your connection and Firebase permissions.',
              );
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ],
    );
  }

  function renderFilter(status: FilterStatus) {
    const selected = filter === status;

    return (
      <Pressable
        key={status}
        style={[
          styles.filterButton,
          selected && styles.filterButtonSelected,
        ]}
        onPress={() => setFilter(status)}
      >
        <Text
          style={[
            styles.filterText,
            selected && styles.filterTextSelected,
          ]}
        >
          {status}
        </Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹  Dashboard</Text>
          </Pressable>

          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>SUPERVISOR WORKSPACE</Text>
          <Text style={styles.title}>Incident Management</Text>
          <Text style={styles.subtitle}>
            Review reported incidents and manage their progress
            through to closure.
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{openCount}</Text>
            <Text style={styles.summaryLabel}>Open</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{reviewCount}</Text>
            <Text style={styles.summaryLabel}>Under review</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryNumber}>{resolvedCount}</Text>
            <Text style={styles.summaryLabel}>Resolved / closed</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Reported incidents</Text>
            <Text style={styles.sectionSubtitle}>
              {incidents.length} report(s) recorded
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map(renderFilter)}
        </ScrollView>

        {loading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color={RED} size="large" />
            <Text style={styles.messageText}>
              Loading incident reports...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : filteredIncidents.length === 0 ? (
          <View style={styles.messageCard}>
            <Text style={styles.emptyTitle}>
              No reports in this category
            </Text>
            <Text style={styles.messageText}>
              Reports will appear here when handlers submit them.
            </Text>
          </View>
        ) : (
          filteredIncidents.map(incident => {
            const severityColors = getSeverityColors(
              incident.severity,
            );

            const statusColors = getStatusColors(
              incident.status,
            );

            const nextAction = getNextAction(incident.status);
            const isUpdating = updatingId === incident.id;

            return (
              <View key={incident.id} style={styles.incidentCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeading}>
                    <Text style={styles.category}>
                      {incident.reportCategory}
                    </Text>
                    <Text style={styles.incidentType}>
                      {incident.incidentType}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: severityColors.background },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: severityColors.text },
                      ]}
                    >
                      {incident.severity}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.statusRow}>
                  <Text style={styles.detailLabel}>CURRENT STATUS</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: statusColors.background },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: statusColors.text },
                      ]}
                    >
                      {incident.status}
                    </Text>
                  </View>
                </View>

                {incident.flightNumber ? (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>FLIGHT</Text>
                    <Text style={styles.detailValue}>
                      {incident.flightNumber}
                    </Text>
                    {!!incident.flightRoute && (
                      <Text style={styles.detailSecondary}>
                        {incident.flightRoute}
                      </Text>
                    )}
                  </View>
                ) : null}

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>LOCATION</Text>
                  <Text style={styles.detailValue}>
                    {incident.location || 'Not specified'}
                  </Text>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>DESCRIPTION</Text>
                  <Text style={styles.description}>
                    {incident.description || 'No description provided.'}
                  </Text>
                </View>

                {!!incident.immediateAction && (
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>
                      IMMEDIATE ACTION TAKEN
                    </Text>
                    <Text style={styles.description}>
                      {incident.immediateAction}
                    </Text>
                  </View>
                )}

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>INJURY REPORTED</Text>
                  <Text style={styles.detailValue}>
                    {incident.injuryReported}
                  </Text>
                  {incident.injuryReported === 'Yes' &&
                    !!incident.injuryDetails && (
                      <Text style={styles.detailSecondary}>
                        {incident.injuryDetails}
                      </Text>
                    )}
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>REPORTED</Text>
                  <Text style={styles.detailSecondary}>
                    {formatDate(incident.reportedAt)}
                  </Text>
                </View>

                <View style={styles.actionDivider} />

                {nextAction ? (
                  <Pressable
                    style={[
                      styles.updateButton,
                      incident.status === 'Closed' &&
                        styles.reopenButton,
                      isUpdating && styles.disabledButton,
                    ]}
                    disabled={!!updatingId}
                    onPress={() =>
                      changeStatus(
                        incident,
                        nextAction.nextStatus,
                      )
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
                ) : null}

                {incident.status === 'Closed' && (
                  <Text style={styles.closedNote}>
                    This report is closed. You can reopen it if
                    further action is needed.
                  </Text>
                )}
              </View>
            );
          })
        )}

        <Text style={styles.footer}>
          AEROSYNC · KENYA AIRWAYS GROUND OPERATIONS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 35,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backText: {
    color: DARK_RED,
    fontSize: 14,
    fontWeight: '800',
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '900',
  },
  heading: {
    marginBottom: 18,
  },
  eyebrow: {
    color: RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 7,
  },
  title: {
    color: TEXT,
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 12,
  },
  summaryNumber: {
    color: TEXT,
    fontSize: 24,
    fontWeight: '900',
  },
  summaryLabel: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  filters: {
    gap: 8,
    paddingBottom: 14,
  },
  filterButton: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  filterButtonSelected: {
    backgroundColor: RED,
    borderColor: RED,
  },
  filterText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },
  filterTextSelected: {
    color: WHITE,
  },
  incidentCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 16,
    marginBottom: 13,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardHeading: {
    flex: 1,
  },
  category: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
  },
  incidentType: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 13,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailBlock: {
    marginBottom: 13,
  },
  detailLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  detailValue: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '700',
  },
  detailSecondary: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  description: {
    color: TEXT,
    fontSize: 12,
    lineHeight: 19,
  },
  actionDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginTop: 3,
    marginBottom: 13,
  },
  updateButton: {
    backgroundColor: RED,
    borderRadius: 12,
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  reopenButton: {
    backgroundColor: '#475569',
  },
  disabledButton: {
    opacity: 0.6,
  },
  updateButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
  },
  closedNote: {
    color: GREEN,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  messageCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    marginTop: 8,
  },
  messageText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
  },
  emptyTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
  },
  errorText: {
    color: RED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  footer: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 25,
  },
});