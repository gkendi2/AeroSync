
import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BaggageQrCard from '@/components/baggage-qr-card';
import Icon from '@/components/icon';
import { buildQrPayload } from '@/features/baggage/qr';
import { validateFlightNumber } from '@/features/baggage/validation';
import {
  AIRLINE_TAG_MAX_DIGITS,
  validateAirlineTagNumber,
} from '@/features/baggage/airline-tag';
import { upcomingFlights } from '@/features/flights/upcoming';
import { useFlights } from '@/features/handler/hooks';
import AeroSyncLogo from '@/components/aerosync-logo';

export type RegisteredBaggage = {
  id: string;
  baggageId: string;
  flightId: string;
  baggageReference: string;
  airlineTagNumber?: string;
  status: 'Registered';
  qrId: string;
  qrPayload: string;
  registeredBy: string;
};

type RegisterBaggageScreenProps = {
  onBack: () => void;
};

const RED = '#C8102E';
const DARK = '#24272B';
const MUTED = '#747B83';
const BORDER = '#E8E9EB';

export default function RegisterBaggageScreen({
  onBack,
}: RegisterBaggageScreenProps) {
  const [flightNumber, setFlightNumber] = useState('');
  const [selectedFlightId, setSelectedFlightId] = useState('');
  const [showFlightPicker, setShowFlightPicker] = useState(false);

  // Same list as the crew form: not departed, not cancelled or completed,
  // soonest first. Recomputed when the picker opens.
  const flights = useFlights();
  const pickableFlights = useMemo(
    () => (showFlightPicker ? upcomingFlights(flights) : []),
    [flights, showFlightPicker],
  );
  const selectedFlight = flights.find((flight) => flight.id === selectedFlightId);
  const [bagCount, setBagCount] = useState('');
  // Optional airline bag tag number; only for a single-bag registration.
  const [airlineTag, setAirlineTag] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState<RegisteredBaggage[]>([]);

  const registerBaggageBatch = async () => {
    if (registering) return;

    const flightCheck = validateFlightNumber(flightNumber);

    if (!flightCheck.ok) {
      Alert.alert('Invalid flight number', flightCheck.error);
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

    const tagCheck = validateAirlineTagNumber(airlineTag);

    if (!tagCheck.ok) {
      Alert.alert('Invalid airline tag number', tagCheck.error);
      return;
    }

    if (tagCheck.tag && count > 1) {
      Alert.alert(
        'One tag number per bag',
        'An airline tag number can only be entered when registering one bag. Register these bags without it, then add each tag number from the bag details.',
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
        const newRecord = doc(collection(db, 'BaggageRecords'));

        const baggageReference = `${flightCheck.flight}-BAG-${String(
          index,
        ).padStart(3, '0')}`;

        const fields = {
          baggageId: `BAG-${newRecord.id}`,
          flightId: flightCheck.flight,
          baggageReference,
          status: 'Registered' as const,
          qrId: newRecord.id,
          qrPayload: buildQrPayload(newRecord.id),
          registeredBy: auth.currentUser.uid,
          ...(tagCheck.tag ? { airlineTagNumber: tagCheck.tag } : {}),
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
      setFlightNumber('');
      setSelectedFlightId('');
      setBagCount('');
      setAirlineTag('');
    } catch (error) {
      console.error('Error registering baggage batch:', error);

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
  };

  const isSuccessful = registered.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <Pressable
              onPress={onBack}
              disabled={registering}
              style={styles.backButton}
            >
              <Icon name="back" size={30} color={DARK} />
            </Pressable>

            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>
                {isSuccessful ? 'Registration complete' : 'Register baggage'}
              </Text>
              <Text style={styles.headerSubtitle}>
                GROUND OPERATIONS
              </Text>
            </View>

            <AeroSyncLogo size={36} />
          </View>

          {isSuccessful ? (
            <>
              {/* SUCCESS SUMMARY */}
              <View style={styles.successBanner}>
                <View style={styles.successIcon}>
                  <Icon name="check" size={22} color="#287448" />
                </View>

                <View style={styles.successCopy}>
                  <Text style={styles.successTitle}>
                    Baggage operation created
                  </Text>
                  <Text style={styles.successDescription}>
                    Your baggage records and individual QR identifiers
                    have been generated successfully.
                  </Text>
                </View>
              </View>

              {/* OPERATION DETAILS */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>FLIGHT</Text>
                  <Text style={styles.summaryValue}>
                    {registered[0].flightId}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>BAGS REGISTERED</Text>
                  <Text style={styles.summaryValue}>
                    {registered.length}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>INITIAL STATUS</Text>
                  <Text style={styles.summaryStatus}>Registered</Text>
                </View>
              </View>

              {/* GENERATED RECORDS */}
              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.sectionTitle}>
                    Generated baggage
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    Individual baggage references and QR codes
                  </Text>
                </View>

                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {registered.length}
                  </Text>
                </View>
              </View>

              <View style={styles.generatedList}>
                {registered.map((record) => (
                  <View key={record.id} style={styles.generatedRow}>
                    <View style={styles.generatedIcon}>
                      <Icon name="baggage" size={19} color={DARK} />
                    </View>

                    <View style={styles.generatedCopy}>
                      <Text style={styles.generatedReference}>
                        {record.baggageReference}
                      </Text>
                      <Text style={styles.generatedId}>
                        {record.baggageId}
                      </Text>
                    </View>

                    <View style={styles.registeredBadge}>
                      <Text style={styles.registeredBadgeText}>
                        Registered
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* QR CARDS */}
              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.sectionTitle}>Baggage QR codes</Text>
                  <Text style={styles.sectionSubtitle}>
                    Each code identifies an individual bag
                  </Text>
                </View>
              </View>

              {registered.map((record) => (
                <BaggageQrCard
                  key={`qr-${record.id}`}
                  record={record}
                  title={record.baggageReference}
                />
              ))}

              <Pressable
                style={styles.primaryButton}
                onPress={registerAnotherBatch}
              >
                <Text style={styles.primaryButtonText}>
                  Create another operation
                </Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={onBack}
              >
                <Text style={styles.secondaryButtonText}>
                  Done, back to baggage
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* INTRODUCTION */}
              <View style={styles.intro}>
                <Text style={styles.eyebrow}>BAGGAGE REGISTRATION</Text>
                <Text style={styles.pageTitle}>
                  Create baggage operation
                </Text>
                <Text style={styles.pageDescription}>
                  Register multiple bags against a single flight.
                  AeroSync will generate a unique baggage record and
                  QR identifier for every bag.
                </Text>
              </View>

              {/* FORM */}
              <View style={styles.formCard}>
                <View style={styles.formHeading}>
                  <Text style={styles.formTitle}>
                    Operation details
                  </Text>
                  <Text style={styles.requiredNote}>
                    * Required
                  </Text>
                </View>

                <Text style={styles.fieldLabel}>
                  FLIGHT <Text style={styles.required}>*</Text>
                </Text>

                <Pressable
                  style={[styles.input, styles.flightSelector]}
                  onPress={() => setShowFlightPicker((open) => !open)}
                  disabled={registering}
                  accessibilityRole="button"
                >
                  <View style={styles.flightSelectorText}>
                    <Text
                      style={[
                        styles.flightSelectorValue,
                        !flightNumber && styles.flightSelectorPlaceholder,
                      ]}
                    >
                      {flightNumber || 'Select an upcoming flight'}
                    </Text>
                    {selectedFlight && (
                      <Text style={styles.flightOptionMeta}>
                        {selectedFlight.origin} → {selectedFlight.destination} ·{' '}
                        {selectedFlight.departureDate}{' '}
                        {selectedFlight.departureTime || '—'}
                      </Text>
                    )}
                  </View>
                  <Icon
                    name={showFlightPicker ? 'collapse' : 'expand'}
                    size={22}
                    color={MUTED}
                  />
                </Pressable>

                {showFlightPicker && (
                  <View style={styles.flightPickerList}>
                    {pickableFlights.length === 0 ? (
                      <Text style={styles.fieldHint}>
                        No upcoming flights. Create one on the Flights screen
                        first.
                      </Text>
                    ) : (
                      pickableFlights.map((flight) => {
                        const selected = flight.id === selectedFlight?.id;

                        return (
                          <Pressable
                            key={flight.id}
                            onPress={() => {
                              setSelectedFlightId(flight.id);
                              setFlightNumber(flight.flightNumber);
                              setShowFlightPicker(false);
                            }}
                            style={[
                              styles.flightOption,
                              selected && styles.flightOptionSelected,
                            ]}
                          >
                            <View style={styles.flightSelectorText}>
                              <Text style={styles.flightSelectorValue}>
                                {flight.flightNumber}
                              </Text>
                              <Text style={styles.flightOptionMeta}>
                                {flight.origin} → {flight.destination} ·{' '}
                                {flight.departureDate}{' '}
                                {flight.departureTime || '—'}
                              </Text>
                            </View>
                            <Icon
                              name={selected ? 'check' : 'unchecked'}
                              size={20}
                              color={selected ? RED : '#B8BBC0'}
                            />
                          </Pressable>
                        );
                      })
                    )}
                  </View>
                )}

                <Text style={styles.fieldHint}>
                  Choose the flight these bags are checked in for.
                </Text>

                <View style={styles.fieldDivider} />

                <Text style={styles.fieldLabel}>
                  NUMBER OF BAGS <Text style={styles.required}>*</Text>
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Enter quantity (1–100)"
                  placeholderTextColor="#9AA0A6"
                  value={bagCount}
                  onChangeText={(value) =>
                    setBagCount(value.replace(/[^0-9]/g, ''))
                  }
                  keyboardType="number-pad"
                  autoCorrect={false}
                  editable={!registering}
                  returnKeyType="done"
                  onSubmitEditing={registerBaggageBatch}
                />

                <Text style={styles.fieldHint}>
                  You can register between 1 and 100 bags per operation.
                </Text>

                <View style={styles.fieldDivider} />

                <Text style={styles.fieldLabel}>
                  AIRLINE BAG TAG NUMBER (OPTIONAL)
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="e.g. 0706123456"
                  placeholderTextColor="#9AA0A6"
                  value={airlineTag}
                  onChangeText={setAirlineTag}
                  keyboardType="number-pad"
                  maxLength={AIRLINE_TAG_MAX_DIGITS}
                  autoCorrect={false}
                  editable={!registering}
                />

                <Text style={styles.fieldHint}>
                  The 10-digit number on the airline's bag tag, if available.
                  {Number.parseInt(bagCount, 10) > 1
                    ? ' For several bags, add each tag number from the bag details after registering.'
                    : ''}
                </Text>

                {/* PREVIEW */}
                <View style={styles.previewBox}>
                  <View style={styles.previewIcon}>
                    <Icon name="baggage" size={21} color={RED} />
                  </View>

                  <View style={styles.previewCopy}>
                    <Text style={styles.previewTitle}>
                      Individual baggage records
                    </Text>
                    <Text style={styles.previewDescription}>
                      Each bag receives its own baggage ID, reference
                      and scannable QR code.
                    </Text>
                  </View>
                </View>

                <Pressable
                  style={[
                    styles.primaryButton,
                    registering && styles.disabledButton,
                  ]}
                  onPress={registerBaggageBatch}
                  disabled={registering}
                >
                  {registering ? (
                    <View style={styles.buttonLoading}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.primaryButtonText}>
                        Creating operation...
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Create baggage operation
                    </Text>
                  )}
                </Pressable>

                <Text style={styles.formFootnote}>
                  Records will be saved to AeroSync once you confirm
                  the operation.
                </Text>
              </View>
            </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              AEROSYNC · KENYA AIRWAYS GROUND OPERATIONS
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 19,
    paddingTop: 7,
    paddingBottom: 35,
  },

  /* HEADER */
  header: {
    height: 59,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 21,
  },
  backButton: {
    width: 34,
    height: 42,
    justifyContent: 'center',
  },
  backIcon: {
    color: DARK,
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 40,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: DARK,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginTop: 3,
  },
  headerMark: {
    width: 36,
    height: 36,
    borderRadius: 19,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMarkText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },

  /* INTRO */
  intro: {
    marginBottom: 22,
  },
  eyebrow: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 7,
  },
  pageTitle: {
    color: DARK,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  pageDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 490,
  },

  /* FORM */
  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 17,
  },
  formHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  formTitle: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
  },
  requiredNote: {
    color: MUTED,
    fontSize: 10,
  },
  required: {
    color: RED,
  },
  fieldLabel: {
    color: DARK,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  input: {
    height: 47,
    borderWidth: 1,
    borderColor: '#DDE0E4',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: DARK,
    backgroundColor: '#FFFFFF',
    outlineStyle: 'none',
  } as any,
  fieldHint: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 7,
  },
  flightSelector: {
    height: 'auto',
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  flightSelectorText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  flightSelectorValue: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },
  flightSelectorPlaceholder: {
    color: '#9AA0A6',
    fontWeight: '400',
  },
  flightPickerList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    overflow: 'hidden',
  },
  flightOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F2',
    backgroundColor: '#FFFFFF',
  },
  flightOptionSelected: {
    backgroundColor: '#FFF3F5',
  },
  flightOptionMeta: {
    color: MUTED,
    fontSize: 11,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: '#F0F1F2',
    marginVertical: 19,
  },

  /* PREVIEW */
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#F8F8F9',
    borderWidth: 1,
    borderColor: '#EFF0F1',
    borderRadius: 9,
    padding: 12,
    marginTop: 23,
    marginBottom: 19,
  },
  previewIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: '#FCECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIconText: {
    color: RED,
    fontSize: 21,
  },
  previewCopy: {
    flex: 1,
  },
  previewTitle: {
    color: DARK,
    fontSize: 11,
    fontWeight: '900',
  },
  previewDescription: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  /* BUTTONS */
  primaryButton: {
    minHeight: 47,
    borderRadius: 9,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.65,
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  formFootnote: {
    color: MUTED,
    fontSize: 9,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },

  /* SUCCESS */
  successBanner: {
    backgroundColor: '#EAF5ED',
    borderWidth: 1,
    borderColor: '#D4EBDD',
    borderRadius: 11,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 15,
  },
  successIcon: {
    width: 37,
    height: 37,
    borderRadius: 20,
    backgroundColor: '#D6EEDF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconText: {
    color: '#287448',
    fontSize: 21,
    fontWeight: '900',
  },
  successCopy: {
    flex: 1,
  },
  successTitle: {
    color: '#23683F',
    fontSize: 13,
    fontWeight: '900',
  },
  successDescription: {
    color: '#547561',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginBottom: 25,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  summaryValue: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
  },
  summaryStatus: {
    color: '#287448',
    fontSize: 11,
    fontWeight: '900',
  },
  summaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: BORDER,
  },

  /* GENERATED RECORDS */
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 7,
  },
  sectionTitle: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  countBadge: {
    minWidth: 29,
    height: 29,
    borderRadius: 16,
    backgroundColor: '#FCECEF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  countBadgeText: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
  },
  generatedList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 23,
  },
  generatedRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F2',
  },
  generatedIcon: {
    width: 34,
    height: 34,
    borderRadius: 18,
    backgroundColor: '#F1F2F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatedIconText: {
    color: DARK,
    fontSize: 19,
  },
  generatedCopy: {
    flex: 1,
  },
  generatedReference: {
    color: DARK,
    fontSize: 12,
    fontWeight: '900',
  },
  generatedId: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },
  registeredBadge: {
    backgroundColor: '#E7F4E9',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  registeredBadgeText: {
    color: '#287448',
    fontSize: 9,
    fontWeight: '800',
  },

  /* FOOTER */
  footer: {
    alignItems: 'center',
    marginTop: 28,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerText: {
    color: '#A0A5AA',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
});
