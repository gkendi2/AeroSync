
import { db } from '@/lib/firebase';
import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import BaggageQrCard from '@/components/baggage-qr-card';
import RegisterBaggageScreen from '@/components/register-baggage-screen';
import { SafeAreaView } from 'react-native-safe-area-context';

type BaggageRecord = {
  id: string;
  baggageId?: string;
  flightId?: string;
  baggageReference?: string;
  status?: string;
  qrId?: string;
  qrPayload?: string;
  registeredBy?: string;
  createdAt?: unknown;
};

type BaggageScreenProps = {
  onBack?: () => void;
};

type BaggageFilter = 'All' | 'Registered' | 'Loading' | 'Offloaded';

const RED = '#C8102E';
const DARK = '#24272B';
const MUTED = '#747B83';
const BORDER = '#E9EAEC';
const BACKGROUND = '#FFFFFF';
const WHITE = '#FFFFFF';

function getStatusAppearance(status?: string) {
  const normalized = (status || 'Registered').toLowerCase();

  if (normalized === 'offloaded') {
    return {
      label: 'Offloaded',
      background: '#E7F4E9',
      color: '#27814B',
    };
  }

  if (normalized === 'loading') {
    return {
      label: 'Loading',
      background: '#E8F0FB',
      color: '#2868A8',
    };
  }

  return {
    label: status || 'Registered',
    background: '#FCECEF',
    color: RED,
  };
}

export default function BaggageScreen({ onBack }: BaggageScreenProps) {
  const router = useRouter();

  const [records, setRecords] = useState<BaggageRecord[]>([]);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  // Document ID of the bag whose QR code is open, or '' for the list.
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] =
    useState<BaggageFilter>('All');

  useEffect(() => {
    const baggageQuery = query(
      collection(db, 'BaggageRecords'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      baggageQuery,
      (snapshot) => {
        const baggageRecords: BaggageRecord[] = snapshot.docs.map(
          (record) => ({
            id: record.id,
            ...(record.data() as Omit<BaggageRecord, 'id'>),
          })
        );

        setRecords(baggageRecords);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading baggage records:', error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const counts = useMemo(() => {
    const registered = records.filter(
      (record) =>
        (record.status || 'Registered').toLowerCase() === 'registered'
    ).length;

    const loadingCount = records.filter(
      (record) => (record.status || '').toLowerCase() === 'loading'
    ).length;

    const offloaded = records.filter(
      (record) => (record.status || '').toLowerCase() === 'offloaded'
    ).length;

    return {
      All: records.length,
      Registered: registered,
      Loading: loadingCount,
      Offloaded: offloaded,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      const status = (record.status || 'Registered').toLowerCase();

      const matchesFilter =
        activeFilter === 'All' ||
        status === activeFilter.toLowerCase();

      const matchesSearch =
        !term ||
        (record.baggageId || '').toLowerCase().includes(term) ||
        record.id.toLowerCase().includes(term) ||
        (record.flightId || '').toLowerCase().includes(term) ||
        (record.baggageReference || '').toLowerCase().includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [records, activeFilter, search]);

  if (showRegisterForm) {
    return (
      <RegisterBaggageScreen
        onBack={() => setShowRegisterForm(false)}
      />
    );
  }

  // Looked up from the live listener, so the status updates while open.
  const selectedRecord = records.find(
    (record) => record.id === selectedRecordId
  );

  if (selectedRecord) {
    const status = getStatusAppearance(selectedRecord.status);

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setSelectedRecordId('')}
              style={styles.backButton}
              accessibilityLabel="Back to baggage"
            >
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>

            <Text style={styles.heading}>Baggage QR</Text>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.qrDetailMeta}>
              <Text style={styles.flightReference} numberOfLines={1}>
                {selectedRecord.flightId || 'Flight not assigned'}
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: status.background },
                ]}
              >
                <Text style={[styles.statusText, { color: status.color }]}>
                  {status.label}
                </Text>
              </View>
            </View>

            <BaggageQrCard
              record={selectedRecord}
              title={
                selectedRecord.baggageReference ||
                selectedRecord.baggageId ||
                selectedRecord.id
              }
            />

            <Pressable onPress={() => setSelectedRecordId('')}>
              <Text style={styles.qrDetailBack}>‹ Back to baggage</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  const filters: BaggageFilter[] = [
    'All',
    'Registered',
    'Loading',
    'Offloaded',
  ];

  function handleBack() {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <Text style={styles.heading}>Baggage</Text>

          <Pressable
            onPress={() => router.push('/scan-qr' as any)}
            style={styles.qrButton}
            accessibilityLabel="Open QR scanner"
          >
            <Text style={styles.qrIcon}>▦</Text>
          </Pressable>
        </View>

        {/* SEARCH */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by bag tag, flight or reference..."
            placeholderTextColor="#9299A0"
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Text style={styles.clearSearch}>×</Text>
            </Pressable>
          )}
        </View>

        {/* STATUS FILTERS */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
        >
          {filters.map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[
                styles.filterChip,
                activeFilter === filter && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter && styles.filterTextActive,
                ]}
              >
                {filter} ({counts[filter]})
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* BAGGAGE REGISTER */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={RED} />
              <Text style={styles.emptyDescription}>
                Loading baggage records...
              </Text>
            </View>
          ) : filteredRecords.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>▣</Text>
              </View>

              <Text style={styles.emptyTitle}>
                {search ? 'No matching baggage' : 'No baggage records'}
              </Text>

              <Text style={styles.emptyDescription}>
                {search
                  ? 'Try searching with another bag tag or flight reference.'
                  : 'Baggage registrations will appear here once recorded.'}
              </Text>

              {!search && (
                <Pressable
                  onPress={() => setShowRegisterForm(true)}
                  style={styles.emptyButton}
                >
                  <Text style={styles.emptyButtonText}>
                    Register baggage
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.recordList}>
              {filteredRecords.map((record, index) => {
                const status = getStatusAppearance(record.status);

                return (
                  <Pressable
                    key={record.id}
                    onPress={() => setSelectedRecordId(record.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Show QR code for ${
                      record.baggageId || record.id
                    }`}
                    style={({ pressed }) => [
                      styles.recordRow,
                      index === filteredRecords.length - 1 &&
                        styles.lastRecordRow,
                      pressed && styles.recordRowPressed,
                    ]}
                  >
                    <View style={styles.bagIcon}>
                      <Text style={styles.bagIconText}>▣</Text>
                    </View>

                    <View style={styles.recordInfo}>
                      <Text
                        style={styles.baggageId}
                        numberOfLines={1}
                      >
                        {record.baggageId || record.id}
                      </Text>

                      <Text
                        style={styles.flightReference}
                        numberOfLines={1}
                      >
                        {record.flightId || 'Flight not assigned'}
                        {record.baggageReference
                          ? ` · ${record.baggageReference}`
                          : ''}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: status.background },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: status.color },
                        ]}
                      >
                        {status.label}
                      </Text>
                    </View>

                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>

        {/* REGISTER ACTION */}
        <Pressable
          onPress={() => setShowRegisterForm(true)}
          style={styles.registerButton}
        >
          <Text style={styles.registerButtonText}>＋ Register baggage</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },

  /* QR DETAIL */
  recordRowPressed: {
    opacity: 0.6,
  },
  qrDetailMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  qrDetailBack: {
    color: RED,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 10,
  },
  screen: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 19,
  },

  /* HEADER */
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  backButton: {
    width: 27,
    height: 42,
    justifyContent: 'center',
  },
  backIcon: {
    color: DARK,
    fontSize: 37,
    lineHeight: 40,
    fontWeight: '300',
  },
  heading: {
    flex: 1,
    color: DARK,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  qrButton: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrIcon: {
    color: DARK,
    fontSize: 29,
    fontWeight: '700',
  },

  /* SEARCH */
  searchBar: {
    height: 46,
    backgroundColor: '#EFF0F2',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginTop: 7,
    marginBottom: 20,
  },
  searchIcon: {
    color: DARK,
    fontSize: 26,
    marginRight: 9,
  },
  searchInput: {
    flex: 1,
    color: DARK,
    fontSize: 12,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,
  clearSearch: {
    color: MUTED,
    fontSize: 23,
    paddingHorizontal: 4,
  },

  /* FILTERS */
  filterScroll: {
    flexGrow: 0,
    marginBottom: 14,
    maxHeight: 45,
  },
  filterContent: {
    alignItems: 'center',
    gap: 9,
    paddingRight: 5,
  },
  filterChip: {
    height: 37,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
  },
  filterChipActive: {
    borderColor: RED,
    backgroundColor: '#FCECEF',
  },
  filterText: {
    color: DARK,
    fontSize: 11,
    fontWeight: '700',
  },
  filterTextActive: {
    color: RED,
    fontWeight: '900',
  },

  /* LIST */
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 1,
    paddingBottom: 20,
  },
  recordList: {
    backgroundColor: WHITE,
  },
  recordRow: {
    minHeight: 83,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F2',
    paddingVertical: 11,
  },
  lastRecordRow: {
    borderBottomWidth: 0,
  },
  bagIcon: {
    width: 43,
    height: 43,
    borderRadius: 23,
    backgroundColor: '#F1F2F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bagIconText: {
    color: DARK,
    fontSize: 23,
    fontWeight: '700',
  },
  recordInfo: {
    flex: 1,
    minWidth: 0,
  },
  baggageId: {
    color: DARK,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  flightReference: {
    color: MUTED,
    fontSize: 11,
    marginTop: 5,
  },
  statusBadge: {
    minWidth: 82,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  chevron: {
    color: '#555D65',
    fontSize: 24,
    fontWeight: '400',
    marginLeft: 1,
  },

  /* EMPTY AND LOADING STATES */
  loadingState: {
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyState: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FCECEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  emptyIconText: {
    color: RED,
    fontSize: 25,
  },
  emptyTitle: {
    color: DARK,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyDescription: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 7,
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: '#FCECEF',
    borderRadius: 20,
    paddingHorizontal: 17,
    paddingVertical: 10,
  },
  emptyButtonText: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
  },
  bottomSpace: {
    height: 20,
  },

  /* REGISTER ACTION */
  registerButton: {
  height: 45,
  backgroundColor: RED,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 10,
  marginBottom: 105,
},
  registerButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '900',
  },
});
