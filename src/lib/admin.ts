import type { User } from 'firebase/auth';

/** Gloria's account: the only one that approves or rejects registrations. */
export const ADMIN_UID = '1IN8y6QDe4WyqGhMXXG3OzRtSWE3';

export function isAdminUser(user: User | null | undefined): boolean {
  return user?.uid === ADMIN_UID;
}
