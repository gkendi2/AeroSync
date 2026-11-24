/**
 * Names and greetings for the home screens. Pure functions, unit-tested.
 */

/**
 * First name for a greeting: the first word of the Firestore profile name
 * (entered at registration), else of the sign-in account's display name,
 * else the fallback. Trimmed, first letter capitalised.
 */
export function greetingFirstName(
  profileName: string | null | undefined,
  authName: string | null | undefined,
  fallback: string,
): string {
  for (const name of [profileName, authName]) {
    const first = (name ?? '').trim().split(/\s+/)[0];
    if (first) return first.charAt(0).toUpperCase() + first.slice(1);
  }
  return fallback;
}

/** Good morning before 12:00, Good afternoon before 17:00, Good evening after. */
export function greetingForTime(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
