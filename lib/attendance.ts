import { supabase } from './supabase';
import { parseQRPayload } from './qr';
import {
  deriveEventStatus,
  getEventByCode,
  type EventStatus,
} from './events';

export type AttendanceStatus = 'present' | 'late' | 'absent';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventVenue: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventStatus: EventStatus;
  status: AttendanceStatus;
  scannedAt: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
  status?: AttendanceStatus;
};

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  venue: string | null;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  status: EventStatus;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string | null;
    status: AttendanceStatus;
    scannedAt: string;
  }[];
};

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  status: EventStatus;
  attendeeCount: number;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);
  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }
  const payload = parsed.payload;

  const event = await getEventByCode(payload.event);
  if (!event) {
    return {
      success: false,
      message: 'This QR code is invalid or no longer available.',
    };
  }

  if (event.status === 'closed') {
    return {
      success: false,
      message: 'This event is already closed.',
      eventTitle: event.title,
    };
  }

  const start = event.start_time
    ? new Date(event.start_time).getTime()
    : payload.start
      ? new Date(payload.start).getTime()
      : null;
  const end = event.end_time
    ? new Date(event.end_time).getTime()
    : payload.end
      ? new Date(payload.end).getTime()
      : null;

  const now = Date.now();
  if (start && now < start) {
    return {
      success: false,
      message: 'This event has not started yet.',
      eventTitle: event.title,
    };
  }
  if (end && now > end) {
    return {
      success: false,
      message: 'This event is already closed.',
      eventTitle: event.title,
    };
  }

  const { data: inserted, error: attError } = await supabase
    .from('attendance')
    .insert([
      {
        student_id: studentId,
        event_id: event.id,
        status: 'present',
      },
    ])
    .select('status')
    .single();

  if (attError) {
    if (attError.code === '23505') {
      return {
        success: false,
        message: 'You have already recorded attendance for this event.',
        eventTitle: event.title,
      };
    }
    if (attError.code === '42501') {
      return {
        success: false,
        message: 'This event is closed or no longer accepting attendance.',
        eventTitle: event.title,
      };
    }
    return { success: false, message: attError.message, eventTitle: event.title };
  }

  const status: AttendanceStatus =
    (inserted?.status as AttendanceStatus) === 'late' ? 'late' : 'present';

  return {
    success: true,
    message:
      status === 'late'
        ? 'Attendance recorded as late.'
        : 'Attendance recorded successfully!',
    eventTitle: event.title,
    status,
  };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(
      'id, scanned_at, status, events ( event_code, title, venue, start_time, end_time, status )'
    )
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    eventVenue: row.events?.venue ?? null,
    eventStart: row.events?.start_time ?? null,
    eventEnd: row.events?.end_time ?? null,
    eventStatus: deriveEventStatus(row.events ?? {}),
    status: (row.status ?? 'present') as AttendanceStatus,
    scannedAt: row.scanned_at,
  }));
}

export async function getTeacherEventAttendance(
  teacherId: string,
  allEvents = false
): Promise<TeacherEventAttendance[]> {
  let query = supabase
    .from('events')
    .select(
      'id, event_code, title, venue, description, start_time, end_time, status'
    )
    .order('created_at', { ascending: false });

  if (!allEvents) {
    query = query.eq('created_by', teacherId);
  }

  const { data: events, error: eventError } = await query;
  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attendance, error: attError } = await supabase
    .from('attendance')
    .select('student_id, scanned_at, event_id, status')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attError || !attendance) {
    return events.map((e: any) => mapEventWithAttendees(e, []));
  }

  const studentIds = [
    ...new Set((attendance as any[]).map((a: any) => a.student_id)),
  ];
  const nameMap: Record<string, string | null> = {};
  if (studentIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);
    ((profs as any[] | null) ?? []).forEach((p: any) => {
      nameMap[p.id] = p.full_name ?? null;
    });
  }

  return events.map((e: any) =>
    mapEventWithAttendees(
      e,
      (attendance as any[]).filter((a: any) => a.event_id === e.id),
      nameMap
    )
  );
}

function mapEventWithAttendees(
  event: any,
  rows: any[],
  nameMap: Record<string, string | null> = {}
): TeacherEventAttendance {
  return {
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    venue: event.venue ?? null,
    description: event.description ?? null,
    startTime: event.start_time,
    endTime: event.end_time,
    status: deriveEventStatus(event),
    attendeeCount: rows.length,
    attendees: rows.map((a: any) => ({
      studentId: a.student_id,
      studentName: nameMap[a.student_id] ?? null,
      status: (a.status ?? 'present') as AttendanceStatus,
      scannedAt: a.scanned_at,
    })),
  };
}

export async function getTeacherEventSummary(
  teacherId: string,
  allEvents = false
): Promise<TeacherEventSummary[]> {
  let query = supabase
    .from('events')
    .select('id, event_code, title, status, start_time, end_time')
    .order('created_at', { ascending: false });

  if (!allEvents) {
    query = query.eq('created_by', teacherId);
  }

  const { data: events, error: eventError } = await query;
  if (eventError || !events) return [];

  const eventIds = events.map((e: any) => e.id);
  if (eventIds.length === 0) return [];

  const { data: attRows, error: attError } = await supabase
    .from('attendance')
    .select('event_id')
    .in('event_id', eventIds);

  if (attError || !attRows) {
    return events.map((e: any) => ({
      eventId: e.id,
      eventCode: e.event_code,
      title: e.title,
      status: deriveEventStatus(e),
      attendeeCount: 0,
    }));
  }

  const counts: Record<string, number> = {};
  (attRows as any[]).forEach((r: any) => {
    counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  });

  return events.map((e: any) => ({
    eventId: e.id,
    eventCode: e.event_code,
    title: e.title,
    status: deriveEventStatus(e),
    attendeeCount: counts[e.id] ?? 0,
  }));
}
