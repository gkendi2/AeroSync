/**
 * App icons (MaterialCommunityIcons from @expo/vector-icons).
 * Screens use these names so the same thing always gets the same icon.
 */
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const ICONS = {
  // Tab bar
  dashboard: 'view-dashboard',
  flights: 'airplane-takeoff',
  baggage: 'bag-suitcase',
  crew: 'account-group',
  more: 'dots-horizontal',
  tasks: 'clipboard-list-outline',
  scanQr: 'qrcode-scan',
  incidents: 'alert',
  account: 'account-circle',

  // Common controls
  back: 'chevron-left',
  forward: 'chevron-right',
  expand: 'chevron-down',
  collapse: 'chevron-up',
  close: 'close',
  search: 'magnify',
  add: 'plus',
  filter: 'filter-variant',
  check: 'check',
  unchecked: 'circle-outline',
  radioOn: 'radiobox-marked',
  radioOff: 'radiobox-blank',

  // Features
  airplane: 'airplane',
  delayRisk: 'clock-alert-outline',
  approvals: 'clipboard-check',
  email: 'email-outline',
  role: 'badge-account-outline',
  access: 'shield-check-outline',
  info: 'information-outline',
  help: 'help-circle-outline',
  signOut: 'logout',
  model: 'chart-tree',

  // Handler screens
  checkIn: 'login',
  checkOut: 'logout-variant',
  clock: 'clock-outline',
  checkCircle: 'check-circle',
  location: 'map-marker-outline',
  image: 'image-outline',
  camera: 'camera-outline',
  warning: 'alert-outline',

  // Messages and notifications
  messages: 'message-text-outline',
  send: 'send',
  bell: 'bell-outline',
  newTask: 'clipboard-plus-outline',
} satisfies Record<string, IconName>;

export type AppIconName = keyof typeof ICONS;

export default function Icon({
  name,
  size = 20,
  color,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
}) {
  return (
    <MaterialCommunityIcons
      name={ICONS[name]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
