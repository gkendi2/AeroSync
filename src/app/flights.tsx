import { auth, db } from '@/lib/firebase';
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Flight = {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  status: string;
  isDemo: boolean;
  demoScenario?: string;
};

const RED = '#F0182B';
const DEEP_RED = '#B51F3A';
const BG = '#F5F5F6';
const TEXT = '#222222';
const MUTED = '#737373';
const BORDER = '#E7E7E9';
const GREEN = '#16805C';
const ORANGE = '#C87916';

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function dateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function timeString(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export default function FlightsScreen({
  onBack,
}: {
  onBack: () => void;
}) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [flightNumber, setFlightNumber] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState(dateString(new Date()));
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalDate, setArrivalDate] = useState(dateString(new Date()));
  const [arrivalTime, setArrivalTime] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'Flights'),
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Flight[];

        records.sort((a, b) =>
          `${a.departureDate} ${a.departureTime}`.localeCompare(
            `${b.departureDate} ${b.departureTime}`
          )
        );

        setFlights(records);
        setLoading(false);
      },
      (error) => {
        console.error('Could not load flights:', error);
        setLoading(false);
        showMessage(
          'Unable to load flights',
          'Check your connection and Firestore permissions.'
        );
      }
    );

    return unsubscribe;
  }, []);

  function resetForm() {
    setFlightNumber('');
    setOrigin('');
    setDestination('');
    setDepartureDate(dateString(new Date()));
    setDepartureTime('');
    setArrivalDate(dateString(new Date()));
    setArrivalTime('');
  }

  async function createFlight() {
    const user = auth.currentUser;

    if (!user) {
      showMessage('Sign-in required', 'Please sign in again.');
      return;
    }

    const cleanFlightNumber = flightNumber.trim().toUpperCase();
    const cleanOrigin = origin.trim().toUpperCase();
    const cleanDestination = destination.trim().toUpperCase();

    if (
      !cleanFlightNumber ||
      !cleanOrigin ||
      !cleanDestination ||
      !departureDate.trim() ||
      !departureTime.trim()
    ) {
      showMessage(
        'Missing information',
        'Enter the flight number, origin, destination, departure date and departure time.'
      );
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(departureDate) ||
      !/^\d{2}:\d{2}$/.test(departureTime)
    ) {
      showMessage(
        'Invalid departure details',
        'Use YYYY-MM-DD for the date and HH:MM for the time.'
      );
      return;
    }

    if (
      (arrivalDate && !/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) ||
      (arrivalTime && !/^\d{2}:\d{2}$/.test(arrivalTime))
    ) {
      showMessage(
        'Invalid arrival details',
        'Use YYYY-MM-DD for the date and HH:MM for the time.'
      );
      return;
    }

    if (cleanOrigin === cleanDestination) {
      showMessage(
        'Check the route',
        'Origin and destination cannot be the same.'
      );
      return;
    }

    setSaving(true);

    try {
      const flightRef = doc(collection(db, 'Flights'));

      await setDoc(flightRef, {
        flightNumber: cleanFlightNumber,
        origin: cleanOrigin,
        destination: cleanDestination,
        departureDate,
        departureTime,
        arrivalDate: arrivalDate || '',
        arrivalTime: arrivalTime || '',
        status: 'Scheduled',
        isDemo: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
      setShowForm(false);

      showMessage(
        'Flight created',
        `${cleanFlightNumber} has been added to Flight Management.`
      );
    } catch (error) {
      console.error('Flight creation failed:', error);
      showMessage(
        'Could not create flight',
        'The flight was not saved. Check your Firestore permissions and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadDemoFlights() {
    const user = auth.currentUser;

    if (!user) {
      showMessage('Sign-in required', 'Please sign in again.');
      return;
    }

    setSeeding(true);

    try {
      const now = new Date();

      const scenarios = [
        {
          id: 'on-track',
          flightNumber: 'DEMO101',
          origin: 'Nairobi',
          destination: 'Mombasa',
          minutesUntilDeparture: 240,
          demoScenario: 'on-track',
        },
        {
          id: 'under-pressure',
          flightNumber: 'DEMO202',
          origin: 'Nairobi',
          destination: 'Kisumu',
          minutesUntilDeparture: 100,
          demoScenario: 'under-pressure',
        },
        {
          id: 'close-to-departure',
          flightNumber: 'DEMO303',
          origin: 'Nairobi',
          destination: 'Eldoret',
          minutesUntilDeparture: 25,
          demoScenario: 'close-to-departure',
        },
      ];

      let created = 0;
      let alreadyExisted = 0;

      for (const scenario of scenarios) {
        const departure = addMinutes(
          now,
          scenario.minutesUntilDeparture
        );

        const arrival = addMinutes(departure, 60);

        // A stable ID prevents duplicate demo records for the same day.
        const demoId = `demo_${scenario.id}_${dateString(now)}`;
        const flightRef = doc(db, 'Flights', demoId);
        const existing = await getDoc(flightRef);

        if (existing.exists()) {
          alreadyExisted++;
          continue;
        }

        await setDoc(flightRef, {
          flightNumber: scenario.flightNumber,
          origin: scenario.origin,
          destination: scenario.destination,
          departureDate: dateString(departure),
          departureTime: timeString(departure),
          arrivalDate: dateString(arrival),
          arrivalTime: timeString(arrival),
          status: 'Scheduled',
          isDemo: true,
          demoScenario: scenario.demoScenario,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        created++;
      }

      showMessage(
        'Demo flights ready',
        `${created} demo flights added.\n${alreadyExisted} already existed and were left unchanged.\n\nAll sample flights are marked DEMO.`
      );
    } catch (error) {
      console.error('Demo flight loading failed:', error);
      showMessage(
        'Could not load demo flights',
        'Check your connection and Firestore permissions, then try again.'
      );
    } finally {
      setSeeding(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back to dashboard</Text>
        </Pressable>

        <Text style={styles.eyebrow}>OPERATIONS MANAGEMENT</Text>

        <Text style={styles.heading}>Flight management</Text>

        <Text style={styles.subtitle}>
          Create and manage the flights used for baggage tracking and crew coordination.
        </Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Flights in AeroSync</Text>

          <Text style={styles.summaryNumber}>
            {loading ? '—' : flights.length}
          </Text>

          <Text style={styles.summaryHint}>
            Includes both operational and demo flights.
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => setShowForm(!showForm)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {showForm ? 'Close form' : '+ Create flight'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={loadDemoFlights}
          disabled={seeding}
          style={[
            styles.demoButton,
            seeding && styles.disabledButton,
          ]}
        >
          {seeding ? (
            <ActivityIndicator color={DEEP_RED} />
          ) : (
            <Text style={styles.demoButtonText}>
              Load sample demo flights
            </Text>
          )}
        </Pressable>

        <Text style={styles.demoNote}>
          Sample records are fictional and visibly marked DEMO. Loading them again will not create duplicates for the same day.
        </Text>

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New flight details</Text>

            <Text style={styles.label}>FLIGHT NUMBER *</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. KQ100"
              value={flightNumber}
              onChangeText={setFlightNumber}
              autoCapitalize="characters"
              editable={!saving}
            />

            <Text style={styles.label}>ORIGIN *</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. Nairobi"
              value={origin}
              onChangeText={setOrigin}
              editable={!saving}
            />

            <Text style={styles.label}>DESTINATION *</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. Mombasa"
              value={destination}
              onChangeText={setDestination}
              editable={!saving}
            />

            <Text style={styles.label}>DEPARTURE DATE *</Text>

            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={departureDate}
              onChangeText={setDepartureDate}
              editable={!saving}
            />

            <Text style={styles.label}>DEPARTURE TIME *</Text>

            <TextInput
              style={styles.input}
              placeholder="HH:MM (24-hour format)"
              value={departureTime}
              onChangeText={setDepartureTime}
              editable={!saving}
            />

            <Text style={styles.label}>ARRIVAL DATE</Text>

            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={arrivalDate}
              onChangeText={setArrivalDate}
              editable={!saving}
            />

            <Text style={styles.label}>ARRIVAL TIME</Text>

            <TextInput
              style={styles.input}
              placeholder="HH:MM (24-hour format)"
              value={arrivalTime}
              onChangeText={setArrivalTime}
              editable={!saving}
            />

            <Pressable
              onPress={createFlight}
              disabled={saving}
              style={[
                styles.primaryButton,
                saving && styles.disabledButton,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  Save flight
                </Text>
              )}
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>All flights</Text>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={RED}
            style={styles.loader}
          />
        ) : flights.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No flights yet</Text>

            <Text style={styles.emptyText}>
              Create a flight manually or load the sample demo flights to explore AeroSync.
            </Text>
          </View>
        ) : (
          flights.map((flight) => (
            <View key={flight.id} style={styles.flightCard}>
              <View style={styles.flightTop}>
                <View style={styles.flightInfo}>
                  <Text style={styles.flightNumber}>
                    {flight.flightNumber}
                  </Text>

                  <Text style={styles.route}>
                    {flight.origin} → {flight.destination}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    flight.isDemo && styles.demoBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      flight.isDemo && styles.demoBadgeText,
                    ]}
                  >
                    {flight.isDemo ? 'DEMO' : flight.status}
                  </Text>
                </View>
              </View>

              <View style={styles.flightDivider} />

              <Text style={styles.flightDetail}>
                Departure: {flight.departureDate} at {flight.departureTime}
              </Text>

              {flight.arrivalDate && flight.arrivalTime ? (
                <Text style={styles.flightDetail}>
                  Arrival: {flight.arrivalDate} at {flight.arrivalTime}
                </Text>
              ) : null}

              {flight.demoScenario ? (
                <Text style={styles.scenario}>
                  Scenario: {flight.demoScenario.replaceAll('-', ' ')}
                </Text>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.footer}>
          AEROSYNC · GROUND OPERATIONS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
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

  backText: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
  },

  eyebrow: {
    color: DEEP_RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  heading: {
    color: TEXT,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },

  subtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 18,
  },

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 18,
    marginBottom: 14,
  },

  summaryLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },

  summaryNumber: {
    color: TEXT,
    fontSize: 32,
    fontWeight: '900',
    marginTop: 5,
  },

  summaryHint: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  buttonRow: {
    marginBottom: 10,
  },

  primaryButton: {
    backgroundColor: RED,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  demoButton: {
    backgroundColor: '#FDECEF',
    borderWidth: 1,
    borderColor: '#F2C5CC',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },

  demoButtonText: {
    color: DEEP_RED,
    fontSize: 13,
    fontWeight: '800',
  },

  disabledButton: {
    opacity: 0.6,
  },

  demoNote: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 9,
    marginBottom: 20,
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 17,
    marginBottom: 22,
  },

  formTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 15,
  },

  label: {
    color: DEEP_RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 13,
    marginBottom: 7,
  },

  input: {
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: TEXT,
    fontSize: 14,
  },

  sectionTitle: {
    color: TEXT,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 12,
  },

  loader: {
    marginTop: 25,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 20,
  },

  emptyTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
  },

  emptyText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },

  flightCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 15,
    marginBottom: 10,
  },

  flightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  flightInfo: {
    flex: 1,
  },

  flightNumber: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '900',
  },

  route: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },

  statusBadge: {
    backgroundColor: '#E8F5EF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    color: GREEN,
    fontSize: 9,
    fontWeight: '900',
  },

  demoBadge: {
    backgroundColor: '#FDECEF',
  },

  demoBadgeText: {
    color: DEEP_RED,
  },

  flightDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 12,
  },

  flightDetail: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },

  scenario: {
    color: ORANGE,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'capitalize',
  },

  footer: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 25,
  },
});