
import { auth, db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type ReportCategory = 'Incident' | 'Near Miss' | 'Hazard';
type IncidentType = 'Baggage' | 'Aircraft' | 'Equipment' | 'Safety' | 'Other';
type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
type ReportStatus =
  | 'Open'
  | 'Under Review'
  | 'Under Investigation'
  | 'Resolved'
  | 'Closed';
type FilterStatus = 'All' | 'Open' | 'In Review' | 'Closed';

type Flight = {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  status: string;
  isDemo?: boolean;
};

type Incident = {
  id: string;
  reportCategory?: ReportCategory;
  incidentType: IncidentType;
  flightId?: string;
  flightNumber?: string;
  flightRoute?: string;
  location: string;
  severity: Severity;
  description: string;
  immediateAction?: string;
  injuryReported?: string;
  injuryDetails?: string;
  reportedBy: string;
  reportedAt?: { toDate?: () => Date } | null;
  status: string;
  supervisorNotes?: string;
  updatedBy?: string;
  updatedAt?: { toDate?: () => Date } | null;
};

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

const RED = '#C8102E';
const DARK = '#252525';
const MUTED = '#777777';
const BG = '#F5F5F6';
const WHITE = '#FFFFFF';
const BORDER = '#EAEAEA';
const GREEN = '#16805C';
const AMBER = '#A86B08';

const REPORT_CATEGORIES: ReportCategory[] = [
  'Incident',
  'Near Miss',
  'Hazard',
];

const INCIDENT_TYPES: IncidentType[] = [
  'Baggage',
  'Aircraft',
  'Equipment',
  'Safety',
  'Other',
];

const SEVERITIES: Severity[] = [
  'Low',
  'Medium',
  'High',
  'Critical',
];

const FILTERS: FilterStatus[] = [
  'All',
  'Open',
  'In Review',
  'Closed',
];

function getDate(value?: Incident['reportedAt']) {
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

function getStatusColors(status: string) {
  if (status === 'Resolved' || status === 'Closed') {
    return { background: '#E8F4ED', text: GREEN };
  }

  if (
    status === 'Under Review' ||
    status === 'Under Investigation'
  ) {
    return { background: '#FFF2DA', text: AMBER };
  }

  return { background: '#FCE8EB', text: RED };
}

function getDisplayStatus(status: string) {
  if (
    status === 'Under Review' ||
    status === 'Under Investigation'
  ) {
    return 'In Review';
  }

  return status;
}

function getIncidentIcon(incident: Incident) {
  if (
    incident.status === 'Resolved' ||
    incident.status === 'Closed'
  ) {
    return { symbol: '✓', color: GREEN };
  }

  if (
    incident.severity === 'Critical' ||
    incident.severity === 'High'
  ) {
    return { symbol: '⚠', color: RED };
  }

  if (incident.severity === 'Medium') {
    return { symbol: '⚠', color: AMBER };
  }

  return { symbol: '⚠', color: MUTED };
}

function getNextAction(status: string) {
  switch (status) {
    case 'Open':
      return {
        label: 'Start review',
        nextStatus: 'Under Review' as const,
      };

    case 'Under Review':
    case 'Under Investigation':
      return {
        label: 'Mark resolved',
        nextStatus: 'Resolved' as const,
      };

    case 'Resolved':
      return {
        label: 'Close report',
        nextStatus: 'Closed' as const,
      };

    case 'Closed':
      return {
        label: 'Reopen report',
        nextStatus: 'Open' as const,
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

export default function IncidentsScreen() {
  const [reportCategory, setReportCategory] =
    useState<ReportCategory>('Incident');

  const [incidentType, setIncidentType] =
    useState<IncidentType>('Baggage');

  const [selectedFlight, setSelectedFlight] =
    useState<Flight | null>(null);

  const [flightPickerOpen, setFlightPickerOpen] = useState(false);
  const [flightSearch, setFlightSearch] = useState('');

  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<Severity>('Low');
  const [description, setDescription] = useState('');
  const [immediateAction, setImmediateAction] = useState('');
  const [injuryReported, setInjuryReported] = useState('No');
  const [injuryDetails, setInjuryDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const [flights, setFlights] = useState<Flight[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(true);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [incidentError, setIncidentError] = useState('');

  const [isSupervisor, setIsSupervisor] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setIncidentError('Please sign in to view reports.');
      setLoadingIncidents(false);
      return;
    }

    const userId = user.uid;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    async function startListener() {
      try {
        const profile = await getDoc(doc(db, 'users', userId));

        if (cancelled) return;

        const role = profile.exists()
          ? profile.data().role
          : '';

        const supervisor =
          userId === ADMIN_UID || role === 'supervisor';

        const handler = role === 'handler';

        setIsSupervisor(supervisor);

        if (!supervisor && !handler) {
          setIncidentError(
            'Your account does not have permission to view reports.'
          );
          setLoadingIncidents(false);
          return;
        }

        const reportsQuery = supervisor
          ? query(collection(db, 'Incidents'))
          : query(
              collection(db, 'Incidents'),
              where('reportedBy', '==', userId)
            );

        unsubscribe = onSnapshot(
          reportsQuery,
          (snapshot) => {
            const loaded: Incident[] = snapshot.docs.map((item) => {
              const data = item.data();

              return {
                id: item.id,
                reportCategory: data.reportCategory ?? 'Incident',
                incidentType: data.incidentType ?? 'Other',
                flightId: data.flightId ?? '',
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
                updatedBy: data.updatedBy ?? '',
                updatedAt: data.updatedAt ?? null,
              };
            });

            loaded.sort(
              (a, b) =>
                (getDate(b.reportedAt)?.getTime() ?? 0) -
                (getDate(a.reportedAt)?.getTime() ?? 0)
            );

            setIncidents(loaded);
            setIncidentError('');
            setLoadingIncidents(false);
          },
          (error) => {
            console.error('INCIDENT LIST ERROR:', error);
            setIncidentError(
              'Could not load reports. Check your connection and permissions.'
            );
            setLoadingIncidents(false);
          }
        );
      } catch (error) {
        console.error('Could not verify incident access:', error);

        if (!cancelled) {
          setIncidentError(
            'Could not verify your account permissions.'
          );
          setLoadingIncidents(false);
        }
      }
    }

    startListener();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'Flights'),
      (snapshot) => {
        const loaded: Flight[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            flightNumber: data.flightNumber ?? '',
            origin: data.origin ?? '',
            destination: data.destination ?? '',
            departureDate: data.departureDate ?? '',
            departureTime: data.departureTime ?? '',
            status: data.status ?? 'Scheduled',
            isDemo: data.isDemo ?? false,
          };
        });

        loaded.sort((a, b) =>
          `${a.departureDate} ${a.departureTime}`.localeCompare(
            `${b.departureDate} ${b.departureTime}`
          )
        );

        setFlights(loaded);
        setLoadingFlights(false);
      },
      (error) => {
        console.error('FLIGHT LIST ERROR:', error);
        setLoadingFlights(false);
      }
    );

    return unsubscribe;
  }, []);

  async function submitIncident() {
    if (saving) return;

    if (!location.trim() || !description.trim()) {
      Alert.alert(
        'Missing information',
        'Please enter the location and description.'
      );
      return;
    }

    if (!auth.currentUser) {
      Alert.alert(
        'Not signed in',
        'Please sign in before submitting a report.'
      );
      return;
    }

    if (injuryReported === 'Yes' && !injuryDetails.trim()) {
      Alert.alert(
        'Missing injury details',
        'Please briefly describe the reported injury.'
      );
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'Incidents'), {
        reportCategory,
        incidentType,
        flightId: selectedFlight?.id ?? '',
        flightNumber: selectedFlight?.flightNumber ?? '',
        flightRoute: selectedFlight
          ? `${selectedFlight.origin} → ${selectedFlight.destination}`
          : '',
        location: location.trim(),
        severity,
        description: description.trim(),
        immediateAction: immediateAction.trim(),
        injuryReported,
        injuryDetails:
          injuryReported === 'Yes' ? injuryDetails.trim() : '',
        reportedBy: auth.currentUser.uid,
        reportedAt: serverTimestamp(),
        status: 'Open',
      });

      Alert.alert(
        'Report submitted',
        'Your report has been successfully recorded.'
      );

      setReportCategory('Incident');
      setIncidentType('Baggage');
      setSelectedFlight(null);
      setFlightSearch('');
      setFlightPickerOpen(false);
      setLocation('');
      setSeverity('Low');
      setDescription('');
      setImmediateAction('');
      setInjuryReported('No');
      setInjuryDetails('');
    } catch (error) {
      console.error('INCIDENT SUBMISSION ERROR:', error);

      Alert.alert(
        'Submission failed',
        'Could not submit your report. Check your connection and Firebase permissions.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    incident: Incident,
    nextStatus: 'Open' | 'Under Review' | 'Resolved' | 'Closed'
  ) {
    if (!isSupervisor || !auth.currentUser || updatingId) return;

    setUpdatingId(incident.id);

    try {
      await updateDoc(doc(db, 'Incidents', incident.id), {
        status: nextStatus,
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: auth.currentUser.uid,
      });

      setExpandedId(null);
    } catch (error) {
      console.error('INCIDENT UPDATE ERROR:', error);

      Alert.alert(
        'Update failed',
        'Could not update this incident. Check your connection and permissions.'
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const counts = useMemo(
    () => ({
      All: incidents.length,
      Open: incidents.filter((item) => item.status === 'Open').length,
      'In Review': incidents.filter(
        (item) =>
          item.status === 'Under Review' ||
          item.status === 'Under Investigation'
      ).length,
      Closed: incidents.filter(
        (item) =>
          item.status === 'Resolved' || item.status === 'Closed'
      ).length,
    }),
    [incidents]
  );

  const filteredIncidents = useMemo(() => {
    if (filter === 'Open') {
      return incidents.filter((item) => item.status === 'Open');
    }

    if (filter === 'In Review') {
      return incidents.filter(
        (item) =>
          item.status === 'Under Review' ||
          item.status === 'Under Investigation'
      );
    }

    if (filter === 'Closed') {
      return incidents.filter(
        (item) =>
          item.status === 'Resolved' || item.status === 'Closed'
      );
    }

    return incidents;
  }, [incidents, filter]);

  const filteredFlights = flights.filter((flight) => {
    const search = flightSearch.trim().toLowerCase();

    if (!search) return true;

    return [
      flight.flightNumber,
      flight.origin,
      flight.destination,
    ].some((value) => value.toLowerCase().includes(search));
  });

  function renderOptions<T extends string>(
    options: T[],
    selected: T,
    onSelect: (value: T) => void
  ) {
    return (
      <View style={styles.optionRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[
              styles.option,
              selected === option && styles.optionSelected,
            ]}
            onPress={() => onSelect(option)}
          >
            <Text
              style={[
                styles.optionText,
                selected === option && styles.optionTextSelected,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    );
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
    const icon = getIncidentIcon(item);
    const nextAction = getNextAction(item.status);
    const updating = updatingId === item.id;

    return (
      <View style={styles.incidentItem}>
        <Pressable
          style={styles.incidentRow}
          onPress={() => setExpandedId(expanded ? null : item.id)}
        >
          <View
            style={[
              styles.incidentIcon,
              { borderColor: icon.color },
            ]}
          >
            <Text
              style={[
                styles.incidentIconText,
                { color: icon.color },
              ]}
            >
              {icon.symbol}
            </Text>
          </View>

          <View style={styles.incidentInfo}>
            <Text style={styles.incidentTitle} numberOfLines={1}>
              {getDisplayTitle(item)}
            </Text>

            <Text style={styles.incidentSubtitle} numberOfLines={1}>
              {getDisplayStatus(item.status)} ·{' '}
              {formatIncidentDate(item.reportedAt)}
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

          <Text style={styles.chevron}>
            {expanded ? '⌄' : '›'}
          </Text>
        </Pressable>

        {expanded && (
          <View style={styles.details}>
            <Detail
              label="INCIDENT TYPE"
              value={item.incidentType}
            />

            <Detail
              label="REPORT CATEGORY"
              value={item.reportCategory ?? 'Incident'}
            />

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
              label="DATE REPORTED"
              value={formatFullDate(item.reportedAt)}
            />

            <Detail
              label="CURRENT STATUS"
              value={getDisplayStatus(item.status)}
            />

            {!!item.supervisorNotes && (
              <Detail
                label="SUPERVISOR NOTES"
                value={item.supervisorNotes}
              />
            )}

            {isSupervisor && nextAction && (
              <Pressable
                style={[
                  styles.updateButton,
                  updating && styles.disabledButton,
                ]}
                disabled={!!updatingId}
                onPress={() =>
                  changeStatus(item, nextAction.nextStatus)
                }
              >
                {updating ? (
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
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand header */}
        <View style={styles.brandHeader}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>K</Text>
          </View>

          <View>
            <Text style={styles.brandName}>AeroSync</Text>
            <Text style={styles.brandSubtitle}>
              GROUND CREW · HANDLER
            </Text>
          </View>
        </View>

        {/* Page heading */}
        <View style={styles.pageHeading}>
          <View style={styles.headingText}>
            <Text style={styles.heading}>Incidents</Text>
            <Text style={styles.subheading}>
              Safety reports and incident history
            </Text>
          </View>

          <View style={styles.totalBadge}>
            <Text style={styles.totalNumber}>{incidents.length}</Text>
            <Text style={styles.totalLabel}>REPORTS</Text>
          </View>
        </View>

        {/* Report form */}
        <View style={styles.formCard}>
          <Text style={styles.sectionHeading}>Submit a Report</Text>
          <Text style={styles.sectionHint}>
            Record an incident, near miss or workplace hazard.
          </Text>

          <Text style={styles.label}>Report Category *</Text>
          {renderOptions(
            REPORT_CATEGORIES,
            reportCategory,
            setReportCategory
          )}

          <Text style={styles.label}>Report Type *</Text>
          {renderOptions(
            INCIDENT_TYPES,
            incidentType,
            setIncidentType
          )}

          <Text style={styles.label}>
            Flight Involved{' '}
            <Text style={styles.optional}>(Optional)</Text>
          </Text>

          <Pressable
            style={styles.flightSelector}
            onPress={() => setFlightPickerOpen(!flightPickerOpen)}
          >
            <View style={{ flex: 1 }}>
              {selectedFlight ? (
                <>
                  <Text style={styles.selectedFlightNumber}>
                    {selectedFlight.flightNumber}
                    {selectedFlight.isDemo ? ' · DEMO' : ''}
                  </Text>

                  <Text style={styles.selectedFlightRoute}>
                    {selectedFlight.origin} →{' '}
                    {selectedFlight.destination}
                  </Text>

                  <Text style={styles.selectedFlightMeta}>
                    {selectedFlight.departureDate} at{' '}
                    {selectedFlight.departureTime}
                  </Text>
                </>
              ) : (
                <Text style={styles.flightPlaceholder}>
                  {loadingFlights
                    ? 'Loading flights...'
                    : 'Select a flight (optional)'}
                </Text>
              )}
            </View>

            <Text style={styles.flightChevron}>
              {flightPickerOpen ? '▲' : '▼'}
            </Text>
          </Pressable>

          {selectedFlight && (
            <Pressable
              onPress={() => setSelectedFlight(null)}
              style={styles.clearFlightButton}
            >
              <Text style={styles.clearFlightText}>
                Remove selected flight
              </Text>
            </Pressable>
          )}

          {flightPickerOpen && (
            <View style={styles.flightPicker}>
              <TextInput
                style={styles.input}
                placeholder="Search flight number or route..."
                placeholderTextColor="#999999"
                value={flightSearch}
                onChangeText={setFlightSearch}
                autoCapitalize="characters"
              />

              <Pressable
                style={styles.noFlightOption}
                onPress={() => {
                  setSelectedFlight(null);
                  setFlightPickerOpen(false);
                  setFlightSearch('');
                }}
              >
                <Text style={styles.clearFlightText}>
                  Not linked to a specific flight
                </Text>
              </Pressable>

              {loadingFlights ? (
                <ActivityIndicator
                  color={RED}
                  style={{ padding: 14 }}
                />
              ) : filteredFlights.length === 0 ? (
                <Text style={styles.noFlightsText}>
                  No matching flights found.
                </Text>
              ) : (
                <View style={styles.flightOptionsList}>
                  {filteredFlights.map((flight) => (
                    <Pressable
                      key={flight.id}
                      style={styles.flightOption}
                      onPress={() => {
                        setSelectedFlight(flight);
                        setFlightPickerOpen(false);
                        setFlightSearch('');
                      }}
                    >
                      <Text style={styles.flightOptionNumber}>
                        {flight.flightNumber}
                        {flight.isDemo ? ' · DEMO' : ''}
                      </Text>

                      <Text style={styles.flightOptionRoute}>
                        {flight.origin} → {flight.destination}
                      </Text>

                      <Text style={styles.flightOptionMeta}>
                        {flight.departureDate} ·{' '}
                        {flight.departureTime} · {flight.status}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <Text style={styles.label}>Location *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Stand 12, Baggage Hall"
            placeholderTextColor="#999999"
            value={location}
            onChangeText={setLocation}
          />

          <Text style={styles.label}>Severity *</Text>
          {renderOptions(SEVERITIES, severity, setSeverity)}

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe what happened or what you observed..."
            placeholderTextColor="#999999"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>Immediate Action Taken</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What action was taken immediately?"
            placeholderTextColor="#999999"
            value={immediateAction}
            onChangeText={setImmediateAction}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>Was anyone injured?</Text>
          {renderOptions(
            ['Yes', 'No'],
            injuryReported,
            setInjuryReported
          )}

          {injuryReported === 'Yes' && (
            <>
              <Text style={styles.label}>Injury Details *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Briefly describe the injury..."
                placeholderTextColor="#999999"
                value={injuryDetails}
                onChangeText={setInjuryDetails}
                multiline
                textAlignVertical="top"
              />
            </>
          )}

          <View style={styles.noteBox}>
            <Text style={styles.noteTitle}>Before submitting</Text>
            <Text style={styles.noteText}>
              Provide accurate details. If immediate assistance is
              needed, follow your airport's emergency and safety
              reporting procedures.
            </Text>
          </View>

          <Pressable
            style={[
              styles.submitButton,
              saving && styles.disabledButton,
            ]}
            onPress={submitIncident}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={WHITE} />
            ) : (
              <Text style={styles.submitButtonText}>
                Submit Report
              </Text>
            )}
          </Pressable>
        </View>

        {/* Report history */}
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.sectionHeading}>Report History</Text>
            <Text style={styles.sectionHint}>
              Tap a report to view its details
            </Text>
          </View>

          <Text style={styles.historyCount}>
            {filteredIncidents.length}
          </Text>
        </View>

        <View style={styles.filters}>
          {FILTERS.map(renderFilter)}
        </View>

        {loadingIncidents ? (
          <View style={styles.messageContainer}>
            <ActivityIndicator color={RED} />
            <Text style={styles.messageText}>
              Loading incidents...
            </Text>
          </View>
        ) : incidentError ? (
          <View style={styles.messageContainer}>
            <Text style={styles.errorText}>{incidentError}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredIncidents}
            keyExtractor={(item) => item.id}
            renderItem={renderIncident}
            scrollEnabled={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  No incidents found
                </Text>

                <Text style={styles.messageText}>
                  {incidents.length === 0
                    ? 'Submitted reports will appear here.'
                    : 'There are no reports in this category.'}
                </Text>
              </View>
            }
          />
        )}

        <Text style={styles.footer}>
          AeroSync · Ground Operations
        </Text>
      </ScrollView>
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
    backgroundColor: BG,
  },

  pageContent: {
    paddingBottom: 145,
  },

  brandHeader: {
    minHeight: 76,
    backgroundColor: WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: WHITE,
    fontSize: 25,
    fontWeight: '900',
  },

  brandName: {
    color: DARK,
    fontSize: 21,
    fontWeight: '900',
  },

  brandSubtitle: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  pageHeading: {
    backgroundColor: WHITE,
    paddingHorizontal: 17,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },

  headingText: {
    flex: 1,
    minWidth: 0,
  },

  heading: {
    color: DARK,
    fontSize: 25,
    fontWeight: '900',
  },

  subheading: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },

  totalBadge: {
    backgroundColor: '#FCEBED',
    minWidth: 60,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
  },

  totalNumber: {
    color: RED,
    fontSize: 19,
    fontWeight: '900',
  },

  totalLabel: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
  },

  formCard: {
    backgroundColor: WHITE,
    marginHorizontal: 10,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  sectionHeading: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
  },

  sectionHint: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
    lineHeight: 17,
  },

  label: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 15,
    marginBottom: 7,
  },

  optional: {
    color: MUTED,
    fontWeight: '500',
  },

  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  option: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: WHITE,
  },

  optionSelected: {
    borderColor: RED,
    backgroundColor: '#FFF5F6',
  },

  optionText: {
    color: DARK,
    fontSize: 11,
    fontWeight: '700',
  },

  optionTextSelected: {
    color: RED,
    fontWeight: '900',
  },

  input: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: DARK,
  },

  textArea: {
    minHeight: 88,
    paddingTop: 12,
  },

  flightSelector: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    backgroundColor: WHITE,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  flightPlaceholder: {
    color: MUTED,
    fontSize: 13,
  },

  flightChevron: {
    color: RED,
    fontWeight: '900',
    fontSize: 12,
  },

  selectedFlightNumber: {
    color: DARK,
    fontSize: 13,
    fontWeight: '900',
  },

  selectedFlightRoute: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },

  selectedFlightMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
  },

  clearFlightButton: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
  },

  clearFlightText: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
  },

  flightPicker: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    padding: 9,
    marginTop: 7,
    backgroundColor: '#FAFAFA',
  },

  noFlightOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  noFlightsText: {
    color: MUTED,
    fontSize: 12,
    textAlign: 'center',
    padding: 12,
  },

  flightOptionsList: {
    maxHeight: 210,
  },

  flightOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  flightOptionNumber: {
    color: DARK,
    fontSize: 12,
    fontWeight: '900',
  },

  flightOptionRoute: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },

  flightOptionMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
  },

  noteBox: {
    backgroundColor: '#F5F5F6',
    borderRadius: 9,
    padding: 12,
    marginTop: 17,
  },

  noteTitle: {
    color: DARK,
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 4,
  },

  noteText: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
  },

  submitButton: {
    backgroundColor: RED,
    borderRadius: 9,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },

  submitButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
  },

  disabledButton: {
    opacity: 0.55,
  },

  historyHeader: {
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  historyCount: {
    color: RED,
    backgroundColor: '#FCEBED',
    borderRadius: 18,
    minWidth: 34,
    textAlign: 'center',
    overflow: 'hidden',
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '900',
  },

  filters: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    borderRadius: 20,
    paddingHorizontal: 3,
    paddingVertical: 9,
  },

  filterButtonSelected: {
    borderColor: RED,
    backgroundColor: '#FFF5F6',
  },

  filterText: {
    color: DARK,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },

  filterTextSelected: {
    color: RED,
    fontWeight: '900',
  },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },

  incidentItem: {
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  incidentRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 9,
  },

  incidentIcon: {
    width: 35,
    height: 35,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  incidentIconText: {
    fontSize: 19,
    fontWeight: '900',
  },

  incidentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  incidentTitle: {
    color: DARK,
    fontSize: 12,
    fontWeight: '900',
  },

  incidentSubtitle: {
    color: MUTED,
    fontSize: 10,
  },

  severityBadge: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  severityText: {
    fontSize: 10,
    fontWeight: '900',
  },

  chevron: {
    color: DARK,
    fontSize: 24,
    paddingLeft: 1,
  },

  details: {
    paddingHorizontal: 48,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 10,
  },

  detailRow: {
    gap: 3,
  },

  detailLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  detailValue: {
    color: DARK,
    fontSize: 12,
    lineHeight: 18,
  },

  updateButton: {
    minHeight: 42,
    backgroundColor: RED,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },

  updateButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
  },

  messageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    gap: 10,
  },

  messageText: {
    color: MUTED,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  errorText: {
    color: RED,
    fontSize: 12,
    textAlign: 'center',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 35,
    gap: 7,
  },

  emptyTitle: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
  },

  footer: {
    color: MUTED,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
});
