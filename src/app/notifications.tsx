import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon, { type AppIconName } from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';
import { toDateString, toTimeString } from '@/features/datetime/format';
import {
  NOTIFICATION_WINDOW_DAYS,
  type AppNotification,
  type NotificationKind,
} from '@/features/notifications/build';
import { useNotifications } from '@/features/notifications/useNotifications';
import { goBackOrHome } from '@/lib/navigation';

const KIND_ICONS: Record<NotificationKind, { icon: AppIconName; color: string; background: string }> = {
  assignment: { icon: 'newTask', color: AeroSyncColors.info, background: AeroSyncColors.infoLight },
  'incident-status': { icon: 'incidents', color: AeroSyncColors.warning, background: AeroSyncColors.warningLight },
  'corrective-action': { icon: 'checkCircle', color: AeroSyncColors.success, background: AeroSyncColors.successLight },
  message: { icon: 'messages', color: AeroSyncColors.primaryDark, background: AeroSyncColors.primaryLight },
  'new-incident': { icon: 'incidents', color: AeroSyncColors.warning, background: AeroSyncColors.warningLight },
  'high-risk': { icon: 'delayRisk', color: AeroSyncColors.danger, background: AeroSyncColors.dangerLight },
};

function formatWhen(time: Date | null) {
  if (!time) return 'Now';
  if (toDateString(time) === toDateString(new Date())) return toTimeString(time);
  return `${time.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${toTimeString(time)}`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, ready, markAllRead } = useNotifications();

  // Unread items when the screen was opened keep their dot while it stays open.
  const [focused, setFocused] = useState(false);
  const [openedUnread, setOpenedUnread] = useState<Set<string> | null>(null);

  const markAllReadRef = useRef(markAllRead);
  markAllReadRef.current = markAllRead;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setOpenedUnread(null);
        // Also covers anything that arrived while the list was open.
        void markAllReadRef.current();
      };
    }, []),
  );

  useEffect(() => {
    if (!focused || !ready || openedUnread !== null) return;
    setOpenedUnread(new Set(notifications.filter((item) => item.unread).map((item) => item.id)));
    void markAllRead();
  }, [focused, ready, openedUnread, notifications, markAllRead]);

  function open(item: AppNotification) {
    if ('params' in item.target) {
      router.push({ pathname: item.target.pathname, params: item.target.params });
    } else {
      router.push(item.target.pathname);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          onPress={() => goBackOrHome(router)}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Icon name="back" size={30} color={AeroSyncColors.text} />
        </Pressable>
        <Text style={styles.heading}>Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>Last {NOTIFICATION_WINDOW_DAYS} days</Text>

        {!ready ? (
          <ActivityIndicator color={AeroSyncColors.primaryDark} style={styles.loading} />
        ) : notifications.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="bell" size={30} color={AeroSyncColors.textSecondary} />
            <Text style={styles.emptyText}>No notifications in the last {NOTIFICATION_WINDOW_DAYS} days.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {notifications.map((item, index) => {
              const look = KIND_ICONS[item.kind];
              const unread = item.unread || !!openedUnread?.has(item.id);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => open(item)}
                  style={({ pressed }) => [
                    styles.row,
                    index === notifications.length - 1 && styles.lastRow,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={[styles.icon, { backgroundColor: look.background }]}>
                    <Icon name={look.icon} size={20} color={look.color} />
                  </View>

                  <View style={styles.copy}>
                    <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.body} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>

                  <View style={styles.meta}>
                    <Text style={styles.time}>{formatWhen(item.time)}</Text>
                    {unread && <View style={styles.dot} accessibilityLabel="Unread" />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AeroSyncColors.background,
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: AeroSyncColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AeroSyncColors.border,
  },
  backButton: {
    width: 32,
    height: 42,
    justifyContent: 'center',
  },
  heading: {
    color: AeroSyncColors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 110,
  },
  hint: {
    color: AeroSyncColors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
  },
  loading: {
    marginTop: 40,
  },
  empty: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 50,
  },
  emptyText: {
    color: AeroSyncColors.textSecondary,
    fontSize: 13,
  },
  list: {
    backgroundColor: AeroSyncColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: AeroSyncColors.border,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  pressed: {
    opacity: 0.65,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    color: AeroSyncColors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  titleUnread: {
    fontWeight: '900',
  },
  body: {
    color: AeroSyncColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  meta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  time: {
    color: AeroSyncColors.textSecondary,
    fontSize: 11,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: AeroSyncColors.primaryDark,
  },
});
