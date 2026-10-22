import { auth, db } from '@/lib/firebase';
import {
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import BaggageQrCard from '@/components/baggage-qr-card';
import { buildQrPayload } from '@/features/baggage/qr';
import { validateFlightNumber } from '@/features/baggage/validation';

export type RegisteredBaggage = {
  id: string;
  baggageId: string;
  flightId: string;
  baggageReference: string;
  status: 'Registered';
  qrId: string;
  qrPayload: string;
  registeredBy: string;
};

type RegisterBaggageScreenProps = {
  onBack: () => void;
};

export default function RegisterBaggageScreen({
  onBack,
}: RegisterBaggageScreenProps) {
  const [flightNumber, setFlightNumber] = useState('');
  const [bagCount, setBagCount] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState<RegisteredBaggage[]>([]);

  const registerBaggageBatch = async () => {
    if (registering) {
      return;
    }

    const flightCheck = validateFlightNumber(flightNumber);

    if (!flightCheck.ok) {
      Alert.alert('Invalid flight number', flightCheck.error);
      return;
    }

    const count = Number.parseInt(bagCount.trim(), 10);

    if (!Number.isInteger(count) || count < 1 || count > 100) {
      Alert.alert(
        'Invalid number of bags',
        'Enter a number between 1 and 100.',
      );
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Not signed in', 'Please sign in again.');
      return;
    }

    setRegistering(true);

    try {
      const batch = writeBatch(db);
      const createdRecords: RegisteredBaggage[] = [];

      for (let index = 1; index <= count; index += 1) {
        const newRecord = doc(collection(db, 'BaggageRecords'));

        const baggageReference = `${flightCheck.flight}-BAG-${String(
          index,
        ).padStart(3, '0')}`;

        const fields = {
          baggageId: `BAG-${newRecord.id}`,
          flightId: flightCheck.flight,
          baggageReference,
          status: 'Registered' as const,
          qrId: newRecord.id,
          qrPayload: buildQrPayload(newRecord.id),
          registeredBy: auth.currentUser.uid,
        };

        batch.set(newRecord, {
          ...fields,
          createdAt: serverTimestamp(),
        });

        createdRecords.push({
          id: newRecord.id,
          ...fields,
        });
      }

      await batch.commit();

      setRegistered(createdRecords);
      setFlightNumber('');
      setBagCount('');
    } catch (error) {
      console.error('Error registering baggage batch:', error);

      Alert.alert(
        'Registration failed',
        'The baggage operation could not be created. Please try again.',
      );
    } finally {
      setRegistering(false);
    }
  };

  const registerAnotherBatch = () => {
    setRegistered([]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          disabled={registering}
        >
          <Text style={styles.backButtonText}>‹ Back to baggage</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create Baggage Operation</Text>

        <Text style={styles.subtitle}>
          Select a flight and enter the number of bags. AeroSync will create
          the individual baggage records and QR identifiers.
        </Text>

        {registered.length > 0 ? (
          <>
            <View style={[styles.card, styles.successCard]}>
              <Text style={styles.successTitle}>
                ✓ Baggage operation created
              </Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Flight</Text>
                <Text style={styles.detailValue}>
                  {registered[0].flightId}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Bags registered</Text>
                <Text style={styles.detailValue}>
                  {registered.length}
                </Text>
              </View>

              <View style={[styles.detailRow, styles.detailRowLast]}>
                <Text style={styles.detailLabel}>Initial status</Text>
                <Text style={styles.detailValue}>Registered</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Generated Baggage Records</Text>

              {registered.map((record) => (
                <View key={record.id} style={styles.recordRow}>
                  <View style={styles.recordMain}>
                    <Text style={styles.recordId}>
                      {record.baggageReference}
                    </Text>

                    <Text style={styles.recordSecondary}>
                      {record.baggageId}
                    </Text>

                    <Text style={styles.recordStatus}>
                      {record.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {registered.map((record) => (
              <BaggageQrCard
                key={`qr-${record.id}`}
                record={record}
                title={record.baggageReference}
              />
            ))}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={registerAnotherBatch}
            >
              <Text style={styles.primaryButtonText}>
                Create another operation
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.textButton} onPress={onBack}>
              <Text style={styles.textButtonText}>
                Done, back to baggage
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Flight Number</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. KQ100"
              placeholderTextColor="#8A94A6"
              value={flightNumber}
              onChangeText={setFlightNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!registering}
            />

            <Text style={styles.label}>Number of Bags</Text>

            <TextInput
              style={styles.input}
              placeholder="e.g. 25"
              placeholderTextColor="#8A94A6"
              value={bagCount}
              onChangeText={setBagCount}
              keyboardType="number-pad"
              autoCorrect={false}
              editable={!registering}
              returnKeyType="done"
              onSubmitEditing={registerBaggageBatch}
            />

            <Text style={styles.helperText}>
              AeroSync will generate a unique record and QR identifier for
              each bag.
            </Text>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                registering && styles.disabledButton,
              ]}
              onPress={registerBaggageBatch}
              disabled={registering}
            >
              <Text style={styles.primaryButtonText}>
                {registering
                  ? 'Creating operation…'
                  : 'Create Baggage Operation'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FA',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2878C8',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#687386',
    marginBottom: 20,
    lineHeight: 21,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3D4858',
    marginBottom: 7,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    marginBottom: 15,
    backgroundColor: '#FAFBFD',
  },
  helperText: {
    fontSize: 13,
    color: '#7A8494',
    lineHeight: 19,
    marginTop: -5,
    marginBottom: 15,
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#2878C8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.5,
  },
  successCard: {
    borderWidth: 1,
    borderColor: '#ABEFC6',
  },
  successTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#067647',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F5',
    gap: 12,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 14,
    color: '#687386',
  },
  detailValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#163B65',
    textAlign: 'right',
  },
  recordRow: {
    borderWidth: 1,
    borderColor: '#E2E7EF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  recordMain: {
    flex: 1,
  },
  recordId: {
    fontSize: 15,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 4,
  },
  recordSecondary: {
    fontSize: 13,
    color: '#687386',
    marginBottom: 5,
  },
  recordStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2878C8',
  },
  textButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  textButtonText: {
    color: '#2878C8',
    fontSize: 15,
    fontWeight: '700',
  },
});