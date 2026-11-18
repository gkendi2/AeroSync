
import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';
import { usePathname } from 'expo-router';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Icon, { type AppIconName } from '@/components/icon';

type Role = 'handler' | 'supervisor';

type AppTabsProps = {
  role: Role;
};

const RED = '#C8102E';
const DARK = '#24272B';
const BORDER = '#E9E9EB';

// Screens shown full screen: the floating tab bar is hidden there
// (each has its own back button).
const FULL_SCREEN_ROUTES = ['/flight-thread'];

export default function AppTabs({ role }: AppTabsProps) {
  const isHandler = role === 'handler';
  const styles = createStyles();

  return (
    // 'history': back returns to the screen you came from, not the first tab.
    <Tabs options={{ backBehavior: 'history' }}>
      <TabSlot style={{ flex: 1 }} />

      <TabList asChild>
        <CustomTabList styles={styles}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton styles={styles} icon="dashboard">
              {isHandler ? 'Home' : 'Operations'}
            </TabButton>
          </TabTrigger>

          {isHandler ? (
            <>
              <TabTrigger name="explore" href="/explore" asChild>
                <TabButton styles={styles} icon="tasks">
                  My Tasks
                </TabButton>
              </TabTrigger>

              <TabTrigger name="scan-qr" href="/scan-qr" asChild>
                <TabButton styles={styles} icon="scanQr">
                  Scan QR
                </TabButton>
              </TabTrigger>

              <TabTrigger name="incidents" href="/incidents" asChild>
                <TabButton styles={styles} icon="incidents">
                  Incidents
                </TabButton>
              </TabTrigger>

              <TabTrigger name="account" href="/account" asChild>
                <TabButton styles={styles} icon="account">
                  Account
                </TabButton>
              </TabTrigger>

              {/* Hidden destinations shared by both roles */}
              <TabTrigger name="flight-thread" href="/flight-thread" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>

              <TabTrigger name="notifications" href="/notifications" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>
            </>
          ) : (
            <>
              <TabTrigger name="flights" href="/flights" asChild>
                <TabButton styles={styles} icon="flights">
                  Flights
                </TabButton>
              </TabTrigger>

              <TabTrigger name="baggage" href="/baggage" asChild>
                <TabButton styles={styles} icon="baggage">
                  Baggage
                </TabButton>
              </TabTrigger>

              <TabTrigger name="crew" href="/crew" asChild>
                <TabButton styles={styles} icon="crew">
                  Crew
                </TabButton>
              </TabTrigger>

              <TabTrigger name="more" href="/more" asChild>
                <TabButton styles={styles} icon="more">
                  More
                </TabButton>
              </TabTrigger>

              {/* Hidden supervisor destinations */}
              <TabTrigger name="delay-risk" href="/delay-risk" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>

              <TabTrigger name="approvals" href="/approvals" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>

              <TabTrigger
                name="incident-management"
                href="/incident-management"
                asChild
              >
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>

              <TabTrigger name="account" href="/account" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>

              {/* Hidden destinations shared by both roles */}
              <TabTrigger name="flight-thread" href="/flight-thread" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>

              <TabTrigger name="notifications" href="/notifications" asChild>
                <Pressable style={styles.hiddenTab} />
              </TabTrigger>
            </>
          )}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabStyles = ReturnType<typeof createStyles>;

function TabButton({
  children,
  isFocused,
  styles,
  icon,
  ...props
}: TabTriggerSlotProps & {
  styles: TabStyles;
  icon: AppIconName;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [
        styles.tabButton,
        isFocused && styles.activeTab,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={23} color={isFocused ? RED : DARK} />

      <Text
        numberOfLines={1}
        style={[
          styles.tabText,
          isFocused && styles.activeTabText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function CustomTabList({
  styles,
  ...props
}: TabListProps & {
  styles: TabStyles;
}) {
  // Hidden, not removed: the triggers must stay mounted for navigation.
  const fullScreen = FULL_SCREEN_ROUTES.includes(usePathname());

  return (
    <View
      {...props}
      style={[styles.tabListContainer, fullScreen && styles.hiddenTab]}
    >
      <View style={styles.tabList}>
        {props.children}
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    tabListContainer: {
      position: 'absolute',
      bottom: 12,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 12,
    },

    tabList: {
      width: '100%',
      maxWidth: 570,
      minHeight: 70,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: BORDER,
      borderRadius: 38,
      paddingHorizontal: 5,
      paddingVertical: 5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      elevation: 7,
      shadowColor: '#000000',
      shadowOpacity: 0.09,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },

    tabButton: {
      flex: 1,
      minWidth: 0,
      height: 58,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingHorizontal: 2,
    },

    hiddenTab: {
      display: 'none',
    },

    activeTab: {
      backgroundColor: '#FCECEF',
    },

    tabText: {
      color: DARK,
      fontSize: 10,
      fontWeight: '600',
      textAlign: 'center',
    },

    activeTabText: {
      color: RED,
      fontWeight: '800',
    },

    pressed: {
      opacity: 0.65,
    },
  });
}
