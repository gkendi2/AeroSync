import {
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { auth, db } from '@/lib/firebase';

type IncidentType =
  | 'Baggage'
  | 'Aircraft'
  | 'Equipment'
  | 'Safety'
  | 'Other';

type Severity = 'Low' | 'Medium' | 'High';

type Incident = {
  id: string;
  incidentType: IncidentType;
  flightNumber: string;
  location: string;
  severity: Severity;
  description: string;
  reportedBy: string;
  reportedAt?: {
    toDate?: () => Date;
  } | null;
  status: string;
};

const INCIDENT_TYPES: IncidentType[] = [
  'Baggage',
  'Aircraft',
  'Equipment',
  'Safety',
  'Other',
];

const SEVERITIES: Severity[] = ['Low', 'Medium', 'High'];

function formatReportedAt(
  reportedAt?: { toDate?: () => Date } | null,
) {
  if (!reportedAt?.toDate) {
    return 'Time unavailable';
  }

  try {
    return reportedAt.toDate().toLocaleString();
  } catch {
    return 'Time unavailable';
  }
}

export default function IncidentsScreen() {
  const [incidentType, setIncidentType] =
    useState<IncidentType>('Baggage');
  const [flightNumber, setFlightNumber] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<Severity>('Low');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  useEffect(() => {
    const incidentsQuery = query(
      collection(db, 'Incidents'),
      orderBy('reportedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      incidentsQuery,
      snapshot => {
        const loadedIncidents: Incident[] = snapshot.docs.map(
          incidentDoc => {
            const data = incidentDoc.data();

            return {
              id: incidentDoc.id,
              incidentType: data.incidentType,
              flightNumber: data.flightNumber,
              location: data.location,
              severity: data.severity,
              description: data.description,
              reportedBy: data.reportedBy,
              reportedAt: data.reportedAt,
              status: data.status,
            };
          },
        );

        setIncidents(loadedIncidents);
        setLoadingIncidents(false);
      },
      error => {
        console.error('INCIDENT LIST ERROR:', error);
        setLoadingIncidents(false);
      },
    );

    return unsubscribe;
  }, []);

  async function submitIncident() {
    if (
      !incidentType ||
      !flightNumber.trim() ||
      !location.trim() ||
      !severity ||
      !description.trim()
    ) {
      Alert.alert(
        'Missing information',
        'Please complete all incident fields before submitting.',
      );
      return;
    }

    if (!auth.currentUser) {
      Alert.alert(
        'Not signed in',
        'Please sign in before reporting an incident.',
      );
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, 'Incidents'), {
        incidentType,
        flightNumber: flightNumber.trim().toUpperCase(),
        location: location.trim(),
        severity,
        description: description.trim(),
        reportedBy: auth.currentUser.uid,
        reportedAt: serverTimestamp(),
        status: 'Open',
      });

      Alert.alert(
        'Incident reported',
        'The incident has been successfully recorded.',
      );

      setIncidentType('Baggage');
      setFlightNumber('');
      setLocation('');
      setSeverity('Low');
      setDescription('');
    } catch (error) {
      console.error('INCIDENT ERROR:', error);

      Alert.alert(
        'Could not report incident',
        'Firebase rejected the incident submission. Check the terminal for the error.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Incident Reporting</Text>
      <Text style={styles.subtitle}>
        Report a ground-handling incident and track recent reports.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Report an Incident</Text>

        <Text style={styles.label}>Incident Type</Text>

        <View style={styles.optionRow}>
          {INCIDENT_TYPES.map(type => (
            <Pressable
              key={type}
              style={[
                styles.option,
                incidentType === type && styles.optionSelected,
              ]}
              onPress={() => setIncidentType(type)}
            >
              <Text
                style={[
                  styles.optionText,
                  incidentType === type && styles.optionTextSelected,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Flight Number</Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. KQ100"
          placeholderTextColor="#8A94A6"
          value={flightNumber}
          onChangeText={setFlightNumber}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Location</Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. Gate 12"
          placeholderTextColor="#8A94A6"
          value={location}
          onChangeText={setLocation}
        />

        <Text style={styles.label}>Severity</Text>

        <View style={styles.optionRow}>
          {SEVERITIES.map(level => (
            <Pressable
              key={level}
              style={[
                styles.option,
                severity === level && styles.optionSelected,
              ]}
              onPress={() => setSeverity(level)}
            >
              <Text
                style={[
                  styles.optionText,
                  severity === level && styles.optionTextSelected,
                ]}
              >
                {level}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Description</Text>

        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="Describe what happened..."
          placeholderTextColor="#8A94A6"
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          style={[
            styles.submitButton,
            saving && styles.submitButtonDisabled,
          ]}
          onPress={submitIncident}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              Submit Incident
            </Text>
          )}
        </Pressable>
      </View>

      <View style={styles.recentHeader}>
        <View>
          <Text style={styles.sectionTitle}>Recent Incidents</Text>
          <Text style={styles.recentSubtitle}>
            Live reports from AeroSync
          </Text>
        </View>

        <View style={styles.countBadge}>
          <Text style={styles.countText}>{incidents.length}</Text>
        </View>
      </View>

      {loadingIncidents ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#2878C8" />
          <Text style={styles.loadingText}>
            Loading incidents...
          </Text>
        </View>
      ) : incidents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No incidents yet</Text>
          <Text style={styles.emptyText}>
            Reported incidents will appear here.
          </Text>
        </View>
      ) : (
        incidents.map(incident => (
          <View key={incident.id} style={styles.incidentCard}>
            <View style={styles.incidentHeader}>
              <View style={styles.incidentTitleArea}>
                <Text style={styles.incidentType}>
                  {incident.incidentType}
                </Text>

                <Text style={styles.incidentFlight}>
                  {incident.flightNumber}
                </Text>
              </View>

              <View
                style={[
                  styles.severityBadge,
                  incident.severity === 'High' &&
                    styles.highSeverity,
                  incident.severity === 'Medium' &&
                    styles.mediumSeverity,
                  incident.severity === 'Low' &&
                    styles.lowSeverity,
                ]}
              >
                <Text style={styles.severityBadgeText}>
                  {incident.severity}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>
                {incident.location}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.statusValue}>
                {incident.status}
              </Text>
            </View>

            <Text style={styles.description}>
              {incident.description}
            </Text>

            <Text style={styles.reportedAt}>
              Reported {formatReportedAt(incident.reportedAt)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#687386',
    lineHeight: 21,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#344054',
    marginBottom: 8,
    marginTop: 12,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: '#D5DBE5',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  optionSelected: {
    backgroundColor: '#2878C8',
    borderColor: '#2878C8',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#526071',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5DBE5',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1F2937',
  },
  descriptionInput: {
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: '#2878C8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  recentSubtitle: {
    color: '#7A8495',
    fontSize: 13,
    marginTop: -10,
    marginBottom: 4,
  },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F0FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: '#2878C8',
    fontWeight: '800',
    fontSize: 14,
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#687386',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#7A8495',
  },
  incidentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 17,
    marginBottom: 12,
  },
  incidentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  incidentTitleArea: {
    flex: 1,
    paddingRight: 12,
  },
  incidentType: {
    fontSize: 17,
    fontWeight: '800',
    color: '#163B65',
    marginBottom: 3,
  },
  incidentFlight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2878C8',
  },
  severityBadge: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
    backgroundColor: '#E8EDF3',
  },
  highSeverity: {
    backgroundColor: '#FDE8E8',
  },
  mediumSeverity: {
    backgroundColor: '#FFF3D6',
  },
  lowSeverity: {
    backgroundColor: '#E7F5EC',
  },
  severityBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#344054',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEF1F5',
    marginVertical: 13,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#7A8495',
    fontWeight: '600',
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: '#344054',
    fontWeight: '700',
    marginLeft: 15,
  },
  statusValue: {
    fontSize: 13,
    color: '#2878C8',
    fontWeight: '800',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
    marginTop: 6,
  },
  reportedAt: {
    fontSize: 11,
    color: '#8A94A6',
    marginTop: 12,
  },
});