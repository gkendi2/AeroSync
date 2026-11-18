import { useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import Icon from '@/components/icon';
import { AeroSyncColors } from '@/constants/theme';
import {
  fallbackCode,
  findAirport,
  formatAirport,
  normalizeAirportCode,
  searchAirports,
  type Airport,
} from '@/features/flights/airports';

/**
 * Full-screen modal body that stays clear of the status bar, notch and
 * gesture bar. A Modal is a separate native window, so it gets its own
 * SafeAreaProvider; the insets are then applied explicitly.
 */
function ModalFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.modal,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Searchable airport field. The value is the stored 3-letter code; a code
 * that is not in the airport list still shows (and can be chosen by typing it).
 */
export default function AirportPicker({
  title,
  value,
  onChange,
  excludeCode,
  excludeLabel,
  style,
}: {
  title: string;
  /** Stored code, e.g. "NBO"; empty when none is chosen. */
  value: string;
  onChange: (code: string) => void;
  /** The airport chosen in the other field: shown, but not selectable. */
  excludeCode?: string;
  excludeLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Lets the last airports scroll clear of the gesture bar / home indicator.
  const bottomInset = useSafeAreaInsets().bottom;

  const selected = value ? findAirport(value) : null;
  const excluded = excludeCode ? normalizeAirportCode(excludeCode) : '';

  const results = useMemo(() => searchAirports(search), [search]);
  const fallback = fallbackCode(search, results);

  function close() {
    setOpen(false);
    setSearch('');
  }

  function choose(code: string) {
    if (code === excluded) return;
    onChange(code);
    close();
  }

  function renderAirport({ item }: { item: Airport }) {
    const disabled = item.code === excluded;
    const current = item.code === normalizeAirportCode(value);

    return (
      <Pressable
        onPress={() => choose(item.code)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.option,
          current && styles.optionCurrent,
          disabled && styles.optionDisabled,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled, selected: current }}
      >
        <Text style={styles.optionCode}>{item.code}</Text>
        <View style={styles.optionCopy}>
          <Text style={styles.optionTitle} numberOfLines={1}>
            {item.city} · {item.name}
          </Text>
          <Text style={styles.optionMeta} numberOfLines={1}>
            {disabled ? excludeLabel ?? 'Already chosen' : item.country}
          </Text>
        </View>
        {current && <Icon name="check" size={20} color={AeroSyncColors.primaryDark} />}
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, style]}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${value || 'not chosen'}`}
      >
        <Text
          style={[styles.fieldText, !value && styles.placeholder]}
          numberOfLines={2}
        >
          {selected
            ? formatAirport(selected)
            : value
              ? `${normalizeAirportCode(value)} · not in airport list`
              : 'Search airport or code'}
        </Text>
        <Icon name="expand" size={20} color={AeroSyncColors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={close}
        // Android: draw under the system bars so the insets below are exact.
        statusBarTranslucent
        navigationBarTranslucent
      >
        <SafeAreaProvider>
          <ModalFrame>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={close} hitSlop={8} accessibilityLabel="Close">
                <Icon name="close" size={26} color={AeroSyncColors.text} />
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Icon name="search" size={20} color={AeroSyncColors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Code, city or airport name"
                placeholderTextColor={AeroSyncColors.textMuted}
                autoFocus
                autoCorrect={false}
              />
            </View>

            <KeyboardAvoidingView
              style={styles.listArea}
              behavior={Platform.OS === 'web' ? undefined : 'padding'}
            >
              <FlatList
                data={results}
                keyExtractor={(item) => item.code}
                renderItem={renderAirport}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={[styles.list, { paddingBottom: 30 + bottomInset }]}
                ListEmptyComponent={
                  fallback ? (
                    <Pressable
                      onPress={() => choose(fallback)}
                      disabled={fallback === excluded}
                      style={({ pressed }) => [
                        styles.option,
                        fallback === excluded && styles.optionDisabled,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.optionCode}>{fallback}</Text>
                      <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>Use code {fallback}</Text>
                        <Text style={styles.optionMeta}>
                          {fallback === excluded
                            ? excludeLabel ?? 'Already chosen'
                            : 'Not in airport list'}
                        </Text>
                      </View>
                    </Pressable>
                  ) : (
                    <Text style={styles.empty}>
                      No airport matches. Type a 3-letter code to use one not in the list.
                    </Text>
                  )
                }
              />
            </KeyboardAvoidingView>
          </ModalFrame>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldText: {
    flex: 1,
    color: AeroSyncColors.text,
    fontSize: 13,
  },
  placeholder: {
    color: AeroSyncColors.textMuted,
  },
  modal: {
    flex: 1,
    backgroundColor: AeroSyncColors.background,
  },
  listArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AeroSyncColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AeroSyncColors.border,
  },
  modalTitle: {
    color: AeroSyncColors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    paddingHorizontal: 12,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    backgroundColor: AeroSyncColors.white,
  },
  searchInput: {
    flex: 1,
    color: AeroSyncColors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  list: {
    paddingHorizontal: 14,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: AeroSyncColors.border,
    backgroundColor: AeroSyncColors.white,
  },
  optionCurrent: {
    backgroundColor: AeroSyncColors.primaryLight,
  },
  optionDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.65,
  },
  optionCode: {
    width: 44,
    color: AeroSyncColors.primaryDark,
    fontSize: 15,
    fontWeight: '900',
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionTitle: {
    color: AeroSyncColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  optionMeta: {
    color: AeroSyncColors.textSecondary,
    fontSize: 12,
  },
  empty: {
    color: AeroSyncColors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    padding: 24,
  },
});
