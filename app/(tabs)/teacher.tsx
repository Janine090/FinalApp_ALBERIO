import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Svg, { Circle, Path } from 'react-native-svg';

import AppBackground from '@/components/ui/AppBackground';
import AppButton from '@/components/AppButton';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DateTimeInput from '@/components/ui/DateTimeInput';
import EmptyState from '@/components/ui/EmptyState';
import FadeIn from '@/components/ui/FadeIn';
import FormField from '@/components/ui/FormField';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import SmartQRCode from '@/components/ui/SmartQRCode';
import StatusBadge from '@/components/ui/StatusBadge';
import { COLORS } from '@/constants/colors';
import {
  FONT_MONO,
  RADIUS,
  SHADOWS,
  SPACING,
  TYPOGRAPHY,
} from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/components/ProfileProvider';
import {
  closeEvent,
  createEvent,
  deriveEventStatus,
  updateEvent,
} from '@/lib/events';
import { buildQRPayload } from '@/lib/qr';
import { confirmAction, showAlert } from '@/lib/dialogs';
import {
  hasValidationErrors,
  validateEventInput,
  type EventValidation,
} from '@/lib/validation';
import {
  getTeacherEventAttendance,
  type TeacherEventAttendance,
} from '@/lib/attendance';

type Message = { tone: 'success' | 'danger'; text: string } | null;

type QRState = {
  title: string;
  code: string;
  payload: string;
  start: string | null;
  end: string | null;
  venue: string | null;
};

function makeEventCode() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EVT-${year}-${random}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatWhen(value: string | null) {
  if (!value) return 'Schedule to be announced';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TeacherScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const qrSize = Math.min(210, Math.max(170, width - 120));
  const { user } = useAuth();
  const { role, loading: profileLoading } = useProfile();
  const isStaff = role === 'teacher' || role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [eventCode, setEventCode] = useState(makeEventCode);
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => {
    const next = new Date();
    next.setHours(next.getHours() + 1);
    return next;
  });
  const [editTarget, setEditTarget] = useState<'start' | 'end' | null>(null);
  const [editingPart, setEditingPart] = useState<'date' | 'time'>('date');
  const [formErrors, setFormErrors] = useState<EventValidation>({});
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<QRState | null>(null);
  const [events, setEvents] = useState<TeacherEventAttendance[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendanceTarget, setAttendanceTarget] =
    useState<TeacherEventAttendance | null>(null);

  const loadEvents = useCallback(async () => {
    if (!user) return;
    const next = await getTeacherEventAttendance(user.id, role === 'admin');
    setEvents(next);
    setEventsLoading(false);
  }, [user, role]);

  useFocusEffect(
    useCallback(() => {
      if (!isStaff) {
        setEventsLoading(false);
        return;
      }
      setEventsLoading(true);
      loadEvents();
    }, [isStaff, loadEvents])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const scrollToForm = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 60);
  };

  const resetForm = () => {
    const start = new Date();
    setTitle('');
    setVenue('');
    setDescription('');
    setEventCode(makeEventCode());
    setStartDate(start);
    setEndDate(new Date(start.getTime() + 60 * 60 * 1000));
    setEditTarget(null);
    setEditingPart('date');
    setFormErrors({});
    setMessage(null);
    setEditingId(null);
  };

  const startCreate = () => {
    resetForm();
    setQr(null);
    setShowForm(true);
    scrollToForm();
  };

  const openEdit = (event: TeacherEventAttendance) => {
    setEditingId(event.eventId);
    setTitle(event.title);
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setEventCode(event.eventCode);
    const start = event.startTime ? new Date(event.startTime) : new Date();
    const end = event.endTime
      ? new Date(event.endTime)
      : new Date(start.getTime() + 60 * 60 * 1000);
    setStartDate(start);
    setEndDate(end);
    setFormErrors({});
    setMessage(null);
    setQr(null);
    setShowForm(true);
    scrollToForm();
  };

  const cancelForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openQR = (event: TeacherEventAttendance) => {
    setQr({
      title: event.title,
      code: event.eventCode,
      payload: buildQRPayload({
        eventId: event.eventCode,
        title: event.title,
        start: event.startTime ?? undefined,
        end: event.endTime ?? undefined,
      }),
      start: event.startTime,
      end: event.endTime,
      venue: event.venue,
    });
    setShowForm(false);
    scrollToForm();
  };

  const updateStart = (selected: Date) => {
    setStartDate(selected);
    if (selected.getTime() >= endDate.getTime()) {
      setEndDate(new Date(selected.getTime() + 60 * 60 * 1000));
    }
  };

  const updateEnd = (selected: Date) => {
    setEndDate(selected);
  };

  const closePicker = () => {
    setEditTarget(null);
    setEditingPart('date');
  };

  const onPickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (event.type === 'dismissed') {
      closePicker();
      return;
    }
    if (selected) {
      if (editTarget === 'start') updateStart(selected);
      if (editTarget === 'end') updateEnd(selected);
    }
    if (Platform.OS === 'android' && editingPart === 'date') {
      setEditingPart('time');
    } else {
      closePicker();
    }
  };

  const applyQuickDuration = (minutes: number) => {
    setEndDate(new Date(startDate.getTime() + minutes * 60 * 1000));
  };

  const handleSaveEvent = async () => {
    setMessage(null);
    const errors = validateEventInput({
      title,
      venue,
      start: startDate,
      end: endDate,
    });
    setFormErrors(errors);

    if (hasValidationErrors(errors)) {
      setMessage({
        tone: 'danger',
        text: 'Check the highlighted fields before saving.',
      });
      return;
    }

    const code = eventCode.trim().toUpperCase();
    if (code.length < 4) {
      setMessage({
        tone: 'danger',
        text: 'Event code must be at least 4 characters.',
      });
      return;
    }

    setSaving(true);

    if (editingId) {
      const current = events.find((item) => item.eventId === editingId);
      const nextStatus =
        current && deriveEventStatus(current) === 'closed'
          ? 'closed'
          : deriveEventStatus({
              start_time: startDate.toISOString(),
              end_time: endDate.toISOString(),
            });
      const { error } = await updateEvent(editingId, {
        title: title.trim(),
        venue: venue.trim(),
        description: description.trim() || null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: nextStatus,
      });
      setSaving(false);
      if (error) {
        setMessage({
          tone: 'danger',
          text: error,
        });
        return;
      }
      setShowForm(false);
      resetForm();
      await loadEvents();
      return;
    }

    const eventData = {
      eventId: code,
      title: title.trim(),
      venue: venue.trim(),
      description: description.trim() || undefined,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };
    const { error } = await createEvent(eventData);
    setSaving(false);

    if (error) {
      setMessage({
        tone: 'danger',
        text: error,
      });
      return;
    }

    setQr({
      title: eventData.title,
      code,
      payload: buildQRPayload(eventData),
      start: eventData.start,
      end: eventData.end,
      venue: eventData.venue,
    });
    setShowForm(false);
    resetForm();
    await loadEvents();
  };

  const shareEvent = async () => {
    if (!qr) return;
    await Share.share({
      message: `QR-ATT session\n${qr.title}\nEvent code: ${qr.code}${
        qr.venue ? `\nVenue: ${qr.venue}` : ''
      }\n\nOpen QR-ATT and scan the QR code shown by your teacher.`,
    });
  };

  const confirmClose = (event: TeacherEventAttendance) => {
    confirmAction({
      title: 'Close event',
      message: `Stop accepting check-ins for "${event.title}"?`,
      confirmLabel: 'Close Event',
      destructive: true,
      onConfirm: async () => {
        const { error } = await closeEvent(event.eventId);
        if (error) {
          showAlert('Could not close event', error);
          return;
        }
        if (qr?.code === event.eventCode) setQr(null);
        await loadEvents();
      },
    });
  };

  const liveCount = events.filter(
    (event) => deriveEventStatus(event) === 'active'
  ).length;
  const totalScans = events.reduce(
    (sum, event) => sum + event.attendeeCount,
    0
  );

  if (profileLoading) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
          <Ionicons name="sync-outline" size={30} color={COLORS.primary} />
          <Text style={styles.muted}>Loading event console...</Text>
        </SafeAreaView>
      </AppBackground>
    );
  }

  if (!isStaff) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
          <View style={styles.lockIcon}>
            <Ionicons
              name="lock-closed-outline"
              size={30}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.lockTitle}>Staff access only</Text>
          <Text style={styles.muted}>
            This console is where teachers and administrators create events and
            generate QR codes.
          </Text>
          <View style={styles.lockAction}>
            <AppButton
              variant="secondary"
              title="Back to Home"
              icon="arrow-back-outline"
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
        </SafeAreaView>
      </AppBackground>
    );
  }

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        >
          <FadeIn>
            <ScreenHeader
              eyebrow={role === 'admin' ? 'Admin manager' : 'Teacher console'}
              title="Event control"
              subtitle={
                role === 'admin'
                  ? 'Oversee every session, QR code, and check-in log.'
                  : 'Create a session, generate the QR, and monitor check-ins.'
              }
              right={
                <Badge
                  label={role === 'admin' ? 'All events' : 'Online'}
                  tone={role === 'admin' ? 'violet' : 'success'}
                  icon={role === 'admin' ? 'shield-outline' : 'wifi-outline'}
                />
              }
            />
          </FadeIn>

          <FadeIn delay={40}>
            <View style={styles.statsRow}>
              <View style={styles.miniStat}>
                <Text style={styles.miniValue}>{events.length}</Text>
                <Text style={styles.miniLabel}>Sessions</Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniValue}>{liveCount}</Text>
                <Text style={styles.miniLabel}>Live</Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniValue}>{totalScans}</Text>
                <Text style={styles.miniLabel}>Check-ins</Text>
              </View>
            </View>
          </FadeIn>

          {qr ? (
            <FadeIn delay={70}>
              <Card style={styles.qrCard} glow={COLORS.primary}>
                <View style={styles.qrHeader}>
                  <View style={styles.qrHeaderText}>
                    <Text style={styles.qrEyebrow}>Session ready</Text>
                    <Text style={styles.qrTitle} numberOfLines={2}>
                      {qr.title}
                    </Text>
                  </View>
                  <Badge label="Ready" tone="success" icon="checkmark" />
                </View>
                <Text style={styles.qrCode}>{qr.code}</Text>
                {qr.venue ? (
                  <View style={styles.qrVenue}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.qrMetaText}>{qr.venue}</Text>
                  </View>
                ) : null}

                <View style={styles.qrShowcase}>
                  <Svg
                    style={StyleSheet.absoluteFill}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    pointerEvents="none"
                  >
                    <Path
                      d="M2 14 H10 V7 H20"
                      stroke={COLORS.primary}
                      strokeOpacity={0.2}
                      strokeWidth={0.5}
                      fill="none"
                    />
                    <Path
                      d="M98 14 H90 V7 H80"
                      stroke={COLORS.primary}
                      strokeOpacity={0.2}
                      strokeWidth={0.5}
                      fill="none"
                    />
                    <Path
                      d="M2 86 H10 V93 H20"
                      stroke={COLORS.primary}
                      strokeOpacity={0.2}
                      strokeWidth={0.5}
                      fill="none"
                    />
                    <Path
                      d="M98 86 H90 V93 H80"
                      stroke={COLORS.violet}
                      strokeOpacity={0.22}
                      strokeWidth={0.5}
                      fill="none"
                    />
                    <Circle
                      cx={2}
                      cy={14}
                      r={1}
                      fill={COLORS.primary}
                      fillOpacity={0.5}
                    />
                    <Circle
                      cx={98}
                      cy={14}
                      r={1}
                      fill={COLORS.primary}
                      fillOpacity={0.5}
                    />
                    <Circle
                      cx={2}
                      cy={86}
                      r={1}
                      fill={COLORS.violet}
                      fillOpacity={0.5}
                    />
                    <Circle
                      cx={98}
                      cy={86}
                      r={1}
                      fill={COLORS.violet}
                      fillOpacity={0.5}
                    />
                  </Svg>

                  <View style={styles.qrTechHeader}>
                    <View style={styles.qrTechDot} />
                    <Text style={styles.qrTechLabel}>Smart attendance pass</Text>
                    <View style={[styles.qrTechDot, styles.qrTechDotViolet]} />
                  </View>

                  <View style={styles.qrFrame}>
                    <View style={[styles.qrCorner, styles.qrTopLeft]} />
                    <View style={[styles.qrCorner, styles.qrTopRight]} />
                    <View style={[styles.qrCorner, styles.qrBottomLeft]} />
                    <View style={[styles.qrCorner, styles.qrBottomRight]} />
                    <View
                      style={[styles.qrCornerInner, styles.qrInnerTopLeft]}
                    />
                    <View
                      style={[styles.qrCornerInner, styles.qrInnerTopRight]}
                    />
                    <View
                      style={[styles.qrCornerInner, styles.qrInnerBottomLeft]}
                    />
                    <View
                      style={[styles.qrCornerInner, styles.qrInnerBottomRight]}
                    />
                    <View style={styles.qrWhite}>
                      <SmartQRCode value={qr.payload} size={qrSize} />
                    </View>
                  </View>

                  <View style={styles.qrTechFooter}>
                    <View style={styles.qrTechSignal}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={12}
                        color={COLORS.success}
                      />
                      <Text
                        style={[
                          styles.qrTechSignalText,
                          { color: COLORS.success },
                        ]}
                      >
                        Encrypted
                      </Text>
                    </View>
                    <View style={styles.qrTechDivider} />
                    <View style={styles.qrTechSignal}>
                      <Ionicons
                        name="scan-outline"
                        size={12}
                        color={COLORS.primary}
                      />
                      <Text style={styles.qrTechSignalText}>
                        Scan to check in
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.qrMetaRow}>
                  <View style={styles.qrMetaItem}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.qrMetaText}>
                      {qr.start
                        ? formatDate(new Date(qr.start))
                        : 'No date'}
                    </Text>
                  </View>
                  <View style={styles.qrMetaItem}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.qrMetaText}>
                      {qr.start ? formatTime(new Date(qr.start)) : '—'} –{' '}
                      {qr.end ? formatTime(new Date(qr.end)) : '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.qrActions}>
                  <View style={styles.flex}>
                    <AppButton
                      variant="secondary"
                      title="Share"
                      icon="share-social-outline"
                      onPress={shareEvent}
                    />
                  </View>
                  <View style={styles.flex}>
                    <AppButton
                      variant="primary"
                      title="New Session"
                      icon="add-outline"
                      onPress={startCreate}
                    />
                  </View>
                </View>
              </Card>
            </FadeIn>
          ) : showForm ? (
            <FadeIn delay={70}>
              <Card style={styles.formCard}>
                <View style={styles.formTop}>
                  <View>
                    <Text style={styles.cardEyebrow}>
                      {editingId ? 'Update session' : 'New session'}
                    </Text>
                    <Text style={styles.cardTitle}>Event details</Text>
                  </View>
                  <Pressable onPress={cancelForm} hitSlop={10}>
                    <Ionicons
                      name="close"
                      size={21}
                      color={COLORS.textSecondary}
                    />
                  </Pressable>
                </View>

                <View style={styles.fields}>
                  <FormField
                    label="Event title"
                    icon="create-outline"
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Founders Day Assembly"
                    editable={!saving}
                    error={formErrors.title}
                  />
                  <FormField
                    label="Venue"
                    icon="location-outline"
                    value={venue}
                    onChangeText={setVenue}
                    placeholder="Main Auditorium"
                    editable={!saving}
                    error={formErrors.venue}
                  />
                  <FormField
                    label="Description (optional)"
                    icon="document-text-outline"
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What is this session for?"
                    multiline
                    editable={!saving}
                    style={styles.descriptionInput}
                  />
                  <View>
                    <FormField
                      label="Event code"
                      icon="barcode-outline"
                      value={eventCode}
                      onChangeText={(value) =>
                        setEventCode(value.toUpperCase())
                      }
                      placeholder="EVT-2026-0001"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!saving && !editingId}
                    />
                    {editingId ? (
                      <Text style={styles.helper}>
                        Event codes stay locked so existing QR codes keep
                        working.
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() => setEventCode(makeEventCode())}
                        style={styles.autoCode}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="flash-outline"
                          size={13}
                          color={COLORS.primary}
                        />
                        <Text style={styles.autoCodeText}>Generate code</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <View style={styles.dateRow}>
                  <Pressable
                    style={styles.dateCard}
                    onPress={() => {
                      setEditTarget('start');
                      setEditingPart('date');
                    }}
                  >
                    <View style={styles.dateIcon}>
                      <Ionicons
                        name="play-outline"
                        size={16}
                        color={COLORS.success}
                      />
                    </View>
                    <Text style={styles.dateLabel}>Starts</Text>
                    <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
                    <Text style={styles.dateTime}>{formatTime(startDate)}</Text>
                  </Pressable>

                  <Pressable
                    style={styles.dateCard}
                    onPress={() => {
                      setEditTarget('end');
                      setEditingPart('date');
                    }}
                  >
                    <View style={styles.dateIcon}>
                      <Ionicons
                        name="stop-outline"
                        size={16}
                        color={COLORS.warning}
                      />
                    </View>
                    <Text style={styles.dateLabel}>Ends</Text>
                    <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
                    <Text style={styles.dateTime}>{formatTime(endDate)}</Text>
                  </Pressable>
                </View>

                {formErrors.time ? (
                  <Text style={styles.timeError}>{formErrors.time}</Text>
                ) : null}

                {editTarget ? (
                  Platform.OS === 'web' ? (
                    <DateTimeInput
                      label={
                        editTarget === 'start'
                          ? 'Session start'
                          : 'Session end'
                      }
                      value={editTarget === 'start' ? startDate : endDate}
                      onChange={
                        editTarget === 'start' ? updateStart : updateEnd
                      }
                      onClose={closePicker}
                    />
                  ) : (
                    <DateTimePicker
                      value={editTarget === 'start' ? startDate : endDate}
                      mode={
                        Platform.OS === 'android' ? editingPart : 'datetime'
                      }
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onPickerChange}
                      themeVariant="dark"
                    />
                  )
                ) : null}

                <View style={styles.chipRow}>
                  {[30, 60, 120].map((minutes) => (
                    <Pressable
                      key={minutes}
                      onPress={() => applyQuickDuration(minutes)}
                      style={({ pressed }) => [
                        styles.chip,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.chipText}>
                        +{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {message ? (
                  <View
                    style={[
                      styles.message,
                      message.tone === 'success'
                        ? styles.messageSuccess
                        : styles.messageDanger,
                    ]}
                  >
                    <Ionicons
                      name={
                        message.tone === 'success'
                          ? 'checkmark-circle'
                          : 'alert-circle'
                      }
                      size={17}
                      color={
                        message.tone === 'success'
                          ? COLORS.success
                          : COLORS.danger
                      }
                    />
                    <Text
                      style={[
                        styles.messageText,
                        {
                          color:
                            message.tone === 'success'
                              ? COLORS.success
                              : COLORS.danger,
                        },
                      ]}
                    >
                      {message.text}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.submit}>
                  <AppButton
                    variant="primary"
                    title={editingId ? 'Save Changes' : 'Create & Generate QR'}
                    icon={editingId ? 'save-outline' : 'qr-code-outline'}
                    onPress={handleSaveEvent}
                    loading={saving}
                  />
                </View>
              </Card>
            </FadeIn>
          ) : (
            <FadeIn delay={70}>
              <Card style={styles.hero} glow={COLORS.violet}>
                <Ionicons
                  name="calendar"
                  size={145}
                  color={COLORS.violet}
                  style={styles.heroWatermark}
                />
                <Badge
                  label={role === 'admin' ? 'Manager mode' : 'Teacher mode'}
                  tone="violet"
                  icon="easel-outline"
                />
                <Text style={styles.heroTitle}>Run your next session.</Text>
                <Text style={styles.heroText}>
                  Publish an event with a venue and schedule, then show the QR
                  code so students can check in instantly.
                </Text>
                <View style={styles.heroAction}>
                  <AppButton
                    variant="primary"
                    title="Create Event"
                    icon="add-circle-outline"
                    onPress={startCreate}
                  />
                </View>
              </Card>
            </FadeIn>
          )}

          <FadeIn delay={130}>
            <SectionHeader
              title={role === 'admin' ? 'All sessions' : 'Recent sessions'}
              caption={`${events.length} total`}
              actionLabel="History"
              onAction={() => router.push('/history')}
            />

            {eventsLoading ? (
              <Card style={styles.emptyCard}>
                <Ionicons
                  name="sync-outline"
                  size={20}
                  color={COLORS.primary}
                />
                <Text style={styles.muted}>Loading sessions...</Text>
              </Card>
            ) : events.length === 0 ? (
              <EmptyState
                icon="calendar-outline"
                title="No sessions yet"
                message="Create your first event and its QR code will be ready to share."
                actionLabel="Create Event"
                onAction={startCreate}
              />
            ) : (
              <View style={styles.eventList}>
                {events.map((event) => {
                  const status = deriveEventStatus(event);
                  const closed = status === 'closed';
                  return (
                    <Card key={event.eventId} style={styles.eventCard}>
                      <View style={styles.eventTop}>
                        <View style={styles.eventIcon}>
                          <Ionicons
                            name={
                              status === 'active'
                                ? 'radio'
                                : 'calendar-outline'
                            }
                            size={18}
                            color={
                              status === 'active'
                                ? COLORS.success
                                : COLORS.violet
                            }
                          />
                        </View>
                        <View style={styles.eventBody}>
                          <Text style={styles.eventTitle} numberOfLines={1}>
                            {event.title}
                          </Text>
                          <Text style={styles.mono} numberOfLines={1}>
                            {event.eventCode}
                          </Text>
                        </View>
                        <StatusBadge status={status} />
                      </View>

                      <View style={styles.eventMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons
                            name="location-outline"
                            size={13}
                            color={COLORS.muted}
                          />
                          <Text style={styles.smallMuted} numberOfLines={1}>
                            {event.venue || 'No venue'}
                          </Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons
                            name="time-outline"
                            size={13}
                            color={COLORS.muted}
                          />
                          <Text style={styles.smallMuted}>
                            {formatWhen(event.startTime)}
                          </Text>
                        </View>
                      </View>

                      {event.description ? (
                        <Text style={styles.eventDescription} numberOfLines={2}>
                          {event.description}
                        </Text>
                      ) : null}

                      <View style={styles.eventFooter}>
                        <Badge
                          label={`${event.attendeeCount}`}
                          tone={event.attendeeCount > 0 ? 'success' : 'neutral'}
                          icon="people-outline"
                        />
                        <View style={styles.eventActions}>
                          {!closed ? (
                            <Pressable
                              onPress={() => openQR(event)}
                              style={({ pressed }) => [
                                styles.miniButton,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons
                                name="qr-code-outline"
                                size={14}
                                color={COLORS.primary}
                              />
                              <Text style={styles.miniText}>QR</Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => openEdit(event)}
                            style={({ pressed }) => [
                              styles.miniButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons
                              name="create-outline"
                              size={14}
                              color={COLORS.primary}
                            />
                            <Text style={styles.miniText}>Edit</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setAttendanceTarget(event)}
                            style={({ pressed }) => [
                              styles.miniButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons
                              name="people-outline"
                              size={14}
                              color={COLORS.primary}
                            />
                            <Text style={styles.miniText}>View</Text>
                          </Pressable>
                          {!closed ? (
                            <Pressable
                              onPress={() => confirmClose(event)}
                              style={({ pressed }) => [
                                styles.miniDanger,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons
                                name="lock-closed-outline"
                                size={14}
                                color={COLORS.danger}
                              />
                              <Text style={styles.miniDangerText}>Close</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </FadeIn>

          <View style={styles.bottomSpace} />
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={attendanceTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAttendanceTarget(null)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setAttendanceTarget(null)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <Text style={styles.sheetEyebrow}>Check-in log</Text>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {attendanceTarget?.title}
                </Text>
              </View>
              <Pressable
                onPress={() => setAttendanceTarget(null)}
                hitSlop={10}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            </View>
            <View style={styles.sheetMeta}>
              <StatusBadge
                status={
                  attendanceTarget
                    ? deriveEventStatus(attendanceTarget)
                    : 'closed'
                }
              />
              <Text style={styles.smallMuted}>
                {attendanceTarget?.attendeeCount ?? 0} checked in
              </Text>
            </View>

            <ScrollView
              style={styles.attendeeScroll}
              contentContainerStyle={styles.attendeeList}
              showsVerticalScrollIndicator={false}
            >
              {attendanceTarget?.attendees.length === 0 ? (
                <Text style={styles.emptyAttendees}>
                  No student scans yet. Share the QR code to start collecting
                  check-ins.
                </Text>
              ) : (
                attendanceTarget?.attendees.map((attendee) => (
                  <View
                    key={`${attendee.studentId}-${attendee.scannedAt}`}
                    style={styles.attendeeRow}
                  >
                    <Avatar
                      name={attendee.studentName ?? undefined}
                      size={32}
                      color={COLORS.success}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.attendeeName} numberOfLines={1}>
                        {attendee.studentName || 'Student'}
                      </Text>
                      <Text style={styles.monoSmall}>
                        {formatWhen(attendee.scannedAt)}
                      </Text>
                    </View>
                    <StatusBadge status={attendee.status} />
                  </View>
                ))
              )}
            </ScrollView>

            <AppButton
              variant="secondary"
              title="Close"
              icon="close-outline"
              onPress={() => setAttendanceTarget(null)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
    gap: SPACING.sm,
  },
  lockIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  lockTitle: {
    ...TYPOGRAPHY.section,
    fontSize: 21,
    color: COLORS.textPrimary,
  },
  muted: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  lockAction: {
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  miniStat: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  miniValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  miniLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.muted,
  },
  hero: {
    overflow: 'hidden',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  heroWatermark: {
    position: 'absolute',
    right: -30,
    bottom: -30,
    opacity: 0.06,
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  heroText: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    maxWidth: 290,
  },
  heroAction: {
    marginTop: SPACING.md,
  },
  formCard: {
    gap: SPACING.sm,
  },
  formTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  cardEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.primary,
  },
  cardTitle: {
    ...TYPOGRAPHY.section,
    fontSize: 21,
    color: COLORS.textPrimary,
    marginTop: 2,
    marginBottom: SPACING.sm,
  },
  fields: {
    gap: SPACING.lg,
  },
  descriptionInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  helper: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: SPACING.sm,
    lineHeight: 15,
  },
  autoCode: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: SPACING.sm,
  },
  autoCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.2,
  },
  dateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  dateCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 2,
  },
  dateIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    marginBottom: SPACING.xs,
  },
  dateLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 9,
    color: COLORS.muted,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dateTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONT_MONO,
  },
  timeError: {
    fontSize: 11,
    color: COLORS.danger,
    marginTop: SPACING.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  chip: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  pressed: {
    opacity: 0.75,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  messageSuccess: {
    backgroundColor: '#34D39914',
    borderColor: '#34D39940',
  },
  messageDanger: {
    backgroundColor: '#FB718514',
    borderColor: '#FB718540',
  },
  messageText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  submit: {
    marginTop: SPACING.md,
  },
  qrCard: {
    gap: SPACING.md,
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  qrHeaderText: {
    flex: 1,
  },
  qrEyebrow: {
    ...TYPOGRAPHY.eyebrow,
    color: COLORS.success,
  },
  qrTitle: {
    ...TYPOGRAPHY.section,
    fontSize: 20,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  qrCode: {
    fontSize: 12,
    color: COLORS.primary,
    fontFamily: FONT_MONO,
    letterSpacing: 1,
    marginTop: -SPACING.sm,
  },
  qrVenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  qrShowcase: {
    position: 'relative',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  qrTechHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  qrTechDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 2,
  },
  qrTechDotViolet: {
    backgroundColor: COLORS.violet,
    shadowColor: COLORS.violet,
  },
  qrTechLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  qrFrame: {
    alignSelf: 'center',
    padding: SPACING.md,
  },
  qrWhite: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: '#22D3EE33',
    ...SHADOWS.card,
  },
  qrCorner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: COLORS.primary,
  },
  qrCornerInner: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderColor: COLORS.violet,
    opacity: 0.8,
  },
  qrTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  qrTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  qrBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  qrBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  qrInnerTopLeft: {
    top: 7,
    left: 7,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopLeftRadius: 5,
  },
  qrInnerTopRight: {
    top: 7,
    right: 7,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderTopRightRadius: 5,
  },
  qrInnerBottomLeft: {
    bottom: 7,
    left: 7,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderBottomLeftRadius: 5,
  },
  qrInnerBottomRight: {
    bottom: 7,
    right: 7,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomRightRadius: 5,
  },
  qrTechFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  qrTechSignal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  qrTechSignalText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLORS.textSecondary,
  },
  qrTechDivider: {
    width: 1,
    height: 12,
    backgroundColor: COLORS.border,
  },
  qrMetaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.lg,
    flexWrap: 'wrap',
  },
  qrMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  qrMetaText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: FONT_MONO,
  },
  qrActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  eventList: {
    gap: SPACING.sm,
  },
  eventCard: {
    gap: SPACING.md,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  eventIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  eventBody: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  mono: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: FONT_MONO,
    marginTop: 2,
  },
  monoSmall: {
    fontSize: 10,
    color: COLORS.muted,
    fontFamily: FONT_MONO,
  },
  eventMeta: {
    gap: 5,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallMuted: {
    fontSize: 10,
    color: COLORS.muted,
  },
  eventDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    paddingTop: SPACING.sm,
  },
  eventActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 5,
  },
  miniButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#22D3EE33',
    backgroundColor: '#22D3EE0F',
  },
  miniText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  miniDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#FB718533',
    backgroundColor: '#FB71850F',
  },
  miniDangerText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.danger,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#03060CCC',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  sheetEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: COLORS.violet,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  sheetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  attendeeScroll: {
    maxHeight: 360,
  },
  attendeeList: {
    gap: SPACING.sm,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  emptyAttendees: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    paddingVertical: SPACING.lg,
    textAlign: 'center',
  },
  bottomSpace: {
    height: 120,
  },
});
