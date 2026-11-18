import { describe, expect, it } from '@jest/globals';

import { cleanTotpCode, formatSecretKey, isCompleteTotpCode, mfaCodeError } from '../mfa';

describe('TOTP code input', () => {
  it('keeps the first six digits only', () => {
    expect(cleanTotpCode('123 456')).toBe('123456');
    expect(cleanTotpCode('12-34-567')).toBe('123456');
    expect(cleanTotpCode('abc')).toBe('');
  });

  it('accepts exactly six digits', () => {
    expect(isCompleteTotpCode('123456')).toBe(true);
    expect(isCompleteTotpCode(' 123 456 ')).toBe(true);
    expect(isCompleteTotpCode('12345')).toBe(false);
  });
});

describe('formatSecretKey', () => {
  it('groups the secret in fours', () => {
    expect(formatSecretKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(formatSecretKey('ABCDEF')).toBe('ABCD EF');
  });
});

describe('mfaCodeError', () => {
  it('keeps the code box open for a wrong code', () => {
    expect(mfaCodeError('auth/invalid-verification-code')).toMatchObject({ restart: false });
  });

  it('restarts for an expired session', () => {
    for (const code of [
      'auth/code-expired',
      'auth/invalid-multi-factor-session',
      'auth/missing-multi-factor-session',
    ]) {
      expect(mfaCodeError(code)).toEqual({
        message: 'This session has expired. Please start again.',
        restart: true,
      });
    }
  });

  it('asks for a fresh sign-in when the session is too old', () => {
    expect(mfaCodeError('auth/requires-recent-login').message).toMatch(/sign out and sign in again/);
  });

  it('has a fallback', () => {
    expect(mfaCodeError(undefined).restart).toBe(false);
  });
});
