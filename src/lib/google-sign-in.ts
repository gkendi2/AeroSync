/**
 * Android and iOS: Google sign-in is not offered (the button is hidden).
 * The web build uses google-sign-in.web.ts instead of this file.
 */
import type { UserCredential } from 'firebase/auth';

export const GOOGLE_SIGN_IN_AVAILABLE = false;

export function signInWithGoogle(): Promise<UserCredential> {
  return Promise.reject(new Error('Google sign-in is only available on the web.'));
}
