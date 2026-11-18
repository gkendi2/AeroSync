/**
 * Google sign-in for the web client (Firebase JS SDK popup).
 * The native build uses google-sign-in.ts, where it is not offered.
 */
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

import { auth } from './firebase';

export const GOOGLE_SIGN_IN_AVAILABLE = true;

export function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  // Let people pick which Google account to use each time.
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
