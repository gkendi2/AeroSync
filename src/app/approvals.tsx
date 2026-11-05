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
import { useEffect, useState } from 'react';
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
};

const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

// AeroSync theme
const DARK = '#252525';
const RED = '#C8102E';
const BG = '#F4F3F3';
const MUTED = '#777777';
const BORDER = '#EAEAEA';
const WHITE = '#FFFFFF';
const GREEN = '#15803D';
const GREEN_BG = '#ECFDF3';
const RED_BG = '#FDE9EC';
const ORANGE = '#B45309';
const ORANGE_BG = '#FFF7ED';

export default function ApprovalsScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const router = useRouter();
  const currentUser = auth.currentUser;

  const isAdmin = currentUser?.uid === ADMIN_UID;

  function handleBack() {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingUid, setProcessingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setError('Please sign in to continue.');
      setLoading(false);
      return;
    }

    if (currentUser.uid !== ADMIN_UID) {
      setApplicants([]);
      setError('Only the AeroSync administrator can manage registrations.');
      setLoading(false);
      return;
    }

    let active = true;

    const pendingQuery = query(
      collection(db, 'users'),
      where('role', '==', 'pending')
    );

    const unsubscribeApplicants = onSnapshot(
      pendingQuery,
      (snapshot) => {
        if (!active) return;

        setApplicants(
          snapshot.docs
            .map((item) => ({
              uid: item.id,
              ...(item.data() as Omit<Applicant, 'uid'>),
            }))
            .filter((item) => item.uid !== ADMIN_UID)
            .sort((a, b) =>
              (a.displayName ?? '').localeCompare(
                b.displayName ?? ''
              )
            )
        );

        setError('');
        setLoading(false);
      },
      (snapshotError) => {
        console.error(
          'Could not load pending applicants:',
          snapshotError
        );

        setError(
          'Could not load applications. Check your connection and Firebase permissions.'
        );
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribeApplicants();
    };
  }, [currentUser?.uid]);

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

    if (
      requestedRole !== 'handler' &&
      requestedRole !== 'supervisor'
    ) {
      showMessage(
        'Cannot approve application',
        'This applicant has not selected a valid role. Only handler and supervisor registrations can be approved.'
      );
      return;
    }

    const applicantName =
      applicant.displayName || applicant.email || 'this applicant';

    const roleName =
      requestedRole === 'handler' ? 'baggage handler' : 'supervisor';

    const confirmApproval = async () => {
      setProcessingUid(applicant.uid);

      try {
        await updateDoc(doc(db, 'users', applicant.uid), {
          role: requestedRole,
          approvedBy: currentUser.uid,
          approvedAt: serverTimestamp(),
        });

        showMessage(
          'Application approved',
          `${applicantName} has been approved as a ${roleName}.`
        );
      } catch (approvalError) {
        console.error(
          'Could not approve applicant:',
          approvalError
        );

        showMessage(
          'Approval failed',
          'The application could not be approved. Check your connection and Firebase permissions, then try again.'
        );
      } finally {
        setProcessingUid(null);
      }
    };

    const confirmationMessage =
      `Are you sure you want to approve ${applicantName} as a ${roleName}?`;

    if (Platform.OS === 'web') {
      if (window.confirm(confirmationMessage)) {
        await confirmApproval();
      }
    } else {
      Alert.alert(
        'Confirm approval',
        confirmationMessage,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Approve',
            onPress: () => {
              void confirmApproval();
            },
          },
        ]
      );
    }
  }

  async function handleReject(applicant: Applicant) {
    if (!isAdmin || !currentUser || processingUid) return;

    const applicantName =
      applicant.displayName || applicant.email || 'this applicant';

    const confirmRejection = async () => {
      setProcessingUid(applicant.uid);

      try {
        await updateDoc(doc(db, 'users', applicant.uid), {
          role: 'rejected',
          rejectedBy: currentUser.uid,
          rejectedAt: serverTimestamp(),
        });

        showMessage(
          'Application rejected',
          `${applicantName}'s application has been rejected. Their user record remains in Firestore.`
        );
      } catch (rejectionError) {
        console.error(
          'Could not reject applicant:',
          rejectionError
        );

        showMessage(
          'Rejection failed',
          'The application could not be rejected. Check your connection and Firebase permissions, then try again.'
        );
      } finally {
        setProcessingUid(null);
      }
    };

    const confirmationMessage =
      `Are you sure you want to reject ${applicantName}'s application?\n\n` +
      'The application will disappear from the pending list, but the Firestore user record will be retained.';

    if (Platform.OS === 'web') {
      if (window.confirm(confirmationMessage)) {
        await confirmRejection();
      }
    } else {
      Alert.alert(
        'Reject application',
        confirmationMessage,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Reject application',
            style: 'destructive',
            onPress: () => {
              void confirmRejection();
            },
          },
        ]
      );
    }
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back to dashboard</Text>
          </Pressable>

          <View style={styles.messageCard}>
            <View style={styles.lockIcon}>
              <Text style={styles.lockIconText}>!</Text>
            </View>

            <Text style={styles.emptyTitle}>
              Administrator access required
            </Text>

            <Text style={styles.mutedText}>
              Only the authorized AeroSync administrator can approve or
              reject registrations.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back to dashboard</Text>
        </Pressable>

        {/* Page heading */}
        <View style={styles.headingSection}>
          <Text style={styles.eyebrow}>ADMINISTRATION</Text>

          <Text style={styles.heading}>
            Registration approvals
          </Text>

          <Text style={styles.subtitle}>
            Review new staff registrations and manage access to the
            AeroSync platform.
          </Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryLabel}>
                PENDING APPLICATIONS
              </Text>

              <Text style={styles.summaryNumber}>
                {loading ? '—' : applicants.length}
              </Text>

              <Text style={styles.summaryDescription}>
                {applicants.length === 1
                  ? 'Application awaiting review'
                  : 'Applications awaiting review'}
              </Text>
            </View>

            <View style={styles.summaryIcon}>
              <Text style={styles.summaryIconText}>✓</Text>
            </View>
          </View>
        </View>

        {/* Applications heading */}
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>
              Applications
            </Text>

            <Text style={styles.sectionSubtitle}>
              Review each applicant before granting access.
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {loading ? '—' : applicants.length}
            </Text>
          </View>
        </View>

        {/* Loading */}
        {loading ? (
          <View style={styles.messageCard}>
            <ActivityIndicator size="large" color={RED} />

            <Text style={styles.mutedText}>
              Loading applications...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.messageCard}>
            <View style={styles.errorIcon}>
              <Text style={styles.errorIconText}>!</Text>
            </View>

            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : applicants.length === 0 ? (
          <View style={styles.messageCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>✓</Text>
            </View>

            <Text style={styles.emptyTitle}>
              All caught up!
            </Text>

            <Text style={styles.mutedText}>
              There are no pending applications right now. New staff
              registrations will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {applicants.map((applicant) => {
              const requestedRole = applicant.requestedRole;

              const validRole =
                requestedRole === 'handler' ||
                requestedRole === 'supervisor';

              const isProcessing =
                processingUid === applicant.uid;

              const applicantInitial = (
                applicant.displayName ||
                applicant.email ||
                '?'
              )
                .charAt(0)
                .toUpperCase();

              return (
                <View
                  key={applicant.uid}
                  style={styles.applicantCard}
                >
                  {/* Applicant details */}
                  <View style={styles.applicantHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {applicantInitial}
                      </Text>
                    </View>

                    <View style={styles.applicantInfo}>
                      <Text style={styles.applicantName}>
                        {applicant.displayName ||
                          'Name not provided'}
                      </Text>

                      <Text style={styles.email}>
                        {applicant.email ||
                          'Email not available'}
                      </Text>
                    </View>

                    <View style={styles.pendingBadge}>
                      <View style={styles.pendingDot} />

                      <Text style={styles.pendingBadgeText}>
                        Pending
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  {/* Requested role */}
                  <View style={styles.roleRow}>
                    <View>
                      <Text style={styles.fieldLabel}>
                        REQUESTED ROLE
                      </Text>

                      <Text style={styles.roleName}>
                        {requestedRole
                          ? requestedRole === 'handler'
                            ? 'Baggage Handler'
                            : requestedRole === 'supervisor'
                              ? 'Supervisor'
                              : requestedRole
                          : 'Not specified'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.roleBadge,
                        requestedRole === 'supervisor' &&
                          styles.supervisorBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          requestedRole === 'supervisor' &&
                            styles.supervisorBadgeText,
                        ]}
                      >
                        {requestedRole || 'Unknown role'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  {validRole ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        style={[
                          styles.approveButton,
                          processingUid !== null && styles.disabled,
                        ]}
                        onPress={() => handleApprove(applicant)}
                        disabled={processingUid !== null}
                      >
                        {isProcessing ? (
                          <ActivityIndicator color={WHITE} />
                        ) : (
                          <Text style={styles.approveButtonText}>
                            Approve
                          </Text>
                        )}
                      </Pressable>

                      <Pressable
                        style={[
                          styles.rejectButton,
                          processingUid !== null && styles.disabled,
                        ]}
                        onPress={() => handleReject(applicant)}
                        disabled={processingUid !== null}
                      >
                        {isProcessing ? (
                          <ActivityIndicator color={RED} />
                        ) : (
                          <Text style={styles.rejectButtonText}>
                            Reject
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <View style={styles.warningBox}>
                        <Text style={styles.warningTitle}>
                          Invalid registration role
                        </Text>

                        <Text style={styles.warningText}>
                          This applicant has not selected a valid
                          registration role. They cannot be approved
                          until their requested role is corrected.
                        </Text>
                      </View>

                      <Pressable
                        style={[
                          styles.rejectButton,
                          styles.fullRejectButton,
                          processingUid !== null && styles.disabled,
                        ]}
                        onPress={() => handleReject(applicant)}
                        disabled={processingUid !== null}
                      >
                        {isProcessing ? (
                          <ActivityIndicator color={RED} />
                        ) : (
                          <Text style={styles.rejectButtonText}>
                            Reject application
                          </Text>
                        )}
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.footerText}>
          AEROSYNC · STAFF ACCESS MANAGEMENT
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
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    gap: 18,
  },

  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 12,
  },

  backText: {
    color: RED,
    fontWeight: '700',
    fontSize: 14,
  },

  headingSection: {
    gap: 7,
    marginTop: 2,
    marginBottom: 4,
  },

  eyebrow: {
    color: RED,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  heading: {
    color: DARK,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.6,
  },

  subtitle: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 550,
  },

  summaryCard: {
    backgroundColor: DARK,
    borderRadius: 18,
    padding: 22,
    marginTop: 2,
    overflow: 'hidden',
  },

  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  summaryLabel: {
    color: '#D0D0D0',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },

  summaryNumber: {
    color: WHITE,
    fontSize: 40,
    fontWeight: '800',
    marginTop: 7,
  },

  summaryDescription: {
    color: '#C8C8C8',
    fontSize: 13,
    marginTop: 2,
  },

  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryIconText: {
    color: WHITE,
    fontSize: 25,
    fontWeight: '800',
  },

  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },

  sectionTitle: {
    color: DARK,
    fontSize: 18,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: RED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  countBadgeText: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
  },

  list: {
    gap: 14,
  },

  applicantCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 16,
  },

  applicantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: RED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: RED,
    fontWeight: '800',
    fontSize: 19,
  },

  applicantInfo: {
    flex: 1,
    gap: 4,
  },

  applicantName: {
    color: DARK,
    fontSize: 15,
    fontWeight: '800',
  },

  email: {
    color: MUTED,
    fontSize: 12,
  },

  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ORANGE_BG,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },

  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },

  pendingBadgeText: {
    color: ORANGE,
    fontSize: 10,
    fontWeight: '800',
  },

  cardDivider: {
    height: 1,
    backgroundColor: BORDER,
  },

  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  fieldLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  roleName: {
    color: DARK,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
  },

  roleBadge: {
    backgroundColor: RED_BG,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },

  roleBadgeText: {
    color: RED,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'capitalize',
  },

  supervisorBadge: {
    backgroundColor: '#F1F1F1',
  },

  supervisorBadgeText: {
    color: DARK,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },

  approveButton: {
    flex: 1,
    backgroundColor: RED,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },

  approveButtonText: {
    color: WHITE,
    fontWeight: '800',
    fontSize: 13,
  },

  rejectButton: {
    flex: 1,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: '#F2BFC7',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },

  fullRejectButton: {
    width: '100%',
    flex: 0,
  },

  rejectButtonText: {
    color: RED,
    fontWeight: '800',
    fontSize: 13,
  },

  disabled: {
    opacity: 0.55,
  },

  warningBox: {
    backgroundColor: ORANGE_BG,
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE2C5',
    gap: 5,
  },

  warningTitle: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '800',
  },

  warningText: {
    color: '#8A4B08',
    fontSize: 12,
    lineHeight: 18,
  },

  messageCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: BORDER,
    minHeight: 170,
  },

  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GREEN_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIconText: {
    color: GREEN,
    fontSize: 24,
    fontWeight: '800',
  },

  lockIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: RED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  lockIconText: {
    color: RED,
    fontSize: 23,
    fontWeight: '800',
  },

  errorIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: RED_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorIconText: {
    color: RED,
    fontSize: 22,
    fontWeight: '800',
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
    maxWidth: 400,
  },

  errorText: {
    color: RED,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
  },

  footerText: {
    color: '#A0A0A0',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 14,
  },
});