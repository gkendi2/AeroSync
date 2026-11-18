import { useRouter } from 'expo-router';
import {
  multiFactor,
  sendEmailVerification,
  signOut,
  TotpMultiFactorGenerator,
  type TotpSecret,
} from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';
import {
  cleanTotpCode,
  formatSecretKey,
  isCompleteTotpCode,
  mfaCodeError,
  TOTP_DISPLAY_NAME,
  TOTP_ISSUER,
} from '@/features/auth/mfa';
import { useAdminMfa } from '@/features/auth/useAdminMfa';
import { auth } from '@/lib/firebase';
import { goBackOrHome } from '@/lib/navigation';

/** Two-factor (authenticator app) set-up for the admin account only. */
export default function AdminSecurityScreen() {
  const router = useRouter();
  const { status, refresh } = useAdminMfa();
  const user = auth.currentUser;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsFreshSignIn, setNeedsFreshSignIn] = useState(false);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState('');

  function handleError(error: unknown) {
    const result = mfaCodeError((error as { code?: string })?.code);
    if ((error as { code?: string })?.code === 'auth/requires-recent-login') {
      setNeedsFreshSignIn(true);
    }
    if (result.restart) {
      setSecret(null);
      setCode('');
    }
    setMessage(result.message);
  }

  async function sendVerification() {
    if (!user || busy) return;
    setBusy(true);
    setMessage('');

    try {
      await sendEmailVerification(user);
      setMessage(`Verification email sent to ${user.email}. Open the link, then tap "I've verified".`);
    } catch (error) {
      console.error('Sending verification email failed:', error);
      setMessage(
        (error as { code?: string })?.code === 'auth/too-many-requests'
          ? 'Too many emails sent. Wait a few minutes and try again.'
          : 'Could not send the email. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkVerified() {
    setBusy(true);
    await refresh(true);
    setBusy(false);
    setMessage(
      auth.currentUser?.emailVerified
        ? ''
        : 'Your email is not verified yet. Open the link in the email, then try again.',
    );
  }

  async function startEnrolment() {
    if (!user || busy) return;
    setBusy(true);
    setMessage('');

    try {
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (error) {
      console.error('Starting two-factor set-up failed:', error);
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrolment() {
    if (!user || !secret || busy || !isCompleteTotpCode(code)) return;
    setBusy(true);
    setMessage('');

    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        secret,
        cleanTotpCode(code),
      );
      await multiFactor(user).enroll(assertion, TOTP_DISPLAY_NAME);
      setSecret(null);
      setCode('');
      await refresh(true);
    } catch (error) {
      console.error('Confirming two-factor set-up failed:', error);
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function signOutNow() {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out failed:', error);
    }
  }

  function renderBody() {
    if (!status.isAdmin) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Not available</Text>
          <Text style={styles.text}>Two-factor set-up is only for the administrator account.</Text>
        </View>
      );
    }

    if (status.loading) {
      return <ActivityIndicator color={AeroSyncColors.primaryDark} style={styles.loading} />;
    }

    if (!status.emailVerified) {
      return (
        <View style={styles.card}>
          <Icon name="email" size={28} color={AeroSyncColors.primaryDark} />
          <Text style={styles.cardTitle}>Verify your email</Text>
          <Text style={styles.text}>
            Two-factor authentication needs a verified email address. We will send a link to{' '}
            <Text style={styles.strong}>{user?.email}</Text>.
          </Text>

          <PrimaryButton label="Send verification email" onPress={sendVerification} busy={busy} />
          <SecondaryButton label="I've verified" onPress={checkVerified} disabled={busy} />
        </View>
      );
    }

    if (status.enrolled) {
      return (
        <View style={styles.card}>
          <Icon name="checkCircle" size={30} color={AeroSyncColors.success} />
          <Text style={styles.cardTitle}>Two-factor authentication is on</Text>
          <Text style={styles.text}>
            Signing in as administrator now needs a 6-digit code from your authenticator app.
          </Text>

          {status.signedInWithCode ? (
            <Text style={styles.okText}>This session was signed in with your code. Approvals are unlocked.</Text>
          ) : (
            <>
              <Text style={styles.warnText}>
                Sign out and sign in again with your code to use Approvals.
              </Text>
              <PrimaryButton label="Sign out" onPress={signOutNow} />
            </>
          )}
        </View>
      );
    }

    if (secret) {
      const qrValue = secret.generateQrCodeUrl(user?.email ?? 'admin', TOTP_ISSUER);

      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scan with your authenticator app</Text>
          <Text style={styles.text}>
            In Google Authenticator tap +, then Scan a QR code. On this phone, use "Enter a setup key"
            with the key below instead.
          </Text>

          <View style={styles.qrBox}>
            <QRCode value={qrValue} size={200} />
          </View>

          <Text style={styles.label}>SETUP KEY</Text>
          <Text style={styles.secret} selectable>
            {formatSecretKey(secret.secretKey)}
          </Text>
          <Text style={styles.hint}>
            Account: {user?.email} · Time-based · {secret.codeLength} digits
          </Text>

          <Text style={styles.label}>6-DIGIT CODE FROM THE APP</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(value) => setCode(cleanTotpCode(value))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
            placeholderTextColor={AeroSyncColors.textMuted}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            editable={!busy}
          />

          <PrimaryButton
            label="Confirm and turn on"
            onPress={confirmEnrolment}
            busy={busy}
            disabled={!isCompleteTotpCode(code)}
          />
          <SecondaryButton
            label="Start again"
            onPress={() => {
              setSecret(null);
              setCode('');
              setMessage('');
            }}
            disabled={busy}
          />
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Icon name="access" size={30} color={AeroSyncColors.primaryDark} />
        <Text style={styles.cardTitle}>Protect the administrator account</Text>
        <Text style={styles.text}>
          Add an authenticator app (such as Google Authenticator). After that, signing in as
          administrator needs your password and a 6-digit code. Staff Approvals stay locked until
          this is done.
        </Text>

        <PrimaryButton label="Set up authenticator app" onPress={startEnrolment} busy={busy} />
        <SecondaryButton label="Not now" onPress={() => goBackOrHome(router)} disabled={busy} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          onPress={() => goBackOrHome(router)}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Icon name="back" size={30} color={AeroSyncColors.text} />
        </Pressable>
        <Text style={styles.heading}>Two-factor authentication</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {renderBody()}

        {!!message && (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
            {needsFreshSignIn && (
              <SecondaryButton label="Sign out" onPress={signOutNow} />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        (busy || disabled) && styles.disabled,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={AeroSyncColors.white} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AeroSyncColors.background,
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: AeroSyncColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AeroSyncColors.border,
  },
  backButton: {
    width: 32,
    height: 42,
    justifyContent: 'center',
  },
  heading: {
    color: AeroSyncColors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 120,
    gap: 14,
  },
  loading: {
    marginTop: 40,
  },
  card: {
    backgroundColor: AeroSyncColors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    color: AeroSyncColors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  text: {
    color: AeroSyncColors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  strong: {
    color: AeroSyncColors.text,
    fontWeight: '800',
  },
  okText: {
    color: AeroSyncColors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  warnText: {
    color: AeroSyncColors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  qrBox: {
    alignSelf: 'center',
    padding: 12,
    backgroundColor: AeroSyncColors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
  },
  label: {
    color: AeroSyncColors.textSecondary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  secret: {
    color: AeroSyncColors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  hint: {
    color: AeroSyncColors.textSecondary,
    fontSize: 12,
  },
  codeInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: AeroSyncColors.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: AeroSyncColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: AeroSyncColors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AeroSyncColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: AeroSyncColors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  messageBox: {
    backgroundColor: AeroSyncColors.warningLight,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  messageText: {
    color: AeroSyncColors.text,
    fontSize: 13,
    lineHeight: 19,
  },
});
