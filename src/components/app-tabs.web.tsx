
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

const RED = '#F0182B';
const DEEP_RED = '#B51F3A';
const TEXT = '#292929';
const MUTED = '#777777';

export default function AppTabs({ role }: AppTabsProps) {
  const isHandler = role === 'handler';

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />

      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>
              {isHandler ? 'Home' : 'Operations'}
            </TabButton>
          </TabTrigger>

          {isHandler && (
            <TabTrigger name="explore" href="/explore" asChild>
              <TabButton>My Tasks</TabButton>
            </TabTrigger>
          )}

          {isHandler && (
            <TabTrigger name="scan-qr" href="/scan-qr" asChild>
              <TabButton>Scan QR</TabButton>
            </TabTrigger>
          )}

          {isHandler && (
            <TabTrigger name="incidents" href="/incidents" asChild>
              <TabButton>Incidents</TabButton>
            </TabTrigger>
          )}

          {!isHandler && (
            <TabTrigger name="baggage" href="/baggage" asChild>
              <TabButton>Baggage</TabButton>
            </TabTrigger>
          )}

          {!isHandler && (
            <TabTrigger name="crew" href="/crew" asChild>
              <TabButton>Crew</TabButton>
            </TabTrigger>
          )}

          {!isHandler && (
            <TabTrigger name="delay-risk" href="/delay-risk" asChild>
              <TabButton>Delay Risk</TabButton>
            </TabTrigger>
          )}

          {!isHandler && (
            <TabTrigger name="approvals" href="/approvals" asChild>
              <TabButton>Approvals</TabButton>
            </TabTrigger>
          )}

          <TabTrigger name="account" href="/account" asChild>
            <TabButton>Account</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  children,
  isFocused,
  ...props
}: TabTriggerSlotProps) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.tabButton,
        isFocused && styles.activeTab,
        pressed && styles.pressed,
      ]}
    >
      <Text
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

function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.tabList}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>

          <View>
            <Text style={styles.brandName}>AeroSync</Text>
            <Text style={styles.brandSubtitle}>
              KENYA AIRWAYS
            </Text>
          </View>
        </View>

        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  tabList: {
    width: '100%',
    maxWidth: 1050,
    minHeight: 66,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    elevation: 5,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },

  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginRight: 'auto',
    paddingHorizontal: 8,
  },

  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },

  brandName: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '900',
  },

  brandSubtitle: {
    color: DEEP_RED,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  tabButton: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
  },

  activeTab: {
    backgroundColor: RED,
  },

  tabText: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
  },

  activeTabText: {
    color: '#FFFFFF',
  },

  pressed: {
    opacity: 0.7,
  },
});
