
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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type FilterType = 'Today' | 'Upcoming' | 'In Progress' | 'Completed';

const RED = '#C8102E';
const CHARCOAL = '#252525';
const BACKGROUND = '#F5F5F7';
const WHITE = '#FFFFFF';
const MUTED = '#777777';
const BORDER = '#E9E9E9';
const GREEN = '#16805C';

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

function getAssignmentDateTime(assignment: Assignment) {
  const date = parseAssignmentDate(assignment.shiftDate);

  if (!date || !assignment.shiftTime) return null;

  const timeMatch = assignment.shiftTime.trim().match(
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

  const scheduled = getAssignmentDateTime(assignment);

  return scheduled ? scheduled.getTime() < now.getTime() : false;
}

function formatTaskDate(dateValue?: string) {
  const date = parseAssignmentDate(dateValue);

  if (!date) return dateValue || 'Date not set';

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  });
}

function getStatusColor(status: string, overdue: boolean) {
  if (overdue) return '#B42318';
  if (status === 'Completed') return GREEN;
  if (status === 'In Progress') return '#946200';
  return MUTED;
}

function getStatusBackground(status: string, overdue: boolean) {
  if (overdue) return '#FCEBED';
  if (status === 'Completed') return '#E8F5EF';
  if (status === 'In Progress') return '#FFF3D6';
  return '#F0F0F0';
}

export default function MyTasksScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] =
    useState<FilterType>('Today');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loadError, setLoadError] = useState('');
  const [searchText, setSearchText] = useState('');

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
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search task or flight..."
            placeholderTextColor="#999999"
            style={styles.searchInput}
            returnKeyType="search"
          />

          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')}>
              <Text style={styles.clearSearch}>✕</Text>
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
            <Text style={styles.emptyIcon}>✓</Text>

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
              const status = assignment.status ?? 'Assigned';
              const isCompleted = status === 'Completed';
              const isInProgress = status === 'In Progress';
              const isUpdating = updatingId === assignment.id;
              const overdue = isOverdue(assignment, currentTime);

              const statusColor = getStatusColor(status, overdue);
              const statusBackground = getStatusBackground(
                status,
                overdue
              );

              return (
                <View key={assignment.id} style={styles.taskRow}>
                  <View style={styles.taskMain}>
                    <View style={styles.taskTopLine}>
                      <Text
                        style={styles.flightNumber}
                        numberOfLines={1}
                      >
                        {assignment.flightNumber || 'General task'}
                      </Text>

                      <Text style={styles.taskTime}>
                        {assignment.shiftTime || '—'}
                      </Text>

                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: statusBackground },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: statusColor },
                          ]}
                          numberOfLines={1}
                        >
                          {overdue ? 'Overdue' : status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.taskBottomLine}>
                      <Text
                        style={styles.activity}
                        numberOfLines={1}
                      >
                        {assignment.activity || 'General handling'}
                      </Text>

                      <Text style={styles.taskDate}>
                        {formatTaskDate(assignment.shiftDate)}
                      </Text>
                    </View>

                    {overdue && (
                      <Text style={styles.overdueText}>
                        Scheduled time has passed
                      </Text>
                    )}

                    {!isCompleted && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isUpdating}
                        onPress={() => updateTask(assignment)}
                        style={({ pressed }) => [
                          styles.taskAction,
                          isInProgress && styles.completeAction,
                          pressed && styles.pressed,
                          isUpdating && styles.disabledButton,
                        ]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator
                            size="small"
                            color={RED}
                          />
                        ) : (
                          <Text
                            style={[
                              styles.taskActionText,
                              isInProgress &&
                                styles.completeActionText,
                            ]}
                          >
                            {status === 'Assigned'
                              ? 'START TASK'
                              : 'MARK AS COMPLETED'}
                          </Text>
                        )}
                      </Pressable>
                    )}

                    {isCompleted && (
                      <Text style={styles.completedText}>
                        ✓ Task completed
                      </Text>
                    )}
                  </View>

                  <Text style={styles.chevron}>›</Text>
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
    backgroundColor: '#ECECEF',
    borderRadius: 17,
    minHeight: 45,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 19,
  },

  searchIcon: {
    color: CHARCOAL,
    fontSize: 22,
    marginRight: 9,
  },

  searchInput: {
    flex: 1,
    color: CHARCOAL,
    fontSize: 12,
    paddingVertical: 9,
  },

  clearSearch: {
    color: MUTED,
    fontSize: 14,
    paddingHorizontal: 5,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    gap: 8,
  },

  taskMain: {
    flex: 1,
    minWidth: 0,
  },

  taskTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  flightNumber: {
    color: CHARCOAL,
    fontSize: 14,
    fontWeight: '900',
    flex: 1,
    minWidth: 0,
  },

  taskTime: {
    color: CHARCOAL,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 42,
    textAlign: 'right',
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 18,
    minWidth: 67,
    maxWidth: 105,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },

  taskBottomLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
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
    color: '#B42318',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 6,
  },

  taskAction: {
    alignSelf: 'flex-start',
    marginTop: 9,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FFF1F3',
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },

  taskActionText: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  completeAction: {
    backgroundColor: '#F1F1F1',
  },

  completeActionText: {
    color: CHARCOAL,
  },

  completedText: {
    color: GREEN,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
  },

  chevron: {
    color: '#888888',
    fontSize: 25,
    paddingHorizontal: 2,
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
    color: '#B42318',
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

  emptyIcon: {
    color: GREEN,
    fontSize: 27,
    fontWeight: '900',
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
