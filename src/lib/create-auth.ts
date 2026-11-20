/**
 * iOS and Android: keep the user signed in across app reloads by storing the
 * auth session in AsyncStorage. (Web uses create-auth.web.ts instead.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import {
  getAuth,
  // Only exported by Firebase's React Native build, which Metro uses here.
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';

export function createAuth(app: FirebaseApp) {
  let auth: Auth;

  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // Fast refresh re-runs this module; auth is already initialised then.
    if ((error as { code?: string })?.code !== 'auth/already-initialized') throw error;
    auth = getAuth(app);
  }

  return { auth, ready: Promise.resolve() };
}
