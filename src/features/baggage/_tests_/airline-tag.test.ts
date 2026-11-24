import { describe, expect, it } from '@jest/globals';

import { airlineTagLabel, validateAirlineTagNumber } from '../airline-tag';

describe('airline bag tag number validation', () => {
  it.each(['', '   ', undefined, null])('accepts empty input %p as no tag', (input) => {
    expect(validateAirlineTagNumber(input)).toEqual({ ok: true, tag: '' });
  });

  it.each([
    ['123456', '123456'],
    ['0706123456', '0706123456'],
    ['  0706123456 ', '0706123456'],
    ['12345678', '12345678'],
  ])('accepts %p as %p', (input, tag) => {
    expect(validateAirlineTagNumber(input)).toEqual({ ok: true, tag });
  });

  it.each(['12345', '1', '07061234567', '123456789012'])(
    'rejects %p (wrong length)',
    (input) => {
      expect(validateAirlineTagNumber(input).ok).toBe(false);
    },
  );

  it.each(['KQ123456', '0706 123456', '070-612345', '123456a', '12345.6', '-123456'])(
    'rejects %p (not digits only)',
    (input) => {
      expect(validateAirlineTagNumber(input).ok).toBe(false);
    },
  );
});

describe('airlineTagLabel', () => {
  it('shows the number when linked', () => {
    expect(airlineTagLabel('0706123456')).toBe('Airline tag: 0706123456');
  });

  it('shows "not linked" when missing or empty', () => {
    expect(airlineTagLabel(undefined)).toBe('Airline tag: not linked');
    expect(airlineTagLabel('')).toBe('Airline tag: not linked');
  });
});
