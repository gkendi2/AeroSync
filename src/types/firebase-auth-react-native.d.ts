/**
 * getReactNativePersistence is exported by Firebase Auth's React Native build
 * (used on iOS/Android by Metro), but TypeScript reads the web type definitions,
 * which leave it out. This declares only that function, matching
 * node_modules/@firebase/auth/dist/rn/index.rn.d.ts.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
