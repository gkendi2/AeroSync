/**
 * A date or time field that opens the platform picker (Android and iOS).
 * The web version lives in date-time-field.web.tsx.
 *
 * Values go in and out as the strings stored in Firestore:
 * dates as YYYY-MM-DD, times as HH:MM (24-hour). '' means not set.
 */
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import {
  parseDateString,
  parseTimeString,
  toDateString,
  toTimeString,
} from '@/features/datetime/format';

export type DateTimeFieldProps = {
  mode: 'date' | 'time';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Earliest selectable date (YYYY-MM-DD). Date mode only. */
  minimumDate?: string;
  /** Shows a Clear button when a value is set. For optional fields. */
  clearable?: boolean;
  /** Box style, e.g. the screen's existing text-input style. */
  style?: StyleProp<TextStyle>;
};

const RED = '#C8102E';
const DARK = '#24272B';
const PLACEHOLDER = '#9299A0';

export default function DateTimeField({
  mode,
  value,
  onChange,
  placeholder,
  minimumDate,
  clearable,
  style,
}: DateTimeFieldProps) {
  // iOS only: the date shown in the open picker, or null when it is closed.
  const [draft, setDraft] = useState<Date | null>(null);

  const format = mode === 'date' ? toDateString : toTimeString;

  const minimum =
    mode === 'date' && minimumDate
      ? (parseDateString(minimumDate) ?? undefined)
      : undefined;

  function pickerDate() {
    const parsed =
      mode === 'date' ? parseDateString(value) : parseTimeString(value);
    const date = parsed ?? new Date();

    return minimum && date.getTime() < minimum.getTime() ? minimum : date;
  }

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerDate(),
        mode,
        display: mode === 'date' ? 'calendar' : 'clock',
        is24Hour: true,
        minimumDate: minimum,
        onValueChange: (_event, date) => onChange(format(date)),
      });
      return;
    }

    setDraft(pickerDate());
  }

  return (
    <View>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        style={[style as StyleProp<ViewStyle>, styles.box]}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value || placeholder || (mode === 'date' ? 'Select date' : 'Select time')}
        </Text>

        {clearable && value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8}>
            <Text style={styles.action}>Clear</Text>
          </Pressable>
        ) : null}
      </Pressable>

      {draft && (
        <View style={styles.iosPanel}>
          <DateTimePicker
            value={draft}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            // iOS follows the device's 12/24-hour setting; this locale forces 24-hour.
            locale={mode === 'time' ? 'en_GB' : undefined}
            minimumDate={minimum}
            themeVariant="light"
            onValueChange={(_event, date) => setDraft(date)}
          />

          <View style={styles.iosActions}>
            <Pressable onPress={() => setDraft(null)} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                onChange(format(draft));
                setDraft(null);
              }}
              hitSlop={8}
            >
              <Text style={styles.action}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  value: {
    color: DARK,
    fontSize: 13,
  },

  placeholder: {
    color: PLACEHOLDER,
  },

  action: {
    color: RED,
    fontSize: 12,
    fontWeight: '700',
  },

  cancel: {
    color: PLACEHOLDER,
    fontSize: 12,
    fontWeight: '700',
  },

  iosPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
  },

  iosActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
});
