/**
 * Web: unchanged behaviour. Authentication lasts only for the current browser
 * session (browserSessionPersistence).
 */
import type { FirebaseApp } from 'firebase/app';
import { browserSessionPersistence, getAuth, setPersistence } from 'firebase/auth';

export function createAuth(app: FirebaseApp) {
  const auth = getAuth(app);
  return { auth, ready: setPersistence(auth, browserSessionPersistence) };
}
