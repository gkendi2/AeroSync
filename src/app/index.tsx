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
import FlightsScreen from './flights';
import HandlerDashboard from './handler-dashboard';
import IncidentManagementScreen from './incident-management';

type DashboardScreen =
  | 'dashboard'
  | 'approvals'
  | 'baggage'
  | 'crew'
  | 'delay-risk'
  | 'flights'
  | 'incident-management';

const RED = '#F0182B';
const DEEP_RED = '#B51F3A';
const BACKGROUND = '#F5F5F6';
const TEXT = '#222222';
const MUTED = '#737373';
const BORDER = '#E7E7E9';
const PALE_RED = '#FDECEF';
const GREEN = '#16805C';

export default function HomeScreen() {
  const [role, setRole] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [screen, setScreen] =
    useState<DashboardScreen>('dashboard');

  const [pendingCount, setPendingCount] = useState(0);
  const [baggageCount, setBaggageCount] = useState(0);
  const [crewCount, setCrewCount] = useState(0);

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
        setRole(
          snapshot.exists() ? snapshot.data().role ?? '' : ''
        );
        setProfileLoading(false);
      },
      (error) => {
        console.error('Could not load user profile:', error);
        setRole('');
        setProfileLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (role !== 'supervisor') {
      return;
    }

    const unsubscribePending = onSnapshot(
      query(
        collection(db, 'users'),
        where('role', '==', 'pending')
      ),
      (snapshot) => setPendingCount(snapshot.size),
      (error) =>
        console.error('Could not load pending count:', error)
    );

    const unsubscribeCrew = onSnapshot(
      query(
        collection(db, 'users'),
        where('role', '==', 'handler')
      ),
      (snapshot) => setCrewCount(snapshot.size),
      (error) =>
        console.error('Could not load crew count:', error)
    );

    const unsubscribeBaggage = onSnapshot(
      collection(db, 'BaggageRecords'),
      (snapshot) => setBaggageCount(snapshot.size),
      (error) =>
        console.error('Could not load baggage count:', error)
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
        <ActivityIndicator size="large" color={RED} />
        <Text style={styles.loadingText}>
          Loading AeroSync...
        </Text>
      </SafeAreaView>
    );
  }

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

    if (screen === 'flights') {
      return <FlightsScreen onBack={goBack} />;
    }

    if (screen === 'incident-management') {
      return <IncidentManagementScreen onBack={goBack} />;
    }
  }

  if (role === 'handler') {
    return <HandlerDashboard />;
  }

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
                KENYA AIRWAYS · GROUND OPERATIONS
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
            AEROSYNC · GROUND OPERATIONS
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const supervisorName =
    auth.currentUser?.displayName?.split(' ')[0] ||
    'Supervisor';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand header */}
        <View style={styles.headerRow}>
          <View style={styles.headerBrand}>
            <View style={styles.brandMarkSmall}>
              <Text style={styles.brandMarkSmallText}>A</Text>
            </View>
            <View>
              <Text style={styles.brandNameSmall}>AeroSync</Text>
              <Text style={styles.headerRole}>
                KENYA AIRWAYS · SUPERVISOR
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

        {/* Red operations banner */}
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
            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>HANDLERS</Text>
              <Text style={styles.heroMetricValue}>
                {crewCount}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>BAGGAGE</Text>
              <Text style={styles.heroMetricValue}>
                {baggageCount}
              </Text>
            </View>

            <View style={styles.heroMetricDivider} />

            <View style={styles.heroMetric}>
              <Text style={styles.heroMetricLabel}>APPROVALS</Text>
              <Text style={styles.heroMetricValue}>
                {pendingCount}
              </Text>
            </View>
          </View>
        </View>

        {/* Action required */}
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

        {/* Summary cards */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Today's overview
          </Text>
          <Text style={styles.sectionSubtitle}>
            Live records from AeroSync
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('crew')}
          >
            <View style={styles.statIcon}>
              <Text style={styles.statIconText}>♧</Text>
            </View>
            <Text style={styles.statNumber}>{crewCount}</Text>
            <Text style={styles.statLabel}>
              Approved handlers
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
            <Text style={styles.statNumber}>{baggageCount}</Text>
            <Text style={styles.statLabel}>
              Baggage records
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.statCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('approvals')}
          >
            <View style={styles.statIcon}>
              <Text style={styles.statIconText}>✓</Text>
            </View>
            <Text style={styles.statNumber}>{pendingCount}</Text>
            <Text style={styles.statLabel}>
              Pending approvals
            </Text>
          </Pressable>

          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Text style={styles.statIconText}>!</Text>
            </View>
            <Text style={styles.statNumber}>—</Text>
            <Text style={styles.statLabel}>Open incidents</Text>
            <Text style={styles.comingSoon}>Not connected yet</Text>
          </View>
        </View>

        {/* Operational shortcuts */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Operations management
          </Text>
          <Text style={styles.sectionSubtitle}>
            Choose a workspace to continue
          </Text>
        </View>

        <View style={styles.actionList}>
          {/* Flight management */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('flights')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>✈</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Flight management
              </Text>
              <Text style={styles.actionDescription}>
                Create flights and load sample demo flights.
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
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>♧</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Crew coordination
              </Text>
              <Text style={styles.actionDescription}>
                Manage handlers, shifts and assignments.
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
                Baggage tracking
              </Text>
              <Text style={styles.actionDescription}>
                Review baggage records and handling status.
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
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>!</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Delay-risk monitoring
              </Text>
              <Text style={styles.actionDescription}>
                Review operational indicators and delay risks.
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </Pressable>

          {/* Incident management */}
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('incident-management')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>!</Text>
            </View>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>
                Incident management
              </Text>
              <Text style={styles.actionDescription}>
                Review reports, investigate incidents and manage closure.
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && styles.pressed,
            ]}
            onPress={() => setScreen('approvals')}
          >
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>✓</Text>
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
                Review pending handler applications.
              </Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </Pressable>
        </View>

        {/* Account information */}
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
          AEROSYNC · KENYA AIRWAYS GROUND OPERATIONS
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

  loadingScreen: {
    flex: 1,
    backgroundColor: BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  loadingLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: RED,
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
    color: TEXT,
    fontSize: 14,
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 30,
    width: '100%',
    alignSelf: 'center',
  },

  pendingContent: {
    padding: 22,
    paddingBottom: 40,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },

  brandMarkSmall: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkSmallText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },

  brandNameSmall: {
    color: TEXT,
    fontSize: 19,
    fontWeight: '900',
  },

  headerRole: {
    color: DEEP_RED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 2,
  },

  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#E8F5EF',
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
    letterSpacing: 0.5,
  },

  greetingBlock: {
    marginBottom: 18,
  },

  greeting: {
    color: TEXT,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: '900',
  },

  subtitle: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },

  heroCard: {
    backgroundColor: RED,
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
  },

  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroTextBlock: {
    flex: 1,
    paddingRight: 8,
  },

  heroEyebrow: {
    color: '#FFFFFF',
    opacity: 0.9,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 8,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
  },

  heroSubtitle: {
    color: '#FFFFFF',
    opacity: 0.95,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },

  planeCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  planeText: {
    color: '#FFFFFF',
    fontSize: 25,
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 18,
  },

  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  heroMetric: {
    flex: 1,
    alignItems: 'flex-start',
  },

  heroMetricLabel: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  heroMetricValue: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 3,
  },

  heroMetricDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: 9,
  },

  attentionCard: {
    backgroundColor: '#FFF0F1',
    borderWidth: 1,
    borderColor: '#F5C7CC',
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
    backgroundColor: '#FBD9DE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  attentionIconText: {
    color: DEEP_RED,
    fontSize: 20,
    fontWeight: '900',
  },

  attentionInfo: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },

  attentionTitle: {
    color: DEEP_RED,
    fontSize: 14,
    fontWeight: '800',
  },

  attentionText: {
    color: '#8B414A',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  attentionArrow: {
    color: DEEP_RED,
    fontSize: 25,
    fontWeight: '700',
  },

  sectionHeader: {
    marginTop: 14,
    marginBottom: 12,
  },

  sectionTitle: {
    color: TEXT,
    fontSize: 19,
    fontWeight: '900',
  },

  sectionSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  statCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: 130,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 15,
  },

  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  statIconText: {
    color: DEEP_RED,
    fontSize: 20,
    fontWeight: '900',
  },

  statNumber: {
    color: TEXT,
    fontSize: 28,
    fontWeight: '900',
  },

  statLabel: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },

  comingSoon: {
    color: DEEP_RED,
    fontSize: 9,
    fontWeight: '800',
    marginTop: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionIconText: {
    color: DEEP_RED,
    fontSize: 22,
    fontWeight: '900',
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
    flexWrap: 'wrap',
  },

  actionTitle: {
    color: TEXT,
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
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionBadgeText: {
    color: DEEP_RED,
    fontSize: 10,
    fontWeight: '900',
  },

  actionArrow: {
    color: DEEP_RED,
    fontSize: 26,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  accountAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  accountInfo: {
    flex: 1,
    marginLeft: 11,
  },

  accountLabel: {
    color: DEEP_RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  accountEmail: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
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
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },

  brandName: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '900',
  },

  brandSubtext: {
    color: DEEP_RED,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
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
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  pendingIconText: {
    fontSize: 30,
  },

  pendingTitle: {
    color: TEXT,
    fontSize: 24,
    fontWeight: '900',
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
    color: DEEP_RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 7,
  },

  cardTitle: {
    color: TEXT,
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
    backgroundColor: RED,
  },

  accountStatusText: {
    color: MUTED,
    fontSize: 11,
  },

  footer: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 24,
  },
});