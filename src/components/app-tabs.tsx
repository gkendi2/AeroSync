
import {
  TabList,
  TabListProps,
  Tabs,
  TabSlot,
  TabTrigger,
  TabTriggerSlotProps,
} from 'expo-router/ui';

import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Role = 'handler' | 'supervisor';

type AppTabsProps = {
  role: Role;
};

const RED = '#C8102E';
const DARK = '#24272B';
const BORDER = '#E9E9EB';

export default function AppTabs({ role }: AppTabsProps) {
  const isHandler = role === 'handler';
  const styles = createStyles();

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />

      <TabList asChild>
        <CustomTabList styles={styles}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton styles={styles} icon="⌂">
              {isHandler ? 'Home' : 'Operations'}
            </TabButton>
          </TabTrigger>

          {isHandler ? (
            <>
              <TabTrigger name="explore" href="/explore" asChild>
                <TabButton styles={styles} icon="▣">
                  My Tasks
                </TabButton>
              </TabTrigger>

              <TabTrigger name="scan-qr" href="/scan-qr" asChild>
                <TabButton styles={styles} icon="▦">
                  Scan QR
                </TabButton>
              </TabTrigger>

              <TabTrigger name="incidents" href="/incidents" asChild>
                <TabButton styles={styles} icon="⚠">
                  Incidents
                </TabButton>
              </TabTrigger>

              <TabTrigger name="account" href="/account" asChild>
                <TabButton styles={styles} icon="●">
                  Account
                </TabButton>
              </TabTrigger>
            </>
          ) : (
            <>
              <TabTrigger name="flights" href="/flights" asChild>
                <TabButton styles={styles} icon="✈">
                  Flights
                </TabButton>
              </TabTrigger>

              <TabTrigger name="baggage" href="/baggage" asChild>
                <TabButton styles={styles} icon="▣">
                  Baggage
                </TabButton>
              </TabTrigger>

              <TabTrigger name="crew" href="/crew" asChild>
                <TabButton styles={styles} icon="👥">
                  Crew
                </TabButton>
              </TabTrigger>

              <TabTrigger name="more" href="/more" asChild>
                <TabButton styles={styles} icon="☰">
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
  icon: string;
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
      <Text style={[styles.tabIcon, isFocused && styles.activeTabIcon]}>
        {icon}
      </Text>

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
  return (
    <View {...props} style={styles.tabListContainer}>
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

    tabIcon: {
      color: DARK,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '600',
    },

    activeTabIcon: {
      color: RED,
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
