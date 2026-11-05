
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import RegisterBaggageScreen from '@/components/register-baggage-screen';

import {
  AeroSyncColors,
  AeroSyncComponents,
  AeroSyncRadius,
  AeroSyncShadows,
  AeroSyncSpacing,
  AeroSyncStatus,
  AeroSyncTypography,
} from '@/constants/theme';

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type BaggageRecord = {
  id: string;
  baggageId?: string;
  flightId?: string;
  baggageReference?: string;
  status?: string;
  qrId?: string;
  qrPayload?: string;
  registeredBy?: string;
  createdAt?: unknown;
};

type BaggageScreenProps = {
  onBack?: () => void;
};

// --------------------------------------------------
// STATUS HELPER
// --------------------------------------------------

function getStatusStyle(status?: string) {
  const normalized = (status || 'registered').toLowerCase();

  if (normalized === 'offloaded') {
    return {
      backgroundColor: AeroSyncStatus.offloaded.background,
      color: AeroSyncStatus.offloaded.color,
      label: AeroSyncStatus.offloaded.label,
    };
  }

  if (normalized === 'loading') {
    return {
      backgroundColor: AeroSyncStatus.loading.background,
      color: AeroSyncStatus.loading.color,
      label: AeroSyncStatus.loading.label,
    };
  }

  return {
    backgroundColor: AeroSyncStatus.registered.background,
    color: AeroSyncStatus.registered.color,
    label: status || AeroSyncStatus.registered.label,
  };
}

// --------------------------------------------------
// MAIN SCREEN
// --------------------------------------------------

export default function BaggageScreen({ onBack }: BaggageScreenProps) {
  const [records, setRecords] = useState<BaggageRecord[]>([]);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // FIRESTORE SUBSCRIPTION

  useEffect(() => {
    const baggageQuery = query(
      collection(db, 'BaggageRecords'),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      baggageQuery,
      (snapshot) => {
        const baggageRecords: BaggageRecord[] = snapshot.docs.map(
          (record) => ({
            id: record.id,
            ...(record.data() as Omit<BaggageRecord, 'id'>),
          }),
        );

        setRecords(baggageRecords);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading baggage records:', error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  // REGISTRATION SCREEN

  if (showRegisterForm) {
    return (
      <RegisterBaggageScreen
        onBack={() => setShowRegisterForm(false)}
      />
    );
  }

  // LIVE STATUS COUNTS

  const registeredCount = records.filter(
    (record) =>
      (record.status || 'Registered').toLowerCase() === 'registered',
  ).length;

  const loadingCount = records.filter(
    (record) =>
      (record.status || '').toLowerCase() === 'loading',
  ).length;

  const offloadedCount = records.filter(
    (record) =>
      (record.status || '').toLowerCase() === 'offloaded',
  ).length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* BRAND HEADER */}

        <View style={styles.topHeader}>
          <View style={styles.brandSection}>
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>A</Text>
            </View>

            <View>
              <Text style={styles.brandName}>AeroSync</Text>
              <Text style={styles.brandSubtitle}>
                KENYA AIRWAYS · SUPERVISOR
              </Text>
            </View>
          </View>

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {/* BACK BUTTON */}

        {onBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
          >
            <Text style={styles.backButtonText}>‹  Back</Text>
          </TouchableOpacity>
        ) : null}

        {/* PAGE HEADING */}

        <View style={styles.headingSection}>
          <Text style={styles.eyebrow}>GROUND OPERATIONS</Text>
          <Text style={styles.title}>Baggage Operations</Text>

          <Text style={styles.subtitle}>
            Monitor baggage registration, loading and offloading
            across your operations.
          </Text>
        </View>

        {/* OPERATIONS BANNER */}

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTextSection}>
              <Text style={styles.heroEyebrow}>
                BAGGAGE CONTROL
              </Text>

              <Text style={styles.heroTitle}>
                Every bag, accounted for.
              </Text>

              <Text style={styles.heroDescription}>
                Keep track of baggage movement from registration
                through to offloading.
              </Text>
            </View>

            <View style={styles.heroIcon}>
              <Text style={styles.heroPlane}>✈</Text>
            </View>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>
              TOTAL BAGGAGE RECORDS
            </Text>
            <Text style={styles.totalNumber}>
              {records.length}
            </Text>
          </View>
        </View>

        {/* STATUS SUMMARY */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Baggage overview
            </Text>
            <Text style={styles.sectionSubtitle}>
              Current recorded baggage status
            </Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconRegistered}>
              <Text style={styles.statIconRegisteredText}>▣</Text>
            </View>
            <Text style={styles.statNumber}>{registeredCount}</Text>
            <Text style={styles.statLabel}>Registered</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconLoading}>
              <Text style={styles.statIconLoadingText}>↗</Text>
            </View>
            <Text style={styles.statNumber}>{loadingCount}</Text>
            <Text style={styles.statLabel}>Loading</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconOffloaded}>
              <Text style={styles.statIconOffloadedText}>✓</Text>
            </View>
            <Text style={styles.statNumber}>{offloadedCount}</Text>
            <Text style={styles.statLabel}>Offloaded</Text>
          </View>
        </View>

        {/* REGISTER BUTTON */}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setShowRegisterForm(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonIcon}>＋</Text>
          <Text style={styles.primaryButtonText}>
            Register New Baggage
          </Text>
          <Text style={styles.buttonArrow}>›</Text>
        </TouchableOpacity>

        {/* REGISTERED BAGGAGE */}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Registered Baggage
            </Text>
            <Text style={styles.sectionSubtitle}>
              All baggage records in the system
            </Text>
          </View>

          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {records.length}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size="large"
              color={AeroSyncColors.primary}
            />
            <Text style={styles.loadingText}>
              Loading baggage records...
            </Text>
          </View>
        ) : records.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>▣</Text>
            </View>

            <Text style={styles.emptyTitle}>
              No baggage registered yet
            </Text>

            <Text style={styles.emptyDescription}>
              New baggage registrations will appear here once
              they have been added to AeroSync.
            </Text>

            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowRegisterForm(true)}
            >
              <Text style={styles.emptyButtonText}>
                Register first baggage
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.recordsContainer}>
            {records.map((record) => {
              const statusStyle = getStatusStyle(record.status);

              return (
                <View key={record.id} style={styles.recordCard}>
                  <View style={styles.recordTop}>
                    <View style={styles.recordIcon}>
                      <Text style={styles.recordIconText}>▣</Text>
                    </View>

                    <View style={styles.recordMain}>
                      <Text
                        style={styles.recordBaggageId}
                        numberOfLines={1}
                      >
                        {record.baggageId || record.id}
                      </Text>

                      <Text style={styles.recordFlight}>
                        Flight: {record.flightId || '—'}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: statusStyle.backgroundColor,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: statusStyle.color },
                        ]}
                      />

                      <Text
                        style={[
                          styles.statusText,
                          { color: statusStyle.color },
                        ]}
                      >
                        {statusStyle.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.recordDivider} />

                  <View style={styles.recordBottom}>
                    <View>
                      <Text style={styles.referenceLabel}>
                        BAGGAGE REFERENCE
                      </Text>

                      <Text style={styles.recordReference}>
                        {record.baggageReference || 'Not available'}
                      </Text>
                    </View>

                    <Text style={styles.recordArrow}>›</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* FOOTER */}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            AEROSYNC · GROUND OPERATIONS
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// --------------------------------------------------
// STYLES - USING SHARED AEROSYNC THEME
// --------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AeroSyncColors.background,
  },

  content: {
    padding: AeroSyncSpacing.xl,
    paddingBottom: AeroSyncSpacing.pageBottom,
  },

  // BRAND HEADER

  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AeroSyncSpacing.section,
  },

  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AeroSyncSpacing.md,
  },

  brandIcon: {
    width: AeroSyncComponents.headerIconSize,
    height: AeroSyncComponents.headerIconSize,
    borderRadius: AeroSyncRadius.lg,
    backgroundColor: AeroSyncColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandIconText: {
    fontSize: 29,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.white,
  },

  brandName: {
    fontSize: 22,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.text,
    letterSpacing: -0.8,
  },

  brandSubtitle: {
    fontSize: AeroSyncTypography.fontSize.xs,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.primaryDark,
    letterSpacing: 0.8,
    marginTop: 2,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AeroSyncSpacing.xs + 2,
    backgroundColor: AeroSyncColors.successLight,
    paddingHorizontal: AeroSyncSpacing.md,
    paddingVertical: AeroSyncSpacing.sm,
    borderRadius: AeroSyncRadius.round,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: AeroSyncRadius.round,
    backgroundColor: AeroSyncColors.success,
  },

  liveText: {
    color: AeroSyncColors.success,
    fontSize: 11,
    fontWeight: AeroSyncTypography.fontWeight.black,
    letterSpacing: 0.8,
  },

  // BACK BUTTON

  backButton: {
    marginBottom: AeroSyncSpacing.lg,
  },

  backButtonText: {
    color: AeroSyncColors.primaryDark,
    fontSize: AeroSyncTypography.fontSize.md,
    fontWeight: AeroSyncTypography.fontWeight.extrabold,
  },

  // PAGE HEADING

  headingSection: {
    marginBottom: AeroSyncSpacing.xxl,
  },

  eyebrow: {
    color: AeroSyncColors.primaryDark,
    fontSize: AeroSyncTypography.fontSize.xs,
    fontWeight: AeroSyncTypography.fontWeight.black,
    letterSpacing: 1.5,
    marginBottom: AeroSyncSpacing.sm - 1,
  },

  title: {
    fontSize: AeroSyncTypography.fontSize.title,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.text,
    letterSpacing: -1,
    marginBottom: AeroSyncSpacing.sm - 1,
  },

  subtitle: {
    fontSize: AeroSyncTypography.fontSize.md,
    color: AeroSyncColors.textSecondary,
    lineHeight: 22,
  },

  // HERO CARD

  heroCard: {
    backgroundColor: AeroSyncColors.primary,
    borderRadius: AeroSyncRadius.xl,
    padding: AeroSyncSpacing.xxl,
    marginBottom: AeroSyncSpacing.section - 2,
    overflow: 'hidden',
  },

  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroTextSection: {
    flex: 1,
    paddingRight: AeroSyncSpacing.md,
  },

  heroEyebrow: {
    color: '#FFE0E4',
    fontSize: AeroSyncTypography.fontSize.xs,
    fontWeight: AeroSyncTypography.fontWeight.black,
    letterSpacing: 1.4,
    marginBottom: AeroSyncSpacing.md,
  },

  heroTitle: {
    color: AeroSyncColors.white,
    fontSize: 23,
    fontWeight: AeroSyncTypography.fontWeight.black,
    lineHeight: 29,
    marginBottom: AeroSyncSpacing.sm,
  },

  heroDescription: {
    color: AeroSyncColors.white,
    fontSize: 13,
    lineHeight: 20,
  },

  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: AeroSyncRadius.round,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroPlane: {
    color: AeroSyncColors.white,
    fontSize: 28,
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginTop: AeroSyncSpacing.xxl,
    marginBottom: AeroSyncSpacing.lg,
  },

  totalSection: {
    gap: AeroSyncSpacing.xs,
  },

  totalLabel: {
    color: '#FFE0E4',
    fontSize: AeroSyncTypography.fontSize.xs,
    fontWeight: AeroSyncTypography.fontWeight.black,
    letterSpacing: 1,
  },

  totalNumber: {
    color: AeroSyncColors.white,
    fontSize: 32,
    fontWeight: AeroSyncTypography.fontWeight.black,
  },

  // SECTION HEADINGS

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AeroSyncSpacing.md + 2,
  },

  sectionTitle: {
    fontSize: AeroSyncTypography.fontSize.xl,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.text,
    letterSpacing: -0.5,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: AeroSyncColors.textSecondary,
    marginTop: AeroSyncSpacing.xs,
  },

  // STAT CARDS

  statsContainer: {
    flexDirection: 'row',
    gap: AeroSyncSpacing.sm + 2,
    marginBottom: AeroSyncSpacing.xxl,
  },

  statCard: {
    flex: 1,
    backgroundColor: AeroSyncColors.surface,
    borderRadius: AeroSyncRadius.lg,
    padding: AeroSyncSpacing.md,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
  },

  statIconRegistered: {
    width: 34,
    height: 34,
    borderRadius: AeroSyncRadius.md - 1,
    backgroundColor: AeroSyncColors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AeroSyncSpacing.md,
  },

  statIconRegisteredText: {
    fontSize: 19,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.info,
  },

  statIconLoading: {
    width: 34,
    height: 34,
    borderRadius: AeroSyncRadius.md - 1,
    backgroundColor: AeroSyncColors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AeroSyncSpacing.md,
  },

  statIconLoadingText: {
    fontSize: 19,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.warning,
  },

  statIconOffloaded: {
    width: 34,
    height: 34,
    borderRadius: AeroSyncRadius.md - 1,
    backgroundColor: AeroSyncColors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AeroSyncSpacing.md,
  },

  statIconOffloadedText: {
    fontSize: 19,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.success,
  },

  statNumber: {
    fontSize: 25,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.text,
  },

  statLabel: {
    fontSize: 11,
    color: AeroSyncColors.textSecondary,
    fontWeight: AeroSyncTypography.fontWeight.bold,
    marginTop: AeroSyncSpacing.xs - 1,
  },

  // REGISTER BUTTON

  primaryButton: {
    height: AeroSyncComponents.buttonHeight + 4,
    backgroundColor: AeroSyncColors.primary,
    borderRadius: AeroSyncRadius.lg - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AeroSyncSpacing.lg,
    marginBottom: AeroSyncSpacing.section,
    ...AeroSyncShadows.button,
  },

  primaryButtonIcon: {
    fontSize: 24,
    fontWeight: AeroSyncTypography.fontWeight.bold,
    color: AeroSyncColors.white,
    marginRight: AeroSyncSpacing.sm,
  },

  primaryButtonText: {
    fontSize: AeroSyncTypography.fontSize.md,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.white,
  },

  buttonArrow: {
    position: 'absolute',
    right: AeroSyncSpacing.xl,
    fontSize: 27,
    color: AeroSyncColors.white,
  },

  // RECORD COUNT

  countBadge: {
    backgroundColor: AeroSyncColors.primaryLight,
    minWidth: 34,
    height: 34,
    borderRadius: AeroSyncRadius.round,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AeroSyncSpacing.sm,
  },

  countBadgeText: {
    color: AeroSyncColors.primaryDark,
    fontSize: 13,
    fontWeight: AeroSyncTypography.fontWeight.black,
  },

  // RECORD LIST

  recordsContainer: {
    gap: AeroSyncSpacing.md,
  },

  recordCard: {
    backgroundColor: AeroSyncColors.surface,
    borderRadius: AeroSyncRadius.lg,
    padding: AeroSyncSpacing.lg,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    ...AeroSyncShadows.card,
  },

  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  recordIcon: {
    width: AeroSyncComponents.iconSize,
    height: AeroSyncComponents.iconSize,
    borderRadius: AeroSyncRadius.md + 1,
    backgroundColor: AeroSyncColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: AeroSyncSpacing.md,
  },

  recordIconText: {
    color: AeroSyncColors.primaryDark,
    fontSize: 21,
    fontWeight: AeroSyncTypography.fontWeight.black,
  },

  recordMain: {
    flex: 1,
    paddingRight: AeroSyncSpacing.sm,
  },

  recordBaggageId: {
    fontSize: AeroSyncTypography.fontSize.base,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.text,
    marginBottom: AeroSyncSpacing.xs,
  },

  recordFlight: {
    fontSize: AeroSyncTypography.fontSize.sm,
    color: AeroSyncColors.textSecondary,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: AeroSyncSpacing.sm + 1,
    paddingVertical: AeroSyncSpacing.xs + 3,
    borderRadius: AeroSyncRadius.round,
    gap: AeroSyncSpacing.xs + 1,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: AeroSyncRadius.round,
  },

  statusText: {
    fontSize: AeroSyncTypography.fontSize.xs,
    fontWeight: AeroSyncTypography.fontWeight.black,
  },

  recordDivider: {
    height: 1,
    backgroundColor: AeroSyncColors.border,
    marginVertical: AeroSyncSpacing.md + 1,
  },

  recordBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  referenceLabel: {
    color: AeroSyncColors.textMuted,
    fontSize: 9,
    fontWeight: AeroSyncTypography.fontWeight.black,
    letterSpacing: 0.8,
    marginBottom: AeroSyncSpacing.xs + 1,
  },

  recordReference: {
    color: '#555555',
    fontSize: AeroSyncTypography.fontSize.sm,
    fontWeight: AeroSyncTypography.fontWeight.semibold,
  },

  recordArrow: {
    fontSize: 25,
    color: AeroSyncColors.primaryDark,
    fontWeight: AeroSyncTypography.fontWeight.semibold,
  },

  // EMPTY STATE

  emptyCard: {
    backgroundColor: AeroSyncColors.surface,
    borderRadius: AeroSyncRadius.xl - 4,
    padding: AeroSyncSpacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    ...AeroSyncShadows.card,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: AeroSyncRadius.lg + 2,
    backgroundColor: AeroSyncColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AeroSyncSpacing.md + 2,
  },

  emptyIconText: {
    color: AeroSyncColors.primaryDark,
    fontSize: 27,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: AeroSyncTypography.fontWeight.black,
    color: AeroSyncColors.text,
    marginBottom: AeroSyncSpacing.sm,
  },

  emptyDescription: {
    fontSize: 13,
    color: AeroSyncColors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: AeroSyncSpacing.lg,
  },

  emptyButton: {
    backgroundColor: AeroSyncColors.primaryLight,
    borderRadius: AeroSyncRadius.md - 2,
    paddingHorizontal: AeroSyncSpacing.lg,
    paddingVertical: AeroSyncSpacing.md,
  },

  emptyButtonText: {
    color: AeroSyncColors.primaryDark,
    fontSize: 13,
    fontWeight: AeroSyncTypography.fontWeight.black,
  },

  // LOADING

  loadingContainer: {
    backgroundColor: AeroSyncColors.surface,
    borderRadius: AeroSyncRadius.lg,
    padding: AeroSyncSpacing.xxl + 6,
    alignItems: 'center',
  },

  loadingText: {
    fontSize: 13,
    color: AeroSyncColors.textSecondary,
    marginTop: AeroSyncSpacing.md,
  },

  // FOOTER

  footer: {
    alignItems: 'center',
    marginTop: AeroSyncSpacing.section + 5,
    paddingBottom: AeroSyncSpacing.md,
  },

  footerText: {
    fontSize: AeroSyncTypography.fontSize.xs,
    color: AeroSyncColors.textMuted,
    fontWeight: AeroSyncTypography.fontWeight.black,
    letterSpacing: 1.2,
  },
});
