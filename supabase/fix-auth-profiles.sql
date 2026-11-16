-- ============================================================
-- QR-ATT - registration / profile / RLS repair
--
-- Run this whole file in Supabase Dashboard -> SQL Editor.
-- It is idempotent and does not delete users, profiles, events,
-- or attendance records. It does not disable RLS.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Profiles table
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'admin'));

update public.profiles
set email = ''
where email is null;

alter table public.profiles alter column email set not null;

-- ------------------------------------------------------------
-- 2. Role helper functions (avoid recursive RLS evaluation)
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
-- 3. Row Level Security (RLS stays enabled)
-- ------------------------------------------------------------

alter table public.profiles enable row level security;

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
  using (auth.uid() = id)
  with check (auth.uid() = id);

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

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 4. Role protection trigger
-- ------------------------------------------------------------

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
-- 5. Auto-create profile on signup
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
    coalesce(new.email, ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
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
-- 6. Backfill profiles for existing auth users (no deletions)
-- ------------------------------------------------------------

insert into public.profiles (id, email, full_name, role)
select
  u.id,
  coalesce(u.email, ''),
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  case
    when u.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher'
    else 'student'
  end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;
