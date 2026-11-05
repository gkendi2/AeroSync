import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyAVkmICVoyXkPlLedmEwo6xmAkycxPN8Qg',
  authDomain: 'aerosync-49084.firebaseapp.com',
  projectId: 'aerosync-49084',
  storageBucket: 'aerosync-49084.firebasestorage.app',
  messagingSenderId: '145284156891',
  appId: '1:145284156891:web:43203c032ad810ae1d6bfe',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);

export const auth = getAuth(app);

// Web: keep authentication only for the current browser session.
// Native: retain the existing Firebase authentication behaviour.
export const authPersistenceReady =
  Platform.OS === 'web'
    ? setPersistence(auth, browserSessionPersistence)
    : Promise.resolve();