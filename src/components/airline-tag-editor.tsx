import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AIRLINE_TAG_MAX_DIGITS,
  airlineTagLabel,
  validateAirlineTagNumber,
} from '@/features/baggage/airline-tag';

const RED = '#C8102E';
const DARK = '#24272B';
const MUTED = '#747B83';
const BORDER = '#E8E9EB';

/**
 * Supervisor bag details: shows the airline bag tag number and lets the
 * supervisor add, change or clear it (BaggageRecords.airlineTagNumber only).
 */
export default function AirlineTagEditor({
  bagId,
  airlineTagNumber,
}: {
  bagId: string;
  airlineTagNumber?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setValue(airlineTagNumber ?? '');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const check = validateAirlineTagNumber(value);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'BaggageRecords', bagId), {
        airlineTagNumber: check.tag,
      });
      setEditing(false);
    } catch (saveError) {
      console.error('Error saving airline tag number:', saveError);
      setError('Could not save the tag number. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <View style={styles.card}>
        <Text style={styles.label}>{airlineTagLabel(airlineTagNumber)}</Text>
        <Pressable onPress={startEditing} accessibilityRole="button">
          <Text style={styles.link}>
            {airlineTagNumber ? 'Edit' : 'Add'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.editCard}>
      <Text style={styles.fieldLabel}>
        AIRLINE BAG TAG NUMBER (OPTIONAL)
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setError('');
        }}
        placeholder="e.g. 0706123456"
        placeholderTextColor="#9AA0A6"
        keyboardType="number-pad"
        maxLength={AIRLINE_TAG_MAX_DIGITS}
        autoCorrect={false}
        editable={!saving}
      />
      <Text style={error ? styles.error : styles.hint}>
        {error ||
          "The 10-digit number on the airline's bag tag, if available. Leave empty to unlink."}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => setEditing(false)}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={saving}
          style={styles.saveButton}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  label: {
    flex: 1,
    color: DARK,
    fontSize: 13,
    fontWeight: '700',
  },
  link: {
    color: RED,
    fontSize: 13,
    fontWeight: '800',
    paddingLeft: 12,
  },
  editCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  fieldLabel: {
    color: DARK,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: DARK,
    fontSize: 14,
  },
  hint: {
    color: MUTED,
    fontSize: 11,
    marginTop: 6,
  },
  error: {
    color: RED,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 18,
    marginTop: 12,
  },
  cancel: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: RED,
    borderRadius: 10,
    paddingHorizontal: 18,
    height: 38,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
