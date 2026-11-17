import DateTimeField from '@/components/date-time-field';
import {
  formatShiftTime,
  parseDateString,
  parseTimeString,
  splitShiftTime,
  toDateString,
} from '@/features/datetime/format';
import { auth, db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

const ACTIVITIES = [
  'Loading baggage',
  'Offloading baggage',
  'Baggage transfer',
  'Baggage reconciliation',
];

type Handler = {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
};

type Supervisor = {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
};

type CrewAssignment = {
  id: string;
  handlerUid: string;
  handlerName: string;
  flightNumber: string;
  shiftDate: string;
  shiftTime: string;
  activity: string;
  status: string;
  supervisorUid?: string;
};

// "Assigned" = has an active (not Cancelled/Completed) assignment.
type Filter = 'All' | 'Assigned' | 'Unassigned';

type UpcomingFlight = {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  status: string;
};

// Same test as the flights screen's Completed tab.
function isCompletedFlight(status: string) {
  const value = status.toLowerCase();
  return (
    value.includes('complete') ||
    value.includes('departed') ||
    value.includes('arrived') ||
    value.includes('landed')
  );
}

const RED = '#C8102E';
const DARK = '#292929';
const MUTED = '#777D84';
const BORDER = '#E8E9EB';
const GREEN = '#2B914D';

export default function CrewScreen({ onBack }: { onBack?: () => void }) {
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.uid === ADMIN_UID;

  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<Filter>('All');
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);

  const [selectedHandler, setSelectedHandler] = useState<Handler | null>(null);
  const [handlerSearch, setHandlerSearch] = useState('');
  const [showHandlerPicker, setShowHandlerPicker] = useState(false);
  const [selectedSupervisorUid, setSelectedSupervisorUid] = useState(ADMIN_UID);
  const [flightNumber, setFlightNumber] = useState('');
  const [shiftDate, setShiftDate] = useState('');
  // shiftTime is the stored "HH:MM-HH:MM" string; start and end feed the pickers.
  const [shiftTime, setShiftTime] = useState('');
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [activity, setActivity] = useState(ACTIVITIES[0]);
  const [editingAssignment, setEditingAssignment] =
    useState<CrewAssignment | null>(null);
  const [flightsData, setFlightsData] = useState<UpcomingFlight[]>([]);
  const [showFlightPicker, setShowFlightPicker] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setError('Please sign in to manage crew.');
      setLoading(false);
      return;
    }

    const handlersQuery = query(
      collection(db, 'users'),
      where('role', '==', 'handler')
    );

    const unsubscribeHandlers = onSnapshot(
      handlersQuery,
      (snapshot) => {
        const results: Handler[] = snapshot.docs
          .map((item) => ({
            uid: item.id,
            ...(item.data() as Omit<Handler, 'uid'>),
          }))
          .sort((a, b) =>
            (a.displayName || a.email || '').localeCompare(
              b.displayName || b.email || ''
            )
          );

        setHandlers(results);
        setLoading(false);
      },
      (err) => {
        console.error('Handler loading error:', err);
        setError('Unable to load approved handlers.');
        setLoading(false);
      }
    );

    let unsubscribeSupervisors: (() => void) | undefined;

    if (isAdmin) {
      const supervisorsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'supervisor')
      );

      unsubscribeSupervisors = onSnapshot(
        supervisorsQuery,
        (snapshot) => {
          const adminEmail = currentUser.email?.trim().toLowerCase();

          const results: Supervisor[] = snapshot.docs
            .map((item) => ({
              ...(item.data() as Omit<Supervisor, 'uid'>),
              uid: item.id,
            }))
            .filter(
              (supervisor) =>
                supervisor.uid !== ADMIN_UID &&
                (!adminEmail ||
                  supervisor.email?.trim().toLowerCase() !== adminEmail)
            );

          setSupervisors(results);
        },
        (err) => {
          console.error('Supervisor loading error:', err);
          setError('Unable to load approved supervisors.');
        }
      );
    }

    const assignmentsQuery = isAdmin
      ? collection(db, 'CrewAssignments')
      : query(
          collection(db, 'CrewAssignments'),
          where('supervisorUid', '==', currentUser.uid)
        );

    const unsubscribeAssignments = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const results: CrewAssignment[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            handlerUid: data.handlerUid ?? '',
            handlerName: data.handlerName ?? 'Unknown handler',
            flightNumber: data.flightNumber ?? '',
            shiftDate: data.shiftDate ?? '',
            shiftTime: data.shiftTime ?? '',
            activity: data.activity ?? '',
            status: data.status ?? 'Assigned',
            supervisorUid: data.supervisorUid ?? '',
          };
        });

        results.sort((a, b) =>
          `${a.shiftDate} ${a.shiftTime}`.localeCompare(
            `${b.shiftDate} ${b.shiftTime}`
          )
        );

        setAssignments(results);
      },
      (err) => {
        console.error('Assignment loading error:', err);
        setError('Unable to load assignments. Check Firestore rules.');
      }
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
              status: data.status ?? 'Scheduled',
            };
          })
        );
      },
      (err) => {
        console.error('Flight loading error:', err);
        setError('Unable to load flights for the flight selector.');
      }
    );

    return () => {
      unsubscribeHandlers();
      unsubscribeSupervisors?.();
      unsubscribeAssignments();
      unsubscribeFlights();
    };
  }, [currentUser?.uid, isAdmin]);

  const activeAssignments = useMemo(
    () =>
      assignments.filter(
        (item) =>
          item.status !== 'Cancelled' && item.status !== 'Completed'
      ),
    [assignments]
  );

  const onDutyUids = useMemo(
    () => new Set(activeAssignments.map((item) => item.handlerUid)),
    [activeAssignments]
  );

  const counts = useMemo(
    () => ({
      All: handlers.length,
      Assigned: handlers.filter((handler) =>
        onDutyUids.has(handler.uid)
      ).length,
      Unassigned: handlers.filter(
        (handler) => !onDutyUids.has(handler.uid)
      ).length,
    }),
    [handlers, onDutyUids]
  );

  const filteredHandlers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return handlers.filter((handler) => {
      const onDuty = onDutyUids.has(handler.uid);

      const matchesFilter =
        activeFilter === 'All' ||
        (activeFilter === 'Assigned' && onDuty) ||
        (activeFilter === 'Unassigned' && !onDuty);

      const name = handler.displayName || handler.email || '';

      const matchesSearch =
        !term ||
        name.toLowerCase().includes(term) ||
        (handler.email || '').toLowerCase().includes(term) ||
        handler.uid.toLowerCase().includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [handlers, onDutyUids, activeFilter, search]);

  const availableHandlers = useMemo(() => {
    const term = handlerSearch.trim().toLowerCase();

    if (!term) return handlers;

    return handlers.filter((handler) => {
      const name = handler.displayName || handler.email || '';

      return (
        name.toLowerCase().includes(term) ||
        (handler.email || '').toLowerCase().includes(term) ||
        handler.uid.toLowerCase().includes(term)
      );
    });
  }, [handlers, handlerSearch]);

  // Flights that have not departed yet and are not cancelled or completed,
  // soonest first. Computed when the picker opens, so "now" is current.
  function upcomingFlights() {
    const now = Date.now();

    return flightsData
      .filter((flight) => {
        if (!flight.flightNumber.trim()) return false;
        if (flight.status.toLowerCase().includes('cancel')) return false;
        if (isCompletedFlight(flight.status)) return false;

        const day = parseDateString(flight.departureDate);
        if (!day) return false;

        const time = parseTimeString(flight.departureTime);
        if (!time) {
          // No readable time: keep it while its date is today or later.
          return flight.departureDate >= toDateString(new Date());
        }

        day.setHours(time.getHours(), time.getMinutes(), 0, 0);
        return day.getTime() >= now;
      })
      .sort((a, b) =>
        `${a.departureDate} ${a.departureTime}`.localeCompare(
          `${b.departureDate} ${b.departureTime}`
        )
      );
  }

  function selectFlight(flight: UpcomingFlight) {
    setFlightNumber(flight.flightNumber);
    setShiftDate(flight.departureDate);
    setShowFlightPicker(false);
  }

  function resetForm() {
    setShowFlightPicker(false);
    setSelectedHandler(null);
    setHandlerSearch('');
    setShowHandlerPicker(false);
    setFlightNumber('');
    setShiftDate('');
    setShiftTime('');
    setShiftStart('');
    setShiftEnd('');
    setActivity(ACTIVITIES[0]);
    setEditingAssignment(null);
    setSelectedSupervisorUid(ADMIN_UID);
    setShowAssignmentForm(false);
  }

  // The stored shiftTime is only rewritten once both times are picked, so an
  // older value in another format survives an edit that leaves the times alone.
  function changeShiftTimes(start: string, end: string) {
    setShiftStart(start);
    setShiftEnd(end);

    if (start && end) {
      setShiftTime(formatShiftTime(start, end));
    }
  }

  function openAssignmentForm(handler?: Handler) {
    setSelectedHandler(handler || null);
    setHandlerSearch('');
    setShowHandlerPicker(false);
    setEditingAssignment(null);
    // New assignments default to today.
    setShiftDate((current) => current || toDateString(new Date()));
    setError('');
    setShowAssignmentForm(true);
  }

  function startEditing(assignment: CrewAssignment) {
    const handler = handlers.find(
      (item) => item.uid === assignment.handlerUid
    );

    setSelectedHandler(
      handler || {
        uid: assignment.handlerUid,
        displayName: assignment.handlerName,
        role: 'handler',
      }
    );

    setHandlerSearch('');
    setShowHandlerPicker(false);
    setEditingAssignment(assignment);
    setFlightNumber(assignment.flightNumber);
    setShiftDate(assignment.shiftDate);
    setShiftTime(assignment.shiftTime);

    const shiftParts = splitShiftTime(assignment.shiftTime);
    setShiftStart(shiftParts?.start ?? '');
    setShiftEnd(shiftParts?.end ?? '');

    setActivity(assignment.activity);

    if (isAdmin) {
      setSelectedSupervisorUid(assignment.supervisorUid || ADMIN_UID);
    }

    setError('');
    setShowAssignmentForm(true);
  }

  async function saveAssignment() {
    if (!currentUser) {
      Alert.alert('Sign-in required', 'Please sign in again.');
      return;
    }

    if (!selectedHandler) {
      Alert.alert('Select a handler', 'Choose a handler first.');
      return;
    }

    if (!flightNumber.trim() || !shiftDate.trim() || !shiftTime.trim()) {
      Alert.alert(
        'Missing details',
        'Select a flight and enter the shift date and shift time.'
      );
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate.trim())) {
      Alert.alert(
        'Invalid date',
        'Use YYYY-MM-DD, for example 2026-11-05.'
      );
      return;
    }

    const supervisorUid = isAdmin
      ? selectedSupervisorUid
      : currentUser.uid;

    if (!supervisorUid) {
      Alert.alert('Select a supervisor', 'Choose an assignment owner.');
      return;
    }

    setSaving(true);

    try {
      const assignmentData = {
        handlerUid: selectedHandler.uid,
        handlerName:
          selectedHandler.displayName ||
          selectedHandler.email ||
          'Approved handler',
        flightNumber: flightNumber.trim().toUpperCase(),
        shiftDate: shiftDate.trim(),
        shiftTime: shiftTime.trim(),
        activity,
      };

      if (editingAssignment) {
        await updateDoc(
          doc(db, 'CrewAssignments', editingAssignment.id),
          {
            ...assignmentData,
            ...(isAdmin ? { supervisorUid } : {}),
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp(),
          }
        );

        Alert.alert(
          'Assignment updated',
          'The assignment has been updated successfully.'
        );
      } else {
        await addDoc(collection(db, 'CrewAssignments'), {
          ...assignmentData,
          status: 'Assigned',
          assignedBy: currentUser.uid,
          createdAt: serverTimestamp(),
          supervisorUid,
        });

        Alert.alert(
          'Assignment created',
          'The crew assignment has been saved.'
        );
      }

      resetForm();
    } catch (err) {
      console.error('Assignment save error:', err);

      Alert.alert(
        'Unable to save',
        'The assignment could not be saved. Check your Firestore rules and try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelAssignment(assignment: CrewAssignment) {
    if (!currentUser) return;

    const performCancellation = async () => {
      try {
        await updateDoc(
          doc(db, 'CrewAssignments', assignment.id),
          {
            status: 'Cancelled',
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp(),
          }
        );

        Alert.alert(
          'Assignment cancelled',
          `${assignment.flightNumber} has been cancelled.`
        );
      } catch (err: any) {
        console.error('Assignment cancellation failed:', err);

        Alert.alert(
          'Unable to cancel',
          `Error: ${err?.code || 'Unknown'}\n${err?.message || 'No error message available'}`
        );
      }
    };

    if (Platform.OS === 'web') {
      await performCancellation();
      return;
    }

    Alert.alert(
      'Cancel assignment?',
      `Cancel the assignment for ${assignment.handlerName} on ${assignment.flightNumber}?`,
      [
        { text: 'Keep assignment', style: 'cancel' },
        {
          text: 'Cancel assignment',
          style: 'destructive',
          onPress: () => void performCancellation(),
        },
      ]
    );
  }

  const canManage = (assignment: CrewAssignment) =>
    isAdmin || assignment.supervisorUid === currentUser?.uid;

  const getSupervisorName = (uid?: string) => {
    if (!uid || uid === ADMIN_UID) return 'Gloria (Administrator)';

    const supervisor = supervisors.find((item) => item.uid === uid);

    return (
      supervisor?.displayName ||
      supervisor?.email ||
      'Supervisor'
    );
  };

  function handleBack() {
    if (showAssignmentForm) {
      resetForm();
    } else {
      onBack?.();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <Text style={styles.heading}>
            {showAssignmentForm ? 'Crew assignment' : 'Crew'}
          </Text>

          {!showAssignmentForm ? (
            <Pressable
              onPress={() => openAssignmentForm()}
              style={styles.addButton}
              accessibilityLabel="Create crew assignment"
            >
              <Text style={styles.addIcon}>＋</Text>
            </Pressable>
          ) : (
            <Pressable onPress={resetForm} style={styles.cancelHeaderButton}>
              <Text style={styles.cancelHeaderText}>Cancel</Text>
            </Pressable>
          )}
        </View>

        {showAssignmentForm ? (
          <ScrollView
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.formIntroTitle}>
              {editingAssignment ? 'Edit assignment' : 'Assign crew member'}
            </Text>

            <Text style={styles.formIntro}>
              Select a handler and enter the flight and shift details.
            </Text>

            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>SELECT HANDLER</Text>

              {loading ? (
                <ActivityIndicator color={RED} />
              ) : handlers.length === 0 ? (
                <Text style={styles.helperText}>
                  No approved handlers are currently available.
                </Text>
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowHandlerPicker((visible) => !visible)}
                    style={[
                      styles.selectedHandlerBox,
                      showHandlerPicker && styles.selectedHandlerBoxOpen,
                    ]}
                  >
                    {selectedHandler ? (
                      <>
                        <View style={styles.avatarSmall}>
                          <Text style={styles.avatarInitial}>
                            {(selectedHandler.displayName ||
                              selectedHandler.email ||
                              'H').charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.handlerInfo}>
                          <Text style={styles.handlerName}>
                            {selectedHandler.displayName ||
                              selectedHandler.email ||
                              'Selected handler'}
                          </Text>
                          <Text style={styles.helperText}>
                            {selectedHandler.email || 'Approved handler'}
                          </Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.handlerInfo}>
                        <Text style={styles.handlerPlaceholder}>
                          Choose an approved handler
                        </Text>
                      </View>
                    )}

                    <Text style={styles.pickerChevron}>
                      {showHandlerPicker ? '⌃' : '⌄'}
                    </Text>
                  </Pressable>

                  {showHandlerPicker && (
                    <View style={styles.handlerPicker}>
                      <TextInput
                        value={handlerSearch}
                        onChangeText={setHandlerSearch}
                        placeholder="Search handlers by name or email"
                        placeholderTextColor="#9299A0"
                        autoCapitalize="none"
                        style={styles.pickerSearch}
                      />

                      <ScrollView
                        style={styles.handlerPickerList}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                      >
                        {availableHandlers.length === 0 ? (
                          <Text style={styles.pickerEmpty}>
                            No handlers match your search.
                          </Text>
                        ) : (
                          availableHandlers.map((handler) => {
                            const name =
                              handler.displayName ||
                              handler.email ||
                              'Name not provided';

                            const selected =
                              selectedHandler?.uid === handler.uid;

                            return (
                              <Pressable
                                key={handler.uid}
                                onPress={() => {
                                  setSelectedHandler(handler);
                                  setShowHandlerPicker(false);
                                  setHandlerSearch('');
                                }}
                                style={[
                                  styles.handlerOption,
                                  selected && styles.selectedOption,
                                ]}
                              >
                                <View style={styles.avatarSmall}>
                                  <Text style={styles.avatarInitial}>
                                    {name.charAt(0).toUpperCase()}
                                  </Text>
                                </View>

                                <View style={styles.handlerInfo}>
                                  <Text style={styles.handlerName}>
                                    {name}
                                  </Text>
                                  <Text style={styles.helperText}>
                                    {handler.email || 'Email not available'}
                                  </Text>
                                </View>

                                <Text style={styles.check}>
                                  {selected ? '✓' : '○'}
                                </Text>
                              </Pressable>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  )}
                </>
              )}

              {isAdmin && (
                <>
                  <Text style={styles.fieldLabel}>ASSIGNMENT OWNER</Text>

                  <Pressable
                    onPress={() => setSelectedSupervisorUid(ADMIN_UID)}
                    style={[
                      styles.handlerOption,
                      selectedSupervisorUid === ADMIN_UID &&
                        styles.selectedOption,
                    ]}
                  >
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarInitial}>G</Text>
                    </View>

                    <View style={styles.handlerInfo}>
                      <Text style={styles.handlerName}>Gloria</Text>
                      <Text style={styles.helperText}>Administrator</Text>
                    </View>

                    <Text style={styles.check}>
                      {selectedSupervisorUid === ADMIN_UID ? '✓' : '○'}
                    </Text>
                  </Pressable>

                  {supervisors.map((supervisor) => {
                    const name =
                      supervisor.displayName ||
                      supervisor.email ||
                      'Supervisor';

                    const selected =
                      selectedSupervisorUid === supervisor.uid;

                    return (
                      <Pressable
                        key={supervisor.uid}
                        onPress={() =>
                          setSelectedSupervisorUid(supervisor.uid)
                        }
                        style={[
                          styles.handlerOption,
                          selected && styles.selectedOption,
                        ]}
                      >
                        <View style={styles.avatarSmall}>
                          <Text style={styles.avatarInitial}>
                            {name.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.handlerInfo}>
                          <Text style={styles.handlerName}>{name}</Text>
                          <Text style={styles.helperText}>
                            {supervisor.email || 'Approved supervisor'}
                          </Text>
                        </View>

                        <Text style={styles.check}>
                          {selected ? '✓' : '○'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}

              <View style={styles.fieldDivider} />

              <Text style={styles.fieldLabel}>FLIGHT</Text>
              <Pressable
                onPress={() => setShowFlightPicker((open) => !open)}
                style={[styles.handlerOption, styles.flightSelector]}
                accessibilityRole="button"
                accessibilityLabel="Select a flight"
              >
                <View style={styles.handlerInfo}>
                  <Text style={styles.handlerName}>
                    {flightNumber || 'Select an upcoming flight'}
                  </Text>
                  <Text style={styles.helperText}>
                    {(() => {
                      if (!flightNumber) {
                        return 'Sets the shift date to the departure date';
                      }
                      const match = flightsData.find(
                        (flight) =>
                          flight.flightNumber === flightNumber &&
                          flight.departureDate === shiftDate
                      );
                      return match
                        ? `${match.origin} → ${match.destination} · ${match.departureDate} ${match.departureTime}`
                        : 'Current flight on this assignment';
                    })()}
                  </Text>
                </View>

                <Text style={styles.check}>
                  {showFlightPicker ? '⌃' : '⌄'}
                </Text>
              </Pressable>

              {showFlightPicker && (
                <View style={styles.flightPickerList}>
                  {upcomingFlights().length === 0 ? (
                    <Text style={styles.helperText}>
                      No upcoming flights. Create one on the Flights screen
                      first.
                    </Text>
                  ) : (
                    upcomingFlights().map((flight) => {
                      const selected =
                        flight.flightNumber === flightNumber &&
                        flight.departureDate === shiftDate;

                      return (
                        <Pressable
                          key={flight.id}
                          onPress={() => selectFlight(flight)}
                          style={[
                            styles.handlerOption,
                            selected && styles.selectedOption,
                          ]}
                        >
                          <View style={styles.handlerInfo}>
                            <Text style={styles.handlerName}>
                              {flight.flightNumber}
                            </Text>
                            <Text style={styles.helperText}>
                              {flight.origin} → {flight.destination} ·{' '}
                              {flight.departureDate}{' '}
                              {flight.departureTime || '—'}
                            </Text>
                          </View>

                          <Text style={styles.check}>
                            {selected ? '✓' : '○'}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}

              <Text style={styles.fieldLabel}>SHIFT DATE</Text>
              <DateTimeField
                mode="date"
                style={styles.input}
                value={shiftDate}
                onChange={setShiftDate}
                // Past dates are blocked for new assignments only.
                minimumDate={
                  editingAssignment ? undefined : toDateString(new Date())
                }
              />

              <View style={styles.shiftRow}>
                <View style={styles.shiftField}>
                  <Text style={styles.fieldLabel}>SHIFT START (24-HOUR)</Text>
                  <DateTimeField
                    mode="time"
                    style={styles.input}
                    value={shiftStart}
                    onChange={(value) => changeShiftTimes(value, shiftEnd)}
                    placeholder="Start time"
                  />
                </View>

                <View style={styles.shiftField}>
                  <Text style={styles.fieldLabel}>SHIFT END (24-HOUR)</Text>
                  <DateTimeField
                    mode="time"
                    style={styles.input}
                    value={shiftEnd}
                    onChange={(value) => changeShiftTimes(shiftStart, value)}
                    placeholder="End time"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>
                BAGGAGE-HANDLING ACTIVITY
              </Text>

              {ACTIVITIES.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setActivity(item)}
                  style={[
                    styles.activityOption,
                    activity === item && styles.selectedOption,
                  ]}
                >
                  <Text
                    style={[
                      styles.activityText,
                      activity === item && styles.selectedActivityText,
                    ]}
                  >
                    {activity === item ? '●' : '○'} {item}
                  </Text>
                </Pressable>
              ))}
            </View>

            {selectedHandler && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Assignment preview</Text>

                <Text style={styles.previewText}>
                  Handler: {selectedHandler.displayName ||
                    selectedHandler.email}
                </Text>

                <Text style={styles.previewText}>
                  Flight: {flightNumber.trim().toUpperCase() || 'Not entered'}
                </Text>

                <Text style={styles.previewText}>
                  Shift: {shiftDate || 'Not entered'} · {shiftTime || 'Not entered'}
                </Text>

                <Text style={styles.previewText}>Activity: {activity}</Text>

                {isAdmin && (
                  <Text style={styles.previewText}>
                    Owner: {getSupervisorName(selectedSupervisorUid)}
                  </Text>
                )}
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              onPress={() => void saveAssignment()}
              disabled={saving || loading || handlers.length === 0}
              style={[
                styles.primaryButton,
                (saving || loading || handlers.length === 0) &&
                  styles.disabledButton,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {editingAssignment ? 'Save changes' : 'Create assignment'}
                </Text>
              )}
            </Pressable>

            {editingAssignment && (
              <Pressable onPress={resetForm} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Stop editing</Text>
              </Pressable>
            )}

            <View style={styles.savedHeader}>
              <Text style={styles.sectionTitle}>Current assignments</Text>
              <Text style={styles.countText}>{assignments.length}</Text>
            </View>

            {assignments.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.helperText}>No assignments found.</Text>
              </View>
            ) : (
              assignments.map((assignment) => (
                <View key={assignment.id} style={styles.assignmentCard}>
                  <View style={styles.assignmentTop}>
                    <View>
                      <Text style={styles.fieldLabel}>FLIGHT</Text>
                      <Text style={styles.flightTitle}>
                        {assignment.flightNumber}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.assignmentStatus,
                        assignment.status === 'Cancelled' &&
                          styles.cancelledStatus,
                      ]}
                    >
                      <Text style={styles.assignmentStatusText}>
                        {assignment.status}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.assignmentName}>
                    {assignment.handlerName}
                  </Text>

                  <Text style={styles.helperText}>
                    {assignment.shiftDate} · {assignment.shiftTime}
                  </Text>

                  <Text style={styles.assignmentActivity}>
                    {assignment.activity}
                  </Text>

                  {isAdmin && (
                    <Text style={styles.helperText}>
                      Owner: {getSupervisorName(assignment.supervisorUid)}
                    </Text>
                  )}

                  {canManage(assignment) &&
                    assignment.status !== 'Cancelled' &&
                    assignment.status !== 'Completed' && (
                      <View style={styles.actionRow}>
                        <Pressable
                          onPress={() => startEditing(assignment)}
                          style={styles.editButton}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => void cancelAssignment(assignment)}
                          style={styles.cancelButton}
                        >
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </Pressable>
                      </View>
                    )}
                </View>
              ))
            )}
          </ScrollView>
        ) : (
          <>
            {/* STATUS FILTERS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterContent}
            >
              {(['All', 'Assigned', 'Unassigned'] as Filter[]).map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => setActiveFilter(filter)}
                  style={[
                    styles.filterChip,
                    activeFilter === filter && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      activeFilter === filter && styles.filterTextActive,
                    ]}
                  >
                    {filter} ({counts[filter]})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* SEARCH */}
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>⌕</Text>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or ID..."
                placeholderTextColor="#9299A0"
                style={styles.searchInput}
                autoCapitalize="none"
              />

              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <Text style={styles.clearSearch}>×</Text>
                </Pressable>
              )}
            </View>

            {/* CREW REGISTER */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator color={RED} size="large" />
                  <Text style={styles.helperText}>Loading crew...</Text>
                </View>
              ) : filteredHandlers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No crew members found</Text>
                  <Text style={styles.helperText}>
                    Try another search or status filter.
                  </Text>
                </View>
              ) : (
                filteredHandlers.map((handler) => {
                  const name =
                    handler.displayName ||
                    handler.email ||
                    'Name not provided';

                  const onDuty = onDutyUids.has(handler.uid);

                  return (
                    <Pressable
                      key={handler.uid}
                      onPress={() => openAssignmentForm(handler)}
                      style={({ pressed }) => [
                        styles.crewRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.photoPlaceholder}>
                        <Text style={styles.photoInitial}>
                          {name.charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.crewInfo}>
                        <Text style={styles.crewName} numberOfLines={1}>
                          {name}
                        </Text>

                        <Text style={styles.crewMeta} numberOfLines={1}>
                          {handler.email || 'Handler'}
                          {' · Handler'}
                        </Text>
                      </View>

                      <View style={styles.dutyStatus}>
                        <View
                          style={[
                            styles.dutyDot,
                            !onDuty && styles.offDutyDot,
                          ]}
                        />

                        <Text style={styles.dutyText}>
                          {onDuty ? 'Assigned' : 'Unassigned'}
                        </Text>
                      </View>

                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  );
                })
              )}

              <View style={{ height: 105 }} />
            </ScrollView>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 19,
    backgroundColor: '#FFFFFF',
  },

  /* HEADER */
  header: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  backButton: {
    width: 27,
    height: 42,
    justifyContent: 'center',
  },

  backIcon: {
    color: DARK,
    fontSize: 37,
    lineHeight: 40,
    fontWeight: '300',
  },

  heading: {
    flex: 1,
    color: DARK,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  addButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addIcon: {
    color: DARK,
    fontSize: 32,
    fontWeight: '300',
  },

  cancelHeaderButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  cancelHeaderText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },

  /* FILTERS */
  filterScroll: {
    flexGrow: 0,
    maxHeight: 53,
    marginTop: 9,
    marginBottom: 11,
  },

  filterContent: {
    alignItems: 'center',
    gap: 8,
    paddingRight: 5,
  },

  filterChip: {
    minHeight: 39,
    borderRadius: 22,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },

  filterChipActive: {
    backgroundColor: '#FCECEF',
    borderColor: RED,
  },

  filterText: {
    color: DARK,
    fontSize: 12,
    fontWeight: '700',
  },

  filterTextActive: {
    color: RED,
    fontWeight: '900',
  },

  /* SEARCH */
  searchBar: {
    height: 46,
    backgroundColor: '#EFF0F2',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 3,
    marginBottom: 16,
  },

  searchIcon: {
    color: DARK,
    fontSize: 26,
    marginRight: 9,
  },

  searchInput: {
    flex: 1,
    color: DARK,
    fontSize: 12,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,

  clearSearch: {
    color: MUTED,
    fontSize: 23,
    paddingHorizontal: 4,
  },

  /* CREW LIST */
  list: {
    flex: 1,
  },

  listContent: {
    paddingTop: 2,
    paddingBottom: 20,
  },

  crewRow: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F2',
    paddingVertical: 12,
  },

  photoPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 30,
    backgroundColor: '#ECEDEF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E3E5E7',
  },

  photoInitial: {
    color: '#737A82',
    fontSize: 21,
    fontWeight: '800',
  },

  crewInfo: {
    flex: 1,
    minWidth: 0,
  },

  crewName: {
    color: DARK,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.3,
  },

  crewMeta: {
    color: MUTED,
    fontSize: 11,
    marginTop: 5,
  },

  dutyStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  dutyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: GREEN,
  },

  offDutyDot: {
    backgroundColor: '#AEB3B8',
  },

  dutyText: {
    color: DARK,
    fontSize: 11,
    fontWeight: '600',
  },

  chevron: {
    color: '#515960',
    fontSize: 25,
    marginLeft: 1,
  },

  pressed: {
    opacity: 0.65,
  },

  emptyState: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  emptyTitle: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
  },

  /* ASSIGNMENT FORM */
  formContent: {
    paddingTop: 14,
    paddingBottom: 135,
  },

  formIntroTitle: {
    color: DARK,
    fontSize: 22,
    fontWeight: '900',
  },

  formIntro: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 17,
  },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
  },

  fieldLabel: {
    color: DARK,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginTop: 13,
    marginBottom: 8,
  },

  selectedHandlerBox: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDE0E4',
    borderRadius: 9,
    padding: 10,
    backgroundColor: '#FFFFFF',
  },

  selectedHandlerBoxOpen: {
    borderColor: RED,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  handlerPlaceholder: {
    color: '#9299A0',
    fontSize: 12,
  },

  pickerChevron: {
    color: DARK,
    fontSize: 20,
    paddingHorizontal: 5,
  },

  handlerPicker: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: RED,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    padding: 9,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },

  pickerSearch: {
    height: 40,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 7,
    paddingHorizontal: 10,
    color: DARK,
    fontSize: 11,
    outlineStyle: 'none',
  } as any,

  handlerPickerList: {
    maxHeight: 220,
    marginTop: 8,
  },

  pickerEmpty: {
    color: MUTED,
    fontSize: 11,
    padding: 12,
    textAlign: 'center',
  },

  shiftRow: {
    flexDirection: 'row',
    gap: 12,
  },

  shiftField: {
    flex: 1,
    minWidth: 0,
  },

  handlerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 9,
    padding: 9,
    marginBottom: 8,
  },

  flightSelector: {
    marginBottom: 8,
  },

  flightPickerList: {
    marginBottom: 8,
  },

  selectedOption: {
    borderColor: RED,
    backgroundColor: '#FFF3F5',
  },

  avatarSmall: {
    width: 37,
    height: 37,
    borderRadius: 20,
    backgroundColor: '#F1E6E8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarInitial: {
    color: RED,
    fontSize: 15,
    fontWeight: '900',
  },

  handlerInfo: {
    flex: 1,
    marginLeft: 10,
  },

  handlerName: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
  },

  check: {
    color: RED,
    fontSize: 19,
    fontWeight: '900',
  },

  helperText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
  },

  fieldDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 17,
  },

  input: {
    height: 45,
    borderWidth: 1,
    borderColor: '#DDE0E4',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: DARK,
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    marginBottom: 8,
    outlineStyle: 'none',
    minWidth: 0,
  } as any,

  activityOption: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 11,
    marginBottom: 7,
  },

  activityText: {
    color: DARK,
    fontSize: 11,
  },

  selectedActivityText: {
    color: RED,
    fontWeight: '800',
  },

  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    padding: 14,
    marginTop: 13,
  },

  previewTitle: {
    color: DARK,
    fontWeight: '900',
    fontSize: 13,
    marginBottom: 6,
  },

  previewText: {
    color: MUTED,
    fontSize: 11,
    marginTop: 5,
  },

  primaryButton: {
    minHeight: 47,
    borderRadius: 9,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  disabledButton: {
    opacity: 0.55,
  },

  secondaryButton: {
    padding: 12,
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: MUTED,
    fontWeight: '700',
    fontSize: 12,
  },

  errorText: {
    color: '#B42318',
    fontSize: 12,
    marginVertical: 10,
  },

  /* SAVED ASSIGNMENTS */
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 25,
    marginBottom: 12,
  },

  sectionTitle: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
  },

  countText: {
    color: RED,
    fontWeight: '900',
    fontSize: 12,
  },

  emptyBox: {
    padding: 15,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
  },

  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    padding: 14,
    marginBottom: 10,
  },

  assignmentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  flightTitle: {
    color: DARK,
    fontSize: 20,
    fontWeight: '900',
  },

  assignmentStatus: {
    backgroundColor: '#E7F4E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
  },

  cancelledStatus: {
    backgroundColor: '#FCE8E8',
  },

  assignmentStatusText: {
    color: DARK,
    fontSize: 10,
    fontWeight: '800',
  },

  assignmentName: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },

  assignmentActivity: {
    color: RED,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 9,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 13,
  },

  editButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 8,
    padding: 9,
    alignItems: 'center',
  },

  editButtonText: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
  },

  cancelButton: {
    flex: 1,
    backgroundColor: '#FCE8E8',
    borderRadius: 8,
    padding: 9,
    alignItems: 'center',
  },

  cancelButtonText: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '800',
  },
});