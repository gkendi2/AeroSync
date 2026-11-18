/**
 * Two-factor (TOTP) helpers for the admin account. Pure functions, unit-tested.
 */

export const TOTP_ISSUER = 'AeroSync';
export const TOTP_DISPLAY_NAME = 'Authenticator app';

/** Digits only, so "123 456" and "123-456" are accepted. */
export function cleanTotpCode(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function isCompleteTotpCode(raw: string) {
  return /^\d{6}$/.test(cleanTotpCode(raw));
}

/** "JBSW Y3DP EHPK 3PXP" — easier to type into an authenticator app. */
export function formatSecretKey(secret: string) {
  return secret.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * What to tell the user when a code is refused. `restart` = the sign-in or
 * setup session is gone, so the user must start again.
 */
export function mfaCodeError(code: string | undefined): { message: string; restart: boolean } {
  switch (code) {
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code':
      return {
        message:
          "That code is not correct. Check that your phone's time is set automatically and enter the newest code.",
        restart: false,
      };
    case 'auth/code-expired':
    case 'auth/invalid-multi-factor-session':
    case 'auth/missing-multi-factor-session':
    case 'auth/totp-challenge-timeout':
      return { message: 'This session has expired. Please start again.', restart: true };
    case 'auth/too-many-requests':
      return {
        message: 'Too many attempts. Wait a few minutes before trying again.',
        restart: false,
      };
    case 'auth/network-request-failed':
      return { message: 'Network error. Check your connection and try again.', restart: false };
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return {
        message:
          'For security, sign out and sign in again, then set up two-factor authentication.',
        restart: true,
      };
    case 'auth/unverified-email':
      return { message: 'Verify your email address first.', restart: true };
    default:
      return { message: 'Something went wrong. Please try again.', restart: false };
  }
}
