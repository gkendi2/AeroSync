import { auth, db } from '@/lib/firebase';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

export type Role = 'pending' | 'handler' | 'supervisor';
type RequestedRole = 'handler' | 'supervisor';

type Styles = {
  screen: ViewStyle;
  scrollContent: ViewStyle;
  card: ViewStyle;
  brandSection: ViewStyle;
  logoCircle: ViewStyle;
  logoText: TextStyle;
  brand: TextStyle;
  subtitle: TextStyle;
  headingSection: ViewStyle;
  heading: TextStyle;
  headingSubtitle: TextStyle;
  registrationSection: ViewStyle;
  sectionLabel: TextStyle;
  sectionHint: TextStyle;
  roleOptions: ViewStyle;
  roleCard: ViewStyle;
  roleCardSelected: ViewStyle;
  roleIconContainer: ViewStyle;
  roleIconContainerSelected: ViewStyle;
  roleIcon: TextStyle;
  roleTitle: TextStyle;
  roleDescription: TextStyle;
  selectedText: TextStyle;
  approvalInfo: ViewStyle;
  approvalInfoTitle: TextStyle;
  approvalInfoText: TextStyle;
  fieldGroup: ViewStyle;
  labelRow: ViewStyle;
  fieldLabel: TextStyle;
  forgotText: TextStyle;
  input: TextStyle;
  passwordContainer: ViewStyle;
  passwordInput: TextStyle;
  visibilityButton: ViewStyle;
  visibilityText: TextStyle;
  passwordHint: TextStyle;
  primaryButton: ViewStyle;
  primaryButtonText: TextStyle;
  disabled: ViewStyle;
  switchButton: ViewStyle;
  switchPrompt: TextStyle;
  switchText: TextStyle;
  bottomNotice: ViewStyle;
  bottomNoticeTitle: TextStyle;
  bottomNoticeText: TextStyle;
};

export default function AuthScreen() {
  const [isRegistering, setIsRegistering] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [requestedRole, setRequestedRole] =
    useState<RequestedRole>('handler');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  function showMessage(title: string, message: string) {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  }

  async function handleForgotPassword() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      showMessage(
        'Enter your email',
        'Enter your email address first, then tap Forgot password.'
      );
      return;
    }

    setResettingPassword(true);

    try {
      await sendPasswordResetEmail(auth, cleanEmail);

      showMessage(
        'Password reset email sent',
        'Check your email for instructions to create a new password.'
      );
    } catch (error: any) {
      console.error('Password reset failed:', error);

      const messages: Record<string, string> = {
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/user-not-found':
          'We could not find an account with that email address.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/too-many-requests':
          'Too many attempts. Please wait a while before trying again.',
        'auth/network-request-failed':
          'Network error. Check your internet connection and try again.',
      };

      showMessage(
        'Password reset failed',
        messages[error?.code] ??
          'Something went wrong. Check your connection and try again.'
      );
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleSubmit() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();

    if (!cleanEmail || !password) {
      showMessage(
        'Missing details',
        'Enter your email address and password.'
      );
      return;
    }

    if (isRegistering && !cleanName) {
      showMessage(
        'Missing name',
        'Enter your full name to create your AeroSync account.'
      );
      return;
    }

    if (isRegistering && password.length < 8) {
      showMessage(
        'Password too short',
        'Use at least 8 characters for your password.'
      );
      return;
    }

    if (isRegistering && password !== confirmPassword) {
      showMessage(
        'Passwords do not match',
        'Make sure both password fields contain the same password.'
      );
      return;
    }

    setLoading(true);

    try {
      if (!isRegistering) {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        return;
      }

      console.log('REGISTRATION: Creating Firebase Auth account...');

      const credential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      console.log('REGISTRATION: Auth account created.', {
        uid: credential.user.uid,
        projectId: db.app.options.projectId,
      });

      const userRef = doc(db, 'users', credential.user.uid);

      try {
        console.log('REGISTRATION: Saving Firestore profile...', {
          uid: credential.user.uid,
          email: cleanEmail,
          requestedRole,
          projectId: db.app.options.projectId,
          collection: 'users',
        });

        await setDoc(userRef, {
          uid: credential.user.uid,
          email: cleanEmail,
          displayName: cleanName,
          role: 'pending' satisfies Role,
          requestedRole,
          createdAt: serverTimestamp(),
        });

        console.log(
          'REGISTRATION: Firestore profile saved successfully.',
          credential.user.uid
        );
      } catch (profileError) {
        console.error(
          'REGISTRATION: Firestore profile save FAILED:',
          profileError
        );

        try {
          await deleteUser(credential.user);
          console.log('REGISTRATION: Auth account rollback succeeded.');
        } catch (deleteError) {
          console.error('Account rollback failed:', deleteError);

          try {
            await signOut(auth);
          } catch (signOutError) {
            console.error('Sign-out failed:', signOutError);
          }
        }

        throw profileError;
      }

      try {
        await updateProfile(credential.user, {
          displayName: cleanName,
        });
      } catch (profileNameError) {
        console.warn(
          'Could not update Auth display name:',
          profileNameError
        );
      }

      const approvalMessage =
        requestedRole === 'supervisor'
          ? 'Your supervisor registration request has been submitted. Supervisor access requires separate authorization.'
          : 'Your handler registration request has been submitted. A supervisor must approve your account before you can access operational records.';

      showMessage('Registration submitted', approvalMessage);
    } catch (error: any) {
      console.error('Authentication failed:', error);

      const messages: Record<string, string> = {
        'auth/email-already-in-use':
          'An account already uses this email.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/invalid-credential':
          'Email or password is incorrect.',
        'auth/weak-password': 'Choose a stronger password.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/too-many-requests':
          'Too many attempts. Wait a while before trying again.',
        'auth/network-request-failed':
          'Network error. Check your connection and try again.',
        'permission-denied':
          'Your profile could not be created. Please check the Firestore rules and try again.',
        'firestore/permission-denied':
          'Your profile could not be created. Please check the Firestore rules and try again.',
      };

      showMessage(
        isRegistering ? 'Registration failed' : 'Login failed',
        messages[error?.code] ??
          'Something went wrong. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setIsRegistering((previous) => !previous);
    setDisplayName('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.brandSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>A</Text>
            </View>

            <Text style={styles.brand}>AeroSync</Text>

            <Text style={styles.subtitle}>
              Crew coordination and operational communication
            </Text>
          </View>

          <View style={styles.headingSection}>
            <Text style={styles.heading}>
              {isRegistering
                ? 'Create your account'
                : 'Welcome back'}
            </Text>

            <Text style={styles.headingSubtitle}>
              {isRegistering
                ? 'Join AeroSync and stay connected to airport operations.'
                : 'Sign in to continue to your AeroSync workspace.'}
            </Text>
          </View>

          {isRegistering && (
            <View style={styles.registrationSection}>
              <Text style={styles.sectionLabel}>Account type</Text>

              <Text style={styles.sectionHint}>
                Select the role you are requesting. Access is approved
                separately by the system.
              </Text>

              <View style={styles.roleOptions}>
                <Pressable
                  style={[
                    styles.roleCard,
                    requestedRole === 'handler' &&
                      styles.roleCardSelected,
                  ]}
                  onPress={() => setRequestedRole('handler')}
                  disabled={loading}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: requestedRole === 'handler',
                  }}
                >
                  <View
                    style={[
                      styles.roleIconContainer,
                      requestedRole === 'handler' &&
                        styles.roleIconContainerSelected,
                    ]}
                  >
                    <Text style={styles.roleIcon}>H</Text>
                  </View>

                  <Text style={styles.roleTitle}>Handler</Text>

                  <Text style={styles.roleDescription}>
                    Crew activities, assigned tasks and baggage handling.
                  </Text>

                  {requestedRole === 'handler' && (
                    <Text style={styles.selectedText}>
                      Selected
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  style={[
                    styles.roleCard,
                    requestedRole === 'supervisor' &&
                      styles.roleCardSelected,
                  ]}
                  onPress={() => setRequestedRole('supervisor')}
                  disabled={loading}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: requestedRole === 'supervisor',
                  }}
                >
                  <View
                    style={[
                      styles.roleIconContainer,
                      requestedRole === 'supervisor' &&
                        styles.roleIconContainerSelected,
                    ]}
                  >
                    <Text style={styles.roleIcon}>S</Text>
                  </View>

                  <Text style={styles.roleTitle}>Supervisor</Text>

                  <Text style={styles.roleDescription}>
                    Crew coordination, approvals and operations monitoring.
                  </Text>

                  {requestedRole === 'supervisor' && (
                    <Text style={styles.selectedText}>
                      Selected
                    </Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.approvalInfo}>
                <Text style={styles.approvalInfoTitle}>
                  Approval required
                </Text>

                <Text style={styles.approvalInfoText}>
                  {requestedRole === 'supervisor'
                    ? 'Supervisor accounts require separate authorization before operational access is granted.'
                    : 'Handler accounts remain pending until a supervisor approves the registration request.'}
                </Text>
              </View>
            </View>
          )}

          {isRegistering && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Full name</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#94A3B8"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                editable={!loading}
                returnKeyType="next"
              />
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email address</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#94A3B8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !resettingPassword}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Password</Text>

              {!isRegistering && (
                <Pressable
                  onPress={handleForgotPassword}
                  disabled={loading || resettingPassword}
                >
                  <Text style={styles.forgotText}>
                    {resettingPassword
                      ? 'Sending...'
                      : 'Forgot password?'}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder={
                  isRegistering
                    ? 'Create a password'
                    : 'Enter your password'
                }
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                returnKeyType={isRegistering ? 'next' : 'done'}
                onSubmitEditing={
                  isRegistering ? undefined : handleSubmit
                }
              />

              <Pressable
                style={styles.visibilityButton}
                onPress={() =>
                  setShowPassword((previous) => !previous)
                }
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword
                    ? 'Hide password'
                    : 'Show password'
                }
              >
                <Text style={styles.visibilityText}>
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>

            {isRegistering && (
              <Text style={styles.passwordHint}>
                Use at least 8 characters.
              </Text>
            )}
          </View>

          {isRegistering && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                Confirm password
              </Text>

              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#94A3B8"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                <Pressable
                  style={styles.visibilityButton}
                  onPress={() =>
                    setShowConfirmPassword(
                      (previous) => !previous
                    )
                  }
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirmPassword
                      ? 'Hide confirm password'
                      : 'Show confirm password'
                  }
                >
                  <Text style={styles.visibilityText}>
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          <Pressable
            style={[
              styles.primaryButton,
              (loading || resettingPassword) && styles.disabled,
            ]}
            onPress={handleSubmit}
            disabled={loading || resettingPassword}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isRegistering
                  ? 'Create account'
                  : 'Log in'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={toggleMode}
            disabled={loading || resettingPassword}
            style={styles.switchButton}
          >
            <Text style={styles.switchPrompt}>
              {isRegistering
                ? 'Already have an account?'
                : "Don't have an account?"}
            </Text>

            <Text style={styles.switchText}>
              {isRegistering ? 'Log in' : 'Register'}
            </Text>
          </Pressable>

          <View style={styles.bottomNotice}>
            <Text style={styles.bottomNoticeTitle}>
              Secure operational access
            </Text>

            <Text style={styles.bottomNoticeText}>
              New accounts are reviewed before access to AeroSync
              operational records is granted.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create<Styles>({
  screen: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },

  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 22,
    gap: 18,
    shadowColor: '#163B65',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },

  brandSection: {
    alignItems: 'center',
    gap: 7,
  },

  logoCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#163B65',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  logoText: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
  },

  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: '#163B65',
  },

  subtitle: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 310,
  },

  headingSection: {
    marginTop: 2,
    gap: 5,
  },

  heading: {
    fontSize: 23,
    fontWeight: '700',
    color: '#172033',
  },

  headingSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
  },

  registrationSection: {
    gap: 9,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#172033',
  },

  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    marginBottom: 2,
  },

  roleOptions: {
    flexDirection: 'row',
    gap: 10,
  },

  roleCard: {
    flex: 1,
    minHeight: 175,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
  },

  roleCardSelected: {
    borderColor: '#2878C8',
    borderWidth: 2,
    backgroundColor: '#EFF6FF',
  },

  roleIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  roleIconContainerSelected: {
    backgroundColor: '#DCEEFF',
  },

  roleIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: '#163B65',
  },

  roleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#163B65',
  },

  roleDescription: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: '#64748B',
  },

  selectedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2878C8',
    marginTop: 'auto',
  },

  approvalInfo: {
    backgroundColor: '#F4F7FB',
    borderRadius: 10,
    padding: 11,
    gap: 3,
  },

  approvalInfoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#163B65',
  },

  approvalInfoText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
  },

  fieldGroup: {
    gap: 7,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },

  forgotText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2878C8',
  },

  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#172033',
    backgroundColor: '#FFFFFF',
  },

  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },

  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#172033',
  },

  visibilityButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  visibilityText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2878C8',
  },

  passwordHint: {
    fontSize: 11,
    color: '#64748B',
  },

  primaryButton: {
    backgroundColor: '#163B65',
    borderRadius: 11,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 2,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },

  disabled: {
    opacity: 0.6,
  },

  switchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 2,
  },

  switchPrompt: {
    color: '#64748B',
    fontSize: 12,
  },

  switchText: {
    color: '#2878C8',
    fontWeight: '700',
    fontSize: 13,
  },

  bottomNotice: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 14,
    alignItems: 'center',
    gap: 3,
  },

  bottomNoticeTitle: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },

  bottomNoticeText: {
    color: '#94A3B8',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    maxWidth: 340,
  },
});