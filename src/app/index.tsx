import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
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

import ApprovalsScreen from './approvals';
import BaggageScreen from './baggage';
import CrewScreen from './crew';
import DelayRiskScreen from './delay-risk';
import HandlerDashboard from './handler-dashboard';

type DashboardScreen =
  | 'dashboard'
  | 'approvals'
  | 'baggage'
  | 'crew'
  | 'delay-risk';

const NAVY = '#163B65';
const BLUE = '#2878C8';
const BG = '#F4F6FA';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16805C';
const ORANGE = '#C96A16';

export default function HomeScreen() {
  const [role, setRole] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [screen, setScreen] =
    useState<DashboardScreen>('dashboard');

  const [pendingCount, setPendingCount] = useState(0);
  const [baggageCount, setBaggageCount] = useState(0);
  const [crewCount, setCrewCount] = useState(0);

  // Read only the signed-in user's profile.
  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setRole('');
      setProfileLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        setRole(snapshot.exists() ? snapshot.data().role ?? '' : '');
        setProfileLoading(false);
      },
      (error) => {
        console.error('Could not load user profile:', error);
        setRole('');
        setProfileLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  // Live counts for the supervisor dashboard.
  useEffect(() => {
    if (role !== 'supervisor') {
      return;
    }

    const unsubscribePending = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'pending')),
      (snapshot) => setPendingCount(snapshot.size),
      (error) => console.error('Could not load pending count:', error),
    );

    const unsubscribeCrew = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'handler')),
      (snapshot) => setCrewCount(snapshot.size),
      (error) => console.error('Could not load crew count:', error),
    );

    const unsubscribeBaggage = onSnapshot(
      collection(db, 'BaggageRecords'),
      (snapshot) => setBaggageCount(snapshot.size),
      (error) => console.error('Could not load baggage count:', error),
    );

    return () => {
      unsubscribePending();
      unsubscribeCrew();
      unsubscribeBaggage();
    };
  }, [role]);

  function goBack() {
    setScreen('dashboard');
  }

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <View style={styles.loadingLogo}>
          <Text style={styles.loadingLogoText}>A</Text>
        </View>

        <ActivityIndicator size="small" color={BLUE} />

        <Text style={styles.loadingText}>
          Loading AeroSync...
        </Text>
      </SafeAreaView>
    );
  }

  // Supervisor-only screens.
  if (role === 'supervisor') {
    if (screen === 'approvals') {
      return <ApprovalsScreen onBack={goBack} />;
    }

    if (screen === 'baggage') {
      return <BaggageScreen onBack={goBack} />;
    }

    if (screen === 'crew') {
      return <CrewScreen onBack={goBack} />;
    }

    if (screen === 'delay-risk') {
      return <DelayRiskScreen onBack={goBack} />;
    }
  }

  // Approved handler dashboard.
  if (role === 'handler') {
    return <HandlerDashboard />;
  }

  // Pending or unrecognized account.
  if (role !== 'supervisor') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.pendingContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>A</Text>
            </View>

            <View>
              <Text style={styles.brandName}>AeroSync</Text>
              <Text style={styles.brandSubtext}>
                Ground operations
              </Text>
            </View>
          </View>

          <View style={styles.pendingHero}>
            <View style={styles.pendingIcon}>
              <Text style={styles.pendingIconText}>⏳</Text>
            </View>

            <Text style={styles.pendingTitle}>
              Account pending approval
            </Text>

            <Text style={styles.pendingSubtitle}>
              Your account has not been approved for operational
              access yet. Please contact your supervisor.
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.cardEyebrow}>ACCOUNT</Text>

            <Text style={styles.cardTitle}>
              {auth.currentUser?.displayName ||
                auth.currentUser?.email ||
                'Signed-in user'}
            </Text>

            <View style={styles.accountStatusRow}>
              <View style={styles.pendingDot} />
              <Text style={styles.accountStatusText}>
                {role || 'Waiting for approval'}
              </Text>
            </View>
          </View>

          <Text style={styles.footer}>
            AeroSync · Ground crew coordination
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const supervisorName =
    auth.currentUser?.displayName?.split(' ')[0] || 'Supervisor';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerBrand}>
            <View style={styles.brandMarkSmall}>
              <Text style={styles.brandMarkSmallText}>A</Text>
            </View>

            <View>
              <Text style={styles.brandNameSmall}>AeroSync</Text>
              <Text style={styles.headerRole}>
                SUPERVISOR
              </Text>
            </View>
          </View>

          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {/* Greeting */}
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            Good to see you, {supervisorName}.
          </Text>

          <Text style={styles.subtitle}>
            Here's your ground operations overview.
          </Text>
        </View>

        {/* Main operations hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroEyebrow}>
                OPERATIONS CONTROL
              </Text>

              <Text style={styles.heroTitle}>
                Keep the operation moving.
              </Text>

              <Text style={styles.heroSubtitle}>
                Monitor crew coordination, baggage activity and
                staff readiness from one place.
              </Text>
            </View>

            <View style={styles.planeCircle}>
              <Text style={styles.planeText}>✈</Text>
            </View>
          </View>

          <View style={styles.heroDivider} />

          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroMetricLabel}>
                ACTIVE HANDLERS
              </Text>
              <Text style={styles.heroMetricValue}>
                {crewCount}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View>
              <Text style={styles.heroMetricLabel}>
                BAGGAGE RECORDS
              </Text>
              <Text style={styles.heroMetricValue}>
                {baggageCount}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View>
              <Text style={styles.heroMetricLabel}>
                APPROVALS
              </Text>
              <Text style={styles.heroMetricValue}>
                {pendingCount}
              </Text>
            </View>
          </View>
        </View>

        {/* Attention */}
        {pendingCount > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.attentionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('approvals')}
          >
            <View style={styles.attentionIcon}>
              <Text style={styles.attentionIconText}>!</Text>
            </View>

            <View style={styles.attentionInfo}>
              <Text style={styles.attentionTitle}>
                Action required
              </Text>

              <Text style={styles.attentionText}>
                {pendingCount === 1
                  ? '1 staff application is waiting for review.'
                  : `${pendingCount} staff applications are waiting for review.`}
              </Text>
            </View>

            <Text style={styles.attentionArrow}>›</Text>
          </Pressable>
        )}

        {/* Overview */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Operations overview
            </Text>

            <Text style={styles.sectionSubtitle}>
              Live activity across AeroSync
            </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('approvals')}
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor: '#FFF4E8',
                },
              ]}
            >
              <Text
                style={[
                  styles.statIconText,
                  {
                    color: ORANGE,
                  },
                ]}
              >
                ✓
              </Text>
            </View>

            <Text style={styles.statNumber}>
              {pendingCount}
            </Text>

            <Text style={styles.statLabel}>
              Pending approvals
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('baggage')}
          >
            <View style={styles.statIcon}>
              <Text style={styles.statIconText}>▣</Text>
            </View>

            <Text style={styles.statNumber}>
              {baggageCount}
            </Text>

            <Text style={styles.statLabel}>
              Baggage records
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('crew')}
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor: '#EAF7F2',
                },
              ]}
            >
              <Text
                style={[
                  styles.statIconText,
                  {
                    color: GREEN,
                  },
                ]}
              >
                ♧
              </Text>
            </View>

            <Text style={styles.statNumber}>
              {crewCount}
            </Text>

            <Text style={styles.statLabel}>
              Approved handlers
            </Text>
          </Pressable>

          <View style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor: '#F1F5F9',
                },
              ]}
            >
              <Text
                style={[
                  styles.statIconText,
                  {
                    color: MUTED,
                  },
                ]}
              >
                !
              </Text>
            </View>

            <Text style={styles.statNumber}>—</Text>

            <Text style={styles.statLabel}>
              Open incidents
            </Text>

            <Text style={styles.comingSoon}>
              Monitoring
            </Text>
          </View>
        </View>

        {/* Management */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Manage operations
            </Text>

            <Text style={styles.sectionSubtitle}>
              Access your operational workspaces
            </Text>
          </View>
        </View>

        <View style={styles.actionList}>
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('approvals')}
          >
            <View
              style={[
                styles.actionIcon,
                {
                  backgroundColor: '#FFF4E8',
                },
              ]}
            >
              <Text
                style={[
                  styles.actionIconText,
                  {
                    color: ORANGE,
                  },
                ]}
              >
                ✓
              </Text>
            </View>

            <View style={styles.actionInfo}>
              <View style={styles.actionTitleRow}>
                <Text style={styles.actionTitle}>
                  Staff approvals
                </Text>

                {pendingCount > 0 && (
                  <View style={styles.actionBadge}>
                    <Text style={styles.actionBadgeText}>
                      {pendingCount}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.actionDescription}>
                Review and approve eligible handler applications.
              </Text>
            </View>

            <Text style={styles.actionArrow}>›</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('baggage')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>▣</Text>
            </View>

            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Baggage operations
              </Text>

              <Text style={styles.actionDescription}>
                View baggage records, flights and handling status.
              </Text>
            </View>

            <Text style={styles.actionArrow}>›</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('crew')}
          >
            <View
              style={[
                styles.actionIcon,
                {
                  backgroundColor: '#EAF7F2',
                },
              ]}
            >
              <Text
                style={[
                  styles.actionIconText,
                  {
                    color: GREEN,
                  },
                ]}
              >
                ♧
              </Text>
            </View>

            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Crew coordination
              </Text>

              <Text style={styles.actionDescription}>
                Manage handlers, flights, shifts and assignments.
              </Text>
            </View>

            <Text style={styles.actionArrow}>›</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('delay-risk')}
          >
            <View
              style={[
                styles.actionIcon,
                {
                  backgroundColor: '#F1F5F9',
                },
              ]}
            >
              <Text
                style={[
                  styles.actionIconText,
                  {
                    color: NAVY,
                  },
                ]}
              >
                !
              </Text>
            </View>

            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Delay-risk monitoring
              </Text>

              <Text style={styles.actionDescription}>
                Assess operational warning indicators and delay risk.
              </Text>
            </View>

            <Text style={styles.actionArrow}>›</Text>
          </Pressable>
        </View>

        {/* Account */}
        <View style={styles.accountCard}>
          <View style={styles.accountAvatar}>
            <Text style={styles.accountAvatarText}>
              {supervisorName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.accountInfo}>
            <Text style={styles.accountLabel}>
              SUPERVISOR ACCOUNT
            </Text>

            <Text style={styles.accountEmail}>
              {auth.currentUser?.email || 'Supervisor account'}
            </Text>
          </View>
        </View>

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

  loadingScreen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  loadingLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  loadingLogoText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },

  loadingText: {
    color: NAVY,
    fontSize: 14,
  },

  content: {
    padding: 20,
    paddingBottom: 42,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },

  pendingContent: {
    padding: 22,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 24,
  },

  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  brandMarkSmall: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkSmallText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },

  brandNameSmall: {
    color: NAVY,
    fontSize: 17,
    fontWeight: '800',
  },

  headerRole: {
    color: BLUE,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 1,
  },

  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EAF7F2',
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GREEN,
  },

  liveText: {
    color: GREEN,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  greetingBlock: {
    marginBottom: 18,
  },

  greeting: {
    color: NAVY,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
  },

  subtitle: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },

  heroCard: {
    backgroundColor: NAVY,
    borderRadius: 22,
    padding: 21,
    marginBottom: 16,
  },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroTextBlock: {
    flex: 1,
    paddingRight: 12,
  },

  heroEyebrow: {
    color: '#BFD7EF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },

  heroSubtitle: {
    color: '#DCEBFA',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },

  planeCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  planeText: {
    color: '#FFFFFF',
    fontSize: 27,
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 18,
  },

  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroMetricLabel: {
    color: '#BFD7EF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },

  heroMetricValue: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 2,
  },

  heroMetricDivider: {
    width: 1,
    height: 31,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 17,
  },

  attentionCard: {
    backgroundColor: '#FFF8EF',
    borderWidth: 1,
    borderColor: '#F5D9B5',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  attentionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFE8CB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  attentionIconText: {
    color: ORANGE,
    fontSize: 20,
    fontWeight: '800',
  },

  attentionInfo: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },

  attentionTitle: {
    color: '#8A4A0A',
    fontSize: 14,
    fontWeight: '800',
  },

  attentionText: {
    color: '#9A6A3B',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  attentionArrow: {
    color: ORANGE,
    fontSize: 25,
    fontWeight: '700',
  },

  sectionHeader: {
    marginTop: 16,
    marginBottom: 10,
  },

  sectionTitle: {
    color: NAVY,
    fontSize: 18,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  statCard: {
    width: '47%',
    flexGrow: 1,
    minWidth: 135,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 15,
  },

  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  statIconText: {
    color: BLUE,
    fontSize: 17,
    fontWeight: '800',
  },

  statNumber: {
    color: NAVY,
    fontSize: 27,
    fontWeight: '800',
  },

  statLabel: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },

  comingSoon: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  actionList: {
    gap: 10,
  },

  actionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#EAF2FC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionIconText: {
    color: BLUE,
    fontSize: 21,
    fontWeight: '800',
  },

  actionInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  actionTitle: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '800',
  },

  actionDescription: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },

  actionBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#FFF0DC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionBadgeText: {
    color: ORANGE,
    fontSize: 10,
    fontWeight: '800',
  },

  actionArrow: {
    color: BLUE,
    fontSize: 25,
    fontWeight: '700',
  },

  accountCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 15,
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },

  accountAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  accountAvatarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  accountInfo: {
    flex: 1,
    marginLeft: 11,
  },

  accountLabel: {
    color: BLUE,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  accountEmail: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 8,
    marginBottom: 30,
  },

  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },

  brandName: {
    color: NAVY,
    fontSize: 18,
    fontWeight: '800',
  },

  brandSubtext: {
    color: MUTED,
    fontSize: 10,
    marginTop: 2,
  },

  pendingHero: {
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 25,
  },

  pendingIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: '#FFF4E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  pendingIconText: {
    fontSize: 30,
  },

  pendingTitle: {
    color: NAVY,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },

  pendingSubtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 9,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 18,
  },

  cardEyebrow: {
    color: BLUE,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 7,
  },

  cardTitle: {
    color: NAVY,
    fontSize: 15,
    fontWeight: '800',
  },

  accountStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    gap: 7,
  },

  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ORANGE,
  },

  accountStatusText: {
    color: MUTED,
    fontSize: 11,
  },

  footer: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 11,
    marginTop: 22,
  },
});