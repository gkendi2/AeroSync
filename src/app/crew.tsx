import { auth, db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
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

type Handler = {
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
};

const NAVY = '#163B65';
const BLUE = '#2878C8';
const BG = '#F4F6FA';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16805C';
const ORANGE = '#C96A16';

const ACTIVITIES = [
  'Loading baggage',
  'Offloading baggage',
  'Baggage transfer',
  'Baggage reconciliation',
];

export default function CrewScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);
  const [selectedHandler, setSelectedHandler] =
    useState<Handler | null>(null);

  const [flightNumber, setFlightNumber] = useState('');
  const [shiftDate, setShiftDate] = useState('');
  const [shiftTime, setShiftTime] = useState('');
  const [activity, setActivity] = useState(ACTIVITIES[0]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
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
      (snapshotError) => {
        console.error('Could not load handlers:', snapshotError);
        setError(
          'Unable to load handlers. Check your connection and permissions.',
        );
        setLoading(false);
      },
    );

    const unsubscribeAssignments = onSnapshot(
      collection(db, 'CrewAssignments'),
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
          };
        });

        results.sort((a, b) =>
          `${a.shiftDate} ${a.shiftTime}`.localeCompare(
            `${b.shiftDate} ${b.shiftTime}`,
          ),
        );

        setAssignments(results);
      },
      (snapshotError) => {
        console.error('Could not load assignments:', snapshotError);
        setError(
          'Could not load assignments. Check the CrewAssignments Firestore rules.',
        );
      },
    );

    return () => {
      unsubscribeHandlers();
      unsubscribeAssignments();
    };
  }, []);

  async function saveAssignment() {
    if (!auth.currentUser) {
      Alert.alert('Sign-in required', 'Please sign in again.');
      return;
    }

    if (!selectedHandler) {
      Alert.alert(
        'Select a handler',
        'Choose an approved handler first.',
      );
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
        'Check the date',
        'Use YYYY-MM-DD, for example 2026-10-16.',
      );
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'CrewAssignments'), {
        handlerUid: selectedHandler.uid,
        handlerName:
          selectedHandler.displayName ||
          selectedHandler.email ||
          'Approved handler',
        flightNumber: flightNumber.trim().toUpperCase(),
        shiftDate: shiftDate.trim(),
        shiftTime: shiftTime.trim(),
        activity,
        status: 'Assigned',
        assignedBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setFlightNumber('');
      setShiftDate('');
      setShiftTime('');
      setSelectedHandler(null);
      setActivity(ACTIVITIES[0]);

      Alert.alert(
        'Assignment saved',
        'The crew assignment has been created.',
      );
    } catch (saveError) {
      console.error('Could not save assignment:', saveError);

      Alert.alert(
        'Could not save assignment',
        'Check that the CrewAssignments Firestore rules have been added and published, then try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmSave() {
    if (Platform.OS === 'web') {
      void saveAssignment();
      return;
    }

    Alert.alert(
      'Create assignment?',
      `Assign ${
        selectedHandler?.displayName ||
        selectedHandler?.email ||
        'the selected handler'
      } to ${flightNumber.trim().toUpperCase()}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Save assignment',
          onPress: () => void saveAssignment(),
        },
      ],
    );
  }

  const selectedHandlerName =
    selectedHandler?.displayName ||
    selectedHandler?.email ||
    'No handler selected';

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
            <Text style={styles.backText}>← Dashboard</Text>
          </Pressable>

          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>
                SUPERVISOR OPERATIONS
              </Text>

              <Text style={styles.heading}>
                Crew coordination
              </Text>

              <Text style={styles.subtitle}>
                Organise handlers, flights and baggage-handling
                shifts from one place.
              </Text>
            </View>

            <View style={styles.headerIcon}>
              <Text style={styles.headerIconText}>♧</Text>
            </View>
          </View>
        </View>

        {/* Live overview */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewTop}>
            <View>
              <Text style={styles.overviewEyebrow}>
                CREW OVERVIEW
              </Text>

              <Text style={styles.overviewTitle}>
                Live workforce
              </Text>
            </View>

            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.overviewMetrics}>
            <View style={styles.metric}>
              <Text style={styles.metricNumber}>
                {handlers.length}
              </Text>

              <Text style={styles.metricLabel}>
                Approved handlers
              </Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metric}>
              <Text style={styles.metricNumber}>
                {assignments.length}
              </Text>

              <Text style={styles.metricLabel}>
                Saved assignments
              </Text>
            </View>
          </View>
        </View>

        {/* Step 1 */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>1</Text>
          </View>

          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>
              Select a handler
            </Text>

            <Text style={styles.sectionSubtitle}>
              Choose the approved crew member for this task.
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={BLUE} />
              <Text style={styles.loadingLabel}>
                Loading approved handlers...
              </Text>
            </View>
          ) : handlers.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>♧</Text>
              </View>

              <Text style={styles.emptyTitle}>
                No approved handlers
              </Text>

              <Text style={styles.muted}>
                Approve a handler application before creating
                an assignment.
              </Text>
            </View>
          ) : (
            <View style={styles.handlerList}>
              {handlers.map((handler) => {
                const selected =
                  selectedHandler?.uid === handler.uid;

                const handlerName =
                  handler.displayName ||
                  handler.email ||
                  'Name not provided';

                return (
                  <Pressable
                    key={handler.uid}
                    onPress={() => setSelectedHandler(handler)}
                    style={({ pressed }) => [
                      styles.handlerOption,
                      selected && styles.handlerOptionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.avatar,
                        selected && styles.avatarSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          selected && styles.avatarTextSelected,
                        ]}
                      >
                        {handlerName
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.handlerInfo}>
                      <Text style={styles.handlerName}>
                        {handlerName}
                      </Text>

                      <Text style={styles.muted}>
                        {handler.email ||
                          'Email not available'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.selectionIndicator,
                        selected &&
                          styles.selectionIndicatorSelected,
                      ]}
                    >
                      {selected && (
                        <Text
                          style={styles.selectionCheck}
                        >
                          ✓
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Selected handler */}
        {selectedHandler && (
          <View style={styles.selectedBanner}>
            <View style={styles.selectedBannerIcon}>
              <Text style={styles.selectedBannerIconText}>
                ✓
              </Text>
            </View>

            <View style={styles.selectedBannerInfo}>
              <Text style={styles.selectedBannerLabel}>
                ASSIGNING TO
              </Text>

              <Text style={styles.selectedBannerName}>
                {selectedHandlerName}
              </Text>
            </View>
          </View>
        )}

        {/* Step 2 */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>2</Text>
          </View>

          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>
              Assignment details
            </Text>

            <Text style={styles.sectionSubtitle}>
              Define where and when the handler will work.
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>FLIGHT NUMBER</Text>

          <TextInput
            value={flightNumber}
            onChangeText={setFlightNumber}
            placeholder="e.g. KQ100"
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            style={styles.input}
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>SHIFT DATE</Text>

              <TextInput
                value={shiftDate}
                onChangeText={setShiftDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>SHIFT TIME</Text>

              <TextInput
                value={shiftTime}
                onChangeText={setShiftTime}
                placeholder="06:00-14:00"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>
            BAGGAGE-HANDLING ACTIVITY
          </Text>

          <View style={styles.activityGrid}>
            {ACTIVITIES.map((item) => {
              const selected = activity === item;

              return (
                <Pressable
                  key={item}
                  onPress={() => setActivity(item)}
                  style={({ pressed }) => [
                    styles.activityOption,
                    selected && styles.activitySelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.activityRadio,
                      selected &&
                        styles.activityRadioSelected,
                    ]}
                  >
                    {selected && (
                      <View style={styles.activityRadioDot} />
                    )}
                  </View>

                  <Text
                    style={[
                      styles.activityText,
                      selected &&
                        styles.activityTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Assignment preview */}
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.previewEyebrow}>
                ASSIGNMENT PREVIEW
              </Text>

              <Text style={styles.previewTitle}>
                Ready to assign
              </Text>
            </View>

            <View style={styles.previewIcon}>
              <Text style={styles.previewIconText}>✈</Text>
            </View>
          </View>

          <View style={styles.previewDivider} />

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>
              Handler
            </Text>

            <Text
              style={[
                styles.previewValue,
                !selectedHandler &&
                  styles.previewPlaceholder,
              ]}
            >
              {selectedHandlerName}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>
              Flight
            </Text>

            <Text
              style={[
                styles.previewValue,
                !flightNumber.trim() &&
                  styles.previewPlaceholder,
              ]}
            >
              {flightNumber.trim().toUpperCase() ||
                'Not entered'}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>
              Shift
            </Text>

            <Text
              style={[
                styles.previewValue,
                (!shiftDate.trim() ||
                  !shiftTime.trim()) &&
                  styles.previewPlaceholder,
              ]}
            >
              {shiftDate.trim() && shiftTime.trim()
                ? `${shiftDate.trim()} · ${shiftTime.trim()}`
                : 'Not entered'}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>
              Activity
            </Text>

            <Text style={styles.previewValue}>
              {activity}
            </Text>
          </View>
        </View>

        {/* Step 3 */}
        <View style={styles.sectionHeader}>
          <View style={styles.stepCircle}>
            <Text style={styles.stepNumber}>3</Text>
          </View>

          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>
              Create assignment
            </Text>

            <Text style={styles.sectionSubtitle}>
              Save the assignment and make it available to the
              handler.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={confirmSave}
          disabled={
            saving ||
            loading ||
            handlers.length === 0
          }
          style={({ pressed }) => [
            styles.saveButton,
            (saving ||
              loading ||
              handlers.length === 0) &&
              styles.saveButtonDisabled,
            pressed && !saving && styles.saveButtonPressed,
          ]}
        >
          {saving ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                Saving assignment...
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.saveButtonIcon}>+</Text>
              <Text style={styles.saveButtonText}>
                Create assignment
              </Text>
            </>
          )}
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>!</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Saved assignments */}
        <View style={styles.savedHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Current assignments
            </Text>

            <Text style={styles.sectionSubtitle}>
              Live assignments from Firestore
            </Text>
          </View>

          <View style={styles.savedCount}>
            <Text style={styles.savedCountText}>
              {assignments.length}
            </Text>
          </View>
        </View>

        {assignments.length === 0 ? (
          <View style={styles.emptyAssignments}>
            <View style={styles.emptyAssignmentsIcon}>
              <Text style={styles.emptyAssignmentsIconText}>
                ☰
              </Text>
            </View>

            <Text style={styles.emptyTitle}>
              No assignments yet
            </Text>

            <Text style={styles.muted}>
              Create an assignment above and it will appear
              here.
            </Text>
          </View>
        ) : (
          <View style={styles.assignmentList}>
            {assignments.map((assignment) => (
              <View
                key={assignment.id}
                style={styles.assignmentCard}
              >
                <View style={styles.assignmentTop}>
                  <View style={styles.flightBlock}>
                    <Text style={styles.flightLabel}>
                      FLIGHT
                    </Text>

                    <Text style={styles.flightTitle}>
                      {assignment.flightNumber}
                    </Text>
                  </View>

                  <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />

                    <Text style={styles.statusText}>
                      {assignment.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.assignmentDivider} />

                <View style={styles.assignmentHandler}>
                  <View style={styles.assignmentAvatar}>
                    <Text style={styles.assignmentAvatarText}>
                      {assignment.handlerName
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.assignmentHandlerInfo}>
                    <Text style={styles.assignmentName}>
                      {assignment.handlerName}
                    </Text>

                    <Text style={styles.assignmentShift}>
                      {assignment.shiftDate} ·{' '}
                      {assignment.shiftTime}
                    </Text>
                  </View>
                </View>

                <View style={styles.assignmentActivity}>
                  <Text style={styles.assignmentActivityLabel}>
                    TASK
                  </Text>

                  <Text style={styles.assignmentActivityText}>
                    {assignment.activity}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>
          AeroSync · Ground crew coordination
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
    paddingVertical: 6,
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
    fontWeight: '800',
  },

  overviewCard: {
    backgroundColor: NAVY,
    borderRadius: 20,
    padding: 19,
    marginBottom: 24,
  },

  overviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  overviewEyebrow: {
    color: '#BFD7EF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  overviewTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },

  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5DD39E',
  },

  liveText: {
    color: '#DCEBFA',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  overviewMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 19,
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
    color: '#BFD7EF',
    fontSize: 10,
    marginTop: 2,
  },

  metricDivider: {
    width: 1,
    height: 35,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginHorizontal: 14,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 7,
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
    marginBottom: 15,
  },

  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 9,
  },

  loadingLabel: {
    color: MUTED,
    fontSize: 12,
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 13,
  },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },

  emptyIconText: {
    color: BLUE,
    fontSize: 22,
  },

  emptyTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 3,
  },

  muted: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  handlerList: {
    gap: 8,
  },

  handlerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
  },

  handlerOptionSelected: {
    borderColor: BLUE,
    backgroundColor: '#EFF6FF',
  },

  pressed: {
    opacity: 0.72,
  },

  avatar: {
    width: 41,
    height: 41,
    borderRadius: 21,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarSelected: {
    backgroundColor: BLUE,
  },

  avatarText: {
    color: NAVY,
    fontSize: 16,
    fontWeight: '800',
  },

  avatarTextSelected: {
    color: '#FFFFFF',
  },

  handlerInfo: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },

  handlerName: {
    color: NAVY,
    fontSize: 13,
    fontWeight: '800',
  },

  selectionIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
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

  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF7F2',
    borderWidth: 1,
    borderColor: '#C5E8D8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },

  selectedBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedBannerIconText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  selectedBannerInfo: {
    marginLeft: 10,
    flex: 1,
  },

  selectedBannerLabel: {
    color: GREEN,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  selectedBannerName: {
    color: '#145C43',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },

  fieldLabel: {
    color: NAVY,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 3,
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: NAVY,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
  },

  fieldRow: {
    flexDirection: 'row',
    gap: 9,
  },

  fieldHalf: {
    flex: 1,
  },

  activityGrid: {
    gap: 8,
  },

  activityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 11,
    padding: 11,
  },

  activitySelected: {
    borderColor: BLUE,
    backgroundColor: '#EFF6FF',
  },

  activityRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  activityRadioSelected: {
    borderColor: BLUE,
  },

  activityRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BLUE,
  },

  activityText: {
    flex: 1,
    color: NAVY,
    fontSize: 12,
  },

  activityTextSelected: {
    color: BLUE,
    fontWeight: '700',
  },

  previewCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 16,
    marginBottom: 22,
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  previewEyebrow: {
    color: BLUE,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.9,
  },

  previewTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },

  previewIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewIconText: {
    color: BLUE,
    fontSize: 18,
  },

  previewDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 13,
  },

  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 5,
  },

  previewLabel: {
    width: 72,
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
  },

  previewValue: {
    flex: 1,
    color: NAVY,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },

  previewPlaceholder: {
    color: '#94A3B8',
    fontWeight: '500',
  },

  saveButton: {
    minHeight: 54,
    backgroundColor: BLUE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    marginBottom: 13,
  },

  saveButtonDisabled: {
    opacity: 0.55,
  },

  saveButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },

  saveButtonIcon: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '400',
    lineHeight: 23,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 11,
    marginBottom: 18,
  },

  errorIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '800',
  },

  errorText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 11,
    lineHeight: 17,
    marginLeft: 8,
  },

  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    marginBottom: 10,
  },

  savedCount: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  savedCountText: {
    color: NAVY,
    fontSize: 12,
    fontWeight: '800',
  },

  assignmentList: {
    gap: 10,
  },

  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 15,
  },

  assignmentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  flightBlock: {
    flex: 1,
  },

  flightLabel: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  flightTitle: {
    color: NAVY,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF7F2',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 13,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GREEN,
  },

  statusText: {
    color: '#21663C',
    fontSize: 9,
    fontWeight: '800',
  },

  assignmentDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 12,
  },

  assignmentHandler: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  assignmentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  assignmentAvatarText: {
    color: NAVY,
    fontSize: 13,
    fontWeight: '800',
  },

  assignmentHandlerInfo: {
    flex: 1,
    marginLeft: 9,
  },

  assignmentName: {
    color: NAVY,
    fontSize: 13,
    fontWeight: '800',
  },

  assignmentShift: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
  },

  assignmentActivity: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
  },

  assignmentActivityLabel: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 3,
  },

  assignmentActivityText: {
    color: BLUE,
    fontSize: 11,
    fontWeight: '700',
  },

  emptyAssignments: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 22,
    alignItems: 'center',
  },

  emptyAssignmentsIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },

  emptyAssignmentsIconText: {
    color: BLUE,
    fontSize: 21,
  },

  footer: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 11,
    marginTop: 24,
  },
});