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
const BACKGROUND = '#F4F3F3';
const WHITE = '#FFFFFF';
const MUTED = '#777777';
const BORDER = '#E7E7E9';
const GREEN = '#16805C';
const PALE_RED = '#FCEBED';

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

  // Load the handler's assignments independently of attendance.
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

  // Attendance has its own document and does not depend on assignments.
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

  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand header */}
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>

          <View style={styles.brandInfo}>
            <Text style={styles.brandName}>AeroSync</Text>
            <Text style={styles.brandSubtitle}>
              GROUND OPERATIONS
            </Text>
          </View>

          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>HANDLER</Text>
          </View>
        </View>

        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.handlerName}>{handlerName}.</Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>

        {/* Attendance */}
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceTop}>
            <View>
              <Text style={styles.cardEyebrow}>DAILY ATTENDANCE</Text>
              <Text style={styles.attendanceTitle}>My Shift</Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                isCheckedIn && styles.statusBadgeActive,
                isCheckedOut && styles.statusBadgeComplete,
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
                  styles.statusBadgeText,
                  isCheckedIn && styles.activeStatusText,
                  isCheckedOut && styles.completeStatusText,
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

          <Text style={styles.attendanceDescription}>
            Record your attendance at the beginning and end of your
            working shift.
          </Text>

          {loadingAttendance ? (
            <View style={styles.loadingButton}>
              <ActivityIndicator color={RED} />
              <Text style={styles.loadingButtonText}>
                Loading attendance...
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.timeGrid}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>CHECK IN</Text>
                  <Text style={styles.timeValue}>
                    {formatTime(attendance?.checkInAt)}
                  </Text>
                </View>

                <View style={styles.timeDivider} />

                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>CHECK OUT</Text>
                  <Text style={styles.timeValue}>
                    {formatTime(attendance?.checkOutAt)}
                  </Text>
                </View>
              </View>

              {!attendance && (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                    updatingAttendance && styles.disabledButton,
                  ]}
                  disabled={updatingAttendance}
                  onPress={() => recordAttendance('checkIn')}
                >
                  {updatingAttendance ? (
                    <ActivityIndicator color={WHITE} />
                  ) : (
                    <Text style={styles.buttonText}>
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
                    <ActivityIndicator color={WHITE} />
                  ) : (
                    <Text style={styles.buttonText}>
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

        {/* Today's work summary */}
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
                View My Tasks for the full assignment list
              </Text>
            )}
          </View>
        )}

        {/* Next assignment */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Next Assignment</Text>
            <Text style={styles.sectionSubtitle}>
              Your next scheduled activity
            </Text>
          </View>
        </View>

        {loadingAssignments ? (
          <View style={styles.messageCard}>
            <ActivityIndicator color={RED} />
            <Text style={styles.muted}>Checking your next assignment...</Text>
          </View>
        ) : nextAssignment ? (
          <View style={styles.nextAssignmentCard}>
            <View style={styles.nextAssignmentTop}>
              <Text style={styles.nextAssignmentEyebrow}>
                UPCOMING ACTIVITY
              </Text>
              <View
                style={[
                  styles.taskStatusBadge,
                  nextAssignment.status === 'In Progress' &&
                    styles.taskProgressBadge,
                ]}
              >
                <Text
                  style={[
                    styles.taskStatusText,
                    nextAssignment.status === 'In Progress' &&
                      styles.taskProgressText,
                  ]}
                >
                  {nextAssignment.status}
                </Text>
              </View>
            </View>

            <Text style={styles.nextFlight}>
              {nextAssignment.flightNumber}
            </Text>

            <Text style={styles.nextActivity}>
              {nextAssignment.activity}
            </Text>

            <View style={styles.nextAssignmentDivider} />

            <View style={styles.nextAssignmentDetails}>
              <View>
                <Text style={styles.nextDetailLabel}>SCHEDULED DATE</Text>
                <Text style={styles.nextDetailValue}>
                  {nextAssignment.shiftDate}
                </Text>
              </View>

              <View>
                <Text style={styles.nextDetailLabel}>SCHEDULED TIME</Text>
                <Text style={styles.nextDetailValue}>
                  {nextAssignment.shiftTime}
                </Text>
              </View>
            </View>
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
                : 'You do not have an upcoming activity scheduled for today. You can still check in and record your attendance.'}
            </Text>
          </View>
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
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    gap: 17,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  brandMark: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: WHITE,
    fontSize: 25,
    fontWeight: '900',
  },

  brandInfo: {
    flex: 1,
    gap: 2,
  },

  brandName: {
    color: CHARCOAL,
    fontSize: 18,
    fontWeight: '900',
  },

  brandSubtitle: {
    color: RED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  roleBadge: {
    backgroundColor: PALE_RED,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  roleBadgeText: {
    color: RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  greetingSection: {
    gap: 3,
    marginTop: 5,
  },

  greeting: {
    color: MUTED,
    fontSize: 17,
    fontWeight: '600',
  },

  handlerName: {
    color: CHARCOAL,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  dateText: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },

  attendanceCard: {
    backgroundColor: WHITE,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 19,
    gap: 15,
  },

  attendanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },

  cardEyebrow: {
    color: RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  attendanceTitle: {
    color: CHARCOAL,
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  statusBadgeActive: {
    backgroundColor: '#FFF0F1',
  },

  statusBadgeComplete: {
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

  statusBadgeText: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
  },

  activeStatusText: {
    color: RED,
  },

  completeStatusText: {
    color: GREEN,
  },

  attendanceDescription: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
  },

  timeGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BACKGROUND,
    borderRadius: 14,
    padding: 15,
  },

  timeBlock: {
    flex: 1,
    gap: 6,
  },

  timeLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  timeValue: {
    color: CHARCOAL,
    fontSize: 19,
    fontWeight: '900',
  },

  timeDivider: {
    width: 1,
    height: 37,
    backgroundColor: BORDER,
    marginHorizontal: 14,
  },

  primaryButton: {
    minHeight: 51,
    borderRadius: 13,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },

  checkoutButton: {
    minHeight: 51,
    borderRadius: 13,
    backgroundColor: CHARCOAL,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },

  buttonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  pressed: {
    opacity: 0.75,
  },

  disabledButton: {
    opacity: 0.6,
  },

  loadingButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  loadingButtonText: {
    color: MUTED,
    fontSize: 12,
  },

  completedBanner: {
    backgroundColor: '#E8F5EF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },

  completedBannerText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: '800',
  },

  attendanceNote: {
    color: MUTED,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 16,
  },

  durationContainer: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 13,
    gap: 4,
  },

  durationLabel: {
    color: MUTED,
    fontSize: 11,
  },

  durationValue: {
    color: CHARCOAL,
    fontSize: 19,
    fontWeight: '900',
  },

  errorText: {
    color: '#B42318',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 3,
  },

  sectionTitle: {
    color: CHARCOAL,
    fontSize: 20,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
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
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
  },

  workSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  workCount: {
    color: CHARCOAL,
    fontSize: 29,
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
    fontSize: 11,
    fontWeight: '600',
  },

  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 13,
    gap: 10,
  },

  assignmentMarker: {
    width: 4,
    height: 38,
    borderRadius: 3,
    backgroundColor: RED,
  },

  assignmentInfo: {
    flex: 1,
    gap: 3,
  },

  assignmentFlight: {
    color: CHARCOAL,
    fontSize: 14,
    fontWeight: '900',
  },

  assignmentActivity: {
    color: MUTED,
    fontSize: 11,
  },

  assignmentTime: {
    color: MUTED,
    fontSize: 10,
  },

  taskStatusBadge: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  taskCompletedBadge: {
    backgroundColor: '#E8F5EF',
  },

  taskProgressBadge: {
    backgroundColor: '#FFF3D6',
  },

  taskStatusText: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
  },

  taskCompletedText: {
    color: GREEN,
  },

  taskProgressText: {
    color: '#946200',
  },

  moreAssignments: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    paddingTop: 3,
  },

  emptyCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIconText: {
    color: RED,
    fontSize: 26,
  },

  emptyTitle: {
    color: CHARCOAL,
    fontSize: 15,
    fontWeight: '900',
  },

  messageCard: {
    backgroundColor: WHITE,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },

  muted: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },

  infoCard: {
    backgroundColor: '#FCEBED',
    borderRadius: 15,
    padding: 17,
    gap: 7,
  },

  infoTitle: {
    color: DARK_RED,
    fontSize: 13,
    fontWeight: '900',
  },

  infoText: {
    color: CHARCOAL,
    fontSize: 12,
    lineHeight: 19,
  },

  footer: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 4,
  },

  nextAssignmentCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 9,
  },

  nextAssignmentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  nextAssignmentEyebrow: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  nextFlight: {
    color: CHARCOAL,
    fontSize: 27,
    fontWeight: '900',
  },

  nextActivity: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 19,
  },

  nextAssignmentDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 5,
  },

  nextAssignmentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  nextDetailLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  nextDetailValue: {
    color: CHARCOAL,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 5,
  },
});