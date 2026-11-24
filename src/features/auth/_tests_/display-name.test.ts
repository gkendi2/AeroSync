import { describe, expect, it } from '@jest/globals';

import { greetingFirstName, greetingForTime } from '../display-name';

describe('greetingFirstName', () => {
  it('uses the first word of a full name', () => {
    expect(greetingFirstName('Mark Otieno Kamau', undefined, 'Handler')).toBe('Mark');
  });

  it('keeps a single name', () => {
    expect(greetingFirstName('Wanjiru', undefined, 'Handler')).toBe('Wanjiru');
  });

  it('ignores extra spaces', () => {
    expect(greetingFirstName('   Amina    Hassan  ', undefined, 'Handler')).toBe('Amina');
  });

  it('capitalises a lower-case name', () => {
    expect(greetingFirstName('brian ochieng', undefined, 'Supervisor')).toBe('Brian');
  });

  it('falls back to the sign-in name when the profile name is empty', () => {
    expect(greetingFirstName('  ', 'grace njeri', 'Supervisor')).toBe('Grace');
    expect(greetingFirstName(undefined, 'Grace', 'Supervisor')).toBe('Grace');
  });

  it('prefers the profile name over the sign-in name', () => {
    expect(greetingFirstName('Mark', 'Someone Else', 'Handler')).toBe('Mark');
  });

  it('uses the fallback when no name is available', () => {
    expect(greetingFirstName(undefined, null, 'Handler')).toBe('Handler');
    expect(greetingFirstName('', '   ', 'Supervisor')).toBe('Supervisor');
  });
});

describe('greetingForTime', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 10, 24, hour, minute);

  it('switches at 12:00 and 17:00', () => {
    expect(greetingForTime(at(0, 0))).toBe('Good morning');
    expect(greetingForTime(at(11, 59))).toBe('Good morning');
    expect(greetingForTime(at(12, 0))).toBe('Good afternoon');
    expect(greetingForTime(at(16, 59))).toBe('Good afternoon');
    expect(greetingForTime(at(17, 0))).toBe('Good evening');
  });
});
