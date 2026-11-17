
import { useRouter } from 'expo-router';
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import Icon, { type AppIconName } from '@/components/icon';
import { isAdminUser } from '@/lib/admin';
import { auth } from '@/lib/firebase';

const RED = '#C8102E';
const DARK = '#24272B';
const MUTED = '#747B83';
const BORDER = '#E8E9EB';

const menuItems: {
  title: string;
  description: string;
  icon: AppIconName;
  route: '/delay-risk' | '/approvals' | '/incident-management' | '/account';
  adminOnly?: boolean;
}[] = [
  {
    title: 'Delay Risk',
    description: 'Monitor flight delay risks and operational indicators',
    icon: 'delayRisk',
    route: '/delay-risk',
  },
  {
    title: 'Staff Approvals',
    description: 'Review and approve staff registration requests',
    icon: 'approvals',
    route: '/approvals',
    // Only the admin approves registrations.
    adminOnly: true,
  },
  {
    title: 'Incident Management',
    description: 'Review and manage reported operational incidents',
    icon: 'incidents',
    route: '/incident-management',
  },
  {
    title: 'Account',
    description: 'Profile information, support and sign-out',
    icon: 'account',
    route: '/account',
  },
];

export default function MoreScreen() {
  const router = useRouter();
  const isAdmin = isAdminUser(auth.currentUser);
  const visibleItems = menuItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>AEROSYNC</Text>
            <Text style={styles.heading}>More</Text>
            <Text style={styles.subtitle}>
              Additional supervisor tools and settings
            </Text>
          </View>

          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>K</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SUPERVISOR TOOLS</Text>

        <View style={styles.menuList}>
          {visibleItems.map((item, index) => (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route)}
              style={({ pressed }) => [
                styles.menuItem,
                index === visibleItems.length - 1 && styles.lastItem,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.menuIcon,
                  item.title === 'Incident Management' &&
                    styles.warningIcon,
                ]}
              >
                <Icon
                  name={item.icon}
                  size={21}
                  color={
                    item.title === 'Incident Management' ? '#A86A13' : RED
                  }
                />
              </View>

              <View style={styles.menuCopy}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuDescription}>
                  {item.description}
                </Text>
              </View>

              <Icon name="forward" size={22} color="#9299A0" />
            </Pressable>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerName}>AeroSync</Text>
          <Text style={styles.footerText}>
            KENYA AIRWAYS · GROUND OPERATIONS
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 115,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
  },
  eyebrow: {
    color: RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heading: {
    color: DARK,
    fontSize: 29,
    fontWeight: '900',
    marginTop: 5,
  },
  subtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 5,
  },
  brandMark: {
    width: 43,
    height: 43,
    borderRadius: 23,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  sectionTitle: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 11,
  },
  menuList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 13,
    paddingHorizontal: 14,
  },
  menuItem: {
    minHeight: 79,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF0F1',
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: '#FCECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconText: {
    color: RED,
    fontSize: 20,
    fontWeight: '800',
  },
  warningIcon: {
    backgroundColor: '#FFF2E0',
  },
  warningIconText: {
    color: '#A86A13',
  },
  menuCopy: {
    flex: 1,
  },
  menuTitle: {
    color: DARK,
    fontSize: 13,
    fontWeight: '800',
  },
  menuDescription: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  chevron: {
    color: '#9299A0',
    fontSize: 24,
  },
  pressed: {
    opacity: 0.65,
  },
  footer: {
    alignItems: 'center',
    marginTop: 34,
  },
  footerName: {
    color: DARK,
    fontSize: 13,
    fontWeight: '900',
  },
  footerText: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 5,
  },
});
