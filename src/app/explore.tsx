
import { auth, db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
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
import { useRouter } from 'expo-router';

import BagProgress from '@/components/bag-progress';
import FlightStrip from '@/components/flight-strip';
import Icon from '@/components/icon';
import StatusBadge, { taskStatusTone } from '@/components/status-badge';
import { AeroSyncColors } from '@/constants/theme';
import { parseShiftStart } from '@/features/delay-risk/inputs';
import {
  flightRoute,
  useAttendanceStatus,
  useBaggage,
  useFlights,
} from '@/features/handler/hooks';
import {
  bagProgressForTask,
  findFlightForTask,
  type HandlerTask,
  isOverdue,
  startBlockedReason,
} from '@/features/handler/tasks';
import { advanceTask } from '@/features/handler/taskService';
import { confirmAction } from '@/lib/confirm';

type Assignment = {
  id: string;
  flightNumber?: string;
  shiftDate?: string;
  shiftTime?: string;
  activity?: string;
  status?: string;
};

type FilterType = 'Today' | 'Upcoming' | 'In Progress' | 'Completed';

const RED = AeroSyncColors.primaryDark;
const CHARCOAL = AeroSyncColors.text;
const BACKGROUND = AeroSyncColors.background;
const WHITE = AeroSyncColors.white;
const MUTED = AeroSyncColors.textSecondary;
const BORDER = AeroSyncColors.border;
const GREEN = AeroSyncColors.success;

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAssignmentDate(dateValue?: string) {
  if (!dateValue) return null;

  const value = dateValue.trim();
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (isoMatch) {
    const date = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

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

function toTask(assignment: Assignment): HandlerTask {
  return {
    id: assignment.id,
    flightNumber: assignment.flightNumber ?? '',
    shiftDate: assignment.shiftDate ?? '',
    shiftTime: assignment.shiftTime ?? '',
    activity: assignment.activity ?? '',
    status: assignment.status ?? 'Assigned',
  };
}

function formatTaskDate(dateValue?: string) {
  const date = parseAssignmentDate(dateValue);

  if (!date) return dateValue || 'Date not set';

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  });
}

export default function MyTasksScreen() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('Today');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loadError, setLoadError] = useState('');
  const [searchText, setSearchText] = useState('');

  const today = getLocalDateKey(currentTime);

  const flights = useFlights();
  const bags = useBaggage(assignments.length > 0);
  const attendance = useAttendanceStatus(auth.currentUser?.uid, today);
  const startBlocked = attendance.loading
    ? 'Checking attendance...'
    : startBlockedReason(attendance.status);

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

        // By shift start (the first time in shiftTime).
        const startOf = (task: Assignment) =>
          parseShiftStart(task.shiftDate ?? '', task.shiftTime ?? '')?.getTime() ?? 0;
        tasks.sort((a, b) => startOf(a) - startOf(b));

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
    const task = toTask(assignment);

    if (task.status !== 'Assigned' && task.status !== 'In Progress') return;
    if (task.status === 'Assigned' && startBlocked) return;

    if (task.status === 'In Progress') {
      const confirmed = await confirmAction({
        title: 'Mark completed?',
        message: `Mark ${task.flightNumber || 'this task'} · ${task.activity || 'General handling'} as completed?`,
        confirmLabel: 'Mark completed',
      });
      if (!confirmed) return;
    }

    setUpdatingId(assignment.id);

    try {
      await advanceTask(assignment.id, task.status);
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

  const filteredAssignments = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return activeAssignments.filter((task) => {
      const status = task.status ?? 'Assigned';
      const date = parseAssignmentDate(task.shiftDate);
      const taskDate = date ? getLocalDateKey(date) : '';

      let matchesFilter = false;

      switch (selectedFilter) {
        case 'Today':
          matchesFilter = taskDate === today;
          break;

        case 'Upcoming':
          matchesFilter =
            !!date && taskDate > today && status !== 'Completed';
          break;

        case 'In Progress':
          matchesFilter = status === 'In Progress';
          break;

        case 'Completed':
          matchesFilter = status === 'Completed';
          break;
      }

      const matchesSearch =
        !search ||
        (task.flightNumber ?? '').toLowerCase().includes(search) ||
        (task.activity ?? '').toLowerCase().includes(search) ||
        (task.status ?? '').toLowerCase().includes(search);

      return matchesFilter && matchesSearch;
    });
  }, [activeAssignments, selectedFilter, today, searchText]);

  const filters: FilterType[] = [
    'Today',
    'Upcoming',
    'In Progress',
    'Completed',
  ];

  const sectionTitle =
    selectedFilter === 'Today'
      ? 'TODAY'
      : selectedFilter === 'Upcoming'
        ? 'UPCOMING'
        : selectedFilter.toUpperCase();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Page header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.pageTitle}>My Tasks</Text>
              <Text style={styles.headerDate}>
                {currentTime.toLocaleDateString([], {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
            </View>

            <View style={styles.taskCountBadge}>
              <Text style={styles.taskCountBadgeText}>
                {activeAssignments.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Filter tabs */}
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

        {/* Search */}
        <View style={styles.searchBox}>
          <View style={styles.searchIcon}>
            <Icon name="search" size={20} color={CHARCOAL} />
          </View>

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search task or flight..."
            placeholderTextColor="#999999"
            style={styles.searchInput}
            returnKeyType="search"
          />

          {searchText.length > 0 && (
            <Pressable
              onPress={() => setSearchText('')}
              style={styles.clearSearch}
              accessibilityLabel="Clear search"
            >
              <Icon name="close" size={18} color={MUTED} />
            </Pressable>
          )}
        </View>

        {/* Assignment heading */}
        <View style={styles.listHeading}>
          <Text style={styles.listTitle}>{sectionTitle}</Text>
          <Text style={styles.listCount}>
            {filteredAssignments.length}
          </Text>
        </View>

        {/* Assignments */}
        {loading ? (
          <View style={styles.messageContainer}>
            <ActivityIndicator size="large" color={RED} />
            <Text style={styles.messageText}>
              Loading your assignments...
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.messageContainer}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : filteredAssignments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="checkCircle" size={28} color={GREEN} />

            <Text style={styles.emptyTitle}>
              {searchText
                ? 'No matching tasks'
                : selectedFilter === 'Today'
                  ? 'No tasks scheduled today'
                  : selectedFilter === 'Upcoming'
                    ? 'No upcoming assignments'
                    : selectedFilter === 'In Progress'
                      ? 'No tasks in progress'
                      : 'No completed tasks yet'}
            </Text>

            <Text style={styles.emptyText}>
              {searchText
                ? 'Try another flight number or activity.'
                : 'Assignments from your supervisor will appear here.'}
            </Text>
          </View>
        ) : (
          <View style={styles.assignmentList}>
            {filteredAssignments.map((assignment) => {
              const task = toTask(assignment);
              const status = task.status;
              const isCompleted = status === 'Completed';
              const isAssigned = status === 'Assigned';
              const isUpdating = updatingId === assignment.id;
              const overdue = isOverdue(task, currentTime);
              const flight = findFlightForTask(task, flights);
              const bagProgress = bagProgressForTask(
                task,
                flights,
                bags,
                currentTime
              );
              const startDisabled = isAssigned && !!startBlocked;

              return (
                <View key={assignment.id} style={styles.taskRow}>
                  <FlightStrip
                    flightNumber={task.flightNumber}
                    route={flightRoute(flight)}
                    departure={
                      flight?.departureTime
                        ? `Dep ${flight.departureTime}`
                        : undefined
                    }
                    right={
                      <StatusBadge
                        label={overdue ? 'Overdue' : status}
                        tone={taskStatusTone(status, overdue)}
                      />
                    }
                  />

                  <View style={styles.taskBottomLine}>
                    <Text style={styles.activity} numberOfLines={1}>
                      {assignment.activity || 'General handling'}
                    </Text>

                    <View style={styles.shiftTime}>
                      <Icon name="clock" size={14} color={MUTED} />
                      <Text style={styles.taskTime}>
                        {assignment.shiftTime || '—'}
                      </Text>
                    </View>

                    <Text style={styles.taskDate}>
                      {formatTaskDate(assignment.shiftDate)}
                    </Text>
                  </View>

                  {overdue && (
                    <Text style={styles.overdueText}>
                      Shift end has passed
                    </Text>
                  )}

                  {bagProgress && (
                    <View style={styles.bagRow}>
                      <View style={styles.bagProgress}>
                        <BagProgress
                          loaded={bagProgress.loaded}
                          total={bagProgress.total}
                        />
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push('/scan-qr')}
                        style={({ pressed }) => [
                          styles.scanButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Icon name="scanQr" size={16} color={RED} />
                        <Text style={styles.scanButtonText}>Scan bags</Text>
                      </Pressable>
                    </View>
                  )}

                  {!isCompleted && startDisabled && (
                    <Text style={styles.blockedText}>{startBlocked}</Text>
                  )}

                  {!isCompleted && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isUpdating || startDisabled}
                      onPress={() => updateTask(assignment)}
                      style={({ pressed }) => [
                        styles.taskAction,
                        !isAssigned && styles.completeAction,
                        pressed && styles.pressed,
                        (isUpdating || startDisabled) && styles.disabledButton,
                      ]}
                    >
                      {isUpdating ? (
                        <ActivityIndicator
                          size="small"
                          color={isAssigned ? WHITE : RED}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.taskActionText,
                            !isAssigned && styles.completeActionText,
                          ]}
                        >
                          {isAssigned ? 'Start task' : 'Mark completed'}
                        </Text>
                      )}
                    </Pressable>
                  )}

                  {isCompleted && (
                    <View style={styles.completedRow}>
                      <Icon name="checkCircle" size={16} color={GREEN} />
                      <Text style={styles.completedText}>Task completed</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

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
    paddingHorizontal: 17,
    paddingTop: Platform.OS === 'ios' ? 58 : 22,
    paddingBottom: 30,
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
  },

  header: {
    paddingTop: 5,
    paddingBottom: 17,
  },

  headerTitleRow: {
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },

  pageTitle: {
    color: CHARCOAL,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.6,
  },

  headerDate: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },

  taskCountBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  taskCountBadgeText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
  },

  filterContainer: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginBottom: 15,
  },

  filterButton: {
    paddingHorizontal: 9,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedFilterButton: {
    borderBottomColor: RED,
  },

  filterText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },

  selectedFilterText: {
    color: RED,
    fontWeight: '900',
  },

  searchBox: {
    backgroundColor: AeroSyncColors.surface,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    minHeight: 45,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 19,
  },

  searchIcon: {
    marginRight: 9,
  },

  searchInput: {
    flex: 1,
    color: CHARCOAL,
    fontSize: 12,
    paddingVertical: 9,
  },

  clearSearch: {
    padding: 5,
  },

  listHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 2,
    marginBottom: 9,
  },

  listTitle: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  listCount: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },

  assignmentList: {
    backgroundColor: WHITE,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },

  taskRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 9,
  },

  shiftTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  taskTime: {
    color: CHARCOAL,
    fontSize: 12,
    fontWeight: '800',
  },

  bagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  bagProgress: {
    flex: 1,
    minWidth: 0,
  },

  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  scanButtonText: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
  },

  blockedText: {
    color: AeroSyncColors.warning,
    fontSize: 11,
    fontWeight: '700',
  },

  taskBottomLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  activity: {
    color: MUTED,
    fontSize: 11,
    flex: 1,
  },

  taskDate: {
    color: MUTED,
    fontSize: 10,
    textAlign: 'right',
  },

  overdueText: {
    color: AeroSyncColors.danger,
    fontSize: 11,
    fontWeight: '700',
  },

  taskAction: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  taskActionText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
  },

  completeAction: {
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: RED,
  },

  completeActionText: {
    color: RED,
  },

  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  completedText: {
    color: GREEN,
    fontSize: 12,
    fontWeight: '800',
  },

  pressed: {
    opacity: 0.65,
  },

  disabledButton: {
    opacity: 0.5,
  },

  messageContainer: {
    backgroundColor: WHITE,
    borderRadius: 13,
    padding: 25,
    alignItems: 'center',
    gap: 10,
  },

  messageText: {
    color: MUTED,
    fontSize: 12,
  },

  errorText: {
    color: AeroSyncColors.danger,
    fontSize: 12,
    textAlign: 'center',
  },

  emptyContainer: {
    backgroundColor: WHITE,
    borderRadius: 13,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },

  emptyTitle: {
    color: CHARCOAL,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  emptyText: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  footer: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 20,
  },
});
