import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import AppBackground from '@/components/ui/AppBackground';
import AppButton from '@/components/AppButton';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import FadeIn from '@/components/ui/FadeIn';
import ScreenHeader from '@/components/ui/ScreenHeader';
import SectionHeader from '@/components/ui/SectionHeader';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { COLORS } from '@/constants/colors';
import { FONT_MONO, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/components/ProfileProvider';
import {
  getAdminEvents,
  getAdminOverview,
  getAdminProfiles,
  getRecentAttendance,
  updateAttendanceStatus,
  type AdminAttendanceRow,
  type AdminEventRow,
  type AdminOverview,
} from '@/lib/admin';
import type { AttendanceStatus } from '@/lib/attendance';
import { closeEvent } from '@/lib/events';
import { updateProfileRole, type Profile, type Role } from '@/lib/profiles';

type AdminTab = 'overview' | 'users' | 'events' | 'attendance';

const TABS: { value: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { value: 'overview', label: 'Overview', icon: 'grid-outline' },
    { value: 'users', label: 'Users', icon: 'people-outline' },
    { value: 'events', label: 'Events', icon: 'calendar-outline' },
    { value: 'attendance', label: 'Attendance', icon: 'checkmark-done-outline' },
  ];

const ROLE_OPTIONS: Role[] = ['student', 'teacher', 'admin'];
const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'late', 'absent'];

function roleTone(role: Role) {
  if (role === 'admin') return 'violet' as const;
  if (role === 'teacher') return 'info' as const;
  return 'neutral' as const;
}

function formatWhen(value: string | null) {
  if (!value) return 'No schedule';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { role } = useProfile();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<AdminEventRow[]>([]);
  const [attendance, setAttendance] = useState<AdminAttendanceRow[]>([]);
  const [topEvents, setTopEvents] = useState<AdminEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleTarget, setRoleTarget] = useState<Profile | null>(null);
  const [pendingRole, setPendingRole] = useState<Role>('student');
  const [attendanceTarget, setAttendanceTarget] =
    useState<AdminAttendanceRow | null>(null);
  const [pendingStatus, setPendingStatus] =
    useState<AttendanceStatus>('present');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [nextOverview, nextProfiles, nextEvents, nextAttendance] =
      await Promise.all([
        getAdminOverview(),
        getAdminProfiles(),
        getAdminEvents(),
        getRecentAttendance(),
      ]);
    setOverview(nextOverview.data);
    setError(nextOverview.error);
    setProfiles(nextProfiles);
    setEvents(nextEvents);
    setAttendance(nextAttendance);
    setTopEvents(
      [...nextEvents]
        .filter((event) => event.attendeeCount > 0)
        .sort((a, b) => b.attendeeCount - a.attendeeCount)
        .slice(0, 5)
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (role !== 'admin') {
        setLoading(false);
        return;
      }
      setLoading(true);
      load();
    }, [role, load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filteredProfiles = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return profiles;
    return profiles.filter(
      (profile) =>
        profile.email.toLowerCase().includes(search) ||
        (profile.full_name ?? '').toLowerCase().includes(search)
    );
  }, [profiles, query]);

  const openRole = (profile: Profile) => {
    if (profile.id === user?.id) {
      Alert.alert(
        'Not allowed',
        'You cannot change your own administrator role while signed in.'
      );
      return;
    }
    setRoleTarget(profile);
    setPendingRole(profile.role);
  };

  const saveRole = async () => {
    if (!roleTarget) return;
    setSaving(true);
    const { error: updateError } = await updateProfileRole(
      roleTarget.id,
      pendingRole
    );
    setSaving(false);
    if (updateError) {
      Alert.alert('Could not update role', updateError);
      return;
    }
    setRoleTarget(null);
    await load();
  };

  const openAttendanceStatus = (row: AdminAttendanceRow) => {
    setAttendanceTarget(row);
    setPendingStatus(row.status);
  };

  const saveAttendanceStatus = async () => {
    if (!attendanceTarget) return;
    setSaving(true);
    const { error: updateError } = await updateAttendanceStatus(
      attendanceTarget.id,
      pendingStatus
    );
    setSaving(false);
    if (updateError) {
      Alert.alert('Could not update attendance', updateError);
      return;
    }
    setAttendanceTarget(null);
    await load();
  };

  const confirmCloseEvent = (event: AdminEventRow) => {
    Alert.alert(
      'Close event',
      `Stop accepting check-ins for "${event.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Event',
          style: 'destructive',
          onPress: async () => {
            const { error: closeError } = await closeEvent(event.id);
            if (closeError) {
              Alert.alert('Could not close event', closeError);
              return;
            }
            await load();
          },
        },
      ]
    );
  };

  if (role !== null && role !== 'admin') {
    return (
      <AppBackground>
        <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
          <View style={styles.lockIcon}>
            <Ionicons
              name="shield-outline"
              size={32}
              color={COLORS.violet}
            />
          </View>
          <Text style={styles.lockTitle}>Administrator access</Text>
          <Text style={styles.muted}>
            This dashboard is limited to campus administrators. Ask an admin to
            update your role if you need access.
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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.violet}
              colors={[COLORS.violet]}
              progressBackgroundColor={COLORS.card}
            />
          }
        >
          <FadeIn>
            <ScreenHeader
              eyebrow="Administration"
              title="Campus control"
              subtitle="Users, events, and attendance from one source of truth."
              right={
                <Badge label="Admin" tone="violet" icon="shield-checkmark" />
              }
            />
          </FadeIn>

          <FadeIn delay={50}>
            <View style={styles.tabBar}>
              {TABS.map((item) => {
                const active = tab === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => setTab(item.value)}
                    style={({ pressed }) => [
                      styles.tab,
                      active && styles.tabActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={15}
                      color={active ? COLORS.textOnPrimary : COLORS.muted}
                    />
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FadeIn>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.violet} />
              <Text style={styles.muted}>Loading campus data...</Text>
            </View>
          ) : (
            <>
              {error ? (
                <View style={styles.errorBanner}>
                  <Ionicons
                    name="cloud-offline-outline"
                    size={18}
                    color={COLORS.danger}
                  />
                  <Text style={styles.errorText}>
                    Some statistics could not be loaded. Pull to refresh.
                  </Text>
                </View>
              ) : null}

              {tab === 'overview' && overview ? (
                <>
                  <FadeIn delay={80}>
                    <Card style={styles.hero} glow={COLORS.violet}>
                      <Ionicons
                        name="shield-checkmark"
                        size={160}
                        color={COLORS.violet}
                        style={styles.heroWatermark}
                      />
                      <Badge
                        label="Live campus data"
                        tone="success"
                        icon="pulse-outline"
                      />
                      <Text style={styles.heroTitle}>
                        Attendance operations, simplified.
                      </Text>
                      <Text style={styles.heroText}>
                        Monitor participation, keep records accurate, and manage
                        every account and session from one dashboard.
                      </Text>
                      <View style={styles.rateBlock}>
                        <View style={styles.rateRow}>
                          <Text style={styles.rateLabel}>
                            Overall attendance rate
                          </Text>
                          <Text style={styles.rateValue}>
                            {overview.attendanceRate}%
                          </Text>
                        </View>
                        <View style={styles.rateTrack}>
                          <View
                            style={[
                              styles.rateFill,
                              { width: `${overview.attendanceRate}%` },
                            ]}
                          />
                        </View>
                        <View style={styles.statusRow}>
                          <Badge
                            label={`${overview.present} present`}
                            tone="success"
                          />
                          <Badge label={`${overview.late} late`} tone="warning" />
                          <Badge
                            label={`${overview.absent} absent`}
                            tone="danger"
                          />
                        </View>
                      </View>
                    </Card>
                  </FadeIn>

                  <FadeIn delay={130}>
                    <View style={styles.statsRow}>
                      <StatCard
                        icon="people-outline"
                        value={overview.totalStudents}
                        label="Students"
                        accent={COLORS.primary}
                      />
                      <StatCard
                        icon="easel-outline"
                        value={overview.totalTeachers}
                        label="Teachers"
                        accent={COLORS.violet}
                      />
                      <StatCard
                        icon="shield-outline"
                        value={overview.totalAdmins}
                        label="Admins"
                        accent={COLORS.magenta}
                      />
                    </View>
                    <View style={styles.statsRow}>
                      <StatCard
                        icon="calendar-outline"
                        value={overview.totalEvents}
                        label="Events"
                        accent={COLORS.primary}
                      />
                      <StatCard
                        icon="radio-outline"
                        value={overview.activeEvents}
                        label="Live now"
                        accent={COLORS.success}
                      />
                      <StatCard
                        icon="checkmark-done-outline"
                        value={overview.totalAttendance}
                        label="Check-ins"
                        accent={COLORS.warning}
                      />
                    </View>
                  </FadeIn>

                  <FadeIn delay={180}>
                    <SectionHeader
                      title="Management"
                      caption="Jump into a workspace"
                    />
                    <View style={styles.quickGrid}>
                      <Pressable
                        onPress={() => setTab('users')}
                        style={({ pressed }) => [
                          styles.quickCard,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="people-circle-outline"
                          size={22}
                          color={COLORS.primary}
                        />
                        <Text style={styles.quickTitle}>Manage users</Text>
                        <Text style={styles.quickCaption}>Roles & accounts</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTab('events')}
                        style={({ pressed }) => [
                          styles.quickCard,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="calendar-number-outline"
                          size={22}
                          color={COLORS.violet}
                        />
                        <Text style={styles.quickTitle}>Manage events</Text>
                        <Text style={styles.quickCaption}>Sessions & QR</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTab('attendance')}
                        style={({ pressed }) => [
                          styles.quickCard,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Ionicons
                          name="clipboard-outline"
                          size={22}
                          color={COLORS.success}
                        />
                        <Text style={styles.quickTitle}>Review records</Text>
                        <Text style={styles.quickCaption}>Correct status</Text>
                      </Pressable>
                    </View>
                  </FadeIn>

                  <FadeIn delay={230}>
                    <SectionHeader
                      title="Top sessions"
                      caption="Highest check-in volume"
                      actionLabel="All events"
                      onAction={() => setTab('events')}
                    />
                    {topEvents.length === 0 ? (
                      <Card style={styles.emptyCard}>
                        <Ionicons
                          name="bar-chart-outline"
                          size={20}
                          color={COLORS.muted}
                        />
                        <Text style={styles.emptyText}>
                          Rankings appear after students check in.
                        </Text>
                      </Card>
                    ) : (
                      <View style={styles.list}>
                        {topEvents.map((event, index) => (
                          <Card key={event.id} style={styles.rowCard}>
                            <View style={styles.rank}>
                              <Text style={styles.rankText}>{index + 1}</Text>
                            </View>
                            <View style={styles.rowBody}>
                              <Text
                                style={styles.rowTitle}
                                numberOfLines={1}
                              >
                                {event.title}
                              </Text>
                              <Text style={styles.mono} numberOfLines={1}>
                                {event.event_code}
                              </Text>
                            </View>
                            <Badge
                              label={`${event.attendeeCount}`}
                              tone="success"
                              icon="people-outline"
                            />
                          </Card>
                        ))}
                      </View>
                    )}
                  </FadeIn>
                </>
              ) : null}

              {tab === 'users' ? (
                <>
                  <FadeIn delay={80}>
                    <View style={styles.searchBox}>
                      <Ionicons
                        name="search-outline"
                        size={18}
                        color={COLORS.muted}
                      />
                      <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search name or email"
                        placeholderTextColor={COLORS.muted}
                        selectionColor={COLORS.primary}
                        style={styles.searchInput}
                        autoCapitalize="none"
                      />
                    </View>
                  </FadeIn>

                  <SectionHeader
                    title="Accounts"
                    caption={`${filteredProfiles.length} of ${profiles.length} users`}
                  />

                  {filteredProfiles.length === 0 ? (
                    <EmptyState
                      icon="people-outline"
                      title="No accounts found"
                      message="Try a different name or email search."
                    />
                  ) : (
                    <View style={styles.list}>
                      {filteredProfiles.map((profile) => (
                        <Card key={profile.id} style={styles.userCard}>
                          <View style={styles.userTop}>
                            <Avatar
                              name={profile.full_name}
                              email={profile.email}
                              size={42}
                              color={
                                profile.role === 'admin'
                                  ? COLORS.violet
                                  : profile.role === 'teacher'
                                    ? COLORS.primary
                                    : COLORS.success
                              }
                            />
                            <View style={styles.rowBody}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {profile.full_name || 'Unnamed user'}
                              </Text>
                              <Text style={styles.mono} numberOfLines={1}>
                                {profile.email}
                              </Text>
                            </View>
                            <Badge
                              label={profile.role}
                              tone={roleTone(profile.role)}
                            />
                          </View>
                          <View style={styles.userFooter}>
                            <Text style={styles.smallMuted}>
                              {profile.created_at
                                ? `Joined ${new Date(
                                    profile.created_at
                                  ).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}`
                                : 'Join date unavailable'}
                            </Text>
                            <Pressable
                              onPress={() => openRole(profile)}
                              style={({ pressed }) => [
                                styles.miniButton,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons
                                name="key-outline"
                                size={14}
                                color={COLORS.primary}
                              />
                              <Text style={styles.miniButtonText}>
                                Change role
                              </Text>
                            </Pressable>
                          </View>
                        </Card>
                      ))}
                    </View>
                  )}
                </>
              ) : null}

              {tab === 'events' ? (
                <>
                  <SectionHeader
                    title="All sessions"
                    caption={`${events.length} events`}
                    actionLabel="Open console"
                    onAction={() => router.push('/teacher')}
                  />
                  {events.length === 0 ? (
                    <EmptyState
                      icon="calendar-outline"
                      title="No events yet"
                      message="Events created by teachers will appear here for oversight."
                      actionLabel="Open Events Console"
                      onAction={() => router.push('/teacher')}
                    />
                  ) : (
                    <View style={styles.list}>
                      {events.map((event) => (
                        <Card key={event.id} style={styles.eventCard}>
                          <View style={styles.eventTop}>
                            <View style={styles.eventIcon}>
                              <Ionicons
                                name="calendar-outline"
                                size={18}
                                color={COLORS.violet}
                              />
                            </View>
                            <View style={styles.rowBody}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {event.title}
                              </Text>
                              <Text style={styles.mono} numberOfLines={1}>
                                {event.event_code}
                              </Text>
                            </View>
                            <StatusBadge status={event.derivedStatus} />
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
                                {formatWhen(event.start_time)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.eventFooter}>
                            <Badge
                              label={`${event.attendeeCount} check-ins`}
                              tone={
                                event.attendeeCount > 0 ? 'success' : 'neutral'
                              }
                              icon="people-outline"
                            />
                            <View style={styles.eventActions}>
                              <Pressable
                                onPress={() => router.push('/teacher')}
                                style={({ pressed }) => [
                                  styles.miniButton,
                                  pressed && styles.pressed,
                                ]}
                              >
                                <Ionicons
                                  name="open-outline"
                                  size={14}
                                  color={COLORS.primary}
                                />
                                <Text style={styles.miniButtonText}>Console</Text>
                              </Pressable>
                              {event.derivedStatus !== 'closed' ? (
                                <Pressable
                                  onPress={() => confirmCloseEvent(event)}
                                  style={({ pressed }) => [
                                    styles.miniButtonDanger,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Ionicons
                                    name="lock-closed-outline"
                                    size={14}
                                    color={COLORS.danger}
                                  />
                                  <Text style={styles.miniButtonDangerText}>
                                    Close
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        </Card>
                      ))}
                    </View>
                  )}
                </>
              ) : null}

              {tab === 'attendance' ? (
                <>
                  <SectionHeader
                    title="Recent records"
                    caption={`${attendance.length} latest check-ins`}
                  />
                  {attendance.length === 0 ? (
                    <EmptyState
                      icon="clipboard-outline"
                      title="No attendance records"
                      message="Student check-ins will appear here for review and correction."
                    />
                  ) : (
                    <View style={styles.list}>
                      {attendance.map((row) => (
                        <Card key={row.id} style={styles.attendanceCard}>
                          <View style={styles.attendanceTop}>
                            <View style={styles.rowBody}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {row.studentName || row.studentEmail || 'Student'}
                              </Text>
                              <Text style={styles.smallMuted} numberOfLines={1}>
                                {row.eventTitle}
                              </Text>
                            </View>
                            <StatusBadge status={row.status} />
                          </View>
                          <View style={styles.attendanceFooter}>
                            <Text style={styles.monoSmall} numberOfLines={1}>
                              {formatWhen(row.scannedAt)}
                            </Text>
                            <Pressable
                              onPress={() => openAttendanceStatus(row)}
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
                              <Text style={styles.miniButtonText}>Manage</Text>
                            </Pressable>
                          </View>
                        </Card>
                      ))}
                    </View>
                  )}
                </>
              ) : null}
            </>
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={roleTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleTarget(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setRoleTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>Access control</Text>
                <Text style={styles.sheetTitle}>Change role</Text>
              </View>
              <Pressable onPress={() => setRoleTarget(null)} hitSlop={10}>
                <Ionicons
                  name="close"
                  size={22}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              {roleTarget?.full_name || roleTarget?.email}
            </Text>
            <View style={styles.optionList}>
              {ROLE_OPTIONS.map((option) => {
                const active = pendingRole === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPendingRole(option)}
                    style={[
                      styles.option,
                      active && styles.optionActive,
                    ]}
                  >
                    <Ionicons
                      name={
                        option === 'admin'
                          ? 'shield-outline'
                          : option === 'teacher'
                            ? 'easel-outline'
                            : 'school-outline'
                      }
                      size={19}
                      color={active ? COLORS.primary : COLORS.muted}
                    />
                    <View style={styles.rowBody}>
                      <Text style={styles.optionTitle}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </Text>
                      <Text style={styles.smallMuted}>
                        {option === 'admin'
                          ? 'Full campus oversight'
                          : option === 'teacher'
                            ? 'Create and manage events'
                            : 'Scan and view attendance'}
                      </Text>
                    </View>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={19}
                        color={COLORS.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <AppButton
              variant="primary"
              title="Save Role"
              icon="checkmark-outline"
              onPress={saveRole}
              loading={saving}
            />
          </Pressable>
        </Pressable>
      </Modal>

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
              <View>
                <Text style={styles.sheetEyebrow}>Attendance record</Text>
                <Text style={styles.sheetTitle}>Correct status</Text>
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
            <Text style={styles.sheetSub}>
              {attendanceTarget?.studentName || attendanceTarget?.studentEmail}{' '}
              · {attendanceTarget?.eventTitle}
            </Text>
            <View style={styles.optionList}>
              {STATUS_OPTIONS.map((option) => {
                const active = pendingStatus === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPendingStatus(option)}
                    style={[
                      styles.option,
                      active && styles.optionActive,
                    ]}
                  >
                    <StatusBadge status={option} />
                    <Text style={styles.optionTitle}>
                      Mark as {option}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={19}
                        color={COLORS.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <AppButton
              variant="primary"
              title="Save Status"
              icon="checkmark-outline"
              onPress={saveAttendanceStatus}
              loading={saving}
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
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#8B5CF640',
    marginBottom: SPACING.sm,
  },
  lockTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  muted: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  lockAction: {
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 5,
    padding: 5,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.muted,
  },
  tabTextActive: {
    color: COLORS.textOnPrimary,
  },
  pressed: {
    opacity: 0.75,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.huge,
    gap: SPACING.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#FB718514',
    borderWidth: 1,
    borderColor: '#FB718540',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '600',
  },
  hero: {
    overflow: 'hidden',
    gap: SPACING.sm,
    paddingVertical: SPACING.xl,
  },
  heroWatermark: {
    position: 'absolute',
    right: -38,
    bottom: -44,
    opacity: 0.06,
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
    maxWidth: 290,
  },
  heroText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    maxWidth: 310,
  },
  rateBlock: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: SPACING.sm,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rateValue: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  rateTrack: {
    height: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.cardAlt,
    overflow: 'hidden',
  },
  rateFill: {
    height: '100%',
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  quickCard: {
    flex: 1,
    minWidth: 0,
    gap: 5,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  quickTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  quickCaption: {
    fontSize: 9,
    color: COLORS.muted,
  },
  list: {
    gap: SPACING.sm,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF61F',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.violet,
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
  smallMuted: {
    fontSize: 10,
    color: COLORS.muted,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: SPACING.sm,
  },
  userCard: {
    gap: SPACING.md,
  },
  userTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  userFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    paddingTop: SPACING.sm,
  },
  miniButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#22D3EE33',
    backgroundColor: '#22D3EE0F',
  },
  miniButtonText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  miniButtonDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: '#FB718533',
    backgroundColor: '#FB71850F',
  },
  miniButtonDangerText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.danger,
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
    backgroundColor: '#8B5CF614',
    borderWidth: 1,
    borderColor: '#8B5CF640',
  },
  eventMeta: {
    gap: 5,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    paddingTop: SPACING.sm,
  },
  eventActions: {
    flexDirection: 'row',
    gap: 6,
  },
  attendanceCard: {
    gap: SPACING.sm,
  },
  attendanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  attendanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    paddingTop: SPACING.sm,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#03060CCC',
    justifyContent: 'flex-end',
  },
  sheet: {
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
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  sheetSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  optionList: {
    gap: SPACING.sm,
    marginVertical: SPACING.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  optionActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#22D3EE10',
  },
  optionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textTransform: 'capitalize',
  },
  bottomSpace: {
    height: 120,
  },
});
