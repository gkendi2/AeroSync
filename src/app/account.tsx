import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
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

import Icon from '@/components/icon';
import {
  MODEL_HYBRID_LOGIC,
  MODEL_TRAINED_ON,
  PROBABILITY_THRESHOLD,
  RULES,
} from '@/features/delay-risk/model';
import { rebuildMessageAccess } from '@/features/messages/service';
import { isAdminUser } from '@/lib/admin';
import { auth, db } from '@/lib/firebase';
import { goBackOrHome } from '@/lib/navigation';
import { useRouter } from 'expo-router';

const RED = '#F0182B';
const DEEP_RED = '#B51F3A';
const GREEN = '#15803D';

type UserRole = 'pending' | 'handler' | 'supervisor' | '';

function formatRole(role: UserRole) {
  if (!role) return 'Staff';
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

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function AccountScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

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
            data.displayName ?? user.displayName ?? ''
          );

          setEmail(data.email ?? user.email ?? '');

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

  async function confirmSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await signOut(auth);
    } catch (error) {
      console.error('Could not sign out:', error);

      showMessage(
        'Sign out failed',
        'We could not sign you out. Please try again.'
      );

      setSigningOut(false);
    }
  }

  function handleSignOut() {
    if (signingOut) return;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        'Are you sure you want to sign out of AeroSync?'
      );

      if (confirmed) {
        void confirmSignOut();
      }

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
          onPress: () => void confirmSignOut(),
        },
      ]
    );
  }

  const initials = getInitials(displayName, email);
  const roleLabel = formatRole(role);
  // Supervisors open Account from More (so it has a back button and the model
  // section); for handlers it is a tab.
  const isSupervisor = role === 'supervisor';
  const isAdmin = isAdminUser(auth.currentUser);

  // Admin tool: rebuild flight-message membership from the current assignments
  // (the backfill for assignments created before messages existed).
  async function handleRebuildAccess() {
    if (rebuilding || !auth.currentUser) return;
    setRebuilding(true);

    try {
      const result = await rebuildMessageAccess(auth.currentUser.uid);
      showMessage(
        'Message access rebuilt',
        `${result.members} handler–flight membership(s) in place. ${result.written} written, ${result.removed} removed.`
      );
    } catch (error) {
      console.error('Rebuilding message access failed:', error);
      showMessage(
        'Rebuild failed',
        'Message access could not be rebuilt. Check your connection and that the latest Firestore rules are deployed.'
      );
    } finally {
      setRebuilding(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={RED} />
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
        {/* PAGE HEADER */}
        <View style={styles.header}>
          {isSupervisor && (
            <Pressable
              onPress={() => goBackOrHome(router)}
              style={styles.backButton}
              accessibilityLabel="Go back"
            >
              <Icon name="back" size={30} color="#292929" />
            </Pressable>
          )}

          <Text style={styles.eyebrow}>AEROSYNC</Text>

          <Text style={styles.title}>My Account</Text>

          <Text style={styles.subtitle}>
            Manage your AeroSync profile and account.
          </Text>
        </View>

        {/* PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            <View style={styles.profileDetails}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName || 'AeroSync Staff'}
              </Text>

              <Text style={styles.email} numberOfLines={2}>
                {email || 'No email available'}
              </Text>

              <View style={styles.activeRow}>
                <View
                  style={[
                    styles.activeDot,
                    role === 'pending' && styles.pendingDot,
                  ]}
                />

                <Text
                  style={[
                    styles.activeText,
                    role === 'pending' && styles.pendingText,
                  ]}
                >
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
              <Text style={styles.label}>ACCOUNT ROLE</Text>
              <Text style={styles.roleValue}>{roleLabel}</Text>
            </View>

            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {roleLabel.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* SIGN OUT */}
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutPressed,
            signingOut && styles.signOutDisabled,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
        >
          {signingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Icon name="signOut" size={20} color="#FFFFFF" />
              <Text style={styles.signOutText}>Sign out</Text>
            </>
          )}
        </Pressable>

        {/* ACCOUNT INFORMATION */}
        <Text style={styles.sectionTitle}>
          Account information
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Icon name="email" size={20} color={DEEP_RED} />
            </View>

            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Email address</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {email || 'Not available'}
              </Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Icon name="role" size={20} color={DEEP_RED} />
            </View>

            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Account role</Text>
              <Text style={styles.infoValue}>{roleLabel}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Icon name="access" size={20} color={DEEP_RED} />
            </View>

            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>Access status</Text>
              <Text style={styles.infoValue}>
                {role === 'pending'
                  ? 'Pending approval'
                  : 'Operational access active'}
              </Text>
            </View>
          </View>
        </View>

        {/* DELAY-RISK MODEL (supervisors only). Values come from
            ml/models/aerosync_decision_tree.json via the model module. */}
        {isSupervisor && (
          <>
            <Text style={styles.sectionTitle}>
              About the delay-risk model
            </Text>

            <View style={[styles.infoCard, styles.modelCard]}>
              <View style={styles.modelRow}>
                <Icon name="model" size={20} color={DEEP_RED} />
                <Text style={styles.modelText}>
                  A decision tree trained on {MODEL_TRAINED_ON}. Results are
                  provisional, not a validated flight-delay prediction.
                </Text>
              </View>

              <Text style={styles.modelLabel}>PROBABILITY THRESHOLD</Text>
              <Text style={styles.modelValue}>
                {PROBABILITY_THRESHOLD.toFixed(2)}
              </Text>

              <Text style={styles.modelLabel}>RULES</Text>
              {RULES.map((rule) => (
                <Text key={rule.id} style={styles.modelText}>
                  {rule.text}
                </Text>
              ))}

              <Text style={styles.modelLabel}>RISK LEVELS</Text>
              {MODEL_HYBRID_LOGIC.split(';').map((part) => (
                <Text key={part} style={styles.modelText}>
                  {part.trim()}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* MESSAGE ACCESS (admin only) */}
        {isAdmin && (
          <>
            <Text style={styles.sectionTitle}>Flight message access</Text>

            <View style={[styles.infoCard, styles.modelCard]}>
              <Text style={styles.modelText}>
                Gives every handler access to the message threads of the flights they are assigned to
                (non-cancelled assignments), and removes access that no longer applies. New assignment
                changes keep this up to date automatically; run it once after deploying the rules, or
                whenever access looks wrong.
              </Text>

              <Pressable
                onPress={handleRebuildAccess}
                disabled={rebuilding}
                style={({ pressed }) => [
                  styles.rebuildButton,
                  pressed && styles.menuRowPressed,
                  rebuilding && styles.signOutDisabled,
                ]}
                accessibilityRole="button"
              >
                {rebuilding ? (
                  <ActivityIndicator color={DEEP_RED} />
                ) : (
                  <>
                    <Icon name="messages" size={18} color={DEEP_RED} />
                    <Text style={styles.rebuildButtonText}>Rebuild message access</Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}

        {/* AEROSYNC INFORMATION */}
        <Text style={styles.sectionTitle}>AeroSync</Text>

        <View style={styles.menuCard}>
          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.menuRowPressed,
            ]}
            onPress={() =>
              showMessage(
                'About AeroSync',
                'AeroSync is a ground operations platform for coordinating staff, baggage handling, incidents and operational activities.'
              )
            }
          >
            <View style={styles.menuIcon}>
              <Icon name="info" size={20} color={DEEP_RED} />
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                About AeroSync
              </Text>

              <Text style={styles.menuSubtitle}>
                Ground operations platform
              </Text>
            </View>

            <Icon name="forward" size={24} color="#737373" />
          </Pressable>

          <View style={styles.infoDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.menuRow,
              pressed && styles.menuRowPressed,
            ]}
            onPress={() =>
              showMessage(
                'Help & Support',
                'For account or operational issues, please contact your AeroSync supervisor.'
              )
            }
          >
            <View style={styles.menuIcon}>
              <Icon name="help" size={20} color={DEEP_RED} />
            </View>

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>
                Help & Support
              </Text>

              <Text style={styles.menuSubtitle}>
                Get assistance with AeroSync
              </Text>
            </View>

            <Icon name="forward" size={24} color="#737373" />
          </Pressable>
        </View>

        <View style={styles.signOutSection}>
          <Text style={styles.footer}>
            AeroSync · Kenya Airways Ground Operations
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rebuildButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: DEEP_RED,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  rebuildButtonText: {
    color: DEEP_RED,
    fontSize: 13,
    fontWeight: '800',
  },

  safeArea: {
    flex: 1,
    backgroundColor: '#F5F5F6',
  },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F5F5F6',
  },

  loadingText: {
    color: '#292929',
    fontSize: 14,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
  },

  header: {
    marginBottom: 20,
  },

  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    marginLeft: -8,
    marginBottom: 6,
  },

  modelCard: {
    paddingVertical: 14,
  },

  modelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  modelLabel: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#737373',
  },

  modelValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#292929',
  },

  modelText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#292929',
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: DEEP_RED,
    marginBottom: 6,
  },

  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: '#292929',
  },

  subtitle: {
    marginTop: 7,
    fontSize: 15,
    lineHeight: 22,
    color: '#737373',
  },

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E7E7E9',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
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
    backgroundColor: RED,
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
    color: '#292929',
  },

  email: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#737373',
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

  pendingDot: {
    backgroundColor: RED,
  },

  activeText: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
  },

  pendingText: {
    color: DEEP_RED,
  },

  divider: {
    height: 1,
    backgroundColor: '#E7E7E9',
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
    color: '#737373',
  },

  roleValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#292929',
  },

  roleBadge: {
    backgroundColor: '#FDECEF',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  roleBadgeText: {
    color: DEEP_RED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  sectionTitle: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '800',
    color: '#292929',
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E7E7E9',
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
    backgroundColor: '#FDECEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  iconText: {
    color: DEEP_RED,
    fontSize: 15,
    fontWeight: '800',
  },

  infoText: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    color: '#737373',
    marginBottom: 3,
  },

  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#292929',
  },

  infoDivider: {
    height: 1,
    backgroundColor: '#E7E7E9',
    marginHorizontal: 2,
  },

  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E7E9',
    overflow: 'hidden',
  },

  menuRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  menuRowPressed: {
    backgroundColor: '#FDECEF',
  },

  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FDECEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  menuIconText: {
    color: DEEP_RED,
    fontSize: 17,
    fontWeight: '800',
  },

  menuText: {
    flex: 1,
  },

  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#292929',
  },

  menuSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: '#737373',
  },

  chevron: {
    fontSize: 27,
    lineHeight: 27,
    color: '#737373',
    marginLeft: 10,
  },

  signOutSection: {
    marginTop: 30,
    alignItems: 'center',
  },

  signOutButton: {
    width: '100%',
    minHeight: 54,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: DEEP_RED,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  signOutPressed: {
    opacity: 0.8,
  },

  signOutDisabled: {
    opacity: 0.65,
  },

  signOutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  footer: {
    marginTop: 16,
    fontSize: 11,
    color: '#737373',
    textAlign: 'center',
  },
});