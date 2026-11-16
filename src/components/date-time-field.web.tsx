/**
 * Web version of DateTimeField. @react-native-community/datetimepicker does
 * not support web, so this uses the browser's native date and time inputs.
 *
 * Values go in and out as the strings stored in Firestore:
 * dates as YYYY-MM-DD, times as HH:MM (24-hour). '' means not set.
 */
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import type { DateTimeFieldProps } from './date-time-field';

export type { DateTimeFieldProps };

const RED = '#C8102E';
const DARK = '#24272B';

export default function DateTimeField({
  mode,
  value,
  onChange,
  minimumDate,
  clearable,
  style,
}: DateTimeFieldProps) {
  return (
    <View style={[style as StyleProp<ViewStyle>, styles.box]}>
      <input
        type={mode}
        value={value}
        min={mode === 'date' ? minimumDate : undefined}
        // A browser time input reports HH:MM; keep only that part if seconds appear.
        onChange={(event) =>
          onChange(
            mode === 'time'
              ? event.target.value.slice(0, 5)
              : event.target.value,
          )
        }
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: DARK,
          fontSize: 13,
          fontFamily: 'inherit',
        }}
      />

      {clearable && value ? (
        <Pressable onPress={() => onChange('')}>
          <Text style={styles.action}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  action: {
    color: RED,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
});
