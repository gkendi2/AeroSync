
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
import { doc, getDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
    if (!scanning || lookingUp || saving) return;

    setScanning(false);
    await lookUpBaggageFromQR(data);
  }

  async function chooseQRFromPhotos() {
    if (selectingImage || lookingUp || saving) return;

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

      if (result.canceled || !result.assets[0]?.uri) return;

      const scannedResults = await scanFromURLAsync(
        result.assets[0].uri,
        ['qr']
      );

      if (scannedResults.length === 0) {
        setMessage(
          'No QR code was found in that image. Please choose an image containing the AeroSync baggage QR code.'
        );
        return;
      }

      const qrData = scannedResults[0]?.data;

      if (!qrData) {
        setMessage('The selected image does not contain readable QR data.');
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
      const newStatus = await recordHandlingEvent(
        baggage.id,
        action,
        auth.currentUser.uid
      );

      setBaggage((previous) =>
        previous ? { ...previous, status: newStatus } : null
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
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>A</Text>
          </View>

          <Text style={styles.eyebrow}>AEROSYNC SCANNER</Text>
          <Text style={styles.heading}>Camera permission required</Text>
          <Text style={styles.messageText}>
            Allow camera access to scan baggage QR codes.
          </Text>

          <Pressable
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
        {/* Header */}
        <View style={styles.headingSection}>
          <View style={styles.headingTopRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>A</Text>
            </View>

            <View>
              <Text style={styles.brandName}>AEROSYNC</Text>
              <Text style={styles.brandSubtitle}>
                GROUND OPERATIONS
              </Text>
            </View>
          </View>

          <View style={styles.headingTitleRow}>
            <View style={styles.headingTextContainer}>
              <Text style={styles.heading}>Scan baggage</Text>
              <Text style={styles.subtitle}>
                Scan a baggage QR code to verify its details and
                record handling activity.
              </Text>
            </View>

            <View style={styles.qrHeadingIcon}>
              <Text style={styles.qrHeadingIconText}>⌗</Text>
            </View>
          </View>
        </View>

        {!baggage && (
          <>
            {/* Live scanner */}
            <View style={styles.cameraCard}>
              <View style={styles.cameraHeader}>
                <View>
                  <Text style={styles.cardEyebrow}>LIVE SCANNER</Text>
                  <Text style={styles.cardTitle}>Scan baggage</Text>
                </View>

                <View style={styles.cameraStatus}>
                  <View style={styles.cameraStatusDot} />
                  <Text style={styles.cameraStatusText}>
                    {lookingUp
                      ? 'VERIFYING'
                      : scanning
                        ? 'READY'
                        : 'PAUSED'}
                  </Text>
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
                  >
                    <View
                      pointerEvents="none"
                      style={styles.scannerOverlay}
                    >
                      <View style={styles.scanTarget}>
                        <View style={[styles.scanCorner, styles.topLeft]} />
                        <View style={[styles.scanCorner, styles.topRight]} />
                        <View style={[styles.scanCorner, styles.bottomLeft]} />
                        <View style={[styles.scanCorner, styles.bottomRight]} />
                        <View style={styles.scanLine} />
                      </View>

                      <Text style={styles.scanOverlayText}>
                        ALIGN QR CODE WITHIN FRAME
                      </Text>
                    </View>
                  </CameraView>
                ) : (
                  <View style={styles.cameraPlaceholder}>
                    {lookingUp ? (
                      <>
                        <ActivityIndicator size="large" color={WHITE} />
                        <Text style={styles.cameraMessage}>
                          Verifying baggage record…
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.placeholderIcon}>⌗</Text>
                        <Text style={styles.cameraMessage}>
                          Scanner paused
                        </Text>
                        <Text style={styles.cameraSubMessage}>
                          Tap below to start another scan
                        </Text>
                      </>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.cameraInstruction}>
                <View style={styles.instructionIcon}>
                  <Text style={styles.instructionIconText}>i</Text>
                </View>
                <Text style={styles.cameraHint}>
                  Hold the camera steady and ensure the entire QR
                  code is visible.
                </Text>
              </View>

              {message !== '' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{message}</Text>
                </View>
              )}

              {!scanning && !lookingUp && (
                <Pressable
                  onPress={scanAgain}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Scan again</Text>
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
              <View style={styles.photoHeader}>
                <View style={styles.photoIcon}>
                  <Text style={styles.photoIconText}>▧</Text>
                </View>

                <View style={styles.photoHeadingText}>
                  <Text style={styles.photoTitle}>Scan from Photos</Text>
                  <Text style={styles.photoDescription}>
                    Use a saved baggage QR image instead.
                  </Text>
                </View>
              </View>

              <Pressable
                disabled={selectingImage || lookingUp || saving}
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
                <Text style={styles.sectionTitle}>Baggage verified</Text>
                <Text style={styles.recordSubtitle}>
                  Matching Firestore record found.
                </Text>
              </View>

              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.detailsHeading}>BAGGAGE DETAILS</Text>

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
                Select the action performed. Each successful action
                creates a timestamped event in Firestore.
              </Text>
            </View>

            {nextAction(baggage.status) === 'Loading' && (
              <Pressable
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
                  This baggage has been successfully offloaded.
                  No further handling actions are required.
                </Text>
              </View>
            )}

            {nextAction(baggage.status) === null &&
              baggage.status !== 'Offloaded' && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>
                    Unrecognised baggage status. Please contact
                    your supervisor.
                  </Text>
                </View>
              )}

            <Pressable
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
    paddingTop: 12,
    paddingBottom: 35,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    gap: 16,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    gap: 15,
  },

  messageText: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },

  headingSection: {
    gap: 20,
    marginBottom: 2,
  },

  headingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  brandMark: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: WHITE,
    fontSize: 21,
    fontWeight: '900',
  },

  brandName: {
    color: CHARCOAL,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  brandSubtitle: {
    color: MUTED,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },

  headingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  headingTextContainer: {
    flex: 1,
    gap: 5,
  },

  heading: {
    color: CHARCOAL,
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  subtitle: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 19,
  },

  qrHeadingIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  qrHeadingIconText: {
    color: RED,
    fontSize: 31,
    fontWeight: '700',
  },

  eyebrow: {
    color: RED,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    textAlign: 'center',
  },

  cardEyebrow: {
    color: RED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },

  cardTitle: {
    color: CHARCOAL,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },

  cameraCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 13,
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
    height: 330,
    overflow: 'hidden',
    borderRadius: 13,
    backgroundColor: CHARCOAL,
  },

  camera: {
    flex: 1,
  },

  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },

  scanTarget: {
    width: 220,
    height: 220,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scanCorner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: WHITE,
  },

  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 9,
  },

  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 9,
  },

  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 9,
  },

  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 9,
  },

  scanLine: {
    width: '85%',
    height: 2,
    backgroundColor: RED,
    opacity: 0.95,
  },

  scanOverlayText: {
    color: WHITE,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 18,
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
    fontSize: 48,
    color: WHITE,
  },

  cameraMessage: {
    color: WHITE,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },

  cameraSubMessage: {
    color: '#BBBBBB',
    fontSize: 11,
    textAlign: 'center',
  },

  cameraInstruction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 3,
  },

  instructionIcon: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: PALE_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  instructionIconText: {
    color: RED,
    fontSize: 12,
    fontWeight: '900',
  },

  cameraHint: {
    flex: 1,
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
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
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: RED,
    paddingVertical: 13,
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
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: CHARCOAL,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButton: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 11,
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
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 13,
  },

  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  photoHeadingText: {
    flex: 1,
    gap: 4,
  },

  photoIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
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
    fontSize: 15,
    fontWeight: '900',
  },

  photoDescription: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 17,
  },

  recordCard: {
    backgroundColor: WHITE,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 17,
    gap: 15,
  },

  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  successIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
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
    fontSize: 17,
    fontWeight: '900',
  },

  recordSubtitle: {
    color: MUTED,
    fontSize: 11,
  },

  verifiedBadge: {
    backgroundColor: '#E8F5EF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
  },

  verifiedBadgeText: {
    color: GREEN,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
  },

  detailsHeading: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
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
    borderRadius: 8,
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
    fontSize: 11,
    lineHeight: 18,
  },

  completedBanner: {
    backgroundColor: '#E8F5EF',
    borderRadius: 13,
    padding: 16,
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
    marginTop: 3,
  },
});
