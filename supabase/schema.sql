-- ============================================================
-- QR-ATT - Supabase PostgreSQL schema
--
-- Roles: student, teacher, administratorw
-- Tables: profiles, events, attendance
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Paste the ENTIRE file
--   3. Click "Run"
--   4. Verify the tables and policies in the dashboard
--
-- This script is IDEMPOTENT and safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  venue text,
  description text,
  start_time timestamptz,
  end_time timestamptz,
  status text not null default 'active'
    check (status in ('upcoming', 'active', 'closed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'present'
    check (status in ('present', 'late', 'absent')),
  scanned_at timestamptz not null default now(),
  unique (student_id, event_id)
);

-- ------------------------------------------------------------
-- 2. MIGRATIONS FOR EXISTING PROJECTS
-- ------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

alter table public.events add column if not exists venue text;
alter table public.events add column if not exists description text;
alter table public.events add column if not exists status text not null default 'active';
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('upcoming', 'active', 'closed'));

alter table public.attendance add column if not exists status text not null default 'present';
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'late', 'absent'));

-- Bring old event rows in line with their schedule without reopening
-- events a teacher already closed manually.
update public.events
set status = case
  when start_time is not null and now() < start_time then 'upcoming'
  when end_time is not null and now() > end_time then 'closed'
  else 'active'
end
where status <> 'closed';

create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists events_status_idx on public.events (status);
create index if not exists attendance_event_id_idx on public.attendance (event_id);
create index if not exists attendance_student_id_idx on public.attendance (student_id);

-- ------------------------------------------------------------
-- 3. ROLE HELPERS
-- SECURITY DEFINER avoids recursive RLS evaluation.
-- ------------------------------------------------------------

create or replace function public.is_student(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'student'
  );
$$;

create or replace function public.is_teacher(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'teacher'
  );
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$$;

create or replace function public.is_staff(uid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role in ('teacher', 'admin')
  );
$$;

revoke all on function public.is_student(uuid) from public;
revoke all on function public.is_teacher(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_staff(uuid) from public;
grant execute on function public.is_student(uuid) to authenticated;
grant execute on function public.is_teacher(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_staff(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- Profiles
drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin(auth.uid()));

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Admins can update all profiles" on public.profiles;
create policy "Admins can update all profiles"
  on public.profiles for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Teachers can view profiles of their attendees" on public.profiles;
create policy "Teachers can view profiles of their attendees"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.attendance a
      join public.events e on e.id = a.event_id
      where a.student_id = profiles.id
        and e.created_by = auth.uid()
    )
  );

-- Events
drop policy if exists "Events are readable by any authenticated user" on public.events;
create policy "Events are readable by any authenticated user"
  on public.events for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can insert events" on public.events;
drop policy if exists "Teachers can insert events" on public.events;
drop policy if exists "Staff can insert events" on public.events;
create policy "Staff can insert events"
  on public.events for insert
  with check (
    auth.uid() = created_by
    and public.is_staff(auth.uid())
  );

drop policy if exists "Users can update their own events" on public.events;
drop policy if exists "Staff can update events" on public.events;
create policy "Staff can update events"
  on public.events for update
  using (public.is_admin(auth.uid()) or auth.uid() = created_by)
  with check (public.is_admin(auth.uid()) or auth.uid() = created_by);

drop policy if exists "Staff can delete events" on public.events;
create policy "Staff can delete events"
  on public.events for delete
  using (public.is_admin(auth.uid()) or auth.uid() = created_by);

-- Attendance
drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance"
  on public.attendance for select
  using (auth.uid() = student_id);

drop policy if exists "Teachers can view attendance for their events" on public.attendance;
create policy "Teachers can view attendance for their events"
  on public.attendance for select
  using (
    exists (
      select 1 from public.events e
      where e.id = attendance.event_id
        and e.created_by = auth.uid()
    )
  );

drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance"
  on public.attendance for select
  using (public.is_admin(auth.uid()));

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance"
  on public.attendance for insert
  with check (
    auth.uid() = student_id
    and status = 'present'
    and public.is_student(auth.uid())
    and exists (
      select 1
      from public.events e
      where e.id = attendance.event_id
        and e.status <> 'closed'
        and (e.start_time is null or now() >= e.start_time)
        and (e.end_time is null or now() <= e.end_time)
    )
  );

drop policy if exists "Admins can insert attendance" on public.attendance;
create policy "Admins can insert attendance"
  on public.attendance for insert
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update attendance" on public.attendance;
create policy "Admins can update attendance"
  on public.attendance for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete attendance" on public.attendance;
create policy "Admins can delete attendance"
  on public.attendance for delete
  using (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- 5. TRIGGERS
-- ------------------------------------------------------------

-- Attendance status is derived server-side. A student cannot send
-- "present" for an event that started more than 15 minutes ago.
create or replace function public.set_attendance_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  event_start timestamptz;
begin
  new.scanned_at := coalesce(new.scanned_at, now());
  select start_time into event_start
  from public.events
  where id = new.event_id;

  if new.status is null then
    new.status := 'present';
  end if;

  if new.status = 'present'
     and event_start is not null
     and new.scanned_at > event_start + interval '15 minutes' then
    new.status := 'late';
  end if;

  return new;
end;
$$;

drop trigger if exists set_attendance_status on public.attendance;
create trigger set_attendance_status
  before insert on public.attendance
  for each row execute procedure public.set_attendance_status();

-- Prevent a signed-in user from promoting themselves. Admin role
-- changes are allowed through the admin policy. SQL Editor/service
-- role operations have no auth.uid() and remain allowed.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  signup_role text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      select coalesce(raw_user_meta_data ->> 'role', 'student')
      into signup_role
      from auth.users
      where id = new.id;

      if signup_role is distinct from 'teacher' then
        signup_role := 'student';
      end if;

      new.role := signup_role;
    end if;
  elsif new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin(auth.uid()) then
      select coalesce(raw_user_meta_data ->> 'role', 'student')
      into signup_role
      from auth.users
      where id = new.id;

      if not (
        auth.uid() = new.id
        and old.role = 'student'
        and new.role = 'teacher'
        and signup_role = 'teacher'
      ) then
        raise exception 'Only administrators can change user roles';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before insert or update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ------------------------------------------------------------
-- 6. AUTO-PROFILE TRIGGER
-- Administrator is intentionally NOT a public signup role.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    case
      when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher'
      else 'student'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 7. ADMIN BOOTSTRAP
--
-- Sign up a normal account first, then promote it from the SQL
-- Editor. Change the email below to your real admin email.
--
-- update public.profiles
-- set role = 'admin'
-- where email = 'admin@your-school.edu';
--
-- END OF SCHEMA
-- ------------------------------------------------------------
