
import { explainRiskLevel } from '@/features/delay-risk/explain';
import { NOT_SCORED_LABELS } from '@/features/delay-risk/inputs';
import {
  DelayRiskFeature,
  PROBABILITY_THRESHOLD,
  RiskLevel,
  RULES,
} from '@/features/delay-risk/model';
import {
  localDateKey,
  useDelayRiskAssessments,
  type Flight,
  type FlightAssessment,
} from '@/features/delay-risk/useDelayRiskAssessments';
import Icon, { type AppIconName } from '@/components/icon';
import { goBackOrHome, openFlightThread } from '@/lib/navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const RED = '#C8102E';
const DARK = '#24272B';
const MUTED = '#777D84';
const BORDER = '#E8E9EB';
const BG = '#F7F7F8';
const ORANGE = '#E6A000';
const GREEN = '#15803D';


const INPUT_LABELS: Record<DelayRiskFeature, string> = {
  time_remaining_minutes: 'time remaining',
  baggage_progress_pct: 'baggage progress',
  staff_availability_pct: 'staff availability',
  unresolved_incidents: 'unresolved incidents',
};

type FactorId = 'Crew' | 'Baggage' | 'Incidents';

/**
 * Which flights the list shows: 'At risk' = High and Medium (the default),
 * a legend item, or a risk-factor card.
 */
type RiskFilter = 'At risk' | RiskLevel | 'Not scored' | FactorId;

/** Flights a risk-factor card counts (and lists when tapped). */
function factorMatches(factor: FactorId, item: FlightAssessment) {
  const rules = item.result?.triggeredRules ?? [];

  if (factor === 'Crew') {
    return rules.includes('R3') || item.live.notScored.includes('no-crew');
  }

  if (factor === 'Baggage') {
    return (
      rules.includes('R1') ||
      rules.includes('R2') ||
      item.live.notScored.includes('no-baggage')
    );
  }

  return item.live.unresolvedIncidents > 0;
}

/** Green when no flight is affected, amber for one, red for two or more. */
function factorColor(flightCount: number) {
  if (flightCount === 0) return GREEN;
  if (flightCount === 1) return ORANGE;
  return RED;
}

function riskColor(risk: RiskLevel | null) {
  if (risk === 'High') return RED;
  if (risk === 'Medium') return ORANGE;
  if (risk === 'Low') return GREEN;
  return MUTED;
}

function formatPercent(value: number | null) {
  return value === null ? '—' : `${Math.round(value)}%`;
}

/** HH:MM, 24-hour. */
function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

function formatTimeRemaining(minutes: number | null) {
  if (minutes === null) return '—';
  if (minutes < 0) return 'Past scheduled departure';

  const whole = Math.floor(minutes);
  const hours = Math.floor(whole / 60);
  return hours > 0 ? `${hours} h ${whole % 60} min` : `${whole} min`;
}

function formatRoute(flight: Flight) {
  if (flight.origin && flight.destination) {
    return `${flight.origin} → ${flight.destination}`;
  }
  return 'Route unavailable';
}

function rowSummary(item: FlightAssessment) {
  if (!item.result) {
    return item.live.notScored
      .map((reason) => NOT_SCORED_LABELS[reason])
      .join(' · ');
  }

  const rules = item.result.triggeredRules;

  return `Delay probability ${formatPercent(item.result.delayProbability * 100)} · ${
    rules.length > 0 ? rules.join(', ') : 'no rules triggered'
  }`;
}

export default function DelayRiskScreen() {
  const router = useRouter();
  // Opened from a High-risk notification: show that flight's panel.
  const params = useLocalSearchParams<{ flightId?: string }>();

  const { assessments, loading: isLoading, error, now } = useDelayRiskAssessments();
  const [selectedFlightId, setSelectedFlightId] = useState(params.flightId ?? '');

  useEffect(() => {
    if (params.flightId) setSelectedFlightId(params.flightId);
  }, [params.flightId]);
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('At risk');
  const [selectedPeriod, setSelectedPeriod] = useState<'Today' | 'All flights'>('Today');
  const [showPeriodOptions, setShowPeriodOptions] = useState(false);


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

  const notScoredAssessments = visibleAssessments.filter(
    (item) => item.risk === null,
  );

  // Share of scored flights that are High; not-scored flights are excluded.
  const scoredFlights =
    visibleAssessments.length - notScoredAssessments.length;

  const riskPercentage =
    scoredFlights > 0
      ? Math.round((highCount / scoredFlights) * 100)
      : 0;

  // The flight list below the legend, filtered by the selected legend item.
  const listedFlights = visibleAssessments
    .filter((item) =>
      riskFilter === 'At risk'
        ? item.risk === 'High' || item.risk === 'Medium'
        : riskFilter === 'Not scored'
          ? item.risk === null
          : riskFilter === 'Crew' ||
              riskFilter === 'Baggage' ||
              riskFilter === 'Incidents'
            ? factorMatches(riskFilter, item)
            : item.risk === riskFilter,
    )
    .sort((a, b) => {
      if (a.risk === b.risk) return 0;
      return a.risk === 'High' ? -1 : 1;
    });

  const isFactorFilter =
    riskFilter === 'Crew' ||
    riskFilter === 'Baggage' ||
    riskFilter === 'Incidents';

  const listTitle =
    riskFilter === 'At risk'
      ? 'Flights at Risk'
      : riskFilter === 'Not scored'
        ? 'Not scored'
        : isFactorFilter
          ? `${riskFilter} factor`
          : `${riskFilter} risk`;

  const emptyListText =
    riskFilter === 'At risk'
      ? 'No high- or medium-risk flights found for this period.'
      : riskFilter === 'Not scored'
        ? 'Every flight in this period has been scored.'
        : isFactorFilter
          ? `No flights affected by the ${riskFilter.toLowerCase()} factor in this period.`
          : `No ${riskFilter.toLowerCase()}-risk flights found for this period.`;

  // Tapping the selected legend item or card again returns to Flights at Risk.
  function toggleRiskFilter(filter: Exclude<RiskFilter, 'At risk'>) {
    setRiskFilter((current) => (current === filter ? 'At risk' : filter));
  }

  const selectedAssessment = assessments.find(
    (item) => item.flight.id === selectedFlightId,
  );

  // Risk-factor counts over the visible flights. Rule counts can only come
  // from scored flights; "no crew" / "no baggage" flights are the not-scored ones.
  const countWhere = (test: (item: FlightAssessment) => boolean) =>
    visibleAssessments.filter(test).length;

  const hasRule = (item: FlightAssessment, rule: string) =>
    item.result?.triggeredRules.includes(rule as never) ?? false;

  const r3Count = countWhere((item) => hasRule(item, 'R3'));
  const noCrewCount = countWhere((item) =>
    item.live.notScored.includes('no-crew'),
  );

  const r1r2Count = countWhere(
    (item) => hasRule(item, 'R1') || hasRule(item, 'R2'),
  );
  const noBaggageCount = countWhere((item) =>
    item.live.notScored.includes('no-baggage'),
  );

  const r4Count = countWhere((item) => hasRule(item, 'R4'));
  const unresolvedReportCount = visibleAssessments.reduce(
    (sum, item) => sum + item.live.unresolvedIncidents,
    0,
  );

  const riskFactors: {
    id: FactorId;
    icon: AppIconName;
    description: string;
    flightCount: number;
    detail: string;
  }[] = [
    {
      id: 'Crew',
      icon: 'crew',
      description: `R3 on ${r3Count} flight(s) · ${noCrewCount} with no crew assigned`,
      flightCount: countWhere((item) => factorMatches('Crew', item)),
      detail:
        'Staff availability is the share of handlers assigned to the flight who are available: checked in today, shift not started yet, or all their assignments on the flight completed. Cancelled assignments are ignored.',
    },
    {
      id: 'Baggage',
      icon: 'baggage',
      description: `R1/R2 on ${r1r2Count} flight(s) · ${noBaggageCount} with no baggage registered`,
      flightCount: countWhere((item) => factorMatches('Baggage', item)),
      detail:
        'Baggage progress is the share of the flight\'s bags with status Loading or Offloaded, counting bags registered in the 24 hours before scheduled departure.',
    },
    {
      id: 'Incidents',
      icon: 'incidents',
      description: `${unresolvedReportCount} unresolved report(s) · R4 on ${r4Count} flight(s)`,
      flightCount: countWhere((item) => factorMatches('Incidents', item)),
      detail:
        'Every incident report for the flight that is not Resolved or Closed counts as unresolved (Open and Under Review both count). Two or more within 120 minutes of departure trigger rule R4.',
    },
  ];

  // The cards sit below the flight list, so bring the list into view on tap.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const listSectionY = useRef(0);

  function selectFactor(id: FactorId) {
    toggleRiskFilter(id);
    scrollRef.current?.scrollTo({
      y: Math.max(listSectionY.current - 8, 0),
      animated: true,
    });
  }

  function openFlight(item: FlightAssessment) {
    setSelectedFlightId(item.flight.id);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => {
                if (selectedAssessment) {
                  setSelectedFlightId('');
                } else {
                  goBackOrHome(router);
                }
              }}
              style={styles.backButton}
              accessibilityLabel="Go back"
            >
              <Icon name="back" size={30} color={DARK} />
            </Pressable>

            <View>
              <Text style={styles.heading}>Delay Risk</Text>
              {/* The screen re-scores on its 30-second clock. */}
              <Text style={styles.lastUpdated}>
                Last updated {formatClock(now)}
              </Text>
            </View>
          </View>

          <View style={styles.periodWrapper}>
            <Pressable
              style={styles.periodButton}
              onPress={() => setShowPeriodOptions((value) => !value)}
            >
              <Text style={styles.periodText}>{selectedPeriod}</Text>
              <Icon name="expand" size={18} color={MUTED} />
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
                  <Text style={styles.detailBackText}>Back to overview</Text>
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
                      {selectedAssessment.risk ?? 'Not scored'}
                    </Text>
                  </View>
                </View>

                {selectedAssessment.result ? (
                  <>
                    {selectedAssessment.live.modelInputs && (() => {
                      const explanation = explainRiskLevel(
                        selectedAssessment.result,
                        selectedAssessment.live.modelInputs,
                      );

                      return (
                        <>
                          <Text style={styles.detailSectionTitle}>
                            Why this risk level
                          </Text>

                          <View style={styles.detailFinding}>
                            <Text style={styles.detailFindingTitle}>
                              {explanation.summary}
                            </Text>
                            {explanation.rules.map((rule) => (
                              <Text key={rule.id} style={styles.detailFindingText}>
                                {rule.text}
                              </Text>
                            ))}
                          </View>
                        </>
                      );
                    })()}

                    <Text style={styles.detailSectionTitle}>Model result</Text>

                    <View style={styles.detailFinding}>
                      <Text style={styles.detailFindingTitle}>
                        Delay probability:{' '}
                        {formatPercent(
                          selectedAssessment.result.delayProbability * 100,
                        )}
                      </Text>
                      <Text style={styles.detailFindingText}>
                        Decision tree output. The alert threshold is{' '}
                        {formatPercent(PROBABILITY_THRESHOLD * 100)}.
                      </Text>
                    </View>

                    <View style={styles.detailFinding}>
                      <Text style={styles.detailFindingTitle}>
                        Rules triggered:{' '}
                        {selectedAssessment.result.triggeredRules.length} of{' '}
                        {RULES.length}
                      </Text>
                      {RULES.filter((rule) =>
                        selectedAssessment.result?.triggeredRules.includes(
                          rule.id,
                        ),
                      ).map((rule) => (
                        <Text key={rule.id} style={styles.detailFindingText}>
                          {rule.text}
                        </Text>
                      ))}
                      {selectedAssessment.result.triggeredRules.length === 0 && (
                        <Text style={styles.detailFindingText}>
                          No rules triggered.
                        </Text>
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.detailSectionTitle}>Not scored</Text>
                    {selectedAssessment.live.notScored.map((reason) => (
                      <View
                        key={reason}
                        style={[styles.warningBox, styles.warningRow]}
                      >
                        <Icon name="incidents" size={18} color="#7A5200" />
                        <Text style={styles.warningText}>
                          {NOT_SCORED_LABELS[reason]}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {selectedAssessment.outOfRange.length > 0 && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      Outside training range:{' '}
                      {selectedAssessment.outOfRange
                        .map((key) => INPUT_LABELS[key])
                        .join(', ')}
                      . The model saw no values like these in training, so treat
                      this result with extra caution.
                    </Text>
                  </View>
                )}

                <Text style={styles.detailSectionTitle}>Live inputs</Text>

                <View style={styles.detailFinding}>
                  <Text style={styles.detailFindingText}>
                    Time remaining:{' '}
                    {formatTimeRemaining(
                      selectedAssessment.live.timeRemainingMinutes,
                    )}
                  </Text>
                  <Text style={styles.detailFindingText}>
                    Baggage progress:{' '}
                    {formatPercent(selectedAssessment.live.baggage.pct)} (
                    {selectedAssessment.live.baggage.handled} of{' '}
                    {selectedAssessment.live.baggage.total} bags handled)
                  </Text>
                  <Text style={styles.detailFindingText}>
                    Staff availability:{' '}
                    {formatPercent(selectedAssessment.live.staff.pct)} (
                    {selectedAssessment.live.staff.available} of{' '}
                    {selectedAssessment.live.staff.assigned} handlers available)
                  </Text>
                  <Text style={styles.detailFindingText}>
                    Unresolved incidents:{' '}
                    {selectedAssessment.live.unresolvedIncidents}
                  </Text>
                </View>

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

                <Pressable
                  onPress={() =>
                    openFlightThread(router, selectedAssessment.flight.id)
                  }
                  style={styles.messagesButton}
                >
                  <Icon name="messages" size={18} color={RED} />
                  <Text style={styles.messagesButtonText}>Open messages</Text>
                </Pressable>

                <Text style={styles.detailDisclaimer}>
                  The risk level combines a decision tree trained on synthetic data with operational rules R1–R4. It is not a validated flight-delay prediction.
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
                    {(
                      [
                        { filter: 'High', count: highCount, dot: { backgroundColor: RED } },
                        { filter: 'Medium', count: mediumCount, dot: { backgroundColor: ORANGE } },
                        { filter: 'Low', count: lowCount, dot: { backgroundColor: '#B8BBC0' } },
                        {
                          filter: 'Not scored',
                          count: notScoredAssessments.length,
                          dot: styles.legendDotHollow,
                        },
                      ] as const
                    ).map(({ filter, count, dot }) => {
                      const active = riskFilter === filter;

                      return (
                        <Pressable
                          key={filter}
                          onPress={() => toggleRiskFilter(filter)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Show ${filter.toLowerCase()} flights`}
                          style={({ pressed }) => [
                            styles.legendRow,
                            active && styles.legendRowActive,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={[styles.legendDot, dot]} />
                          <Text
                            style={[
                              styles.legendText,
                              active && styles.legendTextActive,
                            ]}
                          >
                            {filter} ({count})
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View
                  style={styles.section}
                  onLayout={(event) => {
                    listSectionY.current = event.nativeEvent.layout.y;
                  }}
                >
                  <View style={[styles.sectionHeadingRow, styles.listHeadingRow]}>
                    <Text style={styles.sectionTitle}>
                      {listTitle} ({listedFlights.length})
                    </Text>

                    {riskFilter !== 'At risk' && (
                      <Pressable
                        onPress={() => setRiskFilter('At risk')}
                        hitSlop={8}
                      >
                        <Text style={styles.showAtRisk}>Show at risk</Text>
                      </Pressable>
                    )}
                  </View>

                  {listedFlights.length === 0 ? (
                    <View style={styles.emptyRow}>
                      <Text style={styles.emptyText}>{emptyListText}</Text>
                    </View>
                  ) : (
                    listedFlights.map((item) => (
                      <Pressable
                        key={item.flight.id}
                        onPress={() => openFlight(item)}
                        style={({ pressed }) => [
                          styles.flightRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.airlineIcon}>
                          <Icon name="airplane" size={22} color={RED} />
                        </View>

                        <View style={styles.flightCopy}>
                          <Text style={styles.flightNumber}>
                            {item.flight.flightNumber}
                          </Text>
                          <Text style={styles.flightRoute}>
                            {formatRoute(item.flight)}
                          </Text>
                          <Text style={styles.flightMeta}>
                            {rowSummary(item)}
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
                              : item.risk === 'Medium'
                                ? styles.mediumBadge
                                : item.risk === 'Low'
                                  ? styles.lowBadge
                                  : styles.notScoredBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.flightRiskText,
                              { color: riskColor(item.risk) },
                            ]}
                          >
                            {item.risk ?? 'Not scored'}
                          </Text>
                        </View>

                        <Icon name="forward" size={22} color={MUTED} />
                      </Pressable>
                    ))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Risk Factors</Text>

                  {riskFactors.map((factor) => {
                    const active = riskFilter === factor.id;
                    const color = factorColor(factor.flightCount);

                    return (
                      <View key={factor.id}>
                        <Pressable
                          onPress={() => selectFactor(factor.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`Show flights affected by the ${factor.id.toLowerCase()} factor`}
                          style={({ pressed }) => [
                            styles.factorRow,
                            active && styles.factorRowActive,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.factorIcon}>
                            <Icon name={factor.icon} size={23} color={color} />
                          </View>

                          <View style={styles.factorCopy}>
                            <Text style={styles.factorTitle}>{factor.id}</Text>
                            <Text style={styles.factorDescription}>
                              {factor.description}
                            </Text>
                          </View>

                          <Text style={[styles.factorCount, { color }]}>
                            {factor.flightCount}
                          </Text>

                          <View
                            style={[styles.factorDot, { backgroundColor: color }]}
                          />

                          <Icon name={active ? 'expand' : 'forward'} size={22} color={MUTED} />
                        </Pressable>

                        {active && (
                          <View style={styles.factorDetail}>
                            <Text style={styles.factorDetailText}>
                              {factor.detail}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                <View style={styles.disclaimer}>
                  <Text style={styles.disclaimerText}>
                    Delay probabilities come from a decision tree trained on synthetic data, combined with operational rules R1–R4. They are provisional and are not a validated flight-delay prediction. Weather and equipment data are not yet connected and do not contribute to the risk calculation.
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

  lastUpdated: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
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

  legendRowActive: {
    backgroundColor: '#F1F2F4',
  },

  legendTextActive: {
    fontWeight: '800',
  },

  listHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  showAtRisk: {
    color: RED,
    fontSize: 12,
    fontWeight: '700',
  },

  lowBadge: {
    backgroundColor: '#E7F4E9',
  },

  notScoredBadge: {
    backgroundColor: '#ECEDEF',
  },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
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
    alignItems: 'center',
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

  factorRowActive: {
    backgroundColor: '#F7F7F8',
  },

  factorCount: {
    fontSize: 15,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'right',
  },

  factorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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

  messagesButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },

  messagesButtonText: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
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

  flightMeta: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },

  legendDotHollow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#B8BBC0',
  },

  warningBox: {
    marginTop: 10,
    padding: 11,
    backgroundColor: '#FFF4DC',
    borderRadius: 8,
  },

  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  warningText: {
    color: '#7A5200',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  pressed: {
    opacity: 0.65,
  },
});
