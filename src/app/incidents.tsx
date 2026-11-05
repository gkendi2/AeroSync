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
import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type ReportCategory = 'Incident' | 'Near Miss' | 'Hazard';

type IncidentType =
  | 'Baggage'
  | 'Aircraft'
  | 'Equipment'
  | 'Safety'
  | 'Other';

type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
type ReportStatus = 'Open' | 'Under Investigation' | 'Resolved' | 'Closed';

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
  reportedAt?: {
    toDate?: () => Date;
  } | null;
  status: string;
  supervisorNotes?: string;
  updatedBy?: string;
  updatedAt?: { toDate?: () => Date } | null;
};

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

const RED = '#C8102E';
const DARK_RED = '#A20D25';
const CHARCOAL = '#252525';
const BACKGROUND = '#F4F3F3';
const WHITE = '#FFFFFF';
const MUTED = '#777777';
const BORDER = '#E7E7E9';
const PALE_RED = '#FCEBED';
const GREEN = '#16805C';

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

const REPORT_STATUSES: ReportStatus[] = [
  'Open',
  'Under Investigation',
  'Resolved',
  'Closed',
];

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function formatReportedAt(
  reportedAt?: { toDate?: () => Date } | null,
) {
  if (!reportedAt?.toDate) {
    return 'Time unavailable';
  }

  try {
    return reportedAt.toDate().toLocaleString();
  } catch {
    return 'Time unavailable';
  }
}

function getSeverityStyle(severity: string) {
  switch (severity) {
    case 'Critical':
      return {
        backgroundColor: '#FCE4E4',
        color: '#B42318',
      };

    case 'High':
      return {
        backgroundColor: '#FDEBEC',
        color: RED,
      };

    case 'Medium':
      return {
        backgroundColor: '#FFF2DA',
        color: '#A86B08',
      };

    default:
      return {
        backgroundColor: '#E8F4ED',
        color: GREEN,
      };
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'Resolved':
    case 'Closed':
      return {
        backgroundColor: '#E8F4ED',
        color: GREEN,
      };

    case 'Under Investigation':
      return {
        backgroundColor: '#FFF2DA',
        color: '#A86B08',
      };

    default:
      return {
        backgroundColor: PALE_RED,
        color: RED,
      };
  }
}

// --------------------------------------------------
// MAIN SCREEN
// --------------------------------------------------

export default function IncidentsScreen() {
  // Report form
  const [reportCategory, setReportCategory] =
    useState<ReportCategory>('Incident');

  const [incidentType, setIncidentType] =
    useState<IncidentType>('Baggage');

  const [selectedFlight, setSelectedFlight] =
    useState<Flight | null>(null);

  const [flightPickerOpen, setFlightPickerOpen] =
    useState(false);

  const [flightSearch, setFlightSearch] = useState('');

  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<Severity>('Low');
  const [description, setDescription] = useState('');
  const [immediateAction, setImmediateAction] = useState('');

  const [injuryReported, setInjuryReported] = useState('No');
  const [injuryDetails, setInjuryDetails] = useState('');

  const [saving, setSaving] = useState(false);

  // Flights
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(true);

  // Report history
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [incidentError, setIncidentError] = useState('');

  // Supervisor management
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);

  // --------------------------------------------------
  // LOAD REPORTS ACCORDING TO USER ROLE
  // --------------------------------------------------

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setIncidentError('Please sign in to view reports.');
      setLoadingIncidents(false);
      return;
    }

    let unsubscribeIncidents: (() => void) | undefined;
    let cancelled = false;

    async function startIncidentListener() {
      try {
        const profileSnapshot = await getDoc(
          doc(db, 'users', user.uid),
        );

        if (cancelled) return;

        const role = profileSnapshot.exists()
          ? profileSnapshot.data().role
          : '';

        const supervisor =
          user.uid === ADMIN_UID || role === 'supervisor';

        const handler = role === 'handler';

        setIsSupervisor(supervisor);

        if (!supervisor && !handler) {
          setIncidentError(
            'Your account does not have permission to view reports.',
          );

          setLoadingIncidents(false);
          return;
        }

        const incidentsCollection = collection(db, 'Incidents');

        // Supervisors see all reports.
        // Handlers see only reports they submitted.

        const incidentsQuery = supervisor
          ? query(incidentsCollection)
          : query(
              incidentsCollection,
              where('reportedBy', '==', user.uid),
            );

        unsubscribeIncidents = onSnapshot(
          incidentsQuery,

          snapshot => {
            const loadedIncidents: Incident[] =
              snapshot.docs.map(incidentDoc => {
                const data = incidentDoc.data();

                return {
                  id: incidentDoc.id,
                  reportCategory: data.reportCategory,
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
                  reportedAt: data.reportedAt,
                  status: data.status ?? 'Open',
                  supervisorNotes: data.supervisorNotes ?? '',
                  updatedBy: data.updatedBy ?? '',
                  updatedAt: data.updatedAt ?? null,
                };
              });

            // Sort newest reports first.
            loadedIncidents.sort((a, b) => {
              const aTime =
                a.reportedAt?.toDate?.().getTime() ?? 0;

              const bTime =
                b.reportedAt?.toDate?.().getTime() ?? 0;

              return bTime - aTime;
            });

            setIncidents(loadedIncidents);
            setIncidentError('');
            setLoadingIncidents(false);
          },

          error => {
            console.error('INCIDENT LIST ERROR:', error);

            setIncidentError(
              'Could not load reports. Check your connection and permissions.',
            );

            setLoadingIncidents(false);
          },
        );
      } catch (error) {
        console.error(
          'Could not verify incident access:',
          error,
        );

        if (!cancelled) {
          setIncidentError(
            'Could not verify your account permissions.',
          );

          setLoadingIncidents(false);
        }
      }
    }

    startIncidentListener();

    return () => {
      cancelled = true;
      unsubscribeIncidents?.();
    };
  }, []);

  // --------------------------------------------------
  // LOAD FLIGHTS
  // --------------------------------------------------

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'Flights'),

      snapshot => {
        const loadedFlights: Flight[] =
          snapshot.docs.map(flightDoc => {
            const data = flightDoc.data();

            return {
              id: flightDoc.id,
              flightNumber: data.flightNumber ?? '',
              origin: data.origin ?? '',
              destination: data.destination ?? '',
              departureDate: data.departureDate ?? '',
              departureTime: data.departureTime ?? '',
              status: data.status ?? 'Scheduled',
              isDemo: data.isDemo ?? false,
            };
          });

        loadedFlights.sort((a, b) =>
          `${a.departureDate} ${a.departureTime}`.localeCompare(
            `${b.departureDate} ${b.departureTime}`,
          ),
        );

        setFlights(loadedFlights);
        setLoadingFlights(false);
      },

      error => {
        console.error('FLIGHT LIST ERROR:', error);
        setLoadingFlights(false);
      },
    );

    return unsubscribe;
  }, []);

  // --------------------------------------------------
  // SUBMIT REPORT
  // --------------------------------------------------

  async function submitIncident() {
    if (saving) return;

    if (!location.trim() || !description.trim()) {
      Alert.alert(
        'Missing information',
        'Please enter the location and description.',
      );

      return;
    }

    if (!auth.currentUser) {
      Alert.alert(
        'Not signed in',
        'Please sign in before submitting a report.',
      );

      return;
    }

    if (
      injuryReported === 'Yes' &&
      !injuryDetails.trim()
    ) {
      Alert.alert(
        'Missing injury details',
        'Please briefly describe the reported injury.',
      );

      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'Incidents'), {
        reportCategory,
        incidentType,

        // Link the report to the selected flight.
        flightId: selectedFlight?.id ?? '',

        flightNumber:
          selectedFlight?.flightNumber ?? '',

        flightRoute: selectedFlight
          ? `${selectedFlight.origin} → ${selectedFlight.destination}`
          : '',

        location: location.trim(),
        severity,
        description: description.trim(),
        immediateAction: immediateAction.trim(),

        injuryReported,

        injuryDetails:
          injuryReported === 'Yes'
            ? injuryDetails.trim()
            : '',

        reportedBy: auth.currentUser.uid,
        reportedAt: serverTimestamp(),
        status: 'Open',
      });

      Alert.alert(
        'Report submitted',
        'Your report has been successfully recorded.',
      );

      // Reset form.
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
      console.error(
        'INCIDENT SUBMISSION ERROR:',
        error,
      );

      Alert.alert(
        'Submission failed',
        'Could not submit your report. Check your connection and Firebase permissions.',
      );
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // SUPERVISOR REPORT MANAGEMENT
  // --------------------------------------------------

  async function updateIncident(
    incident: Incident,
    nextStatus: ReportStatus,
  ) {
    if (!isSupervisor || !auth.currentUser) {
      Alert.alert(
        'Not authorised',
        'Only supervisors can manage reports.',
      );
      return;
    }

    setUpdatingReportId(incident.id);

    try {
      await updateDoc(doc(db, 'Incidents', incident.id), {
        status: nextStatus,
        supervisorNotes: (
          noteDrafts[incident.id] ??
          incident.supervisorNotes ??
          ''
        ).trim(),
        updatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      });

      Alert.alert(
        'Report updated',
        `Status changed to ${nextStatus}.`,
      );
    } catch (error) {
      console.error('INCIDENT UPDATE ERROR:', error);

      Alert.alert(
        'Update failed',
        'Could not update this report. Check your connection and Firestore permissions.',
      );
    } finally {
      setUpdatingReportId(null);
    }
  }

  // --------------------------------------------------
  // FILTER REPORTS
  // --------------------------------------------------

  const filteredIncidents = incidents.filter(incident =>
    (categoryFilter === 'All' ||
      (incident.reportCategory ?? 'Incident') === categoryFilter)
    &&
    (severityFilter === 'All' ||
      incident.severity === severityFilter)
    &&
    (statusFilter === 'All' ||
      incident.status === statusFilter),
  );

  // --------------------------------------------------
  // OPTION BUTTONS
  // --------------------------------------------------

  function renderOptions<T extends string>(
    options: T[],
    selected: T,
    onSelect: (value: T) => void,
  ) {
    return (
      <View style={styles.optionRow}>
        {options.map(option => {
          const isSelected = selected === option;

          return (
            <Pressable
              key={option}
              style={[
                styles.option,
                isSelected && styles.optionSelected,
              ]}
              onPress={() => onSelect(option)}
            >
              <Text
                style={[
                  styles.optionText,
                  isSelected && styles.optionTextSelected,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  // --------------------------------------------------
  // FILTER FLIGHTS
  // --------------------------------------------------

  const filteredFlights = flights.filter(flight => {
    const search = flightSearch.trim().toLowerCase();

    if (!search) return true;

    return [
      flight.flightNumber,
      flight.origin,
      flight.destination,
    ].some(value =>
      value.toLowerCase().includes(search),
    );
  });

  // --------------------------------------------------
  // SCREEN UI
  // --------------------------------------------------

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* HEADER */}

      <View style={styles.header}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>A</Text>
        </View>

        <View style={styles.brandText}>
          <Text style={styles.brandName}>AeroSync</Text>

          <Text style={styles.brandSubtitle}>
            GROUND OPERATIONS
          </Text>
        </View>
      </View>

      {/* PAGE HEADING */}

      <View style={styles.headingSection}>
        <Text style={styles.title}>
          Safety Reporting
        </Text>

        <Text style={styles.subtitle}>
          Record incidents, near misses and workplace hazards.
          Your reports help improve ground-handling safety.
        </Text>
      </View>

      {/* REPORT FORM */}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          Submit a Report
        </Text>

        <Text style={styles.label}>
          Report Category *
        </Text>

        {renderOptions(
          REPORT_CATEGORIES,
          reportCategory,
          setReportCategory,
        )}

        <Text style={styles.label}>
          Report Type *
        </Text>

        {renderOptions(
          INCIDENT_TYPES,
          incidentType,
          setIncidentType,
        )}

        {/* FLIGHT SELECTOR */}

        <Text style={styles.label}>
          Flight Involved
          <Text style={styles.optional}>
            {' '}(Optional)
          </Text>
        </Text>

        <Pressable
          style={styles.flightSelector}
          onPress={() =>
            setFlightPickerOpen(!flightPickerOpen)
          }
        >
          <View style={{ flex: 1 }}>
            {selectedFlight ? (
              <>
                <Text style={styles.selectedFlightNumber}>
                  {selectedFlight.flightNumber}
                  {selectedFlight.isDemo ? ' · DEMO' : ''}
                </Text>

                <Text style={styles.selectedFlightRoute}>
                  {selectedFlight.origin} → {selectedFlight.destination}
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

        {selectedFlight ? (
          <Pressable
            onPress={() => setSelectedFlight(null)}
            style={styles.clearFlightButton}
          >
            <Text style={styles.clearFlightText}>
              Remove selected flight
            </Text>
          </Pressable>
        ) : null}

        {/* FLIGHT SEARCH DROPDOWN */}

        {flightPickerOpen ? (
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
              <Text style={styles.noFlightText}>
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
              <ScrollView
                style={styles.flightOptionsList}
                nestedScrollEnabled
              >
                {filteredFlights.map(flight => (
                  <Pressable
                    key={flight.id}
                    style={styles.flightOption}
                    onPress={() => {
                      setSelectedFlight(flight);
                      setFlightPickerOpen(false);
                      setFlightSearch('');
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.flightOptionNumber}>
                        {flight.flightNumber}
                        {flight.isDemo ? ' · DEMO' : ''}
                      </Text>

                      <Text style={styles.flightOptionRoute}>
                        {flight.origin} → {flight.destination}
                      </Text>

                      <Text style={styles.flightOptionMeta}>
                        {flight.departureDate} · {flight.departureTime} · {flight.status}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* LOCATION */}

        <Text style={styles.label}>
          Location *
        </Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. Stand 12, Baggage Hall"
          placeholderTextColor="#999999"
          value={location}
          onChangeText={setLocation}
        />

        {/* SEVERITY */}

        <Text style={styles.label}>
          Severity *
        </Text>

        {renderOptions(
          SEVERITIES,
          severity,
          setSeverity,
        )}

        {/* DESCRIPTION */}

        <Text style={styles.label}>
          Description *
        </Text>

        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe what happened or what you observed..."
          placeholderTextColor="#999999"
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
        />

        {/* IMMEDIATE ACTION */}

        <Text style={styles.label}>
          Immediate Action Taken
        </Text>

        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What action was taken immediately?"
          placeholderTextColor="#999999"
          value={immediateAction}
          onChangeText={setImmediateAction}
          multiline
          textAlignVertical="top"
        />

        {/* INJURY */}

        <Text style={styles.label}>
          Was anyone injured?
        </Text>

        {renderOptions(
          ['Yes', 'No'],
          injuryReported,
          setInjuryReported,
        )}

        {injuryReported === 'Yes' && (
          <>
            <Text style={styles.label}>
              Injury Details *
            </Text>

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

        {/* NOTE */}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>
            Before submitting
          </Text>

          <Text style={styles.noteText}>
            Provide accurate details. If immediate assistance is
            needed, follow your airport's emergency and safety
            reporting procedures.
          </Text>
        </View>

        {/* SUBMIT */}

        <Pressable
          style={[
            styles.submitButton,
            saving && styles.submitButtonDisabled,
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

      {/* REPORT HISTORY */}

      <View style={styles.recentHeader}>
        <View>
          <Text style={styles.sectionTitle}>
            Report History
          </Text>

          <Text style={styles.recentSubtitle}>
            Recent reports from AeroSync
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>
            {isSupervisor ? filteredIncidents.length : incidents.length}
          </Text>
        </View>
      </View>

      {/* SUPERVISOR FILTERS */}

      {isSupervisor ? (
        <View style={styles.filterCard}>
          <Text style={styles.filterHeading}>
            Filter Reports
          </Text>

          <Text style={styles.filterLabel}>
            Category
          </Text>

          {renderOptions(
            ['All', ...REPORT_CATEGORIES],
            categoryFilter,
            setCategoryFilter,
          )}

          <Text style={styles.filterLabel}>
            Severity
          </Text>

          {renderOptions(
            ['All', ...SEVERITIES],
            severityFilter,
            setSeverityFilter,
          )}

          <Text style={styles.filterLabel}>
            Status
          </Text>

          {renderOptions(
            ['All', ...REPORT_STATUSES],
            statusFilter,
            setStatusFilter,
          )}
        </View>
      ) : null}

      {loadingIncidents ? (
        <View style={styles.messageCard}>
          <ActivityIndicator color={RED} />

          <Text style={styles.messageText}>
            Loading reports...
          </Text>
        </View>
      ) : incidentError ? (
        <View style={styles.messageCard}>
          <Text style={styles.errorText}>
            {incidentError}
          </Text>
        </View>
      ) : filteredIncidents.length === 0 ? (
        <View style={styles.messageCard}>
          <Text style={styles.emptyTitle}>
            No reports yet
          </Text>

          <Text style={styles.messageText}>
            {incidents.length === 0
              ? 'Submitted reports will appear here.'
              : 'No reports match the selected filters.'}
          </Text>
        </View>
      ) : (
        filteredIncidents.map(incident => {
          const severityStyle = getSeverityStyle(
            incident.severity,
          );

          const statusStyle = getStatusStyle(
            incident.status,
          );

          const currentStatus = REPORT_STATUSES.includes(
            incident.status as ReportStatus,
          )
            ? incident.status as ReportStatus
            : 'Open';

          return (
            <View
              key={incident.id}
              style={styles.incidentCard}
            >
              <View style={styles.incidentHeader}>
                <View style={styles.incidentTitleArea}>
                  <Text style={styles.incidentType}>
                    {incident.reportCategory ?? 'Incident'}
                  </Text>

                  <Text style={styles.incidentSubType}>
                    {incident.incidentType}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        severityStyle.backgroundColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: severityStyle.color },
                    ]}
                  >
                    {incident.severity}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* LINKED FLIGHT */}

              {incident.flightNumber ? (
                <View style={styles.detailRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>
                      Flight
                    </Text>

                    <Text style={styles.detailValue}>
                      {incident.flightNumber}
                    </Text>

                    {incident.flightRoute ? (
                      <Text style={styles.flightHistoryRoute}>
                        {incident.flightRoute}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* LOCATION */}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  Location
                </Text>

                <Text style={styles.detailValue}>
                  {incident.location}
                </Text>
              </View>

              {/* STATUS */}

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  Status
                </Text>

                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        statusStyle.backgroundColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: statusStyle.color },
                    ]}
                  >
                    {incident.status}
                  </Text>
                </View>
              </View>

              {/* DESCRIPTION */}

              <Text style={styles.descriptionLabel}>
                Description
              </Text>

              <Text style={styles.description}>
                {incident.description}
              </Text>

              {/* IMMEDIATE ACTION */}

              {incident.immediateAction ? (
                <>
                  <Text style={styles.descriptionLabel}>
                    Immediate Action
                  </Text>

                  <Text style={styles.description}>
                    {incident.immediateAction}
                  </Text>
                </>
              ) : null}

              {/* INJURY DETAILS */}

              {incident.injuryReported === 'Yes' ? (
                <>
                  <Text style={styles.descriptionLabel}>
                    Injury Reported
                  </Text>

                  <Text style={styles.description}>
                    {incident.injuryDetails ||
                      'Details not provided'}
                  </Text>
                </>
              ) : null}

              {/* SUPERVISOR MANAGEMENT */}

              {isSupervisor ? (
                <View style={styles.managementPanel}>
                  <Text style={styles.managementTitle}>
                    Supervisor Management
                  </Text>

                  <Text style={styles.filterLabel}>
                    Update Status
                  </Text>

                  {renderOptions(
                    REPORT_STATUSES,
                    currentStatus,
                    value => updateIncident(incident, value),
                  )}

                  <Text style={styles.filterLabel}>
                    Investigation / Resolution Notes
                  </Text>

                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Record findings, action taken or resolution..."
                    placeholderTextColor="#999999"
                    value={
                      noteDrafts[incident.id] ??
                      incident.supervisorNotes ??
                      ''
                    }
                    onChangeText={value =>
                      setNoteDrafts(current => ({
                        ...current,
                        [incident.id]: value,
                      }))
                    }
                    multiline
                    textAlignVertical="top"
                  />

                  <Pressable
                    style={[
                      styles.saveManagementButton,
                      updatingReportId === incident.id &&
                        styles.submitButtonDisabled,
                    ]}
                    onPress={() =>
                      updateIncident(incident, currentStatus)
                    }
                    disabled={updatingReportId === incident.id}
                  >
                    {updatingReportId === incident.id ? (
                      <ActivityIndicator color={WHITE} />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        Save Notes
                      </Text>
                    )}
                  </Pressable>

                  {incident.updatedAt ? (
                    <Text style={styles.reportedAt}>
                      Last updated {formatReportedAt(incident.updatedAt)}
                    </Text>
                  ) : null}
                </View>
              ) : incident.supervisorNotes ? (
                <>
                  <Text style={styles.descriptionLabel}>
                    Supervisor Notes
                  </Text>

                  <Text style={styles.description}>
                    {incident.supervisorNotes}
                  </Text>
                </>
              ) : null}

              <Text style={styles.reportedAt}>
                Reported {formatReportedAt(incident.reportedAt)}
              </Text>
            </View>
          );
        })
      )}

      <Text style={styles.footer}>
        AeroSync · Ground Operations
      </Text>
    </ScrollView>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  content: {
    padding: 20,
    paddingBottom: 45,
    gap: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 4,
  },

  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: WHITE,
    fontSize: 25,
    fontWeight: '900',
  },

  brandText: {
    gap: 3,
  },

  brandName: {
    fontSize: 19,
    fontWeight: '900',
    color: CHARCOAL,
  },

  brandSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: MUTED,
  },

  headingSection: {
    gap: 6,
    marginBottom: 4,
  },

  title: {
    fontSize: 27,
    fontWeight: '900',
    color: CHARCOAL,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
  },

  card: {
    backgroundColor: WHITE,
    borderRadius: 17,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: CHARCOAL,
    marginBottom: 12,
  },

  label: {
    fontSize: 13,
    fontWeight: '800',
    color: CHARCOAL,
    marginTop: 17,
    marginBottom: 9,
  },

  optional: {
    color: MUTED,
    fontWeight: '500',
  },

  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  option: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 13,
    backgroundColor: WHITE,
  },

  optionSelected: {
    backgroundColor: RED,
    borderColor: RED,
  },

  optionText: {
    fontSize: 12,
    fontWeight: '700',
    color: CHARCOAL,
  },

  optionTextSelected: {
    color: WHITE,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    color: CHARCOAL,
  },

  textArea: {
    minHeight: 95,
    paddingTop: 12,
  },

  flightSelector: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  flightPlaceholder: {
    color: '#999999',
    fontSize: 14,
  },

  flightChevron: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
  },

  selectedFlightNumber: {
    color: CHARCOAL,
    fontSize: 14,
    fontWeight: '900',
  },

  selectedFlightRoute: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },

  selectedFlightMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
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
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    backgroundColor: '#FAFAFA',
  },

  noFlightOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  noFlightText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },

  noFlightsText: {
    color: MUTED,
    fontSize: 12,
    textAlign: 'center',
    padding: 15,
  },

  flightOptionsList: {
    maxHeight: 230,
  },

  flightOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: 'row',
  },

  flightOptionNumber: {
    color: CHARCOAL,
    fontSize: 13,
    fontWeight: '900',
  },

  flightOptionRoute: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },

  flightOptionMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },

  flightHistoryRoute: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
  },

  noteBox: {
    backgroundColor: '#F8F7F7',
    borderRadius: 11,
    padding: 13,
    marginTop: 20,
  },

  noteTitle: {
    color: CHARCOAL,
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 5,
  },

  noteText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },

  submitButton: {
    backgroundColor: RED,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  submitButtonDisabled: {
    backgroundColor: DARK_RED,
    opacity: 0.7,
  },

  submitButtonText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: '900',
  },

  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },

  recentSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: -6,
  },

  countBadge: {
    minWidth: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  countText: {
    color: RED,
    fontWeight: '900',
    fontSize: 14,
  },

  filterCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },

  filterHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: CHARCOAL,
  },

  filterLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: CHARCOAL,
    marginTop: 8,
    marginBottom: 5,
  },

  managementPanel: {
    backgroundColor: '#FAF7F7',
    borderRadius: 12,
    padding: 13,
    marginTop: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },

  managementTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: CHARCOAL,
    marginBottom: 5,
  },

  saveManagementButton: {
    backgroundColor: RED,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  messageCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 23,
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: BORDER,
  },

  messageText: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: CHARCOAL,
  },

  errorText: {
    color: RED,
    fontSize: 13,
    textAlign: 'center',
  },

  incidentCard: {
    backgroundColor: WHITE,
    borderRadius: 15,
    padding: 16,
    marginBottom: 1,
    borderWidth: 1,
    borderColor: BORDER,
  },

  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  incidentTitleArea: {
    flex: 1,
    paddingRight: 10,
  },

  incidentType: {
    fontSize: 17,
    fontWeight: '900',
    color: CHARCOAL,
  },

  incidentSubType: {
    fontSize: 12,
    fontWeight: '700',
    color: RED,
    marginTop: 3,
  },

  badge: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    alignSelf: 'flex-start',
  },

  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 13,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  detailLabel: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '600',
  },

  detailValue: {
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
    fontSize: 12,
    color: CHARCOAL,
    fontWeight: '800',
  },

  descriptionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: CHARCOAL,
    marginTop: 9,
    marginBottom: 4,
  },

  description: {
    fontSize: 13,
    lineHeight: 19,
    color: '#555555',
  },

  reportedAt: {
    fontSize: 10,
    color: MUTED,
    marginTop: 14,
  },

  footer: {
    fontSize: 11,
    color: MUTED,
    textAlign: 'center',
    marginTop: 8,
  },
});