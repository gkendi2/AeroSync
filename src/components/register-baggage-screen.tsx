import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import BaggageQrCard from '@/components/baggage-qr-card';
import { buildQrPayload } from '@/features/baggage/qr';

export type RegisteredBaggage = {
  id: string;
  baggageId: string;
  flightId: string;
  baggageReference: string;
  status: 'Registered';
  qrId: string;
  qrPayload: string;
  registeredBy: string;
  flightDocumentId?: string;
};

type FlightOption = {
  id: string;
  flightNumber: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  departureTime?: string;
  status?: string;
  isDemo?: boolean;
};

type RegisterBaggageScreenProps = {
  onBack: () => void;
};

const RED = '#C8102E';
const RED_DARK = '#A80D26';
const DARK = '#252525';
const MUTED = '#777777';
const BACKGROUND = '#F4F3F3';
const BORDER = '#EAEAEA';
const WHITE = '#FFFFFF';

export default function RegisterBaggageScreen({
  onBack,
}: RegisterBaggageScreenProps) {
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [selectedFlight, setSelectedFlight] =
    useState<FlightOption | null>(null);

  const [showFlightOptions, setShowFlightOptions] = useState(false);
  const [flightsLoading, setFlightsLoading] = useState(true);
  const [flightsError, setFlightsError] = useState('');

  const [bagCount, setBagCount] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] =
    useState<RegisteredBaggage[]>([]);

  // Load flights from Firestore in real time.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'Flights'),
      (snapshot) => {
        const availableFlights: FlightOption[] =
          snapshot.docs
            .map((flightDoc) => {
              const data = flightDoc.data();

              return {
                id: flightDoc.id,
                flightNumber: String(
                  data.flightNumber || data.flightId || '',
                ),
                origin: data.origin
                  ? String(data.origin)
                  : '',
                destination: data.destination
                  ? String(data.destination)
                  : '',
                departureDate: data.departureDate
                  ? String(data.departureDate)
                  : '',
                departureTime: data.departureTime
                  ? String(data.departureTime)
                  : '',
                status: data.status
                  ? String(data.status)
                  : 'Scheduled',
                isDemo: data.isDemo === true,
              };
            })
            .filter(
              (flight) =>
                flight.flightNumber.trim().length > 0,
            )
            .sort((a, b) =>
              a.flightNumber.localeCompare(b.flightNumber),
            );

        setFlights(availableFlights);
        setFlightsError('');
        setFlightsLoading(false);
      },
      (error) => {
        console.error(
          'Error loading flights for baggage registration:',
          error,
        );

        setFlightsError(
          'Unable to load flights. Check your connection and access permissions.',
        );

        setFlightsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const selectFlight = (flight: FlightOption) => {
    setSelectedFlight(flight);
    setShowFlightOptions(false);
  };

  // Register baggage against the selected flight.
  const registerBaggageBatch = async () => {
    if (registering) {
      return;
    }

    if (!selectedFlight) {
      Alert.alert(
        'Select a flight',
        'Choose a flight from the flight list before registering baggage.',
      );
      return;
    }

    const count = Number.parseInt(bagCount.trim(), 10);

    if (!Number.isInteger(count) || count < 1 || count > 100) {
      Alert.alert(
        'Invalid number of bags',
        'Enter a number between 1 and 100.',
      );
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }

    setRegistering(true);

    try {
      const batch = writeBatch(db);
      const createdRecords: RegisteredBaggage[] = [];

      for (let index = 1; index <= count; index += 1) {
        const newRecord = doc(
          collection(db, 'BaggageRecords'),
        );

        const baggageReference =
          `${selectedFlight.flightNumber}-BAG-${String(
            index,
          ).padStart(3, '0')}`;

        const fields = {
          baggageId: `BAG-${newRecord.id}`,

          // Retain flight number for existing workflows.
          flightId: selectedFlight.flightNumber,

          // Link baggage to the actual Firestore flight document.
          flightDocumentId: selectedFlight.id,

          baggageReference,
          status: 'Registered' as const,
          qrId: newRecord.id,
          qrPayload: buildQrPayload(newRecord.id),
          registeredBy: auth.currentUser.uid,
        };

        batch.set(newRecord, {
          ...fields,
          createdAt: serverTimestamp(),
        });

        createdRecords.push({
          id: newRecord.id,
          ...fields,
        });
      }

      await batch.commit();

      setRegistered(createdRecords);
      setSelectedFlight(null);
      setBagCount('');
    } catch (error) {
      console.error(
        'Error registering baggage batch:',
        error,
      );

      Alert.alert(
        'Registration failed',
        'The baggage operation could not be created. Please try again.',
      );
    } finally {
      setRegistering(false);
    }
  };

  const registerAnotherBatch = () => {
    setRegistered([]);
    setSelectedFlight(null);
    setBagCount('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          disabled={registering}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>
            ‹  Back to baggage
          </Text>
        </TouchableOpacity>

        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>

          <View>
            <Text style={styles.brandName}>AeroSync</Text>
            <Text style={styles.brandSubtitle}>
              GROUND OPERATIONS
            </Text>
          </View>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>BAGGAGE</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.heroEyebrow}>
              BAGGAGE MANAGEMENT
            </Text>
            <Text style={styles.heroIcon}>✈</Text>
          </View>

          <Text style={styles.heroTitle}>
            Create a baggage operation.
          </Text>

          <Text style={styles.heroDescription}>
            Register baggage against a flight and generate a unique QR
            identifier for every bag.
          </Text>

          <View style={styles.heroFooter}>
            <View style={styles.heroFooterLine} />
            <Text style={styles.heroFooterText}>
              TRACK EVERY BAG. EVERY MOVEMENT.
            </Text>
          </View>
        </View>

        {registered.length > 0 ? (
          <>
            <View style={styles.successHeader}>
              <View style={styles.successIcon}>
                <Text style={styles.successIconText}>✓</Text>
              </View>

              <View style={styles.successHeaderText}>
                <Text style={styles.successHeading}>
                  Operation created
                </Text>
                <Text style={styles.successSubtitle}>
                  Your baggage records have been saved successfully.
                </Text>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.sectionEyebrow}>
                OPERATION SUMMARY
              </Text>

              <Text style={styles.summaryFlight}>
                {registered[0].flightId}
              </Text>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryMetrics}>
                <View style={styles.summaryMetric}>
                  <Text style={styles.summaryNumber}>
                    {registered.length}
                  </Text>
                  <Text style={styles.summaryLabel}>
                    Bags registered
                  </Text>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.summaryMetric}>
                  <Text style={styles.summaryNumber}>100%</Text>
                  <Text style={styles.summaryLabel}>
                    QR identifiers
                  </Text>
                </View>
              </View>

              <View style={styles.initialStatus}>
                <View style={styles.statusDot} />
                <Text style={styles.initialStatusText}>
                  Initial status: Registered
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>
                  Generated baggage records
                </Text>
                <Text style={styles.sectionSubtitle}>
                  Individual identifiers created for this flight.
                </Text>
              </View>

              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {registered.length}
                </Text>
              </View>
            </View>

            {registered.map((record) => (
              <View
                key={record.id}
                style={styles.recordCard}
              >
                <View style={styles.recordTop}>
                  <View style={styles.recordIcon}>
                    <Text style={styles.recordIconText}>▤</Text>
                  </View>

                  <View style={styles.recordInfo}>
                    <Text style={styles.recordId}>
                      {record.baggageReference}
                    </Text>
                    <Text style={styles.recordSecondary}>
                      {record.baggageId}
                    </Text>
                  </View>

                  <View style={styles.registeredBadge}>
                    <Text style={styles.registeredBadgeText}>
                      Registered
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            <View style={styles.qrSection}>
              <Text style={styles.sectionTitle}>
                Baggage QR codes
              </Text>
              <Text style={styles.sectionSubtitle}>
                Each bag has its own QR code for scanning and tracking.
              </Text>
            </View>

            {registered.map((record) => (
              <BaggageQrCard
                key={`qr-${record.id}`}
                record={record}
                title={record.baggageReference}
              />
            ))}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={registerAnotherBatch}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>
                +  Create another operation
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onBack}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>
                Done, back to baggage
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.formHeading}>
              <Text style={styles.sectionEyebrow}>
                NEW REGISTRATION
              </Text>
              <Text style={styles.formTitle}>
                Operation details
              </Text>
              <Text style={styles.formDescription}>
                Select a flight and enter the number of bags to
                register.
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.stepHeading}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>01</Text>
                </View>

                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>
                    Flight information
                  </Text>
                  <Text style={styles.stepDescription}>
                    Select the flight receiving the baggage.
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>SELECT FLIGHT</Text>

              <TouchableOpacity
                style={styles.flightPicker}
                onPress={() =>
                  setShowFlightOptions((current) => !current)
                }
                disabled={registering || flightsLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>✈</Text>

                <View style={styles.flightPickerText}>
                  <Text
                    style={[
                      styles.flightPickerTitle,
                      !selectedFlight &&
                        styles.flightPickerPlaceholder,
                    ]}
                  >
                    {selectedFlight
                      ? selectedFlight.flightNumber
                      : flightsLoading
                        ? 'Loading flights...'
                        : 'Choose a flight'}
                  </Text>

                  {selectedFlight ? (
                    <Text style={styles.flightPickerSubtitle}>
                      {selectedFlight.origin || 'Origin'} →{' '}
                      {selectedFlight.destination || 'Destination'}
                    </Text>
                  ) : (
                    <Text style={styles.flightPickerSubtitle}>
                      Select from flights created in Flight Management
                    </Text>
                  )}
                </View>

                <Text style={styles.flightPickerChevron}>
                  {showFlightOptions ? '⌃' : '⌄'}
                </Text>
              </TouchableOpacity>

              {showFlightOptions && (
                <View style={styles.flightOptions}>
                  {flights.map((flight) => (
                    <TouchableOpacity
                      key={flight.id}
                      style={styles.flightOption}
                      onPress={() => selectFlight(flight)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.flightOptionMain}>
                        <Text style={styles.flightOptionNumber}>
                          {flight.flightNumber}
                        </Text>

                        {flight.isDemo && (
                          <View style={styles.demoBadge}>
                            <Text style={styles.demoBadgeText}>
                              DEMO
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.flightOptionRoute}>
                        {flight.origin || 'Origin'} →{' '}
                        {flight.destination || 'Destination'}
                      </Text>

                      <Text style={styles.flightOptionMeta}>
                        {flight.departureDate || 'Date not set'}
                        {flight.departureTime
                          ? ` · ${flight.departureTime}`
                          : ''}
                        {flight.status
                          ? ` · ${flight.status}`
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!flightsLoading && flights.length === 0 && (
                <View style={styles.inputHint}>
                  <Text style={styles.inputHintText}>
                    {flightsError ||
                      'No flights found. Create a flight in Flight Management first.'}
                  </Text>
                </View>
              )}

              {!!flightsError && flights.length > 0 && (
                <View style={styles.inputHint}>
                  <Text style={styles.inputHintText}>
                    {flightsError}
                  </Text>
                </View>
              )}

              {selectedFlight?.isDemo && (
                <View style={styles.inputHint}>
                  <Text style={styles.inputHintText}>
                    This is a demo flight. Baggage registered against
                    it will also be demo data.
                  </Text>
                </View>
              )}

              <View style={styles.formDivider} />

              <View style={styles.stepHeading}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>02</Text>
                </View>

                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>
                    Baggage quantity
                  </Text>
                  <Text style={styles.stepDescription}>
                    Specify how many bags belong to this operation.
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>NUMBER OF BAGS</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputIcon}>▤</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 25"
                  placeholderTextColor="#A0A0A0"
                  value={bagCount}
                  onChangeText={setBagCount}
                  keyboardType="number-pad"
                  autoCorrect={false}
                  editable={!registering}
                  returnKeyType="done"
                  onSubmitEditing={registerBaggageBatch}
                />
                <Text style={styles.inputSuffix}>BAGS</Text>
              </View>

              <Text style={styles.helperText}>
                You can register between 1 and 100 bags per operation.
                AeroSync will generate an individual record and QR
                identifier for every bag.
              </Text>

              <View style={styles.formDivider} />

              <View style={styles.infoPanel}>
                <Text style={styles.infoIcon}>ⓘ</Text>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoTitle}>
                    Automatic QR generation
                  </Text>
                  <Text style={styles.infoDescription}>
                    Every registered bag receives a unique identifier
                    that can be scanned during baggage handling.
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  registering && styles.disabledButton,
                ]}
                onPress={registerBaggageBatch}
                disabled={registering}
                activeOpacity={0.85}
              >
                {registering ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={WHITE} />
                    <Text style={styles.primaryButtonText}>
                      Creating operation...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Create baggage operation  →
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.secureNote}>
                AeroSync · Ground crew coordination
              </Text>
            </View>
          </>
        )}

        <Text style={styles.footer}>
          AEROSYNC  •  GROUND OPERATIONS
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  content: {
    padding: 20,
    paddingBottom: 45,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 5,
  },
  backButtonText: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  brandMark: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandMarkText: {
    color: WHITE,
    fontSize: 23,
    fontWeight: '900',
  },
  brandName: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
  },
  brandSubtitle: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 2,
  },
  liveBadge: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: RED,
    marginRight: 6,
  },
  liveText: {
    color: DARK,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hero: {
    backgroundColor: RED,
    borderRadius: 18,
    padding: 23,
    marginBottom: 27,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroEyebrow: {
    color: '#FFE0E4',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroIcon: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },
  heroTitle: {
    color: WHITE,
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 14,
    maxWidth: 400,
  },
  heroDescription: {
    color: '#FFE9EC',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 9,
    maxWidth: 440,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
  },
  heroFooterLine: {
    width: 25,
    height: 2,
    backgroundColor: WHITE,
    marginRight: 9,
  },
  heroFooterText: {
    color: WHITE,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  formHeading: {
    marginBottom: 17,
  },
  sectionEyebrow: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  formTitle: {
    color: DARK,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 6,
  },
  formDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },
  formCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 19,
    marginBottom: 20,
  },
  stepHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 19,
  },
  stepNumber: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
  },
  stepText: {
    flex: 1,
    marginLeft: 11,
  },
  stepTitle: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  stepDescription: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
    lineHeight: 15,
  },
  label: {
    color: DARK,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputContainer: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 11,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 13,
  },
  flightPicker: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 11,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  flightPickerText: {
    flex: 1,
  },
  flightPickerTitle: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  flightPickerPlaceholder: {
    color: '#A0A0A0',
    fontWeight: '600',
  },
  flightPickerSubtitle: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  flightPickerChevron: {
    color: RED,
    fontSize: 22,
    fontWeight: '800',
    marginLeft: 8,
  },
  flightOptions: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    backgroundColor: WHITE,
    marginTop: 8,
    overflow: 'hidden',
  },
  flightOption: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  flightOptionMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flightOptionNumber: {
    color: DARK,
    fontSize: 13,
    fontWeight: '900',
  },
  flightOptionRoute: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  flightOptionMeta: {
    color: MUTED,
    fontSize: 9,
    marginTop: 4,
  },
  demoBadge: {
    backgroundColor: '#FFF0D9',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  demoBadgeText: {
    color: '#98600A',
    fontSize: 8,
    fontWeight: '900',
  },
  inputIcon: {
    color: RED,
    fontSize: 18,
    marginRight: 11,
  },
  input: {
    flex: 1,
    height: '100%',
    color: DARK,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
  },
  inputSuffix: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  inputHint: {
    marginTop: 7,
    marginBottom: 2,
  },
  inputHintText: {
    color: MUTED,
    fontSize: 10,
  },
  formDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 22,
  },
  helperText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 17,
    marginTop: 9,
  },
  infoPanel: {
    flexDirection: 'row',
    backgroundColor: '#FFF5F6',
    borderWidth: 1,
    borderColor: '#F7DADD',
    borderRadius: 11,
    padding: 13,
    marginBottom: 20,
  },
  infoIcon: {
    color: RED,
    fontSize: 17,
    marginRight: 10,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    color: DARK,
    fontSize: 11,
    fontWeight: '800',
  },
  infoDescription: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 11,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
    paddingHorizontal: 15,
  },
  primaryButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
  secureNote: {
    color: MUTED,
    textAlign: 'center',
    fontSize: 9,
    marginTop: 15,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
  },
  successIcon: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#E6F5ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: {
    color: '#16834A',
    fontSize: 23,
    fontWeight: '900',
  },
  successHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  successHeading: {
    color: DARK,
    fontSize: 18,
    fontWeight: '900',
  },
  successSubtitle: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
    lineHeight: 15,
  },
  summaryCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 19,
    marginBottom: 25,
  },
  summaryFlight: {
    color: DARK,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 9,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 16,
  },
  summaryMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryMetric: {
    flex: 1,
  },
  summaryNumber: {
    color: RED,
    fontSize: 24,
    fontWeight: '900',
  },
  summaryLabel: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },
  metricDivider: {
    width: 1,
    height: 39,
    backgroundColor: BORDER,
    marginHorizontal: 15,
  },
  initialStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F5ED',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginTop: 17,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16834A',
    marginRight: 7,
  },
  initialStatusText: {
    color: '#16834A',
    fontSize: 10,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: DARK,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },
  countBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
  },
  recordCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 13,
    marginBottom: 9,
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIconText: {
    color: RED,
    fontSize: 19,
  },
  recordInfo: {
    flex: 1,
    marginLeft: 11,
  },
  recordId: {
    color: DARK,
    fontSize: 12,
    fontWeight: '900',
  },
  recordSecondary: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  registeredBadge: {
    backgroundColor: '#E6F5ED',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  registeredBadgeText: {
    color: '#16834A',
    fontSize: 9,
    fontWeight: '800',
  },
  qrSection: {
    marginTop: 20,
    marginBottom: 13,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 5,
  },
  secondaryButtonText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    color: '#999999',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 20,
  },
});