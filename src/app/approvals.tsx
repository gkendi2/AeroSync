
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'expo-router';
import {
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Applicant = {
  uid: string;
  displayName?: string;
  email?: string;
  role: string;
  requestedRole?: string;
  createdAt?: any;
  approvedAt?: any;
  rejectedAt?: any;
};

type ApprovalTab = 'pending' | 'approved' | 'rejected';

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

const RED = '#C8102E';
const DARK = '#252525';
const MUTED = '#777777';
const BG = '#F5F5F6';
const WHITE = '#FFFFFF';
const BORDER = '#EAEAEA';
const GREEN = '#16834A';

function getDateValue(value: any): Date | null {
  if (!value) return null;

  if (typeof value.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeDate(value: any): string {
  const date = getDateValue(value);
  if (!date) return 'Date unavailable';

  const difference = Date.now() - date.getTime();
  const days = Math.floor(difference / (1000 * 60 * 60 * 24));

  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;

  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

function formatFullDate(value: any): string {
  const date = getDateValue(value);
  if (!date) return 'Not available';

  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name?: string, email?: string) {
  const value = name || email || '?';

  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function getRoleName(role?: string) {
  if (role === 'handler') return 'Handler';
  if (role === 'supervisor') return 'Supervisor';
  return role || 'Role not specified';
}

export default function ApprovalsScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const router = useRouter();
  const currentUser = auth.currentUser;
  const isAdmin = currentUser?.uid === ADMIN_UID;

  const [activeTab, setActiveTab] = useState<ApprovalTab>('pending');
  const [pending, setPending] = useState<Applicant[]>([]);
  const [approved, setApproved] = useState<Applicant[]>([]);
  const [rejected, setRejected] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingUid, setProcessingUid] = useState<string | null>(null);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  function handleBack() {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }

  useEffect(() => {
    if (!currentUser) {
      setError('Please sign in to continue.');
      setLoading(false);
      return;
    }

    if (currentUser.uid !== ADMIN_UID) {
      setError('Only the AeroSync administrator can manage registrations.');
      setLoading(false);
      return;
    }

    let active = true;
    let completedInitialLoads = 0;

    const handleInitialLoad = () => {
      completedInitialLoads += 1;
      if (active && completedInitialLoads >= 3) {
        setLoading(false);
      }
    };

    const usersRef = collection(db, 'users');

    const pendingQuery = query(
      usersRef,
      where('role', '==', 'pending')
    );

    const approvedQuery = query(
      usersRef,
      where('role', 'in', ['handler', 'supervisor'])
    );

    const rejectedQuery = query(
      usersRef,
      where('role', '==', 'rejected')
    );

    const mapApplicants = (snapshot: any): Applicant[] =>
      snapshot.docs
        .map((item: any) => ({
          uid: item.id,
          ...(item.data() as Omit<Applicant, 'uid'>),
        }))
        .filter((item: Applicant) => item.uid !== ADMIN_UID)
        .sort((a: Applicant, b: Applicant) =>
          (a.displayName || '').localeCompare(b.displayName || '')
        );

    const unsubscribers = [
      onSnapshot(
        pendingQuery,
        (snapshot) => {
          if (!active) return;
          setPending(mapApplicants(snapshot));
          setError('');
          handleInitialLoad();
        },
        (err) => {
          console.error('Pending applications error:', err);
          if (!active) return;
          setError('Could not load applications. Check your connection and Firebase permissions.');
          setLoading(false);
        }
      ),

      onSnapshot(
        approvedQuery,
        (snapshot) => {
          if (!active) return;
          setApproved(mapApplicants(snapshot));
          handleInitialLoad();
        },
        (err) => {
          console.error('Approved applications error:', err);
          if (!active) return;
          setError('Could not load approved staff. Check your Firebase permissions.');
          setLoading(false);
        }
      ),

      onSnapshot(
        rejectedQuery,
        (snapshot) => {
          if (!active) return;
          setRejected(mapApplicants(snapshot));
          handleInitialLoad();
        },
        (err) => {
          console.error('Rejected applications error:', err);
          if (!active) return;
          setError('Could not load rejected applications. Check your Firebase permissions.');
          setLoading(false);
        }
      ),
    ];

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser?.uid]);

  const applicants = useMemo(() => {
    if (activeTab === 'approved') return approved;
    if (activeTab === 'rejected') return rejected;
    return pending;
  }, [activeTab, pending, approved, rejected]);

  function showMessage(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function handleApprove(applicant: Applicant) {
    if (!isAdmin || !currentUser || processingUid) return;

    const requestedRole = applicant.requestedRole;

    if (requestedRole !== 'handler' && requestedRole !== 'supervisor') {
      showMessage(
        'Cannot approve application',
        'This applicant has not selected a valid role.'
      );
      return;
    }

    const applicantName = applicant.displayName || applicant.email || 'This applicant';
    const roleName = getRoleName(requestedRole).toLowerCase();

    const confirmApproval = async () => {
      setProcessingUid(applicant.uid);

      try {
        await updateDoc(doc(db, 'users', applicant.uid), {
          role: requestedRole,
          approvedBy: currentUser.uid,
          approvedAt: serverTimestamp(),
        });

        setExpandedUid(null);
        showMessage(
          'Application approved',
          `${applicantName} has been approved as a ${roleName}.`
        );
      } catch (err) {
        console.error('Could not approve applicant:', err);
        showMessage(
          'Approval failed',
          'The application could not be approved. Check your connection and Firebase permissions.'
        );
      } finally {
        setProcessingUid(null);
      }
    };

    const message = `Are you sure you want to approve ${applicantName} as a ${roleName}?`;

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await confirmApproval();
      }
    } else {
      Alert.alert('Confirm approval', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => void confirmApproval(),
        },
      ]);
    }
  }

  async function handleReject(applicant: Applicant) {
    if (!isAdmin || !currentUser || processingUid) return;

    const applicantName = applicant.displayName || applicant.email || 'This applicant';

    const confirmRejection = async () => {
      setProcessingUid(applicant.uid);

      try {
        await updateDoc(doc(db, 'users', applicant.uid), {
          role: 'rejected',
          rejectedBy: currentUser.uid,
          rejectedAt: serverTimestamp(),
        });

        setExpandedUid(null);
        showMessage(
          'Application rejected',
          `${applicantName}'s application has been rejected.`
        );
      } catch (err) {
        console.error('Could not reject applicant:', err);
        showMessage(
          'Rejection failed',
          'The application could not be rejected. Check your connection and Firebase permissions.'
        );
      } finally {
        setProcessingUid(null);
      }
    };

    const message =
      `Are you sure you want to reject ${applicantName}'s application?\n\n` +
      'The user record will remain in Firestore.';

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await confirmRejection();
      }
    } else {
      Alert.alert('Reject application', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject application',
          style: 'destructive',
          onPress: () => void confirmRejection(),
        },
      ]);
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.accessDenied}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.emptyTitle}>Administrator access required</Text>
          <Text style={styles.mutedText}>
            Only the authorized AeroSync administrator can manage registrations.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const tabs: { key: ApprovalTab; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: pending.length },
    { key: 'approved', label: 'Approved', count: approved.length },
    { key: 'rejected', label: 'Rejected', count: rejected.length },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <Text style={styles.heading}>Approvals</Text>
        </View>

        <View style={styles.tabs}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  setActiveTab(tab.key);
                  setExpandedUid(null);
                }}
                style={[styles.tab, selected && styles.activeTab]}
              >
                <Text style={[styles.tabText, selected && styles.activeTabText]}>
                  {tab.label}
                  {tab.key === 'pending' ? ` (${tab.count})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.centerMessage}>
            <ActivityIndicator color={RED} size="large" />
            <Text style={styles.mutedText}>Loading staff applications...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerMessage}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {applicants.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'pending'
                    ? 'No pending applications'
                    : activeTab === 'approved'
                      ? 'No approved staff yet'
                      : 'No rejected applications'}
                </Text>
                <Text style={styles.mutedText}>
                  {activeTab === 'pending'
                    ? 'New staff registrations will appear here.'
                    : 'There are no records in this section yet.'}
                </Text>
              </View>
            ) : (
              applicants.map((applicant) => {
                const expanded = expandedUid === applicant.uid;
                const isProcessing = processingUid === applicant.uid;

                const dateValue =
                  activeTab === 'approved'
                    ? applicant.approvedAt
                    : activeTab === 'rejected'
                      ? applicant.rejectedAt || applicant.createdAt
                      : applicant.createdAt;

                return (
                  <View key={applicant.uid} style={styles.applicantItem}>
                    <Pressable
                      style={styles.applicantRow}
                      onPress={() =>
                        setExpandedUid(expanded ? null : applicant.uid)
                      }
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {getInitials(applicant.displayName, applicant.email)}
                        </Text>
                      </View>

                      <View style={styles.applicantInfo}>
                        <Text style={styles.applicantName} numberOfLines={1}>
                          {applicant.displayName || 'Name not provided'}
                        </Text>
                        <Text style={styles.applicantRole}>
                          {getRoleName(
                            activeTab === 'pending'
                              ? applicant.requestedRole
                              : applicant.role
                          )}
                        </Text>
                      </View>

                      <Text style={styles.dateText}>
                        {formatRelativeDate(dateValue)}
                      </Text>

                      <Text style={styles.chevron}>
                        {expanded ? '⌄' : '›'}
                      </Text>
                    </Pressable>

                    {expanded && (
                      <View style={styles.details}>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Email</Text>
                          <Text style={styles.detailValue}>
                            {applicant.email || 'Not provided'}
                          </Text>
                        </View>

                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Requested role</Text>
                          <Text style={styles.detailValue}>
                            {getRoleName(applicant.requestedRole)}
                          </Text>
                        </View>

                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>
                            {activeTab === 'approved'
                              ? 'Approved on'
                              : activeTab === 'rejected'
                                ? 'Rejected / registered on'
                                : 'Registered on'}
                          </Text>
                          <Text style={styles.detailValue}>
                            {formatFullDate(dateValue)}
                          </Text>
                        </View>

                        {activeTab === 'pending' && (
                          <View style={styles.actionRow}>
                            <Pressable
                              style={[
                                styles.approveButton,
                                isProcessing && styles.disabled,
                              ]}
                              onPress={() => handleApprove(applicant)}
                              disabled={processingUid !== null}
                            >
                              {isProcessing ? (
                                <ActivityIndicator color={WHITE} />
                              ) : (
                                <Text style={styles.approveText}>Approve</Text>
                              )}
                            </Pressable>

                            <Pressable
                              style={[
                                styles.rejectButton,
                                isProcessing && styles.disabled,
                              ]}
                              onPress={() => handleReject(applicant)}
                              disabled={processingUid !== null}
                            >
                              <Text style={styles.rejectText}>Reject</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
    backgroundColor: WHITE,
  },
  backButton: {
    width: 28,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 34,
    lineHeight: 38,
    color: DARK,
    fontWeight: '400',
  },
  heading: {
    fontSize: 21,
    fontWeight: '800',
    color: DARK,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: RED,
  },
  tabText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: RED,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 30,
  },
  applicantItem: {
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  applicantRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F4E3E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: RED,
    fontSize: 15,
    fontWeight: '800',
  },
  applicantInfo: {
    flex: 1,
    gap: 4,
  },
  applicantName: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
  },
  applicantRole: {
    color: MUTED,
    fontSize: 12,
  },
  dateText: {
    color: MUTED,
    fontSize: 11,
  },
  chevron: {
    color: DARK,
    fontSize: 25,
    paddingLeft: 2,
  },
  details: {
    paddingHorizontal: 60,
    paddingBottom: 16,
    gap: 12,
  },
  detailRow: {
    gap: 3,
  },
  detailLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
  },
  detailValue: {
    color: DARK,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 5,
  },
  approveButton: {
    flex: 1,
    minHeight: 42,
    backgroundColor: RED,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '800',
  },
  rejectButton: {
    flex: 1,
    minHeight: 42,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.5,
  },
  centerMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 65,
    paddingHorizontal: 25,
    gap: 8,
  },
  emptyTitle: {
    color: DARK,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  mutedText: {
    color: MUTED,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: RED,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  accessDenied: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
});
