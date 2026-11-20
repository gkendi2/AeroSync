import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

import { createAuth } from './create-auth';

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

// Web: authentication only for the current browser session (create-auth.web.ts).
// Native: stays signed in after the app reloads (create-auth.ts, AsyncStorage).
const authSetup = createAuth(app);

export const auth = authSetup.auth;

export const authPersistenceReady: Promise<void> = authSetup.ready;
