
import { auth, db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const RED = '#C8102E';
const DARK = '#24272B';
const MUTED = '#777D84';
const BORDER = '#E8E9EB';
const BG = '#F7F7F8';
const ORANGE = '#E6A000';
const GREEN = '#15803D';

const STALE_BAGGAGE_MINUTES = 60;

type Assignment = {
  id: string;
  flightNumber: string;
  handlerUid: string;
  handlerName: string;
  shiftDate: string;
  shiftTime: string;
  activity: string;
  status: string;
};

type BaggageRecord = {
  id: string;
  baggageId: string;
  flightId: string;
  status: string;
  createdAt: Date | null;
};

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

type RiskLevel = 'High' | 'Medium' | 'Low';

type FlightAssessment = {
  flight: Flight;
  risk: RiskLevel;
  warningCount: number;
  overdueAssignments: Assignment[];
  oldRegisteredBaggage: BaggageRecord[];
  unresolvedIncidents: Incident[];
  highSeverityIncidents: Incident[];
};

const UNRESOLVED_INCIDENT_STATUSES = [
  'Open',
  'Under Investigation',
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function riskColor(risk: RiskLevel) {
  if (risk === 'High') return RED;
  if (risk === 'Medium') return ORANGE;
  return GREEN;
}

function formatRoute(flight: Flight) {
  if (flight.origin && flight.destination) {
    return `${flight.origin} → ${flight.destination}`;
  }
  return 'Route unavailable';
}

function assessFlight(
  flight: Flight,
  assignments: Assignment[],
  baggageRecords: BaggageRecord[],
  incidents: Incident[],
): FlightAssessment {
  const flightAssignments = assignments.filter(
    (item) => item.flightNumber === flight.flightNumber,
  );

  const flightBaggage = baggageRecords.filter(
    (item) => item.flightId === flight.id,
  );

  const flightIncidents = incidents.filter((item) => {
    if (item.flightId && item.flightId === flight.id) return true;

    return (
      !item.flightId &&
      item.flightNumber === flight.flightNumber
    );
  });

  const unresolvedIncidents = flightIncidents.filter((item) =>
    UNRESOLVED_INCIDENT_STATUSES.some(
      (status) => status.toLowerCase() === item.status.toLowerCase(),
    ),
  );

  const highSeverityIncidents = unresolvedIncidents.filter((item) => {
    const severity = item.severity.toLowerCase();
    return severity === 'high' || severity === 'critical';
  });

  const now = Date.now();

  const overdueAssignments = flightAssignments.filter((item) => {
    if (item.status.toLowerCase() !== 'assigned') return false;

    const match = item.shiftTime.match(
      /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
    );

    if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(item.shiftDate)) {
      return false;
    }

    const [, , , endHour, endMinute] = match;

    const shiftEnd = new Date(
      `${item.shiftDate}T${endHour.padStart(2, '0')}:${endMinute}:00`,
    ).getTime();

    return Number.isFinite(shiftEnd) && shiftEnd < now;
  });

  const oldRegisteredBaggage = flightBaggage.filter((item) => {
    if (
      item.status.toLowerCase() !== 'registered' ||
      !item.createdAt
    ) {
      return false;
    }

    const ageMinutes =
      (now - item.createdAt.getTime()) / 60000;

    return ageMinutes >= STALE_BAGGAGE_MINUTES;
  });

  let warningCount = 0;

  if (overdueAssignments.length > 0) warningCount += 1;
  if (oldRegisteredBaggage.length > 0) warningCount += 1;
  if (unresolvedIncidents.length > 0) warningCount += 1;

  const risk: RiskLevel =
    highSeverityIncidents.length > 0 || warningCount >= 2
      ? 'High'
      : warningCount === 1
        ? 'Medium'
        : 'Low';

  return {
    flight,
    risk,
    warningCount,
    overdueAssignments,
    oldRegisteredBaggage,
    unresolvedIncidents,
    highSeverityIncidents,
  };
}

export default function DelayRiskScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [baggageRecords, setBaggageRecords] = useState<BaggageRecord[]>([]);
  const [flightsData, setFlightsData] = useState<Flight[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingBaggage, setLoadingBaggage] = useState(true);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  const [error, setError] = useState('');
  const [selectedFlightId, setSelectedFlightId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<'Today' | 'All flights'>('Today');
  const [showPeriodOptions, setShowPeriodOptions] = useState(false);
  const [expandedFactor, setExpandedFactor] = useState('');

  useEffect(() => {
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
            const data = item.data();
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
  }, []);

  const flights = useMemo(() => {
    const flightMap = new Map<string, Flight>();

    flightsData.forEach((flight) => {
      if (flight.id && flight.flightNumber.trim()) {
        flightMap.set(flight.id, flight);
      }
    });

    assignments.forEach((assignment) => {
      const number = assignment.flightNumber.trim();
      if (!number) return;

      const exists = Array.from(flightMap.values()).some(
        (flight) => flight.flightNumber === number,
      );

      if (!exists) {
        flightMap.set(`assignment-${number}`, {
          id: `assignment-${number}`,
          flightNumber: number,
          origin: '',
          destination: '',
          departureDate: '',
          departureTime: '',
          status: '',
          isDemo: true,
        });
      }
    });

    return Array.from(flightMap.values());
  }, [flightsData, assignments]);

  const assessments = useMemo(() => {
    return flights.map((flight) =>
      assessFlight(flight, assignments, baggageRecords, incidents),
    );
  }, [flights, assignments, baggageRecords, incidents]);

  const visibleAssessments = useMemo(() => {
    if (selectedPeriod === 'All flights') return assessments;

    const today = localDateKey();

    return assessments.filter((item) => {
      if (!item.flight.departureDate) return false;

      const flightDate = item.flight.departureDate.slice(0, 10);
      return flightDate === today;
    });
  }, [assessments, selectedPeriod]);

  const highCount = visibleAssessments.filter(
    (item) => item.risk === 'High',
  ).length;

  const mediumCount = visibleAssessments.filter(
    (item) => item.risk === 'Medium',
  ).length;

  const lowCount = visibleAssessments.filter(
    (item) => item.risk === 'Low',
  ).length;

  const totalFlights = visibleAssessments.length;

  const riskPercentage =
    totalFlights > 0
      ? Math.round((highCount / totalFlights) * 100)
      : 0;

  const flightsAtRisk = visibleAssessments
    .filter((item) => item.risk !== 'Low')
    .sort((a, b) => {
      if (a.risk === b.risk) return 0;
      return a.risk === 'High' ? -1 : 1;
    });

  const selectedAssessment = assessments.find(
    (item) => item.flight.id === selectedFlightId,
  );

  const isLoading =
    loadingAssignments ||
    loadingBaggage ||
    loadingFlights ||
    loadingIncidents;

  const riskFactors = [
    {
      id: 'weather',
      title: 'Weather',
      description: 'Weather data integration pending',
      icon: '☁',
      status: 'Not configured',
      color: MUTED,
      detail:
        'Weather information will be connected here in a later development phase. No weather-based risk is currently included in the assessment.',
    },
    {
      id: 'equipment',
      title: 'Equipment',
      description: 'Equipment availability data pending',
      icon: '🔧',
      status: 'Not configured',
      color: MUTED,
      detail:
        'Ground support equipment status will be connected here later. Equipment availability is not currently included in the risk calculation.',
    },
    {
      id: 'crew',
      title: 'Crew',
      description: `${visibleAssessments.reduce((sum, item) => sum + item.overdueAssignments.length, 0)} overdue assignment(s)`,
      icon: '♙',
      status: 'Live data',
      color: RED,
      detail:
        'Flags assignments that remain Assigned after their scheduled shift end.',
    },
    {
      id: 'baggage',
      title: 'Baggage',
      description: `${visibleAssessments.reduce((sum, item) => sum + item.oldRegisteredBaggage.length, 0)} potentially stalled record(s)`,
      icon: '▣',
      status: 'Live data',
      color: ORANGE,
      detail:
        `Flags baggage records that remain Registered for at least ${STALE_BAGGAGE_MINUTES} minutes.`,
    },
    {
      id: 'incidents',
      title: 'Incidents',
      description: `${visibleAssessments.reduce((sum, item) => sum + item.unresolvedIncidents.length, 0)} unresolved report(s)`,
      icon: '⚠',
      status: 'Live data',
      color: RED,
      detail:
        'Open and Under Investigation incident reports are included in the risk assessment.',
    },
  ];

  function toggleFactor(id: string) {
    setExpandedFactor((current) => current === id ? '' : id);
  }

  function openFlight(item: FlightAssessment) {
    setSelectedFlightId(item.flight.id);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => {
                if (selectedAssessment) {
                  setSelectedFlightId('');
                }
              }}
              style={styles.backButton}
            >
              <Text style={styles.backText}>‹</Text>
            </Pressable>

            <Text style={styles.heading}>Delay Risk</Text>
          </View>

          <View style={styles.periodWrapper}>
            <Pressable
              style={styles.periodButton}
              onPress={() => setShowPeriodOptions((value) => !value)}
            >
              <Text style={styles.periodText}>{selectedPeriod}</Text>
              <Text style={styles.periodChevron}>⌄</Text>
            </Pressable>

            {showPeriodOptions && (
              <View style={styles.periodMenu}>
                {(['Today', 'All flights'] as const).map((period) => (
                  <Pressable
                    key={period}
                    style={styles.periodOption}
                    onPress={() => {
                      setSelectedPeriod(period);
                      setShowPeriodOptions(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.periodOptionText,
                        selectedPeriod === period && styles.periodOptionSelected,
                      ]}
                    >
                      {period}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={RED} />
            <Text style={styles.loadingText}>
              Loading operational risk data...
            </Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {selectedAssessment ? (
              <View style={styles.detailPanel}>
                <Pressable
                  onPress={() => setSelectedFlightId('')}
                  style={styles.detailBack}
                >
                  <Text style={styles.detailBackText}>‹ Back to overview</Text>
                </Pressable>

                <View style={styles.detailFlightHeader}>
                  <View>
                    <Text style={styles.detailFlightNumber}>
                      {selectedAssessment.flight.flightNumber}
                    </Text>
                    <Text style={styles.detailRoute}>
                      {formatRoute(selectedAssessment.flight)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.riskBadge,
                      { backgroundColor: riskColor(selectedAssessment.risk) },
                    ]}
                  >
                    <Text style={styles.riskBadgeText}>
                      {selectedAssessment.risk}
                    </Text>
                  </View>
                </View>

                <Text style={styles.detailSectionTitle}>Risk findings</Text>

                {selectedAssessment.overdueAssignments.length > 0 && (
                  <View style={styles.detailFinding}>
                    <Text style={styles.detailFindingTitle}>Crew assignments</Text>
                    {selectedAssessment.overdueAssignments.map((item) => (
                      <Text key={item.id} style={styles.detailFindingText}>
                        {item.handlerName} · {item.activity} · {item.shiftTime}
                      </Text>
                    ))}
                  </View>
                )}

                {selectedAssessment.oldRegisteredBaggage.length > 0 && (
                  <View style={styles.detailFinding}>
                    <Text style={styles.detailFindingTitle}>Baggage handling</Text>
                    {selectedAssessment.oldRegisteredBaggage.map((item) => (
                      <Text key={item.id} style={styles.detailFindingText}>
                        {item.baggageId} · Status: {item.status}
                      </Text>
                    ))}
                  </View>
                )}

                {selectedAssessment.unresolvedIncidents.length > 0 && (
                  <View style={styles.detailFinding}>
                    <Text style={styles.detailFindingTitle}>Incident reports</Text>
                    {selectedAssessment.unresolvedIncidents.map((item) => (
                      <Text key={item.id} style={styles.detailFindingText}>
                        {item.incidentType || item.reportCategory || 'Incident'} · {item.severity} · {item.status}
                      </Text>
                    ))}
                  </View>
                )}

                {selectedAssessment.warningCount === 0 && (
                  <Text style={styles.noWarnings}>
                    No configured warning conditions detected in the available records.
                  </Text>
                )}

                <Text style={styles.detailDisclaimer}>
                  This is a provisional rule-based indicator, not a validated flight-delay prediction.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.summarySection}>
                  <View style={styles.ringWrap}>
                    <View style={styles.ringOuter}>
                      <View style={styles.ringInner}>
                        <Text style={styles.ringPercentage}>
                          {riskPercentage}%
                        </Text>
                        <Text style={styles.ringLabel}>High risk</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.legend}>
                    <View style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: RED }]} />
                      <Text style={styles.legendText}>High ({highCount})</Text>
                    </View>

                    <View style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: ORANGE }]} />
                      <Text style={styles.legendText}>Medium ({mediumCount})</Text>
                    </View>

                    <View style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: '#B8BBC0' }]} />
                      <Text style={styles.legendText}>Low ({lowCount})</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.section}>
                  <View style={styles.sectionHeadingRow}>
                    <Text style={styles.sectionTitle}>
                      Flights at Risk ({flightsAtRisk.length})
                    </Text>
                  </View>

                  {flightsAtRisk.length === 0 ? (
                    <View style={styles.emptyRow}>
                      <Text style={styles.emptyText}>
                        No high- or medium-risk flights found for this period.
                      </Text>
                    </View>
                  ) : (
                    flightsAtRisk.map((item) => (
                      <Pressable
                        key={item.flight.id}
                        onPress={() => openFlight(item)}
                        style={({ pressed }) => [
                          styles.flightRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.airlineIcon}>✈</Text>

                        <View style={styles.flightCopy}>
                          <Text style={styles.flightNumber}>
                            {item.flight.flightNumber}
                          </Text>
                          <Text style={styles.flightRoute}>
                            {formatRoute(item.flight)}
                          </Text>
                        </View>

                        <Text style={styles.flightTime}>
                          {item.flight.departureTime || '—'}
                        </Text>

                        <View
                          style={[
                            styles.flightRiskBadge,
                            item.risk === 'High'
                              ? styles.highBadge
                              : styles.mediumBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.flightRiskText,
                              { color: riskColor(item.risk) },
                            ]}
                          >
                            {item.risk}
                          </Text>
                        </View>

                        <Text style={styles.rowChevron}>›</Text>
                      </Pressable>
                    ))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Risk Factors</Text>

                  {riskFactors.map((factor) => (
                    <View key={factor.id}>
                      <Pressable
                        onPress={() => toggleFactor(factor.id)}
                        style={({ pressed }) => [
                          styles.factorRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.factorIcon}>
                          <Text style={styles.factorIconText}>
                            {factor.icon}
                          </Text>
                        </View>

                        <View style={styles.factorCopy}>
                          <Text style={styles.factorTitle}>
                            {factor.title}
                          </Text>
                          <Text style={styles.factorDescription}>
                            {factor.description}
                          </Text>
                        </View>

                        {factor.status === 'Not configured' ? (
                          <Text style={styles.pendingLabel}>Pending</Text>
                        ) : (
                          <View style={styles.liveDot} />
                        )}

                        <Text style={styles.rowChevron}>
                          {expandedFactor === factor.id ? '⌄' : '›'}
                        </Text>
                      </Pressable>

                      {expandedFactor === factor.id && (
                        <View style={styles.factorDetail}>
                          <Text style={styles.factorDetailText}>
                            {factor.detail}
                          </Text>
                          {factor.status === 'Not configured' && (
                            <Text style={styles.pendingNote}>
                              Planned integration
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                <View style={styles.disclaimer}>
                  <Text style={styles.disclaimerText}>
                    Risk assessments are provisional and based only on the operational records currently available. Weather and equipment data are not yet connected and do not contribute to the risk calculation.
                  </Text>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingBottom: 115,
  },

  header: {
    minHeight: 65,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    zIndex: 5,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },

  backButton: {
    width: 24,
    alignItems: 'flex-start',
  },

  backText: {
    color: DARK,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '400',
  },

  heading: {
    color: DARK,
    fontSize: 20,
    fontWeight: '800',
  },

  periodWrapper: {
    position: 'relative',
    zIndex: 10,
  },

  periodButton: {
    minWidth: 100,
    height: 37,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  periodText: {
    color: DARK,
    fontSize: 12,
    fontWeight: '700',
  },

  periodChevron: {
    color: MUTED,
    fontSize: 17,
  },

  periodMenu: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 125,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    elevation: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  periodOption: {
    paddingHorizontal: 13,
    paddingVertical: 12,
  },

  periodOptionText: {
    color: DARK,
    fontSize: 12,
  },

  periodOptionSelected: {
    color: RED,
    fontWeight: '800',
  },

  summarySection: {
    minHeight: 220,
    paddingHorizontal: 25,
    paddingVertical: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  ringOuter: {
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 12,
    borderTopColor: RED,
    borderRightColor: ORANGE,
    borderBottomColor: '#D8DADD',
    borderLeftColor: '#D8DADD',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-25deg' }],
  },

  ringInner: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '25deg' }],
  },

  ringPercentage: {
    color: DARK,
    fontSize: 32,
    fontWeight: '800',
  },

  ringLabel: {
    color: DARK,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },

  legend: {
    gap: 17,
    marginLeft: 12,
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  legendDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
  },

  legendText: {
    color: DARK,
    fontSize: 13,
    fontWeight: '600',
  },

  section: {
    paddingTop: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  sectionHeadingRow: {
    marginBottom: 7,
  },

  sectionTitle: {
    color: DARK,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 5,
  },

  flightRow: {
    minHeight: 77,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F1',
    gap: 9,
  },

  airlineIcon: {
    width: 35,
    color: RED,
    fontSize: 23,
    textAlign: 'center',
  },

  flightCopy: {
    flex: 1,
    minWidth: 0,
  },

  flightNumber: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },

  flightRoute: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },

  flightTime: {
    color: DARK,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'center',
  },

  flightRiskBadge: {
    minWidth: 65,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 18,
    alignItems: 'center',
  },

  highBadge: {
    backgroundColor: '#FCE8EB',
  },

  mediumBadge: {
    backgroundColor: '#FFF4DC',
  },

  flightRiskText: {
    fontSize: 11,
    fontWeight: '800',
  },

  rowChevron: {
    color: MUTED,
    fontSize: 25,
    marginLeft: 1,
  },

  emptyRow: {
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F1',
  },

  emptyText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },

  factorRow: {
    minHeight: 69,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F1',
    gap: 11,
  },

  factorIcon: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  factorIconText: {
    color: DARK,
    fontSize: 23,
  },

  factorCopy: {
    flex: 1,
    minWidth: 0,
  },

  factorTitle: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },

  factorDescription: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },

  pendingLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GREEN,
  },

  factorDetail: {
    paddingHorizontal: 49,
    paddingBottom: 13,
    marginTop: -2,
  },

  factorDetailText: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
  },

  pendingNote: {
    color: RED,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },

  disclaimer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },

  disclaimerText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
  },

  loadingBox: {
    padding: 45,
    alignItems: 'center',
    gap: 12,
  },

  loadingText: {
    color: MUTED,
    fontSize: 12,
  },

  errorBox: {
    margin: 18,
    padding: 12,
    backgroundColor: '#FCE8EB',
    borderRadius: 8,
  },

  errorText: {
    color: RED,
    fontSize: 12,
  },

  detailPanel: {
    padding: 20,
  },

  detailBack: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },

  detailBackText: {
    color: RED,
    fontSize: 13,
    fontWeight: '700',
  },

  detailFlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  detailFlightNumber: {
    color: DARK,
    fontSize: 22,
    fontWeight: '800',
  },

  detailRoute: {
    color: MUTED,
    fontSize: 12,
    marginTop: 5,
  },

  riskBadge: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
  },

  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  detailSectionTitle: {
    color: DARK,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 12,
  },

  detailFinding: {
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 5,
  },

  detailFindingTitle: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },

  detailFindingText: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
  },

  noWarnings: {
    color: GREEN,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 15,
  },

  detailDisclaimer: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 18,
  },

  pressed: {
    opacity: 0.65,
  },
});
