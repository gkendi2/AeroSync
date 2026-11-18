
import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AeroSyncLogo from '@/components/aerosync-logo';
import NotificationBell from '@/components/notification-bell';
import FlightStrip from '@/components/flight-strip';
import Icon from '@/components/icon';
import StatusBadge, { taskStatusTone } from '@/components/status-badge';
import { AeroSyncColors } from '@/constants/theme';
import { toTimeString } from '@/features/datetime/format';
import { flightRoute, useFlights } from '@/features/handler/hooks';
import {
  attendanceState,
  findFlightForTask,
  formatDuration,
  isOverdue,
  startBlockedReason,
  summariseDay,
} from '@/features/handler/tasks';
import { advanceTask } from '@/features/handler/taskService';
import { confirmAction } from '@/lib/confirm';
import { openFlightThread } from '@/lib/navigation';

type Assignment = {
  id: string;
  flightNumber: string;
  shiftDate: string;
  shiftTime: string;
  activity: string;
  status: string;
};

type Attendance = {
  handlerUid: string;
  handlerName: string;
  date: string;
  status: 'Checked In' | 'Checked Out';
  checkInAt?: Timestamp | null;
  checkOutAt?: Timestamp | null;
};

const RED = AeroSyncColors.primaryDark;
const CHARCOAL = AeroSyncColors.text;
const BACKGROUND = AeroSyncColors.background;
const WHITE = AeroSyncColors.white;
const MUTED = AeroSyncColors.textSecondary;
const BORDER = AeroSyncColors.border;
const GREEN = AeroSyncColors.success;
const PALE_RED = AeroSyncColors.primaryLight;
const BLUE = AeroSyncColors.info;

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function isTodayShift(shiftDate: string, today: string) {
  const value = shiftDate.trim();

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoMatch) {
    return (
      `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}` ===
      today
    );
  }

  const localMatch = value.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
  );

  if (localMatch) {
    return (
      `${localMatch[3]}-${localMatch[2].padStart(2, '0')}-${localMatch[1].padStart(2, '0')}` ===
      today
    );
  }

  const parsed = new Date(value);

  return (
    !Number.isNaN(parsed.getTime()) &&
    getLocalDateKey(parsed) === today
  );
}

/** HH:MM of a Firestore timestamp, or '--:--' when not recorded yet. */
function formatClock(value?: Timestamp | null) {
  return value && typeof value.toDate === 'function'
    ? toTimeString(value.toDate())
    : '--:--';
}

export default function HandlerDashboard() {
  const router = useRouter();
  const user = auth.currentUser;
  const flights = useFlights();

  const today = getLocalDateKey(new Date());

  const handlerName =
    user?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    'Handler';

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [attendance, setAttendance] = useState<Attendance | null>(null);

  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  const [attendanceError, setAttendanceError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [updatingAttendance, setUpdatingAttendance] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const attendanceId = user ? `${user.uid}_${today}` : '';

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  // Existing CrewAssignments listener.
  useEffect(() => {
    if (!user) {
      setAssignmentError('Please sign in to view your assignments.');
      setLoadingAssignments(false);
      return;
    }

    const assignmentsQuery = query(
      collection(db, 'CrewAssignments'),
      where('handlerUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const results: Assignment[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            flightNumber: data.flightNumber ?? 'Flight not specified',
            shiftDate: data.shiftDate ?? 'Date not specified',
            shiftTime: data.shiftTime ?? 'Time not specified',
            activity: data.activity ?? 'Activity not specified',
            status: data.status ?? 'Assigned',
          };
        });

        results.sort((a, b) =>
          `${a.shiftDate} ${a.shiftTime}`.localeCompare(
            `${b.shiftDate} ${b.shiftTime}`
          )
        );

        setAssignments(results);
        setAssignmentError('');
        setLoadingAssignments(false);
      },
      (error) => {
        console.error('Could not load assignments:', error);
        setAssignmentError('Unable to load your assignments.');
        setLoadingAssignments(false);
      }
    );

    return unsubscribe;
  }, []);

  // Existing Attendance listener.
  useEffect(() => {
    if (!user || !attendanceId) {
      setLoadingAttendance(false);
      return;
    }

    const attendanceRef = doc(db, 'Attendance', attendanceId);

    const unsubscribe = onSnapshot(
      attendanceRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setAttendance(null);
        } else {
          const data = snapshot.data();

          setAttendance({
            handlerUid: data.handlerUid,
            handlerName: data.handlerName ?? handlerName,
            date: data.date ?? today,
            status: data.status ?? 'Checked In',
            checkInAt: data.checkInAt ?? null,
            checkOutAt: data.checkOutAt ?? null,
          });
        }

        setAttendanceError('');
        setLoadingAttendance(false);
      },
      (error) => {
        console.error('Could not load attendance:', error);
        setAttendanceError(
          'Unable to load attendance. Check your connection and Firestore permissions.'
        );
        setLoadingAttendance(false);
      }
    );

    return unsubscribe;
  }, [attendanceId]);

  // Existing attendance transaction logic.
  async function recordAttendance(action: 'checkIn' | 'checkOut') {
    if (!user) {
      setAttendanceError('Please sign in again.');
      return;
    }

    if (updatingAttendance) return;

    setUpdatingAttendance(true);
    setAttendanceError('');

    const attendanceRef = doc(db, 'Attendance', attendanceId);

    try {
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(attendanceRef);

        if (action === 'checkIn') {
          if (existing.exists()) {
            throw new Error(
              'Attendance has already been recorded for today.'
            );
          }

          transaction.set(attendanceRef, {
            handlerUid: user.uid,
            handlerName,
            date: today,
            status: 'Checked In',
            checkInAt: serverTimestamp(),
            checkOutAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          return;
        }

        if (!existing.exists()) {
          throw new Error('You must check in before checking out.');
        }

        const existingData = existing.data();

        if (existingData.status !== 'Checked In') {
          throw new Error(
            'You have already checked out for today.'
          );
        }

        transaction.update(attendanceRef, {
          status: 'Checked Out',
          checkOutAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      console.error('Attendance update failed:', error);

      const message =
        error instanceof Error ? error.message : '';

      setAttendanceError(
        message ||
          'Attendance could not be saved. Check your connection and Firestore Rules.'
      );
    } finally {
      setUpdatingAttendance(false);
    }
  }

  // Today's tasks. Older records may store shiftDate in another format,
  // so the date is matched with isTodayShift first.
  const summary = summariseDay(
    assignments.map((assignment) =>
      isTodayShift(assignment.shiftDate, today)
        ? { ...assignment, shiftDate: today }
        : assignment
    ),
    today
  );

  const nextAssignment = summary.tasks.find(
    (assignment) => assignment.status !== 'Completed'
  );
  const nextFlight = nextAssignment
    ? findFlightForTask(nextAssignment, flights)
    : null;
  const nextOverdue = nextAssignment
    ? isOverdue(nextAssignment, currentTime)
    : false;

  const shiftState = attendanceState(attendance?.status);
  const startBlocked = startBlockedReason(attendance?.status);

  const checkInMs = attendance?.checkInAt?.toMillis?.();
  const checkOutMs = attendance?.checkOutAt?.toMillis?.();
  const shiftDuration =
    checkInMs === undefined
      ? null
      : formatDuration(
          (shiftState === 'checked-out' && checkOutMs !== undefined
            ? checkOutMs
            : currentTime.getTime()) - checkInMs
        );

  const nextActionDisabled =
    !!nextAssignment &&
    (updatingTaskId === nextAssignment.id ||
      (nextAssignment.status === 'Assigned' && !!startBlocked));

  function openMyTasks() {
    router.push('/explore');
  }

  async function handleTaskAction(assignment: Assignment) {
    if (updatingTaskId) return;
    if (assignment.status === 'Assigned' && startBlocked) return;

    if (assignment.status === 'In Progress') {
      const confirmed = await confirmAction({
        title: 'Mark completed?',
        message: `Mark ${assignment.flightNumber} · ${assignment.activity} as completed?`,
        confirmLabel: 'Mark completed',
      });
      if (!confirmed) return;
    }

    setUpdatingTaskId(assignment.id);

    try {
      await advanceTask(assignment.id, assignment.status);
    } catch (error) {
      console.error('Could not update task:', error);
      Alert.alert('Update failed', 'Your task could not be updated. Please try again.');
    } finally {
      setUpdatingTaskId(null);
    }
  }

  const greeting =
    currentTime.getHours() < 12
      ? 'Good morning'
      : currentTime.getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* AeroSync brand header */}
        <View style={styles.header}>
          <AeroSyncLogo size={48} />

          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>AeroSync</Text>
            <Text style={styles.brandSubtitle}>HANDLER</Text>
          </View>

          <NotificationBell />
        </View>

        {/* Greeting */}
        <ImageBackground
          source={require('../../assets/images/Dashboard-photo.png')}
          style={styles.hero}
          imageStyle={styles.heroImage}
          resizeMode="cover"
        >
          <View style={styles.heroOverlay}>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.handlerName}>Handler.</Text>
            <Text style={styles.dateText}>
              {currentTime.toLocaleDateString([], {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </Text>
          </View>
        </ImageBackground>

        {/* 1. Attendance */}
        <View style={styles.card}>
          {loadingAttendance ? (
            <View style={styles.attendanceLoading}>
              <ActivityIndicator color={RED} />
              <Text style={styles.muted}>Loading attendance...</Text>
            </View>
          ) : shiftState === 'not-checked-in' ? (
            <>
              <View style={styles.cardHeading}>
                <Icon name="clock" size={22} color={MUTED} />
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.cardTitle}>Not checked in</Text>
                  <Text style={styles.cardSubtitle}>
                    Check in when your shift begins
                  </Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.checkInButton,
                  pressed && styles.pressed,
                  updatingAttendance && styles.disabledButton,
                ]}
                disabled={updatingAttendance}
                onPress={() => recordAttendance('checkIn')}
              >
                {updatingAttendance ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <>
                    <Icon name="checkIn" size={24} color={WHITE} />
                    <Text style={styles.checkInButtonText}>Check in</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : shiftState === 'on-shift' ? (
            <>
              <View style={styles.cardHeading}>
                <View style={[styles.stateDot, { backgroundColor: GREEN }]} />
                <View style={styles.cardHeadingCopy}>
                  <Text style={styles.cardTitle}>
                    On shift since {formatClock(attendance?.checkInAt)}
                    {shiftDuration ? ` · ${shiftDuration}` : ''}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    Check out when your shift ends
                  </Text>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.checkoutButton,
                  pressed && styles.pressed,
                  updatingAttendance && styles.disabledButton,
                ]}
                disabled={updatingAttendance}
                onPress={() => recordAttendance('checkOut')}
              >
                {updatingAttendance ? (
                  <ActivityIndicator color={RED} />
                ) : (
                  <>
                    <Icon name="checkOut" size={20} color={RED} />
                    <Text style={styles.checkoutButtonText}>Check out</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : (
            <View style={styles.cardHeading}>
              <Icon name="checkCircle" size={24} color={GREEN} />
              <View style={styles.cardHeadingCopy}>
                <Text style={styles.cardTitle}>
                  Shift complete{shiftDuration ? ` · ${shiftDuration}` : ''}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {formatClock(attendance?.checkInAt)}–
                  {formatClock(attendance?.checkOutAt)}
                </Text>
              </View>
            </View>
          )}

          {!!attendanceError && (
            <Text style={styles.errorText}>{attendanceError}</Text>
          )}
        </View>

        {/* 2. Next task */}
        <Text style={styles.sectionTitle}>Next task</Text>

        {loadingAssignments ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color={RED} />
            <Text style={styles.muted}>Loading your assignments...</Text>
          </View>
        ) : assignmentError ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{assignmentError}</Text>
          </View>
        ) : nextAssignment ? (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={openMyTasks}
            accessibilityRole="button"
            accessibilityHint="Opens My Tasks"
          >
            <FlightStrip
              flightNumber={nextAssignment.flightNumber}
              route={flightRoute(nextFlight)}
              departure={
                nextFlight?.departureTime
                  ? `Dep ${nextFlight.departureTime}`
                  : undefined
              }
              right={
                <StatusBadge
                  label={nextOverdue ? 'Overdue' : nextAssignment.status}
                  tone={taskStatusTone(nextAssignment.status, nextOverdue)}
                />
              }
            />

            <View style={styles.taskMeta}>
              <Text style={styles.taskActivity} numberOfLines={1}>
                {nextAssignment.activity}
              </Text>
              <Text style={styles.taskTime}>{nextAssignment.shiftTime}</Text>
            </View>

            {nextAssignment.status === 'Assigned' && !!startBlocked && (
              <Text style={styles.blockedText}>{startBlocked}</Text>
            )}

            <Pressable
              style={({ pressed }) => [
                nextAssignment.status === 'Assigned'
                  ? styles.primaryButton
                  : styles.secondaryButton,
                pressed && styles.pressed,
                nextActionDisabled && styles.disabledButton,
              ]}
              disabled={nextActionDisabled}
              onPress={() => handleTaskAction(nextAssignment)}
            >
              {updatingTaskId === nextAssignment.id ? (
                <ActivityIndicator
                  color={nextAssignment.status === 'Assigned' ? WHITE : RED}
                />
              ) : (
                <Text
                  style={
                    nextAssignment.status === 'Assigned'
                      ? styles.primaryButtonText
                      : styles.secondaryButtonText
                  }
                >
                  {nextAssignment.status === 'Assigned'
                    ? 'Start task'
                    : 'Mark completed'}
                </Text>
              )}
            </Pressable>

            {nextFlight && (
              <Pressable
                accessibilityRole="button"
                onPress={() => openFlightThread(router, nextFlight.id)}
                style={({ pressed }) => [
                  styles.messagesButton,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="messages" size={16} color={RED} />
                <Text style={styles.messagesButtonText}>Messages</Text>
              </Pressable>
            )}
          </Pressable>
        ) : (
          <View style={styles.emptyCard}>
            <Icon name="checkCircle" size={28} color={GREEN} />
            <Text style={styles.emptyTitle}>
              {summary.total > 0
                ? 'All activities completed'
                : 'No upcoming assignment'}
            </Text>
            <Text style={styles.muted}>
              {summary.total > 0
                ? 'You have completed all the activities assigned to you today.'
                : 'You do not have an activity scheduled for today.'}
            </Text>
          </View>
        )}

        {/* 3. Today's work */}
        {!loadingAssignments && !assignmentError && (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={openMyTasks}
            accessibilityRole="button"
            accessibilityHint="Opens My Tasks"
          >
            <View style={styles.cardHeading}>
              <View style={styles.cardHeadingCopy}>
                <Text style={styles.cardTitle}>Today's work</Text>
                <Text style={styles.cardSubtitle}>
                  {summary.completed} of {summary.total} tasks done
                </Text>
              </View>
              <Icon name="forward" size={24} color={MUTED} />
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      summary.total > 0
                        ? (summary.completed / summary.total) * 100
                        : 0
                    }%`,
                  },
                ]}
              />
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{summary.assigned}</Text>
                <Text style={styles.statLabel}>Assigned</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: BLUE }]}>
                  {summary.inProgress}
                </Text>
                <Text style={styles.statLabel}>In progress</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: GREEN }]}>
                  {summary.completed}
                </Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Helpful information */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Remember</Text>
          <Text style={styles.infoText}>
            Check in when your working shift begins and check out
            when it ends. Completing an assigned task does not end
            your shift or change your attendance status.
          </Text>
        </View>

        <Text style={styles.footer}>
          AEROSYNC · GROUND OPERATIONS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 35,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    gap: 18,
  },

  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
  },

  brandInfo: {
    flex: 1,
    gap: 1,
  },

  brandName: {
    color: CHARCOAL,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.8,
  },

  brandSubtitle: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },

  hero: {
    height: 200,
    width: '100%',
    justifyContent: 'flex-start',
    backgroundColor: '#DCE5EB',
    borderRadius: 18,
    overflow: 'hidden',
  },

  heroImage: {
    borderRadius: 18,
  },

  heroOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  greeting: {
    color: CHARCOAL,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },

  handlerName: {
    color: CHARCOAL,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },

  dateText: {
    color: '#555555',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },

  card: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },

  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  cardHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },

  cardTitle: {
    color: CHARCOAL,
    fontSize: 16,
    fontWeight: '900',
  },

  cardSubtitle: {
    color: MUTED,
    fontSize: 12,
  },

  stateDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginHorizontal: 6,
  },

  sectionTitle: {
    color: CHARCOAL,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: -8,
    paddingHorizontal: 2,
  },

  taskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  taskActivity: {
    color: CHARCOAL,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },

  taskTime: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },

  messagesButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  messagesButtonText: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },

  blockedText: {
    color: AeroSyncColors.warning,
    fontSize: 12,
    fontWeight: '700',
  },

  primaryButton: {
    minHeight: 46,
    backgroundColor: RED,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  primaryButtonText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '900',
  },

  secondaryButton: {
    minHeight: 46,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  secondaryButtonText: {
    color: RED,
    fontSize: 14,
    fontWeight: '900',
  },

  emptyCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
    gap: 9,
  },

  emptyTitle: {
    color: CHARCOAL,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: BORDER,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: GREEN,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },

  statNumber: {
    color: CHARCOAL,
    fontSize: 24,
    fontWeight: '900',
  },

  statLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '500',
  },

  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: BORDER,
  },

  messageCard: {
    backgroundColor: WHITE,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },

  muted: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  checkInButton: {
    minHeight: 58,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: RED,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  checkInButtonText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '900',
  },

  checkoutButton: {
    minHeight: 46,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  checkoutButtonText: {
    color: RED,
    fontSize: 14,
    fontWeight: '900',
  },

  attendanceLoading: {
    minHeight: 55,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  errorText: {
    color: RED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  infoCard: {
    backgroundColor: PALE_RED,
    borderRadius: 14,
    padding: 15,
    gap: 6,
  },

  infoTitle: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
  },

  infoText: {
    color: CHARCOAL,
    fontSize: 11,
    lineHeight: 18,
  },

  footer: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 2,
  },

  pressed: {
    opacity: 0.75,
  },

  disabledButton: {
    opacity: 0.6,
  },
});
