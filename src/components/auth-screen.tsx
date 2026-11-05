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
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export type Role = 'pending' | 'handler' | 'supervisor';
type RequestedRole = 'handler' | 'supervisor';

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
          'Too many attempts. Please wait before trying again.',
        'auth/network-request-failed':
          'Network error. Check your internet connection.',
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
      showMessage('Missing name', 'Enter your full name.');
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

      const credential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      try {
        await setDoc(doc(db, 'users', credential.user.uid), {
          uid: credential.user.uid,
          email: cleanEmail,
          displayName: cleanName,
          role: 'pending' satisfies Role,
          requestedRole,
          createdAt: serverTimestamp(),
        });
      } catch (profileError) {
        console.error('Firestore profile save failed:', profileError);

        try {
          await deleteUser(credential.user);
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

      showMessage(
        'Registration submitted',
        requestedRole === 'supervisor'
          ? 'Your supervisor registration request has been submitted. Supervisor access requires separate authorization.'
          : 'Your handler registration request has been submitted. A supervisor must approve your account before you can access operational records.'
      );
    } catch (error: any) {
      console.error('Authentication failed:', error);

      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'An account already uses this email.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/weak-password': 'Choose a stronger password.',
        'auth/user-disabled': 'This account has been disabled.',
        'auth/too-many-requests':
          'Too many attempts. Wait a while before trying again.',
        'auth/network-request-failed':
          'Network error. Check your connection and try again.',
        'permission-denied':
          'Your profile could not be created. Check the Firestore rules and try again.',
        'firestore/permission-denied':
          'Your profile could not be created. Check the Firestore rules and try again.',
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
      <ImageBackground
        source={require('../../assets/images/Kenya Airways at Golden Hour.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.backgroundOverlay}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              isRegistering && styles.registerScrollContent,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pageBrand}>
              <Image
                source={require('../../assets/images/Kenya Airways logo.png')}
                style={styles.airlineLogo}
                resizeMode="contain"
                accessibilityLabel="Kenya Airways logo"
              />

              <Text style={styles.brand}>AeroSync</Text>
              <Text style={styles.brandSubtitle}>
                Ground operations · Crew coordination
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.headingSection}>
                <Text style={styles.eyebrow}>
                  {isRegistering ? 'JOIN THE CREW' : 'CREW PORTAL'}
                </Text>

                <Text style={styles.heading}>
                  {isRegistering ? 'Create your account' : 'Welcome back'}
                </Text>

                <Text style={styles.headingSubtitle}>
                  {isRegistering
                    ? 'Request access to the AeroSync operations platform.'
                    : 'Sign in to continue to your operations workspace.'}
                </Text>
              </View>

              {isRegistering && (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.fieldLabel}>Full name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your full name"
                      placeholderTextColor="#858585"
                      value={displayName}
                      onChangeText={setDisplayName}
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!loading}
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.registrationSection}>
                    <Text style={styles.fieldLabel}>Your role</Text>
                    <Text style={styles.helperText}>
                      Choose the role you are requesting.
                    </Text>

                    <View style={styles.roleRow}>
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
                        <Text style={styles.roleIcon}>H</Text>
                        <Text style={styles.roleTitle}>Handler</Text>
                        <Text style={styles.roleDescription}>
                          Assigned tasks and baggage handling.
                        </Text>
                        {requestedRole === 'handler' && (
                          <Text style={styles.selectedLabel}>SELECTED</Text>
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
                        <Text style={styles.roleIcon}>S</Text>
                        <Text style={styles.roleTitle}>Supervisor</Text>
                        <Text style={styles.roleDescription}>
                          Crew coordination and operations monitoring.
                        </Text>
                        {requestedRole === 'supervisor' && (
                          <Text style={styles.selectedLabel}>SELECTED</Text>
                        )}
                      </Pressable>
                    </View>

                    <View style={styles.approvalBox}>
                      <Text style={styles.approvalTitle}>
                        Access requires approval
                      </Text>
                      <Text style={styles.approvalText}>
                        {requestedRole === 'supervisor'
                          ? 'Supervisor accounts require separate authorization.'
                          : 'Handler accounts remain pending until a supervisor approves the request.'}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@company.com"
                  placeholderTextColor="#858585"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
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
                    placeholderTextColor="#858585"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={
                      isRegistering ? 'new-password' : 'current-password'
                    }
                    editable={!loading}
                    returnKeyType={isRegistering ? 'next' : 'done'}
                    onSubmitEditing={
                      isRegistering ? undefined : handleSubmit
                    }
                  />

                  <Pressable
                    style={styles.visibilityButton}
                    onPress={() => setShowPassword((previous) => !previous)}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    <Text style={styles.visibilityText}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>

                {isRegistering && (
                  <Text style={styles.helperText}>
                    Use at least 8 characters.
                  </Text>
                )}
              </View>

              {isRegistering && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Confirm password</Text>

                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Re-enter your password"
                      placeholderTextColor="#858585"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      editable={!loading}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />

                    <Pressable
                      style={styles.visibilityButton}
                      onPress={() =>
                        setShowConfirmPassword((previous) => !previous)
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
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isRegistering ? 'Create account' : 'Log in'}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={toggleMode}
                disabled={loading || resettingPassword}
                style={styles.switchButton}
                accessibilityRole="button"
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
                <View style={styles.securityIcon}>
                  <Text style={styles.securityCheck}>✓</Text>
                </View>

                <View style={styles.noticeCopy}>
                  <Text style={styles.bottomNoticeTitle}>
                    Secure operational access
                  </Text>
                  <Text style={styles.bottomNoticeText}>
                    New accounts are reviewed before access to AeroSync
                    operational records is granted.
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.footer}>
              AEROSYNC · GROUND OPERATIONS
            </Text>
          </ScrollView>
        </View>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#20232B',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
  },
  backgroundOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 25, 0.25)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  registerScrollContent: {
    justifyContent: 'flex-start',
    paddingTop: 28,
    paddingBottom: 24,
  },
  pageBrand: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingHorizontal: 4,
    paddingBottom: 10,
    gap: 3,
  },
  airlineLogo: {
    width: 300,
    height: 90,
    marginBottom: 8,
    marginRight: 'auto',
    alignSelf: 'flex-start',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 17,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 7,
  },
  headingSection: {
    gap: 4,
  },
  eyebrow: {
    color: '#C8102E',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  heading: {
    color: '#151515',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  headingSubtitle: {
    color: '#6B6B6B',
    fontSize: 12,
    lineHeight: 17,
  },
  fieldGroup: {
    gap: 5,
  },
  fieldLabel: {
    color: '#292929',
    fontSize: 12,
    fontWeight: '800',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#D6D6D6',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#171717',
    backgroundColor: '#FFFFFF',
  },
  passwordContainer: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D6D6D6',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#171717',
  },
  visibilityButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  visibilityText: {
    color: '#C8102E',
    fontSize: 12,
    fontWeight: '800',
  },
  forgotText: {
    color: '#C8102E',
    fontSize: 11,
    fontWeight: '800',
  },
  helperText: {
    color: '#6B6B6B',
    fontSize: 10,
    lineHeight: 15,
  },
  registrationSection: {
    gap: 8,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 9,
  },
  roleCard: {
    flex: 1,
    minHeight: 145,
    borderWidth: 1,
    borderColor: '#D6D6D6',
    borderRadius: 12,
    padding: 9,
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  roleCardSelected: {
    borderColor: '#ED1C24',
    borderWidth: 2,
    backgroundColor: '#FFF4F4',
  },
  roleIcon: {
    width: 34,
    height: 34,
    lineHeight: 34,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 17,
    backgroundColor: '#FFE3E5',
    color: '#C8102E',
    fontSize: 15,
    fontWeight: '900',
  },
  roleTitle: {
    color: '#242424',
    fontSize: 12,
    fontWeight: '800',
  },
  roleDescription: {
    color: '#666666',
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  selectedLabel: {
    color: '#C8102E',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginTop: 'auto',
  },
  approvalBox: {
    backgroundColor: '#F7F7F7',
    borderLeftWidth: 3,
    borderLeftColor: '#ED1C24',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  approvalTitle: {
    color: '#252525',
    fontSize: 11,
    fontWeight: '800',
  },
  approvalText: {
    color: '#666666',
    fontSize: 10,
    lineHeight: 15,
  },
  primaryButton: {
    minHeight: 44,
    backgroundColor: '#ED1C24',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  disabled: {
    opacity: 0.6,
  },
  switchButton: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  switchPrompt: {
    color: '#686868',
    fontSize: 11,
  },
  switchText: {
    color: '#C8102E',
    fontSize: 12,
    fontWeight: '900',
  },
  bottomNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingTop: 9,
  },
  securityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFE6E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityCheck: {
    color: '#C8102E',
    fontSize: 15,
    fontWeight: '900',
  },
  noticeCopy: {
    flex: 1,
    gap: 3,
  },
  bottomNoticeTitle: {
    color: '#333333',
    fontSize: 10,
    fontWeight: '900',
  },
  bottomNoticeText: {
    color: '#777777',
    fontSize: 9,
    lineHeight: 13,
  },
  footer: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.9,
  },
});