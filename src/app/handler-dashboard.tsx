
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
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

const RED = '#C8102E';
const DARK_RED = '#A20D25';
const CHARCOAL = '#252525';
const BACKGROUND = '#F5F5F6';
const WHITE = '#FFFFFF';
const MUTED = '#777777';
const BORDER = '#E7E7E9';
const GREEN = '#16805C';
const PALE_RED = '#FCEBED';
const BLUE = '#1764B4';
const PALE_BLUE = '#E8F1FF';

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

function formatTime(value?: Timestamp | null) {
  if (!value || typeof value.toDate !== 'function') {
    return 'Not recorded';
  }

  return value.toDate().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(
  checkInAt?: Timestamp | null,
  checkOutAt?: Timestamp | null
) {
  if (!checkInAt || !checkOutAt) {
    return 'Still on duty';
  }

  const milliseconds =
    checkOutAt.toMillis() - checkInAt.toMillis();

  if (milliseconds < 0) return 'Unavailable';

  const minutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function getStatusStyle(status: string) {
  if (status === 'Completed') {
    return {
      backgroundColor: '#E8F5EF',
      color: GREEN,
    };
  }

  if (status === 'In Progress') {
    return {
      backgroundColor: PALE_BLUE,
      color: BLUE,
    };
  }

  return {
    backgroundColor: '#F0F0F0',
    color: MUTED,
  };
}

export default function HandlerDashboard() {
  const user = auth.currentUser;

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

  // Existing assignment calculations.
  const todaysAssignments = assignments.filter((assignment) =>
    isTodayShift(assignment.shiftDate, today)
  );

  const completedCount = todaysAssignments.filter(
    (assignment) => assignment.status === 'Completed'
  ).length;

  const inProgressCount = todaysAssignments.filter(
    (assignment) => assignment.status === 'In Progress'
  ).length;

  const pendingCount = todaysAssignments.filter(
    (assignment) =>
      assignment.status !== 'Completed' &&
      assignment.status !== 'In Progress'
  ).length;

  const nextAssignment = todaysAssignments.find(
    (assignment) =>
      assignment.status !== 'Completed' &&
      assignment.status !== 'Cancelled'
  );

  const isCheckedIn = attendance?.status === 'Checked In';
  const isCheckedOut = attendance?.status === 'Checked Out';

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
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>K</Text>
          </View>

          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>AeroSync</Text>
            <Text style={styles.brandSubtitle}>HANDLER</Text>
          </View>
        </View>

        {/* Hero and overlapping workload card */}
        <View style={styles.heroSection}>
          <ImageBackground
            source={require('../../assets/images/Dashboard-photo.png')}
            style={styles.hero}
            imageStyle={styles.heroImage}
            resizeMode="cover"
          >
            <View style={styles.heroOverlay}>
              <Text style={styles.greeting}>{greeting},</Text>
              <Text style={styles.handlerName}>Handler.</Text>
              <Text style={styles.heroSubtitle}>
                Your tasks for today.
              </Text>
              <Text style={styles.dateText}>
                {currentTime.toLocaleDateString([], {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
            </View>
          </ImageBackground>

          {/* Floating workload summary */}
          <View style={styles.statsCard}>
            <View style={styles.statsHeading}>
              <View>
                <Text style={styles.statsTitle}>Today's workload</Text>
                <Text style={styles.statsSubtitle}>
                  Your assigned ground activities
                </Text>
              </View>
              <Text style={styles.statsChevron}>›</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {loadingAssignments ? '—' : pendingCount}
                </Text>
                <Text style={styles.statLabel}>Assigned</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <Text style={styles.statNumber}>
                  {loadingAssignments ? '—' : inProgressCount}
                </Text>
                <Text style={styles.statLabel}>In Progress</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <Text style={[styles.statNumber, { color: RED }]}>
                  {loadingAssignments ? '—' : completedCount}
                </Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
            </View>
          </View>
        </View>

        {/* My Tasks */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>My Tasks</Text>
            <Text style={styles.sectionSubtitle}>
              Your next scheduled activity
            </Text>
          </View>
        </View>

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
          <View style={styles.taskCard}>
            <View style={styles.taskIcon}>
              <Text style={styles.taskIconText}>✈</Text>
            </View>

            <View style={styles.taskInfo}>
              <Text style={styles.taskFlight} numberOfLines={1}>
                {nextAssignment.flightNumber} – {nextAssignment.activity}
              </Text>

              <Text style={styles.taskTime} numberOfLines={1}>
                {nextAssignment.shiftDate} · {nextAssignment.shiftTime}
              </Text>
            </View>

            <View
              style={[
                styles.taskStatusBadge,
                {
                  backgroundColor: getStatusStyle(nextAssignment.status)
                    .backgroundColor,
                },
              ]}
            >
              <Text
                style={[
                  styles.taskStatusText,
                  { color: getStatusStyle(nextAssignment.status).color },
                ]}
              >
                {nextAssignment.status}
              </Text>
            </View>

            <Text style={styles.taskChevron}>›</Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>✓</Text>
            </View>
            <Text style={styles.emptyTitle}>
              {todaysAssignments.length > 0
                ? 'All activities completed'
                : 'No upcoming assignment'}
            </Text>
            <Text style={styles.muted}>
              {todaysAssignments.length > 0
                ? 'You have completed all the activities currently assigned to you today.'
                : 'You do not have an upcoming activity scheduled for today.'}
            </Text>
          </View>
        )}

        {/* Today's work breakdown */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Today's Work</Text>
            <Text style={styles.sectionSubtitle}>
              Your assigned ground activities
            </Text>
          </View>

          <View style={styles.todayBadge}>
            <Text style={styles.todayBadgeText}>TODAY</Text>
          </View>
        </View>

        {loadingAssignments ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color={RED} />
            <Text style={styles.muted}>Loading your assignments...</Text>
          </View>
        ) : assignmentError ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{assignmentError}</Text>
          </View>
        ) : (
          <View style={styles.workCard}>
            <View style={styles.workSummaryTop}>
              <View>
                <Text style={styles.workCount}>
                  {todaysAssignments.length}
                </Text>
                <Text style={styles.workCountLabel}>
                  Activities assigned
                </Text>
              </View>

              <View style={styles.workStats}>
                <Text style={styles.workStatText}>
                  {pendingCount} Not started
                </Text>
                <Text style={styles.workStatText}>
                  {inProgressCount} In progress
                </Text>
                <Text style={styles.workStatText}>
                  {completedCount} Completed
                </Text>
              </View>
            </View>

            {todaysAssignments.length > 0 && (
              <Text style={styles.moreAssignments}>
                Your task counts update automatically.
              </Text>
            )}
          </View>
        )}

        {/* Attendance */}
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceHeader}>
            <View>
              <Text style={styles.sectionTitle}>Attendance</Text>
              <Text style={styles.sectionSubtitle}>
                Your daily shift record
              </Text>
            </View>

            <View
              style={[
                styles.attendanceStatus,
                isCheckedIn && styles.attendanceStatusActive,
                isCheckedOut && styles.attendanceStatusComplete,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  isCheckedIn && styles.activeDot,
                  isCheckedOut && styles.completeDot,
                ]}
              />
              <Text
                style={[
                  styles.attendanceStatusText,
                  isCheckedIn && { color: RED },
                  isCheckedOut && { color: GREEN },
                ]}
              >
                {loadingAttendance
                  ? 'LOADING'
                  : isCheckedIn
                    ? 'ON DUTY'
                    : isCheckedOut
                      ? 'COMPLETED'
                      : 'NOT CHECKED IN'}
              </Text>
            </View>
          </View>

          {loadingAttendance ? (
            <View style={styles.attendanceLoading}>
              <ActivityIndicator color={RED} />
              <Text style={styles.muted}>Loading attendance...</Text>
            </View>
          ) : (
            <>
              <View style={styles.attendanceTimes}>
                <View style={styles.attendanceTimeBlock}>
                  <Text style={styles.timeLabel}>CHECK IN</Text>
                  <Text style={styles.timeValue}>
                    {formatTime(attendance?.checkInAt)}
                  </Text>
                </View>

                <View style={styles.attendanceTimeDivider} />

                <View style={styles.attendanceTimeBlock}>
                  <Text style={styles.timeLabel}>CHECK OUT</Text>
                  <Text style={styles.timeValue}>
                    {formatTime(attendance?.checkOutAt)}
                  </Text>
                </View>
              </View>

              {!attendance && (
                <Pressable
                  style={({ pressed }) => [
                    styles.attendanceButton,
                    pressed && styles.pressed,
                    updatingAttendance && styles.disabledButton,
                  ]}
                  disabled={updatingAttendance}
                  onPress={() => recordAttendance('checkIn')}
                >
                  {updatingAttendance ? (
                    <ActivityIndicator color={WHITE} />
                  ) : (
                    <Text style={styles.attendanceButtonText}>
                      CHECK IN FOR TODAY
                    </Text>
                  )}
                </Pressable>
              )}

              {isCheckedIn && (
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
                    <Text style={styles.checkoutButtonText}>
                      CHECK OUT
                    </Text>
                  )}
                </Pressable>
              )}

              {isCheckedOut && (
                <View style={styles.completedBanner}>
                  <Text style={styles.completedBannerText}>
                    Your attendance for today is complete.
                  </Text>
                </View>
              )}

              {isCheckedOut && (
                <View style={styles.durationContainer}>
                  <Text style={styles.durationLabel}>
                    Total recorded shift duration
                  </Text>
                  <Text style={styles.durationValue}>
                    {formatDuration(
                      attendance?.checkInAt,
                      attendance?.checkOutAt
                    )}
                  </Text>
                </View>
              )}
            </>
          )}

          {!!attendanceError && (
            <Text style={styles.errorText}>{attendanceError}</Text>
          )}

          <Text style={styles.attendanceNote}>
            Attendance is recorded separately from your assigned tasks.
          </Text>
        </View>

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

  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: WHITE,
    fontSize: 29,
    fontWeight: '900',
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

  heroSection: {
    height: 415,
    position: 'relative',
    marginBottom: 0,
  },

  hero: {
    height: 340,
    width: '100%',
    justifyContent: 'flex-start',
    backgroundColor: '#DCE5EB',
  },

  heroImage: {
    borderRadius: 0,
  },

  heroOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 22,
    paddingTop: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  greeting: {
    color: CHARCOAL,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },

  handlerName: {
    color: CHARCOAL,
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -1.2,
  },

  heroSubtitle: {
    color: '#454545',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 7,
  },

  dateText: {
    color: '#555555',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },

  statsCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    minHeight: 165,
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EEEEEF',
    paddingHorizontal: 17,
    paddingVertical: 16,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 5,
  },

  statsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statsTitle: {
    color: CHARCOAL,
    fontSize: 17,
    fontWeight: '900',
  },

  statsSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  statsChevron: {
    color: MUTED,
    fontSize: 27,
    fontWeight: '500',
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },

  statNumber: {
    color: CHARCOAL,
    fontSize: 29,
    fontWeight: '900',
  },

  statLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '500',
  },

  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: BORDER,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 3,
    paddingHorizontal: 2,
  },

  sectionTitle: {
    color: CHARCOAL,
    fontSize: 19,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  taskCard: {
    minHeight: 82,
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },

  taskIcon: {
    width: 47,
    height: 47,
    borderRadius: 13,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  taskIconText: {
    color: RED,
    fontSize: 26,
    fontWeight: '800',
  },

  taskInfo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },

  taskFlight: {
    color: CHARCOAL,
    fontSize: 12,
    fontWeight: '900',
  },

  taskTime: {
    color: MUTED,
    fontSize: 10,
  },

  taskStatusBadge: {
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  taskStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },

  taskChevron: {
    color: CHARCOAL,
    fontSize: 25,
    paddingLeft: 1,
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

  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#E8F5EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIconText: {
    color: GREEN,
    fontSize: 23,
    fontWeight: '900',
  },

  emptyTitle: {
    color: CHARCOAL,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  todayBadge: {
    backgroundColor: PALE_RED,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  todayBadgeText: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
  },

  workCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 15,
    gap: 13,
  },

  workSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  workCount: {
    color: CHARCOAL,
    fontSize: 28,
    fontWeight: '900',
  },

  workCountLabel: {
    color: MUTED,
    fontSize: 11,
    marginTop: 2,
  },

  workStats: {
    alignItems: 'flex-end',
    gap: 5,
  },

  workStatText: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '600',
  },

  moreAssignments: {
    color: MUTED,
    fontSize: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
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

  attendanceCard: {
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

  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },

  attendanceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  attendanceStatusActive: {
    backgroundColor: '#FFF0F1',
  },

  attendanceStatusComplete: {
    backgroundColor: '#E8F5EF',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: MUTED,
  },

  activeDot: {
    backgroundColor: RED,
  },

  completeDot: {
    backgroundColor: GREEN,
  },

  attendanceStatusText: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
  },

  attendanceTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BACKGROUND,
    borderRadius: 12,
    padding: 13,
  },

  attendanceTimeBlock: {
    flex: 1,
    gap: 5,
  },

  timeLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  timeValue: {
    color: CHARCOAL,
    fontSize: 17,
    fontWeight: '900',
  },

  attendanceTimeDivider: {
    width: 1,
    height: 37,
    backgroundColor: BORDER,
    marginHorizontal: 12,
  },

  attendanceButton: {
    minHeight: 45,
    backgroundColor: RED,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  attendanceButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  checkoutButton: {
    minHeight: 45,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: RED,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  checkoutButtonText: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
  },

  attendanceLoading: {
    minHeight: 55,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  completedBanner: {
    backgroundColor: '#E8F5EF',
    borderRadius: 11,
    padding: 12,
    alignItems: 'center',
  },

  completedBannerText: {
    color: GREEN,
    fontSize: 11,
    fontWeight: '800',
  },

  durationContainer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 11,
    gap: 4,
  },

  durationLabel: {
    color: MUTED,
    fontSize: 10,
  },

  durationValue: {
    color: CHARCOAL,
    fontSize: 17,
    fontWeight: '900',
  },

  attendanceNote: {
    color: MUTED,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 15,
  },

  errorText: {
    color: '#B42318',
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
    color: DARK_RED,
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
