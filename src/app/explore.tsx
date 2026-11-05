import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Assignment = {
  id: string;
  flightNumber?: string;
  shiftDate?: string;
  shiftTime?: string;
  activity?: string;
  status?: string;
};

type FilterType =
  | 'All'
  | 'Today'
  | 'Upcoming'
  | 'In Progress'
  | 'Completed';

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

function parseAssignmentDate(dateValue?: string) {
  if (!dateValue) return null;

  const value = dateValue.trim();

  // Supports YYYY-MM-DD
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Supports DD/MM/YYYY or DD-MM-YYYY
  const localMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (localMatch) {
    const date = new Date(
      Number(localMatch[3]),
      Number(localMatch[2]) - 1,
      Number(localMatch[1])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAssignmentDateTime(assignment: Assignment) {
  const date = parseAssignmentDate(assignment.shiftDate);

  if (!date || !assignment.shiftTime) return null;

  const time = assignment.shiftTime.trim();

  // Supports 10:30 AM, 10:30PM and 14:30
  const timeMatch = time.match(
    /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i
  );

  if (!timeMatch) return null;

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const period = timeMatch[3]?.toUpperCase();

  if (minutes > 59 || hours > 23) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;

    if (period === 'AM' && hours === 12) hours = 0;
    if (period === 'PM' && hours !== 12) hours += 12;
  }

  date.setHours(hours, minutes, 0, 0);

  return date;
}

function isOverdue(assignment: Assignment, now: Date) {
  const status = assignment.status ?? 'Assigned';

  if (status === 'Completed' || status === 'Cancelled') {
    return false;
  }

  const scheduledDateTime = getAssignmentDateTime(assignment);

  if (!scheduledDateTime) return false;

  return scheduledDateTime.getTime() < now.getTime();
}

function getStatusColor(status: string, overdue: boolean) {
  if (overdue) return '#B42318';
  if (status === 'Completed') return GREEN;
  if (status === 'In Progress') return '#946200';

  return MUTED;
}

export default function MyTasksScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('All');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loadError, setLoadError] = useState('');

  const today = getLocalDateKey(currentTime);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setAssignments([]);
      setLoading(false);
      setLoadError('Please sign in to view your assignments.');
      return;
    }

    const assignmentsQuery = query(
      collection(db, 'CrewAssignments'),
      where('handlerUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      assignmentsQuery,
      (snapshot) => {
        const tasks: Assignment[] = snapshot.docs.map((item) => {
          const data = item.data();

          return {
            id: item.id,
            flightNumber: data.flightNumber,
            shiftDate: data.shiftDate,
            shiftTime: data.shiftTime,
            activity: data.activity,
            status: data.status ?? 'Assigned',
          };
        });

        tasks.sort((a, b) => {
          const dateA = getAssignmentDateTime(a)?.getTime() ?? 0;
          const dateB = getAssignmentDateTime(b)?.getTime() ?? 0;

          return dateA - dateB;
        });

        setAssignments(tasks);
        setLoadError('');
        setLoading(false);
      },
      (error) => {
        console.error('Could not load tasks:', error);
        setLoadError('Unable to load your tasks. Please try again.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  async function updateTask(assignment: Assignment) {
    const currentStatus = assignment.status ?? 'Assigned';

    if (
      currentStatus !== 'Assigned' &&
      currentStatus !== 'In Progress'
    ) {
      return;
    }

    const nextStatus =
      currentStatus === 'Assigned' ? 'In Progress' : 'Completed';

    setUpdatingId(assignment.id);

    try {
      await updateDoc(doc(db, 'CrewAssignments', assignment.id), {
        status: nextStatus,
      });
    } catch (error) {
      console.error('Could not update task:', error);

      Alert.alert(
        'Update failed',
        'Your task could not be updated. Please try again.'
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const activeAssignments = assignments.filter(
    (task) => task.status !== 'Cancelled'
  );

  const overdueCount = activeAssignments.filter((task) =>
    isOverdue(task, currentTime)
  ).length;

  const inProgressCount = activeAssignments.filter(
    (task) => task.status === 'In Progress'
  ).length;

  const completedCount = activeAssignments.filter(
    (task) => task.status === 'Completed'
  ).length;

  const assignedCount = activeAssignments.filter(
    (task) => task.status === 'Assigned'
  ).length;

  const todayCount = activeAssignments.filter((task) => {
    const date = parseAssignmentDate(task.shiftDate);
    return date && getLocalDateKey(date) === today;
  }).length;

  const filteredAssignments = useMemo(() => {
    return activeAssignments.filter((task) => {
      const status = task.status ?? 'Assigned';
      const date = parseAssignmentDate(task.shiftDate);
      const taskDate = date ? getLocalDateKey(date) : '';

      switch (selectedFilter) {
        case 'Today':
          return taskDate === today;

        case 'Upcoming':
          return !!date && taskDate > today && status !== 'Completed';

        case 'In Progress':
          return status === 'In Progress';

        case 'Completed':
          return status === 'Completed';

        case 'All':
        default:
          return true;
      }
    });
  }, [activeAssignments, selectedFilter, today]);

  const filters: FilterType[] = [
    'All',
    'Today',
    'Upcoming',
    'In Progress',
    'Completed',
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>AEROSYNC · CREW WORKSPACE</Text>

          <Text style={styles.title}>My Tasks</Text>

          <Text style={styles.subtitle}>
            Manage your assigned ground activities and monitor your progress.
          </Text>
        </View>

        {/* Task summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text style={styles.summaryHeading}>Task Overview</Text>
            <Text style={styles.summaryDate}>
              {currentTime.toLocaleDateString([], {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>
                {activeAssignments.length}
              </Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>
                {inProgressCount}
              </Text>
              <Text style={styles.summaryLabel}>In progress</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNumber, { color: GREEN }]}>
                {completedCount}
              </Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
          </View>

          <View style={styles.summaryFooter}>
            <Text style={styles.summaryFooterText}>
              {assignedCount} awaiting start
            </Text>

            {overdueCount > 0 && (
              <Text style={styles.overdueSummary}>
                {overdueCount} overdue
              </Text>
            )}
          </View>
        </View>

        {/* Filters */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your Assignments</Text>
            <Text style={styles.sectionSubtitle}>
              {todayCount} scheduled for today
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map((filter) => {
            const selected = selectedFilter === filter;

            return (
              <Pressable
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                style={[
                  styles.filterButton,
                  selected && styles.selectedFilterButton,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    selected && styles.selectedFilterText,
                  ]}
                >
                  {filter}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Assignment list */}
        {loading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator size="large" color={RED} />
            <Text style={styles.messageText}>
              Loading your assignments...
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.messageCard}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : filteredAssignments.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>✓</Text>
            </View>

            <Text style={styles.emptyTitle}>
              {selectedFilter === 'Today'
                ? 'No tasks scheduled today'
                : selectedFilter === 'Upcoming'
                  ? 'No upcoming assignments'
                  : selectedFilter === 'In Progress'
                    ? 'No tasks in progress'
                    : selectedFilter === 'Completed'
                      ? 'No completed tasks yet'
                      : 'No assignments yet'}
            </Text>

            <Text style={styles.emptyText}>
              {selectedFilter === 'All'
                ? 'Assignments from your supervisor will appear here.'
                : 'There are currently no assignments in this category.'}
            </Text>
          </View>
        ) : (
          filteredAssignments.map((assignment) => {
            const status = assignment.status ?? 'Assigned';
            const isCompleted = status === 'Completed';
            const isInProgress = status === 'In Progress';
            const isUpdating = updatingId === assignment.id;
            const overdue = isOverdue(assignment, currentTime);

            return (
              <View key={assignment.id} style={styles.taskCard}>
                {/* Card header */}
                <View style={styles.cardTop}>
                  <View style={styles.flightBlock}>
                    <Text style={styles.flightLabel}>FLIGHT</Text>
                    <Text style={styles.flightNumber}>
                      {assignment.flightNumber || 'Not specified'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      isInProgress && styles.progressBadge,
                      isCompleted && styles.completedBadge,
                      overdue && styles.overdueBadge,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: getStatusColor(status, overdue) },
                      ]}
                    />

                    <Text
                      style={[
                        styles.statusText,
                        { color: getStatusColor(status, overdue) },
                      ]}
                    >
                      {overdue ? 'OVERDUE' : status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Activity */}
                <Text style={styles.activity}>
                  {assignment.activity || 'General handling'}
                </Text>

                {/* Schedule */}
                <View style={styles.detailsContainer}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>SCHEDULED DATE</Text>
                    <Text style={styles.detailValue}>
                      {assignment.shiftDate || 'Not specified'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>SCHEDULED TIME</Text>
                    <Text style={styles.detailValue}>
                      {assignment.shiftTime || 'Not specified'}
                    </Text>
                  </View>
                </View>

                {/* Overdue explanation */}
                {overdue && (
                  <View style={styles.overdueNotice}>
                    <Text style={styles.overdueNoticeText}>
                      This task is past its scheduled time and has not been
                      completed.
                    </Text>
                  </View>
                )}

                {/* Task action */}
                {!isCompleted && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isUpdating}
                    onPress={() => updateTask(assignment)}
                    style={({ pressed }) => [
                      styles.actionButton,
                      isInProgress && styles.completeButton,
                      pressed && styles.pressed,
                      isUpdating && styles.disabledButton,
                    ]}
                  >
                    {isUpdating ? (
                      <ActivityIndicator color={WHITE} />
                    ) : (
                      <Text style={styles.actionButtonText}>
                        {status === 'Assigned'
                          ? 'START TASK'
                          : 'MARK AS COMPLETED'}
                      </Text>
                    )}
                  </Pressable>
                )}

                {isCompleted && (
                  <View style={styles.completedMessage}>
                    <Text style={styles.completedMessageText}>
                      ✓ Task completed
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Task status guide</Text>

          <View style={styles.guideRow}>
            <View style={[styles.guideDot, { backgroundColor: MUTED }]} />
            <Text style={styles.guideText}>
              Assigned — waiting to be started
            </Text>
          </View>

          <View style={styles.guideRow}>
            <View style={[styles.guideDot, { backgroundColor: '#946200' }]} />
            <Text style={styles.guideText}>
              In Progress — work has started
            </Text>
          </View>

          <View style={styles.guideRow}>
            <View style={[styles.guideDot, { backgroundColor: GREEN }]} />
            <Text style={styles.guideText}>
              Completed — work has been finished
            </Text>
          </View>

          <View style={styles.guideRow}>
            <View style={[styles.guideDot, { backgroundColor: '#B42318' }]} />
            <Text style={styles.guideText}>
              Overdue — scheduled time has passed
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          AEROSYNC · GROUND OPERATIONS
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  content: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },

  header: {
    backgroundColor: CHARCOAL,
    borderRadius: 19,
    padding: 22,
    marginBottom: 17,
  },

  eyebrow: {
    color: '#F3B9C2',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  title: {
    color: WHITE,
    fontSize: 29,
    fontWeight: '900',
  },

  subtitle: {
    color: '#E2E2E2',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },

  summaryCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    padding: 17,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },

  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 17,
  },

  summaryHeading: {
    color: CHARCOAL,
    fontSize: 15,
    fontWeight: '900',
  },

  summaryDate: {
    color: MUTED,
    fontSize: 11,
  },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },

  summaryNumber: {
    color: CHARCOAL,
    fontSize: 25,
    fontWeight: '900',
  },

  summaryLabel: {
    color: MUTED,
    fontSize: 11,
    textAlign: 'center',
  },

  summaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: BORDER,
  },

  summaryFooter: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 15,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  summaryFooterText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },

  overdueSummary: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '800',
  },

  sectionHeader: {
    marginBottom: 13,
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

  filterContainer: {
    gap: 8,
    paddingBottom: 17,
  },

  filterButton: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },

  selectedFilterButton: {
    backgroundColor: RED,
    borderColor: RED,
  },

  filterText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },

  selectedFilterText: {
    color: WHITE,
  },

  taskCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    padding: 17,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: BORDER,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  flightBlock: {
    flex: 1,
  },

  flightLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  flightNumber: {
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },

  progressBadge: {
    backgroundColor: '#FFF3D6',
  },

  completedBadge: {
    backgroundColor: '#E8F5EF',
  },

  overdueBadge: {
    backgroundColor: '#FCEBED',
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },

  activity: {
    color: CHARCOAL,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 15,
  },

  detailsContainer: {
    backgroundColor: BACKGROUND,
    borderRadius: 12,
    padding: 13,
    gap: 11,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  detailLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  detailValue: {
    color: CHARCOAL,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },

  overdueNotice: {
    backgroundColor: '#FCEBED',
    borderRadius: 10,
    padding: 11,
    marginTop: 12,
  },

  overdueNoticeText: {
    color: '#B42318',
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
  },

  actionButton: {
    backgroundColor: RED,
    borderRadius: 11,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 46,
  },

  completeButton: {
    backgroundColor: CHARCOAL,
  },

  actionButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  completedMessage: {
    backgroundColor: '#E8F5EF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 14,
  },

  completedMessageText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: '800',
  },

  pressed: {
    opacity: 0.75,
  },

  disabledButton: {
    opacity: 0.6,
  },

  emptyCard: {
    backgroundColor: WHITE,
    padding: 25,
    borderRadius: 17,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIconText: {
    color: RED,
    fontSize: 24,
    fontWeight: '900',
  },

  emptyTitle: {
    color: CHARCOAL,
    fontSize: 16,
    fontWeight: '900',
  },

  emptyText: {
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 12,
  },

  messageCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 25,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  messageText: {
    color: MUTED,
    fontSize: 12,
  },

  errorText: {
    color: '#B42318',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 19,
  },

  footerCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 17,
    marginTop: 9,
    gap: 12,
  },

  footerTitle: {
    color: CHARCOAL,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },

  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  guideDot: {
    width: 8,
    height: 8,
    borderRadius: 5,
  },

  guideText: {
    color: MUTED,
    fontSize: 11,
  },

  footer: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 22,
  },
});