import { StyleSheet, Text, View } from 'react-native';

import { AeroSyncColors } from '@/constants/theme';

export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

const TONES: Record<StatusTone, { background: string; text: string }> = {
  neutral: { background: '#F0F0F0', text: AeroSyncColors.textSecondary },
  info: { background: AeroSyncColors.infoLight, text: AeroSyncColors.info },
  warning: { background: AeroSyncColors.warningLight, text: AeroSyncColors.warning },
  success: { background: AeroSyncColors.successLight, text: AeroSyncColors.success },
  danger: { background: AeroSyncColors.dangerLight, text: AeroSyncColors.danger },
};

/** Tone for a crew-assignment status. */
export function taskStatusTone(status: string, overdue = false): StatusTone {
  if (overdue) return 'danger';
  if (status === 'Completed') return 'success';
  if (status === 'In Progress') return 'info';
  if (status === 'Cancelled') return 'danger';
  return 'neutral';
}

export default function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const colors = TONES[tone];

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
  },
});
