import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import AppBackground from '@/components/ui/AppBackground';
import AppButton from '@/components/AppButton';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import FadeIn from '@/components/ui/FadeIn';
import ScreenHeader from '@/components/ui/ScreenHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { COLORS } from '@/constants/colors';
import { FONT_MONO, RADIUS, SPACING } from '@/constants/theme';
import { useProfile } from '@/components/ProfileProvider';
import {
  deriveEventStatus,
  getAvailableEvents,
  type CloudEvent,
} from '@/lib/events';

function formatDate(value: string | null) {
  if (!value) return 'Date to be announced';
  return new Date(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AvailableEventsScreen() {
  const router = useRouter();
  const { role } = useProfile();
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const next = await getAvailableEvents();
    setEvents(next);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const header = (
    <FadeIn>
      <Pressable
        onPress={() => router.replace('/(tabs)')}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons name="arrow-back" size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Back to Home</Text>
      </Pressable>
      <ScreenHeader
        eyebrow="Discover"
        title="Available events"
        subtitle="Open sessions you can check into right now."
        right={
          <Badge
            label={`${events.length}`}
            tone="info"
            icon="calendar-outline"
          />
        }
      />
    </FadeIn>
  );

  if (role !== null && role !== 'student') {
    return (
      <AppBackground>
        <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
          <View style={styles.lockIcon}>
            <Ionicons
              name="people-outline"
              size={30}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.lockTitle}>Student view</Text>
          <Text style={styles.muted}>
            Available events are shown to students. Staff manage sessions from
            the Events console.
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

  if (loading) {
    return (
      <AppBackground>
        <SafeAreaView style={styles.centered} edges={['top', 'bottom']}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.muted}>Loading available events...</Text>
        </SafeAreaView>
      </AppBackground>
    );
  }

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-clear-outline"
              title="No open events"
              message="There are no upcoming or active events right now. Check back after your teacher publishes a session."
            />
          }
          renderItem={({ item, index }) => {
            const status = deriveEventStatus(item);
            const isLive = status === 'active';
            return (
              <FadeIn delay={Math.min(index * 45, 240)}>
                <Card style={styles.eventCard}>
                  <View style={styles.eventTop}>
                    <View style={styles.eventIcon}>
                      <Ionicons
                        name={isLive ? 'radio' : 'calendar-outline'}
                        size={20}
                        color={isLive ? COLORS.success : COLORS.primary}
                      />
                    </View>
                    <View style={styles.eventBody}>
                      <Text style={styles.eventTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.eventCode}>{item.event_code}</Text>
                    </View>
                    <StatusBadge status={status} />
                  </View>

                  {item.description ? (
                    <Text style={styles.description} numberOfLines={3}>
                      {item.description}
                    </Text>
                  ) : null}

                  <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="location-outline"
                        size={15}
                        color={COLORS.muted}
                      />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {item.venue || 'Venue to be announced'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color={COLORS.muted}
                      />
                      <Text style={styles.metaText}>
                        {formatDate(item.start_time)}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color={COLORS.muted}
                      />
                      <Text style={styles.metaText}>
                        {formatTime(item.start_time)} –{' '}
                        {formatTime(item.end_time)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.action}>
                    <AppButton
                      variant={isLive ? 'primary' : 'secondary'}
                      title={isLive ? 'Scan to check in' : 'Not open yet'}
                      icon={isLive ? 'scan-outline' : 'hourglass-outline'}
                      onPress={() => router.push('/scan')}
                      disabled={!isLive}
                      compact
                    />
                  </View>
                </Card>
              </FadeIn>
            );
          }}
          ListFooterComponent={<View style={styles.bottomSpace} />}
        />
      </SafeAreaView>
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  backText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
    gap: SPACING.sm,
  },
  muted: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
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
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  lockAction: {
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
  },
  eventCard: {
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  eventIcon: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
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
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  eventCode: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontFamily: FONT_MONO,
    letterSpacing: 0.7,
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  metaGrid: {
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  metaText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  action: {
    marginTop: SPACING.xs,
  },
  bottomSpace: {
    height: 120,
  },
});
