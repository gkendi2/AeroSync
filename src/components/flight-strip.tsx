import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Icon from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';

/**
 * One-line flight summary: plane icon, flight number, route and departure.
 * Route and departure are left out when the Flights record is not known.
 */
export default function FlightStrip({
  flightNumber,
  route,
  departure,
  right,
}: {
  flightNumber: string;
  /** e.g. "NBO → LHR" */
  route?: string;
  /** e.g. "Dep 14:00" */
  departure?: string;
  /** Optional element on the right, such as a StatusBadge. */
  right?: ReactNode;
}) {
  const details = [route, departure].filter(Boolean).join(' · ');

  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Icon name="airplane" size={20} color={AeroSyncColors.primaryDark} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.flight} numberOfLines={1}>
          {flightNumber || 'General task'}
        </Text>
        {!!details && (
          <Text style={styles.details} numberOfLines={1}>
            {details}
          </Text>
        )}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: AeroSyncColors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  flight: {
    color: AeroSyncColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  details: {
    color: AeroSyncColors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
});
