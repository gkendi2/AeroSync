
import { nextAction } from '@/features/baggage/handling';
import {
  HandlingError,
  recordHandlingEvent,
} from '@/features/baggage/handlingService';
import { auth, db } from '@/lib/firebase';
import {
  CameraView,
  scanFromURLAsync,
  useCameraPermissions,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type BaggageRecord = {
  id: string;
  baggageId?: string;
  flightId?: string;
  baggageReference?: string;
  qrId?: string;
  qrPayload?: string;
  status?: string;
};

type HandlingAction = 'Loading' | 'Offloading';

const RED = '#C8102E';
const DARK_RED = '#A20D25';
const CHARCOAL = '#252525';
const BG = '#F4F3F3';
const WHITE = '#FFFFFF';
const MUTED = '#777777';
const BORDER = '#E7E7E9';
const GREEN = '#16805C';
const PALE_RED = '#FCEBED';

const QR_PREFIX = 'AEROSYNC:BAGGAGE:';

export default function ScanQRScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [scanning, setScanning] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectingImage, setSelectingImage] = useState(false);

  const [message, setMessage] = useState('');
  const [baggage, setBaggage] = useState<BaggageRecord | null>(null);

  async function lookUpBaggageFromQR(data: string) {
    setLookingUp(true);
    setMessage('');
    setBaggage(null);

    try {
      if (!data.startsWith(QR_PREFIX)) {
        setMessage('This is not a valid AeroSync baggage QR code.');
        return;
      }

      const documentId = data.slice(QR_PREFIX.length).trim();

      if (!documentId) {
        setMessage('The QR code does not contain a baggage ID.');
        return;
      }

      if (!auth.currentUser) {
        setMessage('Please sign in before scanning baggage.');
        return;
      }

      const baggageRef = doc(db, 'BaggageRecords', documentId);
      const baggageSnapshot = await getDoc(baggageRef);

      if (!baggageSnapshot.exists()) {
        setMessage('No baggage record was found for this QR code.');
        return;
      }

      const recordData = baggageSnapshot.data();

      setBaggage({
        id: baggageSnapshot.id,
        baggageId: recordData.baggageId,
        flightId: recordData.flightId,
        baggageReference: recordData.baggageReference,
        qrId: recordData.qrId,
        qrPayload: recordData.qrPayload,
        status: recordData.status,
      });
    } catch (error) {
      console.error('QR scan lookup failed:', error);

      setMessage(
        'Could not look up this baggage record. Check your connection and Firebase permissions.'
      );
    } finally {
      setLookingUp(false);
    }
  }

  async function handleBarcodeScanned({
    data,
  }: {
    data: string;
    type: string;
  }) {
    if (!scanning || lookingUp || saving) {
      return;
    }

    setScanning(false);

    await lookUpBaggageFromQR(data);
  }

  async function chooseQRFromPhotos() {
    if (selectingImage || lookingUp || saving) {
      return;
    }

    if (!auth.currentUser) {
      Alert.alert(
        'Sign in required',
        'Please sign in before selecting a baggage QR code.'
      );
      return;
    }

    setSelectingImage(true);
    setMessage('');

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }

      const imageUri = result.assets[0].uri;

      const scannedResults = await scanFromURLAsync(imageUri, ['qr']);

      if (scannedResults.length === 0) {
        setMessage(
          'No QR code was found in that image. Please choose an image containing the AeroSync baggage QR code.'
        );
        return;
      }

      const qrData = scannedResults[0]?.data;

      if (!qrData) {
        setMessage(
          'The selected image does not contain readable QR data.'
        );
        return;
      }

      await lookUpBaggageFromQR(qrData);
    } catch (error) {
      console.error('QR image scan failed:', error);

      setMessage(
        'Could not read the QR image. Please choose a clear image containing the full QR code.'
      );
    } finally {
      setSelectingImage(false);
    }
  }

  async function recordHandling(action: HandlingAction) {
    if (!baggage || !auth.currentUser) {
      Alert.alert(
        'Unable to record event',
        'Sign in and scan a valid baggage QR code first.'
      );
      return;
    }

    setSaving(true);

    try {
      console.log('Recording baggage handling action...', {
        action,
        baggageDocumentId: baggage.id,
        baggageId: baggage.baggageId || baggage.id,
        flightId: baggage.flightId || '',
        handlerUid: auth.currentUser.uid,
      });

      const newStatus = await recordHandlingEvent(
        baggage.id,
        action,
        auth.currentUser.uid
      );

      console.log('Baggage handling transaction succeeded.', {
        action,
        newStatus,
        baggageDocumentId: baggage.id,
      });

      setBaggage((previous) =>
        previous
          ? {
              ...previous,
              status: newStatus,
            }
          : null
      );

      Alert.alert(
        'Handling event recorded',
        `${action} was saved for ${baggage.baggageId || baggage.id}.`
      );
    } catch (error) {
      console.error('Could not save handling event:', error);

      if (error instanceof HandlingError) {
        Alert.alert('Could not save event', error.message);
      } else {
        Alert.alert(
          'Could not save event',
          'The handling action could not be saved. Please try again.'
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function scanAgain() {
    setBaggage(null);
    setMessage('');
    setScanning(true);
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RED} />

          <Text style={styles.messageText}>
            Checking camera permission…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.eyebrow}>AEROSYNC SCANNER</Text>

          <Text style={styles.heading}>
            Camera permission required
          </Text>

          <Text style={styles.messageText}>
            Allow camera access to scan baggage QR codes.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={requestPermission}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              Allow camera access
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Page heading */}
        <View style={styles.headingSection}>
          <Text style={styles.eyebrow}>HANDLER OPERATIONS</Text>

          <Text style={styles.heading}>Scan baggage QR</Text>

          <Text style={styles.subtitle}>
            Scan a registered baggage QR code using your camera or select a QR
            image from your phone.
          </Text>
        </View>

        {!baggage && (
          <>
            {/* Live camera scanner */}
            <View style={styles.cameraCard}>
              <View style={styles.cameraHeader}>
                <View>
                  <Text style={styles.cardEyebrow}>LIVE SCANNER</Text>
                  <Text style={styles.cardTitle}>Scan baggage</Text>
                </View>

                <View style={styles.cameraStatus}>
                  <View style={styles.cameraStatusDot} />
                  <Text style={styles.cameraStatusText}>READY</Text>
                </View>
              </View>

              <View style={styles.cameraFrame}>
                {scanning ? (
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                ) : (
                  <View style={styles.cameraPlaceholder}>
                    {lookingUp ? (
                      <>
                        <ActivityIndicator
                          size="large"
                          color={RED}
                        />

                        <Text style={styles.cameraMessage}>
                          Looking up baggage…
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.placeholderIcon}>▦</Text>

                        <Text style={styles.cameraMessage}>
                          Scanner paused
                        </Text>
                      </>
                    )}
                  </View>
                )}
              </View>

              <Text style={styles.cameraHint}>
                Position the entire QR code inside the camera view.
              </Text>

              {message !== '' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              )}

              {!scanning && !lookingUp && (
                <Pressable
                  accessibilityRole="button"
                  onPress={scanAgain}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    Scan again
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Alternative photo scanning */}
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.photoCard}>
              <View style={styles.photoIcon}>
                <Text style={styles.photoIconText}>▧</Text>
              </View>

              <Text style={styles.photoTitle}>
                Scan from your Photos
              </Text>

              <Text style={styles.photoDescription}>
                Already have a baggage QR code saved on this phone? Select its
                image here instead of using the camera.
              </Text>

              <Pressable
                accessibilityRole="button"
                disabled={
                  selectingImage || lookingUp || saving
                }
                onPress={chooseQRFromPhotos}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                  (selectingImage || lookingUp || saving) &&
                    styles.disabledButton,
                ]}
              >
                {selectingImage ? (
                  <ActivityIndicator color={RED} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
                    Choose QR from Photos
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        {/* Verified baggage record */}
        {baggage && (
          <View style={styles.recordCard}>
            <View style={styles.successHeader}>
              <View style={styles.successIcon}>
                <Text style={styles.successIconText}>✓</Text>
              </View>

              <View style={styles.recordInfo}>
                <Text style={styles.sectionTitle}>
                  Baggage verified
                </Text>

                <Text style={styles.subtitle}>
                  Matching Firestore record found.
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Baggage ID</Text>

              <Text style={styles.detailValue}>
                {baggage.baggageId || baggage.id}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Flight</Text>

              <Text style={styles.detailValue}>
                {baggage.flightId || 'Not specified'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reference</Text>

              <Text style={styles.detailValue}>
                {baggage.baggageReference || 'Not specified'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Current status</Text>

              <View style={styles.statusBadge}>
                <Text style={styles.statusValue}>
                  {baggage.status || 'Unknown'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.actionHeading}>
              <Text style={styles.sectionTitle}>
                Record handling event
              </Text>

              <Text style={styles.formHint}>
                Select the action performed. Each successful action creates a
                timestamped event in Firestore.
              </Text>
            </View>

            {nextAction(baggage.status) === 'Loading' && (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => recordHandling('Loading')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.pressed,
                  saving && styles.disabledButton,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Record Loading
                  </Text>
                )}
              </Pressable>
            )}

            {nextAction(baggage.status) === 'Offloading' && (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => recordHandling('Offloading')}
                style={({ pressed }) => [
                  styles.darkButton,
                  pressed && styles.pressed,
                  saving && styles.disabledButton,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    Record Offloading
                  </Text>
                )}
              </Pressable>
            )}

            {baggage.status === 'Offloaded' && (
              <View style={styles.completedBanner}>
                <View style={styles.completedIcon}>
                  <Text style={styles.completedIconText}>✓</Text>
                </View>

                <Text style={styles.completedTitle}>
                  Handling completed
                </Text>

                <Text style={styles.completedBannerText}>
                  This baggage has been successfully offloaded. No further
                  handling actions are required.
                </Text>
              </View>
            )}

            {nextAction(baggage.status) === null &&
              baggage.status !== 'Offloaded' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>
                    Unrecognised baggage status. Please contact your
                    supervisor.
                  </Text>
                </View>
              )}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={scanAgain}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
                saving && styles.disabledButton,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                Scan another bag
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.footer}>
          AEROSYNC · GROUND OPERATIONS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    gap: 17,
  },

  headingSection: {
    gap: 5,
    marginBottom: 3,
  },

  eyebrow: {
    color: RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },

  heading: {
    color: CHARCOAL,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  subtitle: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
  },

  cardEyebrow: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  cardTitle: {
    color: CHARCOAL,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 4,
  },

  cameraCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
  },

  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  cameraStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  cameraStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GREEN,
  },

  cameraStatusText: {
    color: CHARCOAL,
    fontSize: 9,
    fontWeight: '900',
  },

  cameraFrame: {
    width: '100%',
    height: 350,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: CHARCOAL,
  },

  camera: {
    flex: 1,
  },

  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
    backgroundColor: CHARCOAL,
  },

  placeholderIcon: {
    fontSize: 42,
    color: WHITE,
  },

  cameraMessage: {
    color: WHITE,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  cameraHint: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },

  errorCard: {
    padding: 13,
    borderRadius: 11,
    backgroundColor: PALE_RED,
    borderWidth: 1,
    borderColor: '#F3D0D5',
  },

  errorText: {
    color: DARK_RED,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
  },

  primaryButton: {
    minHeight: 49,
    borderRadius: 12,
    backgroundColor: RED,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  darkButton: {
    minHeight: 49,
    borderRadius: 12,
    backgroundColor: CHARCOAL,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButton: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 12,
    backgroundColor: WHITE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButtonText: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },

  disabledButton: {
    opacity: 0.6,
  },

  pressed: {
    opacity: 0.75,
  },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER,
  },

  orText: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  photoCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 19,
    gap: 12,
  },

  photoIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  photoIconText: {
    color: RED,
    fontSize: 24,
    fontWeight: '800',
  },

  photoTitle: {
    color: CHARCOAL,
    fontSize: 17,
    fontWeight: '900',
  },

  photoDescription: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
  },

  recordCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 19,
    gap: 16,
  },

  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  successIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: '#E8F5EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  successIconText: {
    color: GREEN,
    fontSize: 23,
    fontWeight: '900',
  },

  recordInfo: {
    flex: 1,
    gap: 4,
  },

  sectionTitle: {
    color: CHARCOAL,
    fontSize: 18,
    fontWeight: '900',
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
  },

  detailLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
  },

  detailValue: {
    color: CHARCOAL,
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },

  statusBadge: {
    backgroundColor: PALE_RED,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusValue: {
    color: RED,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'right',
  },

  actionHeading: {
    gap: 7,
  },

  formHint: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
  },

  completedBanner: {
    backgroundColor: '#E8F5EF',
    borderRadius: 14,
    padding: 17,
    alignItems: 'center',
    gap: 8,
  },

  completedIcon: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  completedIconText: {
    color: GREEN,
    fontSize: 21,
    fontWeight: '900',
  },

  completedTitle: {
    color: GREEN,
    fontSize: 15,
    fontWeight: '900',
  },

  completedBannerText: {
    color: CHARCOAL,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },

  footer: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginTop: 4,
  },
});
