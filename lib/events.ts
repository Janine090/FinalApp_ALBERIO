import { supabase } from './supabase';

export type EventStatus = 'upcoming' | 'active' | 'closed';

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  venue?: string;
  description?: string;
  status?: EventStatus;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  venue: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
};

export type EventUpdates = {
  title?: string;
  venue?: string | null;
  description?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: EventStatus;
};

export function deriveEventStatus(event: {
  status?: EventStatus | null;
  start_time?: string | null;
  end_time?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): EventStatus {
  if (event.status === 'closed') return 'closed';
  const start = event.start_time ?? event.startTime;
  const end = event.end_time ?? event.endTime;
  const now = Date.now();
  if (start && now < new Date(start).getTime()) {
    return 'upcoming';
  }
  if (end && now > new Date(end).getTime()) {
    return 'closed';
  }
  return 'active';
}

export async function createEvent(
  event: Event
): Promise<{ data: CloudEvent | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const status =
    event.status ??
    deriveEventStatus({ start_time: event.start, end_time: event.end });

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_code: event.eventId,
      title: event.title,
      venue: event.venue?.trim() || null,
      description: event.description?.trim() || null,
      start_time: event.start || null,
      end_time: event.end || null,
      status,
      created_by: user?.id ?? null,
    })
    .select('*')
    .maybeSingle();

  return {
    data: (data as CloudEvent | null) ?? null,
    error:
      error?.code === '23505'
        ? 'That event code is already in use. Please try again.'
        : (error?.message ?? null),
  };
}

export async function updateEvent(
  eventId: string,
  updates: EventUpdates
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', eventId);

  return { error: error?.message ?? null };
}

export async function closeEvent(
  eventId: string
): Promise<{ error: string | null }> {
  return updateEvent(eventId, { status: 'closed' });
}

export async function getEventsByTeacher(
  teacherId: string
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as CloudEvent[];
}

export async function getAllEvents(limit = 100): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as CloudEvent[];
}

export async function getAvailableEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .neq('status', 'closed')
    .order('start_time', { ascending: true });

  if (error || !data) return [];

  return (data as CloudEvent[]).filter(
    (event) => deriveEventStatus(event) !== 'closed'
  );
}

export async function getEventByCode(
  code: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('event_code', code)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CloudEvent;
}

export async function getEventById(
  id: string
): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return data as CloudEvent;
}
