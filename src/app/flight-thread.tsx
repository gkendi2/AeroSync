import { useLocalSearchParams, useRouter } from 'expo-router';
import { FirebaseError } from 'firebase/app';
import {
  collection,
  doc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import FlightStrip from '@/components/flight-strip';
import Icon from '@/components/icon';
import StatusBadge from '@/components/status-badge';
import { AeroSyncColors } from '@/constants/theme';
import { toDateString, toTimeString } from '@/features/datetime/format';
import { checkMessageText, MAX_MESSAGE_LENGTH } from '@/features/messages/membership';
import { getSenderProfile, sendFlightMessage } from '@/features/messages/service';
import { auth, db } from '@/lib/firebase';
import { goBackOrHome } from '@/lib/navigation';

type Message = {
  id: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: Date | null;
};

type ThreadFlight = {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
};

const MESSAGE_LIMIT = 200;

function formatMessageTime(date: Date | null) {
  if (!date) return 'Sending…';
  if (toDateString(date) === toDateString(new Date())) return toTimeString(date);

  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${toTimeString(date)}`;
}

export default function FlightThreadScreen() {
  const router = useRouter();
  const { flightId } = useLocalSearchParams<{ flightId?: string }>();
  const uid = auth.currentUser?.uid;

  const [flight, setFlight] = useState<ThreadFlight | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const insets = useSafeAreaInsets();

  // Newest message at the bottom: keep the list scrolled to the end when
  // messages arrive and when the keyboard resizes the list.
  function scrollToNewest() {
    scrollRef.current?.scrollToEnd({ animated: false });
  }

  useEffect(() => {
    if (!flightId) return;

    return onSnapshot(
      doc(db, 'Flights', flightId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError('This flight no longer exists.');
          return;
        }
        const data = snapshot.data();
        setFlight({
          id: snapshot.id,
          flightNumber: data.flightNumber ?? '',
          origin: data.origin ?? '',
          destination: data.destination ?? '',
          departureDate: data.departureDate ?? '',
          departureTime: data.departureTime ?? '',
        });
      },
      (err) => console.error('Could not load flight:', err),
    );
  }, [flightId]);

  useEffect(() => {
    if (!flightId) {
      setError('No flight selected.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    return onSnapshot(
      query(
        collection(db, 'FlightMessages', flightId, 'messages'),
        orderBy('createdAt', 'asc'),
        limitToLast(MESSAGE_LIMIT),
      ),
      (snapshot) => {
        setMessages(
          snapshot.docs.map((item) => {
            // 'estimate' shows a just-sent message with a time straight away.
            const data = item.data({ serverTimestamps: 'estimate' });
            return {
              id: item.id,
              senderUid: data.senderUid ?? '',
              senderName: data.senderName ?? 'Unknown',
              senderRole: data.senderRole ?? '',
              text: data.text ?? '',
              createdAt: data.createdAt?.toDate?.() ?? null,
            };
          }),
        );
        setLoading(false);
      },
      (err) => {
        console.error('Could not load messages:', err);
        setError(
          err instanceof FirebaseError && err.code === 'permission-denied'
            ? 'Messages for this flight are open to supervisors and to crew assigned to it.'
            : 'Could not load messages. Check your connection.',
        );
        setLoading(false);
      },
    );
  }, [flightId]);

  const check = checkMessageText(draft);
  const tooLong = draft.trim().length > MAX_MESSAGE_LENGTH;

  async function send() {
    if (!flight || sending) return;

    const result = checkMessageText(draft);
    if (!result.ok) return;

    setSending(true);

    try {
      const sender = await getSenderProfile();
      await sendFlightMessage(flight, result.text, sender);
      setDraft('');
    } catch (err) {
      console.error('Could not send message:', err);
      Alert.alert(
        'Message not sent',
        err instanceof FirebaseError && err.code === 'permission-denied'
          ? 'You are not allowed to post on this flight.'
          : 'Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Lifts the composer above the on-screen keyboard (iOS and Android;
          browsers handle this themselves). */}
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => goBackOrHome(router)}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <Icon name="back" size={30} color={AeroSyncColors.text} />
          </Pressable>

          <View style={styles.headerStrip}>
            <FlightStrip
              flightNumber={flight?.flightNumber ?? 'Flight messages'}
              route={
                flight && (flight.origin || flight.destination)
                  ? `${flight.origin} → ${flight.destination}`
                  : undefined
              }
              departure={
                flight?.departureTime
                  ? `${flight.departureDate} · Dep ${flight.departureTime}`
                  : undefined
              }
            />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToNewest}
          onLayout={scrollToNewest}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <ActivityIndicator color={AeroSyncColors.primaryDark} style={styles.loading} />
          ) : error ? (
            <View style={styles.notice}>
              <Icon name="info" size={22} color={AeroSyncColors.textSecondary} />
              <Text style={styles.noticeText}>{error}</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.notice}>
              <Icon name="info" size={22} color={AeroSyncColors.textSecondary} />
              <Text style={styles.noticeText}>
                No messages yet. Messages here are seen by supervisors and the
                crew assigned to this flight.
              </Text>
            </View>
          ) : (
            messages.map((message) => {
              const mine = message.senderUid === uid;

              return (
                <View
                  key={message.id}
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
                >
                  <View style={styles.bubbleHeader}>
                    <Text style={styles.sender} numberOfLines={1}>
                      {mine ? 'You' : message.senderName}
                    </Text>
                    <StatusBadge
                      label={message.senderRole === 'supervisor' ? 'Supervisor' : 'Handler'}
                      tone={message.senderRole === 'supervisor' ? 'info' : 'neutral'}
                    />
                    <Text style={styles.time}>{formatMessageTime(message.createdAt)}</Text>
                  </View>
                  <Text style={styles.text}>{message.text}</Text>
                </View>
              );
            })
          )}
        </ScrollView>

        {!error && (
          <View
            style={[
              styles.composer,
              // Clear the home indicator / gesture bar.
              { paddingBottom: Math.max(insets.bottom, 8) },
            ]}
          >
            <View style={styles.composerRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Message the flight crew"
                placeholderTextColor={AeroSyncColors.textMuted}
                multiline
                editable={!sending && !!flight}
              />

              <Pressable
                onPress={send}
                disabled={!check.ok || sending || !flight}
                style={[styles.sendButton, (!check.ok || sending || !flight) && styles.disabled]}
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator color={AeroSyncColors.white} />
                ) : (
                  <Icon name="send" size={20} color={AeroSyncColors.white} />
                )}
              </Pressable>
            </View>

            <Text style={[styles.counter, tooLong && styles.counterOver]}>
              {draft.trim().length}/{MAX_MESSAGE_LENGTH}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AeroSyncColors.background,
  },
  page: {
    flex: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: AeroSyncColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AeroSyncColors.border,
  },
  backButton: {
    width: 34,
    height: 42,
    justifyContent: 'center',
  },
  headerStrip: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    gap: 10,
    flexGrow: 1,
  },
  loading: {
    marginTop: 40,
  },
  notice: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
  },
  noticeText: {
    color: AeroSyncColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 14,
    padding: 11,
    gap: 6,
    borderWidth: 1,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: AeroSyncColors.primaryLight,
    borderColor: AeroSyncColors.primaryLight,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: AeroSyncColors.white,
    borderColor: AeroSyncColors.border,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sender: {
    color: AeroSyncColors.text,
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  time: {
    color: AeroSyncColors.textSecondary,
    fontSize: 11,
  },
  text: {
    color: AeroSyncColors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    backgroundColor: AeroSyncColors.white,
    borderTopWidth: 1,
    borderTopColor: AeroSyncColors.border,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: AeroSyncColors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: AeroSyncColors.text,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AeroSyncColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  counter: {
    color: AeroSyncColors.textSecondary,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  counterOver: {
    color: AeroSyncColors.danger,
    fontWeight: '800',
  },
});
