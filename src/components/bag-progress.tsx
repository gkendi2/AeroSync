import { StyleSheet, Text, View } from 'react-native';

import Icon from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';

/** Progress bar with "3/5 loaded" for a flight's registered bags. */
export default function BagProgress({ loaded, total }: { loaded: number; total: number }) {
  const ratio = total > 0 ? Math.min(loaded / total, 1) : 0;
  const done = total > 0 && loaded >= total;

  return (
    <View style={styles.row} accessibilityLabel={`${loaded} of ${total} bags loaded`}>
      <Icon name="baggage" size={16} color={AeroSyncColors.textSecondary} />

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${ratio * 100}%`,
              backgroundColor: done ? AeroSyncColors.success : AeroSyncColors.info,
            },
          ]}
        />
      </View>

      <Text style={styles.label}>
        {loaded}/{total} loaded
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  track: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: AeroSyncColors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  label: {
    color: AeroSyncColors.text,
    fontSize: 11,
    fontWeight: '800',
  },
});
