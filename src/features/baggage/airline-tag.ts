/**
 * Optional airline bag tag number on a BaggageRecords document
 * (airlineTagNumber). Separate from baggageReference, which AeroSync generates.
 */

export const AIRLINE_TAG_MIN_DIGITS = 6;
export const AIRLINE_TAG_MAX_DIGITS = 10;

export type AirlineTagCheck =
  | { ok: true; tag: string }
  | { ok: false; error: string };

/**
 * Empty (no tag, saved as '') or 6–10 digits only. Surrounding spaces are
 * trimmed; anything else that is not a digit is rejected.
 */
export function validateAirlineTagNumber(raw: unknown): AirlineTagCheck {
  const tag = typeof raw === 'string' ? raw.trim() : '';
  if (tag === '') return { ok: true, tag: '' };
  if (
    !/^[0-9]+$/.test(tag) ||
    tag.length < AIRLINE_TAG_MIN_DIGITS ||
    tag.length > AIRLINE_TAG_MAX_DIGITS
  ) {
    return {
      ok: false,
      error: `Enter ${AIRLINE_TAG_MIN_DIGITS}–${AIRLINE_TAG_MAX_DIGITS} digits only, or leave it empty.`,
    };
  }
  return { ok: true, tag };
}

/** "Airline tag: 0706123456" or "Airline tag: not linked". */
export function airlineTagLabel(tag: string | null | undefined): string {
  const value = (tag ?? '').trim();
  return `Airline tag: ${value || 'not linked'}`;
}
