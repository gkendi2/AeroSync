import { auth, db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
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

const NAVY = '#252525';
const BLUE = '#C8102E';
const BG = '#F4F3F3';
const MUTED = '#777777';
const BORDER = '#EAEAEA';

const GREEN = '#15803D';
const GREEN_BG = '#ECFDF3';

const ORANGE = '#B45309';
const ORANGE_BG = '#FFF7ED';

const RED = '#C8102E';
const RED_BG = '#FDE9EC';

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

const UNRESOLVED_INCIDENT_STATUSES = [
  'Open',
  'Under Investigation',
];

export default function DelayRiskScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [baggageRecords, setBaggageRecords] = useState<BaggageRecord[]>([]);
  const [flightsData, setFlightsData] = useState<Flight[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [selectedFlight, setSelectedFlight] = useState('');
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingBaggage, setLoadingBaggage] = useState(true);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auth.currentUser) {
      setError('Please sign in to assess operational risk.');
      setLoadingAssignments(false);
      setLoadingBaggage(false);
      setLoadingFlights(false);
      setLoadingIncidents(false);
      return;
    }

    const unsubscribeAssignments = onSnapshot(
      collection(db, 'CrewAssignments'),
      (snapshot) => {
        const results: Assignment[] = snapshot.docs.map((item) => {
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
        });

        setAssignments(results);
        setLoadingAssignments(false);
      },
      (err) => {
        console.error('Could not load assignments:', err);
        setError(
          'Could not read crew assignments. Check Firestore permissions.',
        );
        setLoadingAssignments(false);
      },
    );

    const unsubscribeBaggage = onSnapshot(
      collection(db, 'BaggageRecords'),
      (snapshot) => {
        const results: BaggageRecord[] = snapshot.docs.map((item) => {
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
        });

        setBaggageRecords(results);
        setLoadingBaggage(false);
      },
      (err) => {
        console.error('Could not load baggage records:', err);
        setError(
          'Could not read baggage records. Check Firestore permissions.',
        );
        setLoadingBaggage(false);
      },
    );

    const unsubscribeFlights = onSnapshot(
      collection(db, 'Flights'),
      (snapshot) => {
        const results: Flight[] = snapshot.docs.map((item) => {
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
        });

        setFlightsData(results);
        setLoadingFlights(false);
      },
      (err) => {
        console.error('Could not load flights:', err);
        setError(
          'Could not read flight records. Check Firestore permissions.',
        );
        setLoadingFlights(false);
      },
    );

    const unsubscribeIncidents = onSnapshot(
      collection(db, 'Incidents'),
      (snapshot) => {
        const results: Incident[] = snapshot.docs.map((item) => {
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
        });

        setIncidents(results);
        setLoadingIncidents(false);
      },
      (err) => {
        console.error('Could not load incidents:', err);
        setError(
          'Could not read incident reports. Check Firestore permissions.',
        );
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

    // Include flights found in operational records if they are
    // not yet present in the Flights collection.
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

    return Array.from(flightMap.values()).sort((a, b) =>
      a.flightNumber.localeCompare(b.flightNumber),
    );
  }, [flightsData, assignments]);

  useEffect(() => {
    if (flights.length === 0) {
      setSelectedFlight('');
      return;
    }

    if (!flights.some((flight) => flight.id === selectedFlight)) {
      setSelectedFlight(flights[0].id);
    }
  }, [flights, selectedFlight]);

  const selectedFlightData = flights.find(
    (flight) => flight.id === selectedFlight,
  );

  const selectedFlightNumber =
    selectedFlightData?.flightNumber ?? '';

  const flightAssignments = assignments.filter(
    (item) => item.flightNumber === selectedFlightNumber,
  );

  const flightBaggage = baggageRecords.filter(
    (item) => item.flightId === selectedFlight,
  );

  const flightIncidents = incidents.filter((item) => {
    // Match by the actual Firestore flight document ID first.
    if (item.flightId && item.flightId === selectedFlight) {
      return true;
    }

    // Fallback for older reports that may only have a flight number.
    return (
      !item.flightId &&
      item.flightNumber === selectedFlightNumber
    );
  });

  const unresolvedIncidents = flightIncidents.filter((item) =>
    UNRESOLVED_INCIDENT_STATUSES.some(
      (status) =>
        status.toLowerCase() === item.status.toLowerCase(),
    ),
  );

  const highSeverityIncidents = unresolvedIncidents.filter(
    (item) => {
      const severity = item.severity.toLowerCase();

      return severity === 'high' || severity === 'critical';
    },
  );

  const now = Date.now();

  const overdueAssignments = flightAssignments.filter((item) => {
    if (item.status.toLowerCase() !== 'assigned') {
      return false;
    }

    const match = item.shiftTime.match(
      /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
    );

    if (
      !match ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.shiftDate)
    ) {
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

  const warnings: string[] = [];

  if (overdueAssignments.length > 0) {
    warnings.push(
      `${overdueAssignments.length} assignment(s) remain Assigned after their scheduled shift end.`,
    );
  }

  if (oldRegisteredBaggage.length > 0) {
    warnings.push(
      `${oldRegisteredBaggage.length} baggage record(s) remain Registered for at least ${STALE_BAGGAGE_MINUTES} minutes.`,
    );
  }

  if (unresolvedIncidents.length > 0) {
    warnings.push(
      `${unresolvedIncidents.length} unresolved incident report(s) are linked to this flight.`,
    );
  }

  const warningCount = warnings.length;

  const risk =
    highSeverityIncidents.length > 0 || warningCount >= 2
      ? 'High'
      : warningCount === 1
        ? 'Medium'
        : 'Low';

  const riskColor =
    risk === 'High'
      ? RED
      : risk === 'Medium'
        ? ORANGE
        : GREEN;

  const riskBackground =
    risk === 'High'
      ? RED_BG
      : risk === 'Medium'
        ? ORANGE_BG
        : GREEN_BG;

  const riskBorder =
    risk === 'High'
      ? '#FECACA'
      : risk === 'Medium'
        ? '#FED7AA'
        : '#BBF7D0';

  const isLoading =
    loadingAssignments ||
    loadingBaggage ||
    loadingFlights ||
    loadingIncidents;

  function formatIncidentDate(date: Date | null) {
    if (!date) return 'Date unavailable';

    return date.toLocaleString();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            disabled={!onBack}
            style={styles.backButton}
          >
            <Text style={styles.backText}>
              ← Dashboard
            </Text>
          </Pressable>

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>
                SUPERVISOR OPERATIONS
              </Text>

              <Text style={styles.heading}>
                Delay-risk monitoring
              </Text>

              <Text style={styles.subtitle}>
                Review operational warning indicators for a
                specific flight.
              </Text>
            </View>

            <View style={styles.headerIcon}>
              <Text style={styles.headerIconText}>!</Text>
            </View>
          </View>
        </View>

        {/* Provisional assessment notice */}
        <View style={styles.notice}>
          <View style={styles.noticeIcon}>
            <Text style={styles.noticeIconText}>i</Text>
          </View>

          <View style={styles.noticeContent}>
            <Text style={styles.noticeTitle}>
              Provisional rule-based assessment
            </Text>

            <Text style={styles.noticeText}>
              These indicators flag possible operational issues.
              They do not establish that a flight will be
              delayed. The thresholds are demonstration
              settings, not validated aviation standards.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator
              size="large"
              color={BLUE}
            />

            <Text style={styles.messageTitle}>
              Loading operational records
            </Text>

            <Text style={styles.muted}>
              Checking flights, crew assignments, baggage and
              incident reports...
            </Text>
          </View>
        ) : (
          <>
            {error ? (
              <View style={styles.errorCard}>
                <View style={styles.errorIcon}>
                  <Text style={styles.errorIconText}>
                    !
                  </Text>
                </View>

                <Text style={styles.errorText}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Flight selector */}
            <View style={styles.sectionHeader}>
              <View style={styles.stepCircle}>
                <Text style={styles.stepNumber}>1</Text>
              </View>

              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>
                  Select a flight
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Choose a flight from your operational records.
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              {flights.length === 0 ? (
                <View style={styles.emptyBox}>
                  <View style={styles.emptyIcon}>
                    <Text style={styles.emptyIconText}>
                      ✈
                    </Text>
                  </View>

                  <Text style={styles.emptyTitle}>
                    No flights available
                  </Text>

                  <Text style={styles.muted}>
                    Add a flight or create a crew assignment first.
                  </Text>
                </View>
              ) : (
                <View style={styles.flightList}>
                  {flights.map((flight) => {
                    const selected =
                      selectedFlight === flight.id;

                    const assignmentCount =
                      assignments.filter(
                        (item) =>
                          item.flightNumber === flight.flightNumber,
                      ).length;

                    const baggageCount =
                      baggageRecords.filter(
                        (item) => item.flightId === flight.id,
                      ).length;

                    const incidentCount =
                      incidents.filter(
                        (item) =>
                          item.flightId === flight.id ||
                          (!item.flightId &&
                            item.flightNumber === flight.flightNumber),
                      ).length;

                    return (
                      <Pressable
                        key={flight.id}
                        onPress={() =>
                          setSelectedFlight(flight.id)
                        }
                        style={({ pressed }) => [
                          styles.flightOption,
                          selected && styles.flightSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.flightIcon,
                            selected && styles.flightIconSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.flightIconText,
                              selected &&
                                styles.flightIconTextSelected,
                            ]}
                          >
                            ✈
                          </Text>
                        </View>

                        <View style={styles.flightInfo}>
                          <Text
                            style={[
                              styles.flightOptionText,
                              selected && styles.flightSelectedText,
                            ]}
                          >
                            {flight.flightNumber}
                          </Text>

                          <Text style={styles.flightMeta}>
                            {assignmentCount} assignment
                            {assignmentCount === 1 ? '' : 's'} ·{' '}
                            {baggageCount} baggage · {incidentCount}{' '}
                            incident
                            {incidentCount === 1 ? '' : 's'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.selectionIndicator,
                            selected &&
                              styles.selectionIndicatorSelected,
                          ]}
                        >
                          {selected ? (
                            <Text
                              style={styles.selectionCheck}
                            >
                              ✓
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            {selectedFlight ? (
              <>
                {/* Risk hero */}
                <View style={styles.sectionHeader}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNumber}>2</Text>
                  </View>

                  <View style={styles.sectionHeaderText}>
                    <Text style={styles.sectionTitle}>
                      Operational assessment
                    </Text>

                    <Text style={styles.sectionSubtitle}>
                      Current indicators for {selectedFlightNumber}.
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.riskCard,
                    {
                      backgroundColor: riskBackground,
                      borderColor: riskBorder,
                    },
                  ]}
                >
                  <View style={styles.riskTop}>
                    <View>
                      <Text style={styles.riskEyebrow}>
                        CURRENT FLIGHT
                      </Text>

                      <Text style={styles.riskFlight}>
                        {selectedFlightNumber}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.riskBadge,
                        {
                          backgroundColor: riskColor,
                        },
                      ]}
                    >
                      <Text style={styles.riskBadgeText}>
                        {risk.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.riskDivider} />

                  <Text
                    style={[
                      styles.riskValue,
                      { color: riskColor },
                    ]}
                  >
                    {risk === 'Low'
                      ? 'No warning categories'
                      : risk === 'Medium'
                        ? 'Review required'
                        : 'Immediate review'}
                  </Text>

                  <Text style={styles.riskExplanation}>
                    {warningCount === 0
                      ? 'No configured warning conditions were detected in the available records. This does not guarantee an absence of delay risk.'
                      : `${warningCount} warning categor${
                          warningCount === 1 ? 'y' : 'ies'
                        } detected. Review the findings below.`}
                  </Text>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricBox}>
                      <Text style={styles.metricNumber}>
                        {flightAssignments.length}
                      </Text>

                      <Text style={styles.metricLabel}>
                        Assignments
                      </Text>
                    </View>

                    <View style={styles.metricBox}>
                      <Text style={styles.metricNumber}>
                        {flightBaggage.length}
                      </Text>

                      <Text style={styles.metricLabel}>
                        Baggage
                      </Text>
                    </View>

                    <View style={styles.metricBox}>
                      <Text style={styles.metricNumber}>
                        {unresolvedIncidents.length}
                      </Text>

                      <Text style={styles.metricLabel}>
                        Open incidents
                      </Text>
                    </View>

                    <View style={styles.metricBox}>
                      <Text
                        style={[
                          styles.metricNumber,
                          { color: riskColor },
                        ]}
                      >
                        {warningCount}
                      </Text>

                      <Text style={styles.metricLabel}>
                        Warnings
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Findings */}
                <View style={styles.findingsHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Assessment findings
                    </Text>

                    <Text style={styles.sectionSubtitle}>
                      The indicators contributing to this
                      assessment.
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.warningCountBadge,
                      warningCount > 0 &&
                        styles.warningCountBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.warningCountText,
                        warningCount > 0 &&
                          styles.warningCountTextActive,
                      ]}
                    >
                      {warningCount}{' '}
                      {warningCount === 1 ? 'warning' : 'warnings'}
                    </Text>
                  </View>
                </View>

                {/* Crew warning */}
                <View
                  style={[
                    styles.findingCard,
                    overdueAssignments.length > 0 &&
                      styles.findingCardWarning,
                  ]}
                >
                  <View style={styles.findingTop}>
                    <View
                      style={[
                        styles.findingIcon,
                        overdueAssignments.length > 0
                          ? styles.findingIconWarning
                          : styles.findingIconGood,
                      ]}
                    >
                      <Text
                        style={[
                          styles.findingIconText,
                          overdueAssignments.length > 0
                            ? styles.findingIconTextWarning
                            : styles.findingIconTextGood,
                        ]}
                      >
                        {overdueAssignments.length > 0 ? '!' : '✓'}
                      </Text>
                    </View>

                    <View style={styles.findingHeading}>
                      <Text style={styles.findingTitle}>
                        Crew assignments
                      </Text>

                      <Text style={styles.findingSubtitle}>
                        Assigned work after scheduled shift end.
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.findingNumber,
                        overdueAssignments.length > 0 &&
                          styles.findingNumberWarning,
                      ]}
                    >
                      {overdueAssignments.length}
                    </Text>
                  </View>

                  <View style={styles.findingDivider} />

                  {overdueAssignments.length === 0 ? (
                    <Text style={styles.goodText}>
                      No overdue assignments detected for this
                      flight.
                    </Text>
                  ) : (
                    <View style={styles.detailList}>
                      {overdueAssignments.map((item) => (
                        <View
                          key={item.id}
                          style={styles.detailRow}
                        >
                          <View style={styles.detailBullet} />

                          <View style={styles.detailContent}>
                            <Text style={styles.detailTitle}>
                              {item.handlerName}
                            </Text>

                            <Text style={styles.detailText}>
                              {item.activity} · {item.shiftTime}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Baggage warning */}
                <View
                  style={[
                    styles.findingCard,
                    oldRegisteredBaggage.length > 0 &&
                      styles.findingCardWarning,
                  ]}
                >
                  <View style={styles.findingTop}>
                    <View
                      style={[
                        styles.findingIcon,
                        oldRegisteredBaggage.length > 0
                          ? styles.findingIconWarning
                          : styles.findingIconGood,
                      ]}
                    >
                      <Text
                        style={[
                          styles.findingIconText,
                          oldRegisteredBaggage.length > 0
                            ? styles.findingIconTextWarning
                            : styles.findingIconTextGood,
                        ]}
                      >
                        {oldRegisteredBaggage.length > 0 ? '!' : '✓'}
                      </Text>
                    </View>

                    <View style={styles.findingHeading}>
                      <Text style={styles.findingTitle}>
                        Baggage handling
                      </Text>

                      <Text style={styles.findingSubtitle}>
                        Records remaining Registered for at least{' '}
                        {STALE_BAGGAGE_MINUTES} minutes.
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.findingNumber,
                        oldRegisteredBaggage.length > 0 &&
                          styles.findingNumberWarning,
                      ]}
                    >
                      {oldRegisteredBaggage.length}
                    </Text>
                  </View>

                  <View style={styles.findingDivider} />

                  {oldRegisteredBaggage.length === 0 ? (
                    <Text style={styles.goodText}>
                      No potentially stalled baggage detected for
                      this flight.
                    </Text>
                  ) : (
                    <View style={styles.detailList}>
                      {oldRegisteredBaggage.map((item) => (
                        <View
                          key={item.id}
                          style={styles.detailRow}
                        >
                          <View style={styles.detailBullet} />

                          <View style={styles.detailContent}>
                            <Text style={styles.detailTitle}>
                              {item.baggageId}
                            </Text>

                            <Text style={styles.detailText}>
                              Current status: {item.status}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Incident warning */}
                <View
                  style={[
                    styles.findingCard,
                    unresolvedIncidents.length > 0 &&
                      styles.findingCardWarning,
                  ]}
                >
                  <View style={styles.findingTop}>
                    <View
                      style={[
                        styles.findingIcon,
                        unresolvedIncidents.length > 0
                          ? styles.findingIconWarning
                          : styles.findingIconGood,
                      ]}
                    >
                      <Text
                        style={[
                          styles.findingIconText,
                          unresolvedIncidents.length > 0
                            ? styles.findingIconTextWarning
                            : styles.findingIconTextGood,
                        ]}
                      >
                        {unresolvedIncidents.length > 0 ? '!' : '✓'}
                      </Text>
                    </View>

                    <View style={styles.findingHeading}>
                      <Text style={styles.findingTitle}>
                        Incident reports
                      </Text>

                      <Text style={styles.findingSubtitle}>
                        Open and under-investigation reports linked
                        to this flight.
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.findingNumber,
                        unresolvedIncidents.length > 0 &&
                          styles.findingNumberWarning,
                      ]}
                    >
                      {unresolvedIncidents.length}
                    </Text>
                  </View>

                  <View style={styles.findingDivider} />

                  {unresolvedIncidents.length === 0 ? (
                    <Text style={styles.goodText}>
                      No unresolved incident reports detected for
                      this flight.
                    </Text>
                  ) : (
                    <View style={styles.detailList}>
                      {unresolvedIncidents.map((item) => (
                        <View
                          key={item.id}
                          style={styles.detailRow}
                        >
                          <View style={styles.detailBullet} />

                          <View style={styles.detailContent}>
                            <Text style={styles.detailTitle}>
                              {item.incidentType ||
                                item.reportCategory ||
                                'Incident report'}
                              {' · '}
                              {item.severity}
                            </Text>

                            <Text style={styles.detailText}>
                              {item.description}
                            </Text>

                            <Text style={styles.detailText}>
                              {item.location
                                ? `${item.location} · `
                                : ''}
                              {item.status} ·{' '}
                              {formatIncidentDate(item.reportedAt)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Assignment overview */}
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>
                        Assignment overview
                      </Text>

                      <Text style={styles.cardSubtitle}>
                        Crew activity currently linked to this
                        flight.
                      </Text>
                    </View>

                    <View style={styles.cardCount}>
                      <Text style={styles.cardCountText}>
                        {flightAssignments.length}
                      </Text>
                    </View>
                  </View>

                  {flightAssignments.length === 0 ? (
                    <View style={styles.inlineEmpty}>
                      <Text style={styles.muted}>
                        No assignments match this flight number.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.recordList}>
                      {flightAssignments.map((item) => (
                        <View
                          key={item.id}
                          style={styles.recordRow}
                        >
                          <View style={styles.recordAvatar}>
                            <Text style={styles.recordAvatarText}>
                              {item.handlerName
                                .charAt(0)
                                .toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.recordContent}>
                            <Text style={styles.recordTitle}>
                              {item.handlerName}
                            </Text>

                            <Text style={styles.recordMeta}>
                              {item.activity}
                            </Text>

                            <Text style={styles.recordMeta}>
                              {item.shiftDate} · {item.shiftTime}
                            </Text>
                          </View>

                          <View style={styles.statusBadge}>
                            <Text style={styles.statusBadgeText}>
                              {item.status}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Baggage overview */}
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>
                        Baggage overview
                      </Text>

                      <Text style={styles.cardSubtitle}>
                        Current baggage records linked to this
                        flight.
                      </Text>
                    </View>

                    <View style={styles.cardCount}>
                      <Text style={styles.cardCountText}>
                        {flightBaggage.length}
                      </Text>
                    </View>
                  </View>

                  {flightBaggage.length === 0 ? (
                    <View style={styles.inlineEmpty}>
                      <Text style={styles.muted}>
                        No baggage records match this flight.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.recordList}>
                      {flightBaggage.map((item) => (
                        <View
                          key={item.id}
                          style={styles.baggageRow}
                        >
                          <View style={styles.baggageIcon}>
                            <Text style={styles.baggageIconText}>
                              ▣
                            </Text>
                          </View>

                          <View style={styles.recordContent}>
                            <Text style={styles.recordTitle}>
                              {item.baggageId}
                            </Text>

                            <Text style={styles.recordMeta}>
                              Current status
                            </Text>
                          </View>

                          <View style={styles.baggageStatus}>
                            <Text style={styles.baggageStatusText}>
                              {item.status}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Incident overview */}
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>
                        Incident overview
                      </Text>

                      <Text style={styles.cardSubtitle}>
                        All incident reports associated with this
                        flight, including resolved reports.
                      </Text>
                    </View>

                    <View style={styles.cardCount}>
                      <Text style={styles.cardCountText}>
                        {flightIncidents.length}
                      </Text>
                    </View>
                  </View>

                  {flightIncidents.length === 0 ? (
                    <View style={styles.inlineEmpty}>
                      <Text style={styles.muted}>
                        No incident reports are linked to this
                        flight.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.recordList}>
                      {flightIncidents.map((item) => (
                        <View
                          key={item.id}
                          style={styles.incidentOverviewRow}
                        >
                          <View style={styles.incidentOverviewIcon}>
                            <Text style={styles.incidentOverviewIconText}>
                              !
                            </Text>
                          </View>

                          <View style={styles.recordContent}>
                            <Text style={styles.recordTitle}>
                              {item.incidentType ||
                                item.reportCategory ||
                                'Incident'}
                            </Text>

                            <Text style={styles.recordMeta}>
                              Severity: {item.severity}
                            </Text>

                            <Text style={styles.recordMeta}>
                              Status: {item.status}
                            </Text>

                            <Text style={styles.recordMeta}>
                              {formatIncidentDate(item.reportedAt)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Methodology */}
                <View style={styles.methodCard}>
                  <View style={styles.methodHeader}>
                    <View style={styles.methodIcon}>
                      <Text style={styles.methodIconText}>
                        i
                      </Text>
                    </View>

                    <View style={styles.methodHeading}>
                      <Text style={styles.cardTitle}>
                        How risk is classified
                      </Text>

                      <Text style={styles.cardSubtitle}>
                        Current demonstration rule set
                      </Text>
                    </View>
                  </View>

                  <View style={styles.ruleRow}>
                    <View
                      style={[
                        styles.ruleDot,
                        { backgroundColor: GREEN },
                      ]}
                    />

                    <Text style={styles.ruleText}>
                      <Text style={styles.ruleStrong}>
                        Low
                      </Text>{' '}
                      — no configured warning categories detected.
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    <View
                      style={[
                        styles.ruleDot,
                        { backgroundColor: ORANGE },
                      ]}
                    />

                    <Text style={styles.ruleText}>
                      <Text style={styles.ruleStrong}>
                        Medium
                      </Text>{' '}
                      — one warning category detected.
                    </Text>
                  </View>

                  <View style={styles.ruleRow}>
                    <View
                      style={[
                        styles.ruleDot,
                        { backgroundColor: RED },
                      ]}
                    />

                    <Text style={styles.ruleText}>
                      <Text style={styles.ruleStrong}>
                        High
                      </Text>{' '}
                      — two or more warning categories are
                      detected, or at least one unresolved
                      High/Critical incident is reported.
                    </Text>
                  </View>

                  <View style={styles.methodDivider} />

                  <Text style={styles.footnote}>
                    This is a provisional rule-based indicator,
                    not a trained Decision Tree prediction.
                    Incident reports are counted only when their
                    status is Open or Under Investigation.
                  </Text>
                </View>
              </>
            ) : null}
          </>
        )}

        <Text style={styles.footer}>
          AeroSync · Operational decision support
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },

  content: {
    padding: 20,
    paddingBottom: 42,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },

  header: {
    marginBottom: 18,
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
    marginBottom: 15,
  },

  backText: {
    color: BLUE,
    fontSize: 13,
    fontWeight: '700',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerText: {
    flex: 1,
    paddingRight: 12,
  },

  eyebrow: {
    color: BLUE,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 5,
  },

  heading: {
    color: NAVY,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
  },

  subtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },

  headerIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerIconText: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
  },

  notice: {
    flexDirection: 'row',
    backgroundColor: ORANGE_BG,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 22,
  },

  noticeIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  noticeIconText: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: '800',
  },

  noticeContent: {
    flex: 1,
    marginLeft: 10,
  },

  noticeTitle: {
    color: '#9A3412',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },

  noticeText: {
    color: '#9A3412',
    fontSize: 11,
    lineHeight: 17,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 3,
  },

  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepNumber: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  sectionHeaderText: {
    flex: 1,
    marginLeft: 10,
  },

  sectionTitle: {
    color: NAVY,
    fontSize: 17,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 15,
    marginBottom: 18,
  },

  flightList: {
    gap: 8,
  },

  flightOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 11,
  },

  flightSelected: {
    borderColor: BLUE,
    backgroundColor: '#FDEFF1',
  },

  pressed: {
    opacity: 0.72,
  },

  flightIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  flightIconSelected: {
    backgroundColor: BLUE,
  },

  flightIconText: {
    color: MUTED,
    fontSize: 17,
  },

  flightIconTextSelected: {
    color: '#FFFFFF',
  },

  flightInfo: {
    flex: 1,
    marginLeft: 10,
  },

  flightOptionText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '800',
  },

  flightSelectedText: {
    color: BLUE,
  },

  flightMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
  },

  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectionIndicatorSelected: {
    borderColor: BLUE,
    backgroundColor: BLUE,
  },

  selectionCheck: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  riskCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
  },

  riskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  riskEyebrow: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  riskFlight: {
    color: NAVY,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },

  riskBadge: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
  },

  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  riskDivider: {
    height: 1,
    backgroundColor: 'rgba(100,116,139,0.18)',
    marginVertical: 14,
  },

  riskValue: {
    fontSize: 24,
    fontWeight: '900',
  },

  riskExplanation: {
    color: NAVY,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  metricsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
    flexWrap: 'wrap',
  },

  metricBox: {
    flex: 1,
    minWidth: 65,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 12,
    padding: 10,
  },

  metricNumber: {
    color: NAVY,
    fontSize: 20,
    fontWeight: '800',
  },

  metricLabel: {
    color: MUTED,
    fontSize: 9,
    marginTop: 2,
  },

  findingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  warningCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },

  warningCountBadgeActive: {
    backgroundColor: ORANGE_BG,
  },

  warningCountText: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
  },

  warningCountTextActive: {
    color: ORANGE,
  },

  findingCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 15,
    marginBottom: 10,
  },

  findingCardWarning: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFAFA',
  },

  findingTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  findingIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  findingIconWarning: {
    backgroundColor: '#FFEDD5',
  },

  findingIconGood: {
    backgroundColor: GREEN_BG,
  },

  findingIconText: {
    fontSize: 17,
    fontWeight: '900',
  },

  findingIconTextWarning: {
    color: ORANGE,
  },

  findingIconTextGood: {
    color: GREEN,
  },

  findingHeading: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },

  findingTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '800',
  },

  findingSubtitle: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },

  findingNumber: {
    color: NAVY,
    fontSize: 24,
    fontWeight: '800',
  },

  findingNumberWarning: {
    color: ORANGE,
  },

  findingDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 12,
  },

  goodText: {
    color: GREEN,
    fontSize: 11,
    lineHeight: 17,
  },

  detailList: {
    gap: 9,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  detailBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
    marginTop: 5,
    marginRight: 8,
  },

  detailContent: {
    flex: 1,
  },

  detailTitle: {
    color: NAVY,
    fontSize: 11,
    fontWeight: '800',
  },

  detailText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 1,
  },

  detailCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 15,
    marginBottom: 10,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },

  cardTitle: {
    color: NAVY,
    fontSize: 15,
    fontWeight: '800',
  },

  cardSubtitle: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },

  cardCount: {
    minWidth: 29,
    height: 29,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardCountText: {
    color: NAVY,
    fontSize: 11,
    fontWeight: '800',
  },

  recordList: {
    gap: 0,
  },

  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 10,
  },

  recordAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  recordAvatarText: {
    color: NAVY,
    fontSize: 12,
    fontWeight: '800',
  },

  recordContent: {
    flex: 1,
    marginLeft: 9,
    marginRight: 7,
  },

  recordTitle: {
    color: NAVY,
    fontSize: 11,
    fontWeight: '800',
  },

  recordMeta: {
    color: MUTED,
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },

  statusBadge: {
    backgroundColor: '#FDEFF1',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },

  statusBadgeText: {
    color: BLUE,
    fontSize: 8,
    fontWeight: '800',
  },

  baggageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 10,
  },

  baggageIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  baggageIconText: {
    color: BLUE,
    fontSize: 15,
  },

  baggageStatus: {
    backgroundColor: '#F8FAFC',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },

  baggageStatusText: {
    color: NAVY,
    fontSize: 8,
    fontWeight: '800',
  },

  incidentOverviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 10,
  },

  incidentOverviewIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  incidentOverviewIconText: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: '900',
  },

  inlineEmpty: {
    paddingVertical: 8,
  },

  methodCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 16,
    marginTop: 5,
  },

  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 13,
  },

  methodIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  methodIconText: {
    color: BLUE,
    fontSize: 15,
    fontWeight: '800',
  },

  methodHeading: {
    flex: 1,
    marginLeft: 9,
  },

  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 9,
  },

  ruleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 9,
  },

  ruleText: {
    flex: 1,
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
  },

  ruleStrong: {
    color: NAVY,
    fontWeight: '800',
  },

  methodDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 4,
  },

  footnote: {
    color: '#9A3412',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },

  messageCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 25,
    alignItems: 'center',
    marginTop: 5,
  },

  messageTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 11,
  },

  muted: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 12,
  },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },

  emptyIconText: {
    color: BLUE,
    fontSize: 20,
  },

  emptyTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: RED_BG,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 13,
    padding: 11,
    marginBottom: 18,
  },

  errorIcon: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorIconText: {
    color: RED,
    fontSize: 13,
    fontWeight: '900',
  },

  errorText: {
    flex: 1,
    color: RED,
    fontSize: 10,
    lineHeight: 16,
    marginLeft: 8,
  },

  footer: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 10,
    marginTop: 23,
  },
});