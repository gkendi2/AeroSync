import { Alert, Platform } from 'react-native';

/**
 * Yes/no confirmation that works on phones (Alert) and on web (window.confirm,
 * because Alert buttons do nothing in the browser). Resolves true on confirm.
 */
export function confirmAction({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
