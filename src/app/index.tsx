
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
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/icon';
import { isAdminUser } from '@/lib/admin';
import { useRouter } from 'expo-router';

import HandlerDashboard from './handler-dashboard';

type FlightSummary = {
  id: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  departureTime?: string;
  status?: string;
};

const RED = '#C8102E';
const DARK = '#20252B';
const MUTED = '#737B84';
const BORDER = '#E7E9EC';
const WHITE = '#FFFFFF';
const BACKGROUND = '#F5F5F6';

const AIRPORT_IMAGE =
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1600&q=90';

function getToday() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getFormattedDate() {
  return new Date().toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function getStatusStyle(status: string) {
  const value = status.toLowerCase();

  if (
    value.includes('risk') ||
    value.includes('delay') ||
    value.includes('cancel')
  ) {
    return { backgroundColor: '#FCE9EC', color: RED };
  }

  if (
    value.includes('progress') ||
    value.includes('turnaround') ||
    value.includes('boarding')
  ) {
    return { backgroundColor: '#E8F0FA', color: '#2863A6' };
  }

  if (
    value.includes('complete') ||
    value.includes('departed') ||
    value.includes('arrived')
  ) {
    return { backgroundColor: '#E8F3EC', color: '#287448' };
  }

  return { backgroundColor: '#F0F1F2', color: '#626970' };
}

export default function HomeScreen() {
  // Screens open as routes (like the tab bar and More), so their back
  // buttons return here through the router.
  const router = useRouter();
  const isAdmin = isAdminUser(auth.currentUser);

  const [role, setRole] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  const [pendingCount, setPendingCount] = useState(0);
  const [baggageCount, setBaggageCount] = useState(0);
  const [crewCount, setCrewCount] = useState(0);
  const [todayFlights, setTodayFlights] = useState<FlightSummary[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(true);

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
    if (role !== 'supervisor') return;

    const unsubscribePending = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'pending')),
      (snapshot) => setPendingCount(snapshot.size),
      (error) => console.error('Could not load pending count:', error)
    );

    const unsubscribeCrew = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'handler')),
      (snapshot) => setCrewCount(snapshot.size),
      (error) => console.error('Could not load crew count:', error)
    );

    const unsubscribeBaggage = onSnapshot(
      collection(db, 'BaggageRecords'),
      (snapshot) => setBaggageCount(snapshot.size),
      (error) => console.error('Could not load baggage count:', error)
    );

    const unsubscribeFlights = onSnapshot(
      collection(db, 'Flights'),
      (snapshot) => {
        const records = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as FlightSummary[];

        const filtered = records
          .filter((flight) => flight.departureDate === getToday())
          .sort((a, b) =>
            (a.departureTime || '').localeCompare(b.departureTime || '')
          );

        setTodayFlights(filtered);
        setFlightsLoading(false);
      },
      (error) => {
        console.error('Could not load today’s flights:', error);
        setFlightsLoading(false);
      }
    );

    return () => {
      unsubscribePending();
      unsubscribeCrew();
      unsubscribeBaggage();
      unsubscribeFlights();
    };
  }, [role]);

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={styles.loadingLogo}>K</Text>
        <ActivityIndicator size="large" color={RED} />
        <Text style={styles.loadingText}>Loading AeroSync...</Text>
      </SafeAreaView>
    );
  }

  if (role === 'handler') {
    return <HandlerDashboard />;
  }

  if (role !== 'supervisor') {
    return (
      <SafeAreaView style={styles.pendingScreen}>
        <ScrollView contentContainerStyle={styles.pendingContent}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>K</Text>
            </View>
            <View>
              <Text style={styles.brandName}>AeroSync</Text>
              <Text style={styles.brandSubtext}>
                KENYA AIRWAYS · GROUND OPERATIONS
              </Text>
            </View>
          </View>

          <View style={styles.pendingHero}>
            <Text style={styles.pendingEyebrow}>ACCOUNT ACCESS</Text>
            <Text style={styles.pendingTitle}>
              Account pending approval
            </Text>
            <Text style={styles.pendingDescription}>
              Your account has not been approved for operational access
              yet. Please contact your supervisor.
            </Text>
          </View>

          <View style={styles.pendingAccount}>
            <Text style={styles.pendingLabel}>SIGNED-IN ACCOUNT</Text>
            <Text style={styles.pendingName}>
              {auth.currentUser?.displayName ||
                auth.currentUser?.email ||
                'Signed-in user'}
            </Text>
            <Text style={styles.pendingStatus}>
              {role || 'Waiting for approval'}
            </Text>
          </View>
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
        {/* Application header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMarkSmall}>
              <Text style={styles.brandMarkSmallText}>K</Text>
            </View>
            <View>
              <Text style={styles.brandNameSmall}>AeroSync</Text>
              <Text style={styles.headerRole}>SUPERVISOR</Text>
            </View>
          </View>
        </View>

        {/* Main aviation image */}
        <ImageBackground
          source={{ uri: AIRPORT_IMAGE }}
          style={styles.welcomeImage}
          imageStyle={styles.welcomeImageRadius}
          resizeMode="cover"
        >
          <View style={styles.imageOverlay}>
            <View style={styles.welcomeCopy}>
              <Text style={styles.greeting}>Good morning,</Text>
              <Text style={styles.greetingName}>
                {supervisorName}.
              </Text>
              <Text style={styles.dateText}>{getFormattedDate()}</Text>
            </View>
            <View style={styles.imageBottomLine} />
          </View>
        </ImageBackground>

        {/* Overlapping operations summary */}
        <Pressable
          style={styles.metricsPanel}
          onPress={() => router.push('/crew')}
        >
          <View style={styles.metricsHeading}>
            <View>
              <Text style={styles.metricsTitle}>
                Operations at a glance
              </Text>
              <Text style={styles.metricsSubtitle}>
                Current operational records
              </Text>
            </View>
            <Icon name="forward" size={22} color={MUTED} />
          </View>

          <View style={styles.metricsValues}>
            <Pressable
              style={styles.metric}
              onPress={() => router.push('/crew')}
            >
              <Text style={styles.metricValue}>{crewCount}</Text>
              <Text style={styles.metricLabel}>Handlers</Text>
            </Pressable>

            <View style={styles.metricDivider} />

            <Pressable
              style={styles.metric}
              onPress={() => router.push('/baggage')}
            >
              <Text style={styles.metricValue}>{baggageCount}</Text>
              <Text style={styles.metricLabel}>Baggage</Text>
            </Pressable>

            {/* Only the admin approves registrations. */}
            {isAdmin && (
              <>
                <View style={styles.metricDivider} />

                <Pressable
                  style={styles.metric}
                  onPress={() => router.push('/approvals')}
                >
                  <Text
                    style={[
                      styles.metricValue,
                      pendingCount > 0 && styles.metricAlert,
                    ]}
                  >
                    {pendingCount}
                  </Text>
                  <Text style={styles.metricLabel}>Pending</Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>

        {/* Flight register */}
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Today's flights</Text>
            <Text style={styles.sectionSubtitle}>
              Scheduled departures
            </Text>
          </View>
          <Pressable
            style={styles.viewAllButton}
            onPress={() => router.push('/flights')}
          >
            <Text style={styles.viewAll}>View all</Text>
            <Icon name="forward" size={18} color={RED} />
          </Pressable>
        </View>

        <View style={styles.flightList}>
          {flightsLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={RED} />
              <Text style={styles.emptyText}>Loading flights...</Text>
            </View>
          ) : todayFlights.length === 0 ? (
            <Pressable
              style={styles.emptyState}
              onPress={() => router.push('/flights')}
            >
              <View style={styles.emptyFlightIcon}>
                <Icon name="airplane" size={21} color={RED} />
              </View>
              <View style={styles.emptyFlightCopy}>
                <Text style={styles.emptyTitle}>
                  No flights scheduled today
                </Text>
                <Text style={styles.emptyText}>
                  Your scheduled departures will appear here.
                </Text>
              </View>
              <Icon name="forward" size={21} color="#9299A0" />
            </Pressable>
          ) : (
            todayFlights.slice(0, 4).map((flight, index) => {
              const status = flight.status || 'Scheduled';
              const statusStyle = getStatusStyle(status);

              return (
                <Pressable
                  key={flight.id}
                  style={[
                    styles.flightRow,
                    index === Math.min(todayFlights.length, 4) - 1 &&
                      styles.lastFlightRow,
                  ]}
                  onPress={() => router.push('/flights')}
                >
                  <View style={styles.flightMain}>
                    <Text style={styles.flightNumber}>
                      {flight.flightNumber || 'Flight'}
                    </Text>
                    <Text style={styles.flightRoute}>
                      {flight.origin || '—'} → {flight.destination || '—'}
                    </Text>
                  </View>

                  <Text style={styles.flightTime}>
                    {flight.departureTime || '—'}
                  </Text>

                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusStyle.backgroundColor },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: statusStyle.color }]}>
                      {status}
                    </Text>
                  </View>

                  <Icon name="forward" size={21} color="#9299A0" />
                </Pressable>
              );
            })
          )}
        </View>

        {/* Action queue: approvals are for the admin only. */}
        {isAdmin && pendingCount > 0 && (
          <>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Needs attention</Text>
                <Text style={styles.sectionSubtitle}>
                  Items requiring supervisor review
                </Text>
              </View>
              <View style={styles.attentionCount}>
                <Text style={styles.attentionCountText}>
                  {pendingCount}
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.attentionRow}
              onPress={() => router.push('/approvals')}
            >
              <View style={styles.attentionAccent} />
              <View style={styles.attentionIcon}>
                <Icon name="approvals" size={19} color={RED} />
              </View>

              <View style={styles.attentionInfo}>
                <Text style={styles.attentionTitle}>Staff approvals</Text>
                <Text style={styles.attentionDescription}>
                  {pendingCount}{' '}
                  {pendingCount === 1
                    ? 'application awaiting review'
                    : 'applications awaiting review'}
                </Text>
              </View>

              <Icon name="forward" size={21} color="#9299A0" />
            </Pressable>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            AEROSYNC  /  GROUND OPERATIONS
          </Text>
        </View>
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
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 34,
  },

  /* Header */
  header: {
    height: 53,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandMarkSmall: {
    width: 39,
    height: 39,
    borderRadius: 21,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkSmallText: {
    color: WHITE,
    fontSize: 22,
    fontWeight: '900',
  },
  brandNameSmall: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  headerRole: {
    color: RED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 1,
  },
  notificationButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIcon: {
    fontSize: 22,
    color: DARK,
  },
  notificationDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 5,
    backgroundColor: RED,
    borderWidth: 1,
    borderColor: WHITE,
  },

  /* Welcome image */
  welcomeImage: {
    height: 224,
    width: '100%',
    justifyContent: 'flex-start',
    backgroundColor: '#8996A1',
    overflow: 'hidden',
  },
  welcomeImageRadius: {
    borderRadius: 9,
  },
  imageOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 19,
    paddingTop: 19,
    paddingBottom: 15,
    backgroundColor: 'rgba(18, 29, 42, 0.12)',
  },
  welcomeCopy: {
    alignItems: 'flex-start',
  },
  greeting: {
    color: DARK,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  greetingName: {
    color: DARK,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  dateText: {
    color: '#343B43',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  imageBottomLine: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: RED,
  },

  /* Overlapping metrics */
  metricsPanel: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: '#E6E7E9',
    borderRadius: 15,
    marginTop: -34,
    marginHorizontal: 10,
    zIndex: 2,
    elevation: 5,
    shadowColor: '#18202A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    paddingHorizontal: 17,
    paddingTop: 15,
    paddingBottom: 15,
    marginBottom: 23,
  },
  metricsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  metricsTitle: {
    color: DARK,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metricsSubtitle: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },
  metricsArrow: {
    color: MUTED,
    fontSize: 24,
    fontWeight: '400',
  },
  metricsValues: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  metricValue: {
    color: DARK,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  metricAlert: {
    color: RED,
  },
  metricLabel: {
    color: MUTED,
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
  },
  metricDivider: {
    width: 1,
    height: 39,
    backgroundColor: BORDER,
  },

  /* Section headings */
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 10,
  },
  sectionTitle: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    color: MUTED,
    fontSize: 10,
    marginTop: 3,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  viewAll: {
    color: RED,
    fontSize: 12,
    fontWeight: '800',
  },
  viewAllArrow: {
    color: RED,
    fontSize: 18,
    marginTop: -1,
  },

  /* Flight register */
  flightList: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 13,
    marginBottom: 22,
  },
  flightRow: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 9,
  },
  lastFlightRow: {
    borderBottomWidth: 0,
  },
  flightMain: {
    flex: 1,
    minWidth: 0,
  },
  flightNumber: {
    color: DARK,
    fontSize: 12,
    fontWeight: '900',
  },
  flightRoute: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },
  flightTime: {
    color: DARK,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  rowArrow: {
    color: '#9299A0',
    fontSize: 21,
    fontWeight: '400',
  },
  emptyState: {
    minHeight: 83,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    gap: 12,
  },
  emptyFlightIcon: {
    width: 43,
    height: 43,
    borderRadius: 12,
    backgroundColor: '#F8ECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFlightIconText: {
    color: RED,
    fontSize: 21,
  },
  emptyFlightCopy: {
    flex: 1,
  },
  emptyTitle: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  /* Needs attention */
  attentionCount: {
    minWidth: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#FCEBED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  attentionCountText: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
  },
  attentionRow: {
    minHeight: 69,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 11,
    overflow: 'hidden',
  },
  attentionAccent: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: RED,
    marginLeft: -12,
  },
  attentionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FCEBED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionIconText: {
    color: RED,
    fontSize: 19,
    fontWeight: '900',
  },
  attentionInfo: {
    flex: 1,
  },
  attentionTitle: {
    color: DARK,
    fontSize: 12,
    fontWeight: '800',
  },
  attentionDescription: {
    color: MUTED,
    fontSize: 10,
    marginTop: 4,
  },

  /* Footer */
  footer: {
    alignItems: 'center',
    marginTop: 25,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerText: {
    color: '#A0A5AA',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },

  /* Loading */
  loadingScreen: {
    flex: 1,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
  },
  loadingLogo: {
    color: WHITE,
    backgroundColor: RED,
    overflow: 'hidden',
    width: 44,
    height: 44,
    borderRadius: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 23,
    fontWeight: '900',
  },
  loadingText: {
    color: MUTED,
    fontSize: 12,
  },

  /* Pending account */
  pendingScreen: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  pendingContent: {
    padding: 22,
    paddingBottom: 40,
  },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: WHITE,
    fontSize: 21,
    fontWeight: '900',
  },
  brandName: {
    color: DARK,
    fontSize: 17,
    fontWeight: '900',
  },
  brandSubtext: {
    color: RED,
    fontSize: 8,
    fontWeight: '700',
    marginTop: 3,
  },
  pendingHero: {
    marginTop: 38,
    marginBottom: 25,
  },
  pendingEyebrow: {
    color: RED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 9,
  },
  pendingTitle: {
    color: DARK,
    fontSize: 24,
    fontWeight: '800',
  },
  pendingDescription: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
  pendingAccount: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 15,
  },
  pendingLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 7,
  },
  pendingName: {
    color: DARK,
    fontSize: 13,
    fontWeight: '700',
  },
  pendingStatus: {
    color: RED,
    fontSize: 10,
    marginTop: 8,
  },
});
