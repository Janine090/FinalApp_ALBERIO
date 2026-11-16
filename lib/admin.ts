import { supabase } from './supabase';
import type { AttendanceStatus } from './attendance';
import {
  deriveEventStatus,
  getAllEvents,
  type CloudEvent,
  type EventStatus,
} from './events';
import { getAllProfiles, type Profile } from './profiles';

export type AdminOverview = {
  totalStudents: number;
  totalTeachers: number;
  totalAdmins: number;
  totalEvents: number;
  activeEvents: number;
  totalAttendance: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number;
};

export type AdminAttendanceRow = {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  eventTitle: string;
  eventCode: string;
  status: AttendanceStatus;
  scannedAt: string;
};

export type AdminEventRow = CloudEvent & {
  attendeeCount: number;
  derivedStatus: EventStatus;
};

export async function getAdminOverview(): Promise<{
  data: AdminOverview | null;
  error: string | null;
}> {
  const [profilesResult, eventsResult, attendanceResult] = await Promise.all([
    supabase.from('profiles').select('id, role'),
    supabase.from('events').select('id, status, start_time, end_time'),
    supabase.from('attendance').select('id, status'),
  ]);

  const error =
    profilesResult.error?.message ??
    eventsResult.error?.message ??
    attendanceResult.error?.message ??
    null;

  if (error) {
    return { data: null, error };
  }

  const profiles = (profilesResult.data ?? []) as {
    id: string;
    role: string;
  }[];
  const events = (eventsResult.data ?? []) as {
    id: string;
    status: EventStatus;
    start_time: string | null;
    end_time: string | null;
  }[];
  const attendance = (attendanceResult.data ?? []) as {
    id: string;
    status: AttendanceStatus;
  }[];

  const totalStudents = profiles.filter((p) => p.role === 'student').length;
  const totalTeachers = profiles.filter((p) => p.role === 'teacher').length;
  const totalAdmins = profiles.filter((p) => p.role === 'admin').length;
  const activeEvents = events.filter(
    (event) => deriveEventStatus(event) === 'active'
  ).length;
  const present = attendance.filter((a) => a.status === 'present').length;
  const late = attendance.filter((a) => a.status === 'late').length;
  const absent = attendance.filter((a) => a.status === 'absent').length;
  const checkedIn = present + late;
  const possibleCheckIns = Math.max(1, totalStudents * events.length);

  return {
    data: {
      totalStudents,
      totalTeachers,
      totalAdmins,
      totalEvents: events.length,
      activeEvents,
      totalAttendance: checkedIn,
      present,
      late,
      absent,
      attendanceRate: Math.min(
        100,
        Math.round((checkedIn / possibleCheckIns) * 100)
      ),
    },
    error: null,
  };
}

export async function getAdminProfiles(): Promise<Profile[]> {
  return getAllProfiles();
}

export async function getAdminEvents(): Promise<AdminEventRow[]> {
  const [events, attendanceResult] = await Promise.all([
    getAllEvents(),
    supabase.from('attendance').select('event_id'),
  ]);

  const counts: Record<string, number> = {};
  ((attendanceResult.data ?? []) as { event_id: string }[]).forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((event) => ({
    ...event,
    derivedStatus: deriveEventStatus(event),
    attendeeCount: counts[event.id] ?? 0,
  }));
}

export async function getRecentAttendance(
  limit = 60
): Promise<AdminAttendanceRow[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(
      'id, student_id, scanned_at, status, events ( title, event_code )'
    )
    .order('scanned_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const rows = data as any[];
  const studentIds = [...new Set(rows.map((row) => row.student_id))];
  const profileMap: Record<string, { name: string | null; email: string | null }> =
    {};

  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', studentIds);
    ((profiles ?? []) as any[]).forEach((profile) => {
      profileMap[profile.id] = {
        name: profile.full_name ?? null,
        email: profile.email ?? null,
      };
    });
  }

  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: profileMap[row.student_id]?.name ?? null,
    studentEmail: profileMap[row.student_id]?.email ?? null,
    eventTitle: row.events?.title ?? 'Unknown event',
    eventCode: row.events?.event_code ?? '',
    status: (row.status ?? 'present') as AttendanceStatus,
    scannedAt: row.scanned_at,
  }));
}

export async function updateAttendanceStatus(
  attendanceId: string,
  status: AttendanceStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', attendanceId);

  return { error: error?.message ?? null };
}

export async function getMostAttendedEvents(
  limit = 5
): Promise<AdminEventRow[]> {
  const events = await getAdminEvents();
  return events
    .filter((event) => event.attendeeCount > 0)
    .sort((a, b) => b.attendeeCount - a.attendeeCount)
    .slice(0, limit);
}
