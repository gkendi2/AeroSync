
import DateTimeField from '@/components/date-time-field';
import Icon from '@/components/icon';
import { auth, db } from '@/lib/firebase';
import { openFlightThread } from '@/lib/navigation';
import { useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
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

type FlightTab = 'Today' | 'Upcoming' | 'Completed';

// Status choices when editing a flight. A flight whose stored status is not
// in this list keeps it as an extra choice.
const FLIGHT_STATUSES = [
  'Scheduled',
  'Boarding',
  'Delayed',
  'Departed',
  'Arrived',
  'Cancelled',
];

const RED = '#C8102E';
const DARK = '#20252B';
const MUTED = '#747B83';
const BORDER = '#E8E9EB';
const BACKGROUND = '#F7F7F8';
const GREEN = '#21834B';
const BLUE = '#2868A8';
const AMBER = '#A86A13';

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

function getStatusAppearance(status: string) {
  const value = status.toLowerCase();

  if (
    value.includes('turnaround') ||
    value.includes('boarding') ||
    value.includes('progress')
  ) {
    return { backgroundColor: '#E5F0FC', color: BLUE };
  }

  if (
    value.includes('risk') ||
    value.includes('delay') ||
    value.includes('cancel')
  ) {
    return { backgroundColor: '#FFF0D6', color: AMBER };
  }

  if (
    value.includes('on time') ||
    value.includes('complete') ||
    value.includes('departed') ||
    value.includes('arrived')
  ) {
    return { backgroundColor: '#E7F5E9', color: GREEN };
  }

  return { backgroundColor: '#ECEDEF', color: DARK };
}

function isCompleted(status: string) {
  const value = status.toLowerCase();
  return (
    value.includes('complete') ||
    value.includes('departed') ||
    value.includes('arrived') ||
    value.includes('landed')
  );
}

// A tab screen: no back button.
export default function FlightsScreen() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [activeTab, setActiveTab] = useState<FlightTab>('Today');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedDate, setSelectedDate] = useState(dateString(new Date()));
  const [showForm, setShowForm] = useState(false);

  // Edit form: the flight being edited (null when closed) and its draft values.
  const router = useRouter();
  const [editingFlight, setEditingFlight] = useState<Flight | null>(null);
  const [editDepartureDate, setEditDepartureDate] = useState('');
  const [editDepartureTime, setEditDepartureTime] = useState('');
  const [editArrivalDate, setEditArrivalDate] = useState('');
  const [editArrivalTime, setEditArrivalTime] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

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
        const records = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            flightNumber: data.flightNumber ?? '',
            origin: data.origin ?? '',
            destination: data.destination ?? '',
            departureDate: data.departureDate ?? '',
            departureTime: data.departureTime ?? '',
            arrivalDate: data.arrivalDate ?? '',
            arrivalTime: data.arrivalTime ?? '',
            status: data.status ?? 'Scheduled',
            isDemo: data.isDemo ?? false,
            demoScenario: data.demoScenario ?? '',
          } as Flight;
        });

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

  const today = dateString(new Date());

  const tabFlights = useMemo(() => {
    return flights.filter((flight) => {
      if (activeTab === 'Today') {
        return flight.departureDate === today;
      }

      if (activeTab === 'Upcoming') {
        return flight.departureDate > today && !isCompleted(flight.status);
      }

      return isCompleted(flight.status);
    });
  }, [flights, activeTab, today]);

  const filteredFlights = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tabFlights.filter((flight) => {
      const matchesSearch =
        !term ||
        flight.flightNumber.toLowerCase().includes(term) ||
        flight.origin.toLowerCase().includes(term) ||
        flight.destination.toLowerCase().includes(term);

      const matchesStatus =
        selectedStatus === 'All' ||
        flight.status.toLowerCase() === selectedStatus.toLowerCase();

      const matchesDate =
        !showDateFilter || flight.departureDate === selectedDate;

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [
    tabFlights,
    search,
    selectedStatus,
    showDateFilter,
    selectedDate,
  ]);

  const availableStatuses = useMemo(
    () => ['All', ...Array.from(new Set(tabFlights.map((f) => f.status)))],
    [tabFlights]
  );

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
        `${cleanFlightNumber} has been added to AeroSync.`
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
          flightNumber: 'KQ901',
          origin: 'Nairobi',
          destination: 'Mombasa',
          minutesUntilDeparture: 240,
          demoScenario: 'on-track',
        },
        {
          id: 'under-pressure',
          flightNumber: 'KQ902',
          origin: 'Nairobi',
          destination: 'Kisumu',
          minutesUntilDeparture: 100,
          demoScenario: 'under-pressure',
        },
        {
          id: 'close-to-departure',
          flightNumber: 'KQ903',
          origin: 'Nairobi',
          destination: 'Eldoret',
          minutesUntilDeparture: 25,
          demoScenario: 'close-to-departure',
        },
      ];

      let created = 0;
      let alreadyExisted = 0;

      for (const scenario of scenarios) {
        const departure = addMinutes(now, scenario.minutesUntilDeparture);
        const arrival = addMinutes(departure, 60);

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

  function startEditingFlight(flight: Flight) {
    setShowForm(false);
    setEditingFlight(flight);
    setEditDepartureDate(flight.departureDate);
    setEditDepartureTime(flight.departureTime);
    setEditArrivalDate(flight.arrivalDate);
    setEditArrivalTime(flight.arrivalTime);
    setEditStatus(flight.status || 'Scheduled');
  }

  async function saveFlightEdit() {
    if (!editingFlight) return;

    if (!auth.currentUser) {
      showMessage('Sign-in required', 'Please sign in again.');
      return;
    }

    // Same checks as creating a flight.
    if (!editDepartureDate.trim() || !editDepartureTime.trim()) {
      showMessage(
        'Missing information',
        'Enter the departure date and departure time.'
      );
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(editDepartureDate) ||
      !/^\d{2}:\d{2}$/.test(editDepartureTime)
    ) {
      showMessage(
        'Invalid departure details',
        'Use YYYY-MM-DD for the date and HH:MM for the time.'
      );
      return;
    }

    if (
      (editArrivalDate && !/^\d{4}-\d{2}-\d{2}$/.test(editArrivalDate)) ||
      (editArrivalTime && !/^\d{2}:\d{2}$/.test(editArrivalTime))
    ) {
      showMessage(
        'Invalid arrival details',
        'Use YYYY-MM-DD for the date and HH:MM for the time.'
      );
      return;
    }

    setSavingEdit(true);

    try {
      await updateDoc(doc(db, 'Flights', editingFlight.id), {
        departureDate: editDepartureDate,
        departureTime: editDepartureTime,
        arrivalDate: editArrivalDate || '',
        arrivalTime: editArrivalTime || '',
        status: editStatus,
        updatedAt: serverTimestamp(),
      });

      showMessage(
        'Flight updated',
        `${editingFlight.flightNumber} has been updated.`
      );
      setEditingFlight(null);
    } catch (error) {
      console.error('Flight update failed:', error);
      showMessage(
        'Could not update flight',
        'The changes were not saved. Check your Firestore permissions and try again.'
      );
    } finally {
      setSavingEdit(false);
    }
  }

  function changeTab(tab: FlightTab) {
    setActiveTab(tab);
    setSelectedStatus('All');
    setShowDateFilter(false);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>Flights</Text>

          <View style={styles.headerActions}>
            {/* One Filter button opens both the status and the date filter. */}
            <Pressable
              onPress={() => setShowFilters(!showFilters)}
              style={[
                styles.filterButton,
                (showFilters || selectedStatus !== 'All' || showDateFilter) &&
                  styles.headerIconActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Filter flights"
            >
              <Icon name="filter" size={18} color={DARK} />
              <Text style={styles.filterButtonText}>
                Filter
                {selectedStatus !== 'All' || showDateFilter ? ' •' : ''}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setEditingFlight(null);
                setShowForm(!showForm);
              }}
              style={styles.addButton}
              accessibilityLabel="Create a flight"
            >
              <Icon name="add" size={20} color={WHITE} />
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['Today', 'Upcoming', 'Completed'] as FlightTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => changeTab(tab)}
              style={styles.tab}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeTabText,
                ]}
              >
                {tab}
              </Text>
              {activeTab === tab && <View style={styles.tabUnderline} />}
            </Pressable>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Icon name="search" size={19} color={MUTED} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search flight (e.g. KQ102)..."
            placeholderTextColor="#969CA3"
            style={styles.searchInput}
            autoCapitalize="characters"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              accessibilityLabel="Clear search"
            >
              <Icon name="close" size={18} color={MUTED} />
            </Pressable>
          )}
        </View>

        {/* Filters: status and departure date, opened by the Filter button.
            The date filter applies only while it is switched on, as before. */}
        {showFilters && (
          <View style={styles.filterPanel}>
            <Text style={styles.filterPanelTitle}>Status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterOptions}
            >
              {availableStatuses.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setSelectedStatus(status)}
                  style={[
                    styles.filterChip,
                    selectedStatus === status && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedStatus === status && styles.filterChipTextActive,
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.filterPanelTitle}>Departure date</Text>
            <Pressable
              onPress={() => setShowDateFilter(!showDateFilter)}
              style={[
                styles.filterChip,
                styles.dateToggle,
                showDateFilter && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  showDateFilter && styles.filterChipTextActive,
                ]}
              >
                {showDateFilter ? 'Filtering by date' : 'Filter by date'}
              </Text>
            </Pressable>

            {showDateFilter && (
              <>
                <TextInput
                  value={selectedDate}
                  onChangeText={setSelectedDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.dateInput}
                />
                <Pressable
                  onPress={() => {
                    setSelectedDate(today);
                    setShowDateFilter(false);
                  }}
                >
                  <Text style={styles.resetFilter}>Reset to today</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* Flight list */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {showForm && (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>New flight</Text>
                <Pressable
                  onPress={() => setShowForm(false)}
                  accessibilityLabel="Close new flight form"
                >
                  <Icon name="close" size={22} color={MUTED} />
                </Pressable>
              </View>

              <Text style={styles.formLabel}>FLIGHT NUMBER</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. KQ100"
                value={flightNumber}
                onChangeText={setFlightNumber}
                autoCapitalize="characters"
              />

              <Text style={styles.formLabel}>ORIGIN</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. NBO"
                value={origin}
                onChangeText={setOrigin}
              />

              <Text style={styles.formLabel}>DESTINATION</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. JNB"
                value={destination}
                onChangeText={setDestination}
              />

              <Text style={styles.formLabel}>DEPARTURE DATE</Text>
              <DateTimeField
                mode="date"
                style={styles.formInput}
                value={departureDate}
                onChange={setDepartureDate}
                minimumDate={today}
              />

              <Text style={styles.formLabel}>DEPARTURE TIME (24-HOUR)</Text>
              <DateTimeField
                mode="time"
                style={styles.formInput}
                value={departureTime}
                onChange={setDepartureTime}
              />

              <Text style={styles.formLabel}>ARRIVAL DATE (OPTIONAL)</Text>
              <DateTimeField
                mode="date"
                style={styles.formInput}
                value={arrivalDate}
                onChange={setArrivalDate}
                clearable
              />

              <Text style={styles.formLabel}>ARRIVAL TIME (OPTIONAL)</Text>
              <DateTimeField
                mode="time"
                style={styles.formInput}
                value={arrivalTime}
                onChange={setArrivalTime}
                clearable
              />

              <Pressable
                onPress={createFlight}
                disabled={saving}
                style={styles.saveButton}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.saveButtonText}>Save flight</Text>
                )}
              </Pressable>

              <Pressable
                onPress={loadDemoFlights}
                disabled={seeding}
                style={styles.demoButton}
              >
                {seeding ? (
                  <ActivityIndicator color={RED} />
                ) : (
                  <Text style={styles.demoButtonText}>
                    Load sample demo flights
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {editingFlight && (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>
                  Edit {editingFlight.flightNumber}
                </Text>
                <Pressable
                  onPress={() => setEditingFlight(null)}
                  accessibilityLabel="Close edit form"
                >
                  <Icon name="close" size={22} color={MUTED} />
                </Pressable>
              </View>

              <Text style={styles.editRoute}>
                {editingFlight.origin} → {editingFlight.destination}
              </Text>

              <Text style={styles.formLabel}>DEPARTURE DATE</Text>
              <DateTimeField
                mode="date"
                style={styles.formInput}
                value={editDepartureDate}
                onChange={setEditDepartureDate}
              />

              <Text style={styles.formLabel}>DEPARTURE TIME (24-HOUR)</Text>
              <DateTimeField
                mode="time"
                style={styles.formInput}
                value={editDepartureTime}
                onChange={setEditDepartureTime}
              />

              <Text style={styles.formLabel}>ARRIVAL DATE (OPTIONAL)</Text>
              <DateTimeField
                mode="date"
                style={styles.formInput}
                value={editArrivalDate}
                onChange={setEditArrivalDate}
                clearable
              />

              <Text style={styles.formLabel}>ARRIVAL TIME (OPTIONAL)</Text>
              <DateTimeField
                mode="time"
                style={styles.formInput}
                value={editArrivalTime}
                onChange={setEditArrivalTime}
                clearable
              />

              <Text style={styles.formLabel}>STATUS</Text>
              <View style={styles.statusOptions}>
                {(FLIGHT_STATUSES.includes(editingFlight.status) ||
                !editingFlight.status
                  ? FLIGHT_STATUSES
                  : [...FLIGHT_STATUSES, editingFlight.status]
                ).map((status) => (
                  <Pressable
                    key={status}
                    onPress={() => setEditStatus(status)}
                    style={[
                      styles.filterChip,
                      editStatus === status && styles.filterChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        editStatus === status && styles.filterChipTextActive,
                      ]}
                    >
                      {status}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={saveFlightEdit}
                disabled={savingEdit}
                style={styles.saveButton}
              >
                {savingEdit ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.saveButtonText}>Save changes</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => openFlightThread(router, editingFlight.id)}
                style={styles.messagesButton}
              >
                <Icon name="messages" size={18} color={RED} />
                <Text style={styles.messagesButtonText}>Open messages</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.resultsHeading}>
            <Text style={styles.resultsCount}>
              {activeTab === 'Today'
                ? 'TODAY'
                : activeTab === 'Upcoming'
                  ? 'UPCOMING DEPARTURES'
                  : 'COMPLETED FLIGHTS'}
            </Text>
            <Text style={styles.resultsNumber}>
              {loading ? '—' : filteredFlights.length}
            </Text>
          </View>

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={RED} size="large" />
              <Text style={styles.emptyText}>Loading flights...</Text>
            </View>
          ) : filteredFlights.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Icon name="airplane" size={28} color={RED} />
              </View>
              <Text style={styles.emptyTitle}>No flights found</Text>
              <Text style={styles.emptyText}>
                {search
                  ? 'Try another flight number or route.'
                  : activeTab === 'Today'
                    ? 'There are no flights scheduled for today.'
                    : activeTab === 'Upcoming'
                      ? 'There are no upcoming departures.'
                      : 'Completed flights will appear here.'}
              </Text>
              {!search && activeTab === 'Today' && (
                <Pressable onPress={() => setShowForm(true)}>
                  <Text style={styles.emptyAction}>Add a flight</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.flightList}>
              {filteredFlights.map((flight, index) => {
                const appearance = getStatusAppearance(flight.status);

                return (
                  <Pressable
                    key={flight.id}
                    onPress={() => startEditingFlight(flight)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit flight ${flight.flightNumber}`}
                    style={({ pressed }) => [
                      styles.flightRow,
                      index === filteredFlights.length - 1 &&
                        styles.lastFlightRow,
                      pressed && styles.flightRowPressed,
                    ]}
                  >
                    <View style={styles.flightIdentity}>
                      <Text style={styles.flightNumber}>
                        {flight.flightNumber}
                      </Text>
                      <Text style={styles.flightRoute}>
                        {flight.origin} → {flight.destination}
                      </Text>
                      {flight.isDemo && (
                        <Text style={styles.demoLabel}>DEMO RECORD</Text>
                      )}
                    </View>

                    <Text style={styles.flightTime}>
                      {flight.departureTime || '—'}
                    </Text>

                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: appearance.backgroundColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: appearance.color },
                        ]}
                      >
                        {flight.status}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => openFlightThread(router, flight.id)}
                      hitSlop={8}
                      style={styles.messagesIconButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Messages for ${flight.flightNumber}`}
                    >
                      <Icon name="messages" size={20} color={RED} />
                    </Pressable>

                    <Icon name="forward" size={22} color="#9299A0" />
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const WHITE = '#FFFFFF';

const styles = StyleSheet.create({
  messagesIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FDE9EC',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 10,
  },

  messagesButtonText: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
  },

  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 19,
  },

  /* Header */
  header: {
    height: 65,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  backButton: {
    width: 27,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backIcon: {
    color: DARK,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '300',
  },
  heading: {
    flex: 1,
    color: DARK,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerIconButton: {
    width: 34,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  headerIconActive: {
    backgroundColor: '#F9E9EC',
  },
  filterButton: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
  },
  filterButtonText: {
    color: DARK,
    fontSize: 12,
    fontWeight: '700',
  },
  dateToggle: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  headerIcon: {
    color: DARK,
    fontSize: 25,
    fontWeight: '700',
  },
  calendarIcon: {
    color: DARK,
    fontSize: 21,
  },
  addButton: {
    width: 31,
    height: 31,
    borderRadius: 17,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 1,
  },
  addButtonText: {
    color: WHITE,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '500',
  },

  /* Tabs */
  tabs: {
    flexDirection: 'row',
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    color: '#777E86',
    fontSize: 13,
    fontWeight: '700',
  },
  activeTabText: {
    color: RED,
    fontWeight: '900',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 7,
    right: 7,
    height: 3,
    borderRadius: 3,
    backgroundColor: RED,
  },

  /* Search */
  searchBar: {
    height: 45,
    backgroundColor: '#ECEDEF',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    marginBottom: 16,
  },
  searchIcon: {
    color: '#555D65',
    fontSize: 25,
    marginRight: 9,
  },
  searchInput: {
    flex: 1,
    color: DARK,
    fontSize: 13,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,
  clearSearch: {
    color: MUTED,
    fontSize: 22,
    paddingHorizontal: 4,
  },

  /* Filters */
  filterPanel: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 13,
    marginBottom: 13,
  },
  filterPanelTitle: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  dateInput: {
    height: 40,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: DARK,
    fontSize: 13,
  },
  resetFilter: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 9,
  },
  filterScroll: {
    maxHeight: 43,
    marginBottom: 12,
  },
  filterOptions: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 5,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: WHITE,
  },
  filterChipActive: {
    borderColor: RED,
    backgroundColor: '#FCEEF0',
  },
  filterChipText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: RED,
  },

  /* Results */
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 25,
  },
  resultsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  resultsCount: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  resultsNumber: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
  },
  flightList: {
    backgroundColor: WHITE,
    borderRadius: 13,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#EFF0F1',
  },
  flightRow: {
    minHeight: 77,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF0F1',
  },
  lastFlightRow: {
    borderBottomWidth: 0,
  },
  flightIdentity: {
    flex: 1,
    minWidth: 0,
  },
  flightNumber: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  flightRoute: {
    color: '#69717A',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  flightTime: {
    width: 52,
    textAlign: 'center',
    color: DARK,
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  statusBadge: {
    minWidth: 82,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 18,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rowChevron: {
    color: '#59616A',
    fontSize: 25,
    fontWeight: '400',
    marginLeft: 1,
  },
  demoLabel: {
    color: RED,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 3,
    letterSpacing: 0.5,
  },

  /* Empty state */
  emptyState: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  emptyIconCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#F9E9EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyPlane: {
    color: RED,
    fontSize: 22,
  },
  emptyTitle: {
    color: DARK,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyAction: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 13,
  },

  /* Create flight */
  flightRowPressed: {
    opacity: 0.6,
  },
  editRoute: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  formCard: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    padding: 15,
    marginBottom: 18,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  formTitle: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
  },
  closeForm: {
    color: MUTED,
    fontSize: 25,
  },
  formLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 6,
  },
  formInput: {
    height: 42,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 11,
    color: DARK,
    fontSize: 13,
    backgroundColor: '#FAFAFB',
  },
  saveButton: {
    height: 45,
    backgroundColor: RED,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 17,
  },
  saveButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
  },
  demoButton: {
    height: 42,
    backgroundColor: '#FCEEF0',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 9,
  },
  demoButtonText: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
  },
  bottomSpace: {
    height: 25,
  },
});
