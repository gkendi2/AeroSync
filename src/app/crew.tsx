
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
import { useEffect, useRef, useState } from 'react';
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

export default function CrewScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.uid === ADMIN_UID;

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);

  const [selectedHandler, setSelectedHandler] =
    useState<Handler | null>(null);

  const [selectedSupervisorUid, setSelectedSupervisorUid] =
    useState(ADMIN_UID);

  const [flightNumber, setFlightNumber] = useState('');
  const [shiftDate, setShiftDate] = useState('');
  const [shiftTime, setShiftTime] = useState('');
  const [activity, setActivity] = useState(ACTIVITIES[0]);

  const [editingAssignment, setEditingAssignment] =
    useState<CrewAssignment | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentUser) {
      setError('Please sign in to manage crew assignments.');
      setLoading(false);
      return;
    }

    const handlersQuery = query(
      collection(db, 'users'),
      where('role', '==', 'handler'),
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
              b.displayName || b.email || '',
            ),
          );

        setHandlers(results);
        setLoading(false);
      },
      (err) => {
        console.error('Handler loading error:', err);
        setError('Unable to load approved handlers.');
        setLoading(false);
      },
    );

    let unsubscribeSupervisors: (() => void) | undefined;

    if (isAdmin) {
      const supervisorsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'supervisor'),
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
                  supervisor.email?.trim().toLowerCase() !== adminEmail),
            );

          setSupervisors(results);
        },
        (err) => {
          console.error('Supervisor loading error:', err);
          setError('Unable to load approved supervisors.');
        },
      );
    }

    const assignmentsQuery = isAdmin
      ? collection(db, 'CrewAssignments')
      : query(
          collection(db, 'CrewAssignments'),
          where('supervisorUid', '==', currentUser.uid),
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
            `${b.shiftDate} ${b.shiftTime}`,
          ),
        );

        setAssignments(results);
      },
      (err) => {
        console.error('Assignment loading error:', err);
        setError('Unable to load assignments. Check Firestore rules.');
      },
    );

    return () => {
      unsubscribeHandlers();
      unsubscribeSupervisors?.();
      unsubscribeAssignments();
    };
  }, [currentUser?.uid, isAdmin]);

  function resetForm() {
    setSelectedHandler(null);
    setFlightNumber('');
    setShiftDate('');
    setShiftTime('');
    setActivity(ACTIVITIES[0]);
    setEditingAssignment(null);
    setSelectedSupervisorUid(ADMIN_UID);
  }

  function startEditing(assignment: CrewAssignment) {
    setEditingAssignment(assignment);

    const handler = handlers.find(
      (item) => item.uid === assignment.handlerUid,
    );

    setSelectedHandler(
      handler || {
        uid: assignment.handlerUid,
        displayName: assignment.handlerName,
        role: 'handler',
      },
    );

    setFlightNumber(assignment.flightNumber);
    setShiftDate(assignment.shiftDate);
    setShiftTime(assignment.shiftTime);
    setActivity(assignment.activity);

    if (isAdmin) {
      setSelectedSupervisorUid(
        assignment.supervisorUid || ADMIN_UID,
      );
    }

    setError('');

    scrollViewRef.current?.scrollTo({
      y: 0,
      animated: true,
    });
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

    if (
      !flightNumber.trim() ||
      !shiftDate.trim() ||
      !shiftTime.trim()
    ) {
      Alert.alert(
        'Missing details',
        'Enter the flight number, shift date and shift time.',
      );
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate.trim())) {
      Alert.alert(
        'Invalid date',
        'Use YYYY-MM-DD, for example 2026-11-05.',
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
          },
        );

        Alert.alert(
          'Assignment updated',
          'The assignment has been updated successfully.',
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
          'The crew assignment has been saved.',
        );
      }

      resetForm();
    } catch (err) {
      console.error('Assignment save error:', err);

      Alert.alert(
        'Unable to save',
        'The assignment could not be saved. Check your Firestore rules and try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelAssignment(assignment: CrewAssignment) {
    if (!currentUser) return;

    const performCancellation = async () => {
      try {
        console.log('--- CANCELLATION DEBUG ---');
        console.log('Current UID:', currentUser.uid);
        console.log('Admin UID:', ADMIN_UID);
        console.log('Is admin:', currentUser.uid === ADMIN_UID);
        console.log('Assignment ID:', assignment.id);
        console.log('Assignment status:', assignment.status);
        console.log('Supervisor UID:', assignment.supervisorUid);
        console.log('Handler UID:', assignment.handlerUid);

        await updateDoc(
          doc(db, 'CrewAssignments', assignment.id),
          {
            status: 'Cancelled',
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp(),
          },
        );

        console.log('Cancellation successful.');

        Alert.alert(
          'Assignment cancelled',
          `${assignment.flightNumber} has been cancelled.`,
        );
      } catch (err: any) {
        console.error('--- CANCELLATION FAILED ---');
        console.error('Error code:', err?.code);
        console.error('Error message:', err?.message);
        console.error('Full error:', err);

        Alert.alert(
          'Unable to cancel',
          `Error: ${err?.code || 'Unknown'}\n${err?.message || 'No error message available'}`,
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
      ],
    );
  }

  const activeAssignments = assignments.filter(
    (item) => item.status !== 'Cancelled',
  );

  const canManage = (assignment: CrewAssignment) =>
    isAdmin || assignment.supervisorUid === currentUser?.uid;

  const selectedHandlerName =
    selectedHandler?.displayName ||
    selectedHandler?.email ||
    'No handler selected';

  const getSupervisorName = (uid?: string) => {
    if (!uid || uid === ADMIN_UID) return 'Gloria (Administrator)';

    const supervisor = supervisors.find((item) => item.uid === uid);

    return (
      supervisor?.displayName ||
      supervisor?.email ||
      'Supervisor'
    );
  };

  return (

    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onBack} disabled={!onBack}>
          <Text style={styles.backText}>← Dashboard</Text>
        </Pressable>

        <Text style={styles.eyebrow}>SUPERVISOR OPERATIONS</Text>
        <Text style={styles.heading}>Crew coordination</Text>
        <Text style={styles.subtitle}>
          Manage handlers, flight assignments and baggage-handling shifts.
        </Text>

        <View style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>
            {isAdmin ? 'Administrator overview' : 'Team overview'}
          </Text>

          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricNumber}>{handlers.length}</Text>
              <Text style={styles.metricLabel}>Approved handlers</Text>
            </View>

            <View style={styles.metric}>
              <Text style={styles.metricNumber}>
                {activeAssignments.length}
              </Text>
              <Text style={styles.metricLabel}>Active assignments</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionNumber}>1</Text>
          <View style={styles.sectionHeadingText}>
            <Text style={styles.sectionTitle}>
              {editingAssignment ? 'Edit assignment' : 'Select a handler'}
            </Text>
            <Text style={styles.muted}>
              Choose the approved crew member for the task.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator color={RED} />
          ) : handlers.length === 0 ? (
            <Text style={styles.muted}>
              No approved handlers are currently available.
            </Text>
          ) : (
            handlers.map((handler) => {
              const selected = selectedHandler?.uid === handler.uid;
              const name =
                handler.displayName ||
                handler.email ||
                'Name not provided';

              return (
                <Pressable
                  key={handler.uid}
                  onPress={() => setSelectedHandler(handler)}
                  style={[
                    styles.handlerOption,
                    selected && styles.selectedOption,
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {name.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.handlerInfo}>
                    <Text style={styles.handlerName}>{name}</Text>
                    <Text style={styles.muted}>
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
        </View>

        {isAdmin && (
          <>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionNumber}>2</Text>
              <View style={styles.sectionHeadingText}>
                <Text style={styles.sectionTitle}>Assignment owner</Text>
                <Text style={styles.muted}>
                  Select which supervisor will manage this assignment.
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Pressable
                onPress={() => setSelectedSupervisorUid(ADMIN_UID)}
                style={[
                  styles.handlerOption,
                  selectedSupervisorUid === ADMIN_UID &&
                    styles.selectedOption,
                ]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>G</Text>
                </View>

                <View style={styles.handlerInfo}>
                  <Text style={styles.handlerName}>Gloria</Text>
                  <Text style={styles.muted}>Administrator</Text>
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
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.handlerInfo}>
                      <Text style={styles.handlerName}>{name}</Text>
                      <Text style={styles.muted}>
                        {supervisor.email || 'Approved supervisor'}
                      </Text>
                    </View>

                    <Text style={styles.check}>
                      {selected ? '✓' : '○'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionNumber}>{isAdmin ? '3' : '2'}</Text>
          <View style={styles.sectionHeadingText}>
            <Text style={styles.sectionTitle}>Assignment details</Text>
            <Text style={styles.muted}>
              Enter the flight, shift and activity.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>FLIGHT NUMBER</Text>
          <TextInput
            value={flightNumber}
            onChangeText={setFlightNumber}
            placeholder="e.g. KQ100"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>SHIFT DATE</Text>
          <TextInput
            value={shiftDate}
            onChangeText={setShiftDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>SHIFT TIME</Text>
          <TextInput
            value={shiftTime}
            onChangeText={setShiftTime}
            placeholder="06:00-14:00"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>BAGGAGE-HANDLING ACTIVITY</Text>

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
                {activity === item ? '●' : '○'}  {item}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedHandler && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Assignment preview</Text>
            <Text style={styles.previewText}>
              Handler: {selectedHandlerName}
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

        <Pressable
          onPress={() => void saveAssignment()}
          disabled={saving || loading || handlers.length === 0}
          style={[
            styles.saveButton,
            (saving || loading || handlers.length === 0) &&
              styles.disabledButton,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {editingAssignment ? 'Save changes' : 'Create assignment'}
            </Text>
          )}
        </Pressable>

        {editingAssignment && (
          <Pressable onPress={resetForm} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Stop editing</Text>
          </Pressable>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.savedHeader}>
          <View>
            <Text style={styles.sectionTitle}>Current assignments</Text>
            <Text style={styles.muted}>
              Assignments saved in Firestore.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countText}>{assignments.length}</Text>
          </View>
        </View>

        {assignments.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.muted}>No assignments found.</Text>
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
                    styles.statusBadge,
                    assignment.status === 'Cancelled' &&
                      styles.cancelledBadge,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {assignment.status}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <Text style={styles.assignmentName}>
                {assignment.handlerName}
              </Text>

              <Text style={styles.assignmentDetail}>
                {assignment.shiftDate} · {assignment.shiftTime}
              </Text>

              <Text style={styles.assignmentActivity}>
                {assignment.activity}
              </Text>

              {isAdmin && (
                <Text style={styles.ownerText}>
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

        <Text style={styles.footer}>
          AeroSync · Ground crew coordination
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const RED = '#C8102E';
const DARK = '#292929';
const BG = '#F5F5F5';
const MUTED = '#707070';
const BORDER = '#E5E5E5';

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
  backText: {
    color: RED,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 20,
  },
  eyebrow: {
    color: RED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heading: {
    color: DARK,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 5,
  },
  subtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },
  overviewCard: {
    backgroundColor: DARK,
    borderRadius: 17,
    padding: 19,
    marginBottom: 25,
  },
  overviewTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  metrics: {
    flexDirection: 'row',
    marginTop: 18,
  },
  metric: {
    flex: 1,
  },
  metricNumber: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  metricLabel: {
    color: '#DDDDDD',
    fontSize: 11,
    marginTop: 3,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: RED,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
    fontWeight: '800',
  },
  sectionHeadingText: {
    flex: 1,
    marginLeft: 10,
  },
  sectionTitle: {
    color: DARK,
    fontSize: 17,
    fontWeight: '800',
  },
  muted: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 14,
    marginBottom: 17,
  },
  handlerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    padding: 10,
    marginBottom: 8,
  },
  selectedOption: {
    borderColor: RED,
    backgroundColor: '#FFF1F3',
  },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: '#F5E5E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: RED,
    fontWeight: '800',
    fontSize: 15,
  },
  handlerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  handlerName: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },
  check: {
    color: RED,
    fontSize: 19,
    fontWeight: '800',
  },
  fieldLabel: {
    color: DARK,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5D5D5',
    borderRadius: 10,
    padding: 12,
    color: DARK,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    marginBottom: 14,
  },
  activityOption: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  activityText: {
    color: DARK,
    fontSize: 12,
  },
  selectedActivityText: {
    color: RED,
    fontWeight: '700',
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 15,
    marginBottom: 15,
  },
  previewTitle: {
    color: DARK,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 8,
  },
  previewText: {
    color: MUTED,
    fontSize: 12,
    marginTop: 5,
  },
  saveButton: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.5,
  },
  secondaryButton: {
    padding: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  secondaryButtonText: {
    color: MUTED,
    fontWeight: '700',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    marginVertical: 10,
  },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15,
    marginBottom: 12,
  },
  countBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5E5E8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    color: RED,
    fontWeight: '800',
  },
  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 15,
    marginBottom: 11,
  },
  assignmentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flightTitle: {
    color: DARK,
    fontSize: 22,
    fontWeight: '800',
  },
  statusBadge: {
    backgroundColor: '#E8F5EC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  cancelledBadge: {
    backgroundColor: '#FCE8E8',
  },
  statusText: {
    color: DARK,
    fontSize: 10,
    fontWeight: '800',
  },
  cardDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 12,
  },
  assignmentName: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  assignmentDetail: {
    color: MUTED,
    fontSize: 11,
    marginTop: 4,
  },
  assignmentActivity: {
    color: RED,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
  },
  ownerText: {
    color: MUTED,
    fontSize: 10,
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  editButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 9,
    padding: 10,
    alignItems: 'center',
  },
  editButtonText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#FCE8E8',
    borderRadius: 9,
    padding: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    color: MUTED,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 25,
  },
});
