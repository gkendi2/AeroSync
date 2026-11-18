/**
 * Two-factor status of the signed-in user. Only the admin account takes part;
 * for everyone else `isAdmin` is false and nothing is checked.
 */
import { multiFactor, TotpMultiFactorGenerator } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';

import { isAdminUser } from '@/lib/admin';
import { auth } from '@/lib/firebase';

export type AdminMfaStatus = {
  isAdmin: boolean;
  loading: boolean;
  emailVerified: boolean;
  /** An authenticator app (TOTP) is enrolled. */
  enrolled: boolean;
  /** This session was signed in with the authenticator code. */
  signedInWithCode: boolean;
};

/** Approvals are allowed only for the admin, enrolled and signed in with the code. */
export function approvalsUnlocked(status: AdminMfaStatus) {
  return status.isAdmin && status.enrolled && status.signedInWithCode;
}

// The automatic set-up prompt is shown once per sign-in.
let promptedSignIn: string | null = null;

export function shouldPromptEnrolment(status: AdminMfaStatus) {
  const user = auth.currentUser;
  if (!user || !status.isAdmin || status.loading || status.enrolled) return false;

  const key = `${user.uid}:${user.metadata.lastSignInTime ?? ''}`;
  if (promptedSignIn === key) return false;

  promptedSignIn = key;
  return true;
}

export function useAdminMfa() {
  const user = auth.currentUser;
  const isAdmin = isAdminUser(user);

  const [status, setStatus] = useState<AdminMfaStatus>({
    isAdmin,
    loading: isAdmin,
    emailVerified: !!user?.emailVerified,
    enrolled: false,
    signedInWithCode: false,
  });

  /** Re-reads the account (pass true after verifying email or enrolling). */
  const refresh = useCallback(
    async (fromServer = false) => {
      const current = auth.currentUser;

      if (!current || !isAdminUser(current)) {
        setStatus((previous) => ({ ...previous, isAdmin: false, loading: false }));
        return;
      }

      try {
        if (fromServer) await current.reload();
        const token = await current.getIdTokenResult(fromServer);

        setStatus({
          isAdmin: true,
          loading: false,
          emailVerified: current.emailVerified,
          enrolled: multiFactor(current).enrolledFactors.some(
            (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
          ),
          signedInWithCode: token.signInSecondFactor === TotpMultiFactorGenerator.FACTOR_ID,
        });
      } catch (error) {
        console.error('Could not read two-factor status:', error);
        setStatus((previous) => ({ ...previous, loading: false }));
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh, user?.uid]);

  return { status, refresh };
}
