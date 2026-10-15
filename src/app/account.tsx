import { signOut } from 'firebase/auth';
import {
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth, db } from '@/lib/firebase';

const NAVY = '#163B65';
const BLUE = '#2878C8';
const BG = '#F4F6FA';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#15803D';

type UserRole = 'pending' | 'handler' | 'supervisor' | '';

function formatRole(role: UserRole) {
  if (!role) {
    return 'Staff';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getInitials(
  displayName?: string | null,
  email?: string | null
) {
  const value = displayName?.trim() || email?.trim() || 'User';

  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

export default function AccountScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setDisplayName('');
      setEmail('');
      setRole('');
      setLoading(false);
      return;
    }

    setEmail(user.email ?? '');
    setDisplayName(user.displayName ?? '');

    const userRef = doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          setDisplayName(
            data.displayName ??
              user.displayName ??
              ''
          );

          setEmail(
            data.email ??
              user.email ??
              ''
          );

          setRole(
            data.role === 'handler' ||
              data.role === 'supervisor' ||
              data.role === 'pending'
              ? data.role
              : ''
          );
        } else {
          setRole('');
        }

        setLoading(false);
      },
      (error) => {
        console.error('Could not load account profile:', error);

        setDisplayName(user.displayName ?? '');
        setEmail(user.email ?? '');
        setRole('');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out of AeroSync?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);

            try {
              await signOut(auth);
            } catch (error) {
              console.error('Could not sign out:', error);

              Alert.alert(
                'Sign out failed',
                'We could not sign you out. Please try again.'
              );

              setSigningOut(false);
            }
          },
        },
      ]
    );
  }

  const initials = getInitials(displayName, email);
  const roleLabel = formatRole(role);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={BLUE} />
          <Text style={styles.loadingText}>
            Loading your account...
          </Text>
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
        <View style={styles.header}>
          <Text style={styles.eyebrow}>AEROSYNC</Text>

          <Text style={styles.title}>
            My Account
          </Text>

          <Text style={styles.subtitle}>
            Manage your AeroSync profile and account.
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initials}
              </Text>
            </View>

            <View style={styles.profileDetails}>
              <Text
                style={styles.name}
                numberOfLines={1}
              >
                {displayName || 'AeroSync Staff'}
              </Text>

              <Text
                style={styles.email}
                numberOfLines={2}
              >
                {email || 'No email available'}
              </Text>

              <View style={styles.activeRow}>
                <View style={styles.activeDot} />

                <Text style={styles.activeText}>
                  {role === 'pending'
                    ? 'Pending approval'
                    : 'Active account'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.roleRow}>
            <View>
              <Text style={styles.label}>
                ACCOUNT ROLE
              </Text>

              <Text style={styles.roleValue}>
                {roleLabel}
              </Text>
            </View>

            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {roleLabel.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          Account information
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>
                @
              </Text>
            </View>

            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>
                Email address
              </Text>

              <Text
                style={styles.infoValue}
                numberOfLines={2}
              >
                {email || 'Not available'}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>
                ID
              </Text>
            </View>

            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>
                Account role
              </Text>

              <Text style={styles.infoValue}>
                {roleLabel}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>
                ✓
              </Text>
            </View>

            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>
                Access status
              </Text>

              <Text style={styles.infoValue}>
                {role === 'pending'
                  ? 'Pending approval'
                  : 'Operational access active'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          AeroSync
        </Text>

        <View style={styles.menuCard}>
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.menuRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                'About AeroSync',
                'AeroSync is a ground operations platform for coordinating staff, baggage handling, incidents and operational activities.'
              )
            }
          >
            <View style={styles.menuIcon}>
              <Text style={styles.menuIconText}>
                i
              </Text>
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                About AeroSync
              </Text>

              <Text style={styles.menuSubtitle}>
                Ground operations platform
              </Text>
            </View>

            <Text style={styles.chevron}>
              ›
            </Text>
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.menuRowPressed,
            ]}
            onPress={() =>
              Alert.alert(
                'Help & Support',
                'For account or operational issues, please contact your AeroSync supervisor.'
              )
            }
          >
            <View style={styles.menuIcon}>
              <Text style={styles.menuIconText}>
                ?
              </Text>
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                Help & Support
              </Text>

              <Text style={styles.menuSubtitle}>
                Get assistance with AeroSync
              </Text>
            </View>

            <Text style={styles.chevron}>
              ›
            </Text>
          </Pressable>
        </View>

        <View style={styles.signOutSection}>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.signOutPressed,
              signingOut && styles.signOutDisabled,
            ]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color="#B42318" />
            ) : (
              <Text style={styles.signOutText}>
                Sign out
              </Text>
            )}
          </Pressable>

          <Text style={styles.footer}>
            AeroSync · Ground operations
          </Text>
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  loadingText: {
    color: NAVY,
    fontSize: 14,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },

  header: {
    marginBottom: 20,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: BLUE,
    marginBottom: 6,
  },

  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: NAVY,
  },

  subtitle: {
    marginTop: 7,
    fontSize: 15,
    lineHeight: 22,
    color: MUTED,
  },

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 2,
  },

  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  profileDetails: {
    flex: 1,
  },

  name: {
    fontSize: 20,
    fontWeight: '800',
    color: NAVY,
  },

  email: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
  },

  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
    marginRight: 7,
  },

  activeText: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 18,
  },

  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: MUTED,
  },

  roleValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: NAVY,
  },

  roleBadge: {
    backgroundColor: '#EAF3FC',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  roleBadgeText: {
    color: BLUE,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  sectionTitle: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '800',
    color: NAVY,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  iconText: {
    color: BLUE,
    fontSize: 15,
    fontWeight: '800',
  },

  infoText: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },

  infoDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 2,
  },

  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },

  menuRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  menuRowPressed: {
    backgroundColor: '#F8FAFC',
  },

  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF4FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  menuIconText: {
    color: BLUE,
    fontSize: 17,
    fontWeight: '800',
  },

  menuText: {
    flex: 1,
  },

  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },

  menuSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: MUTED,
  },

  chevron: {
    fontSize: 27,
    lineHeight: 27,
    color: '#94A3B8',
    marginLeft: 10,
  },

  signOutSection: {
    marginTop: 30,
    alignItems: 'center',
  },

  signOutButton: {
    width: '100%',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0C7C4',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  signOutPressed: {
    backgroundColor: '#FFF7F6',
  },

  signOutDisabled: {
    opacity: 0.65,
  },

  signOutText: {
    color: '#B42318',
    fontSize: 16,
    fontWeight: '800',
  },

  footer: {
    marginTop: 16,
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
});