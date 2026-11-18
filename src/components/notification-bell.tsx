import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';
import { badgeLabel } from '@/features/notifications/build';
import { useNotifications } from '@/features/notifications/useNotifications';

/** Bell with the unread count; opens the notifications list. */
export default function NotificationBell() {
  const router = useRouter();
  const { unread } = useNotifications();
  const label = badgeLabel(unread);

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      hitSlop={6}
    >
      <Icon name="bell" size={24} color={AeroSyncColors.text} />
      {!!label && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AeroSyncColors.white,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: AeroSyncColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: AeroSyncColors.white,
    fontSize: 10,
    fontWeight: '900',
  },
});
