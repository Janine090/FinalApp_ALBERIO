import { useState, useEffect } from 'react';
import { supabase, supabaseConfigError, supabaseHost } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  revision: number;
};

let globalSession: Session | null = null;
let globalUser: User | null = null;
let globalLoading = true;
let globalRevision = 0;
let initialized = false;
let listeners: Set<() => void> = new Set();

function notify() {
  globalRevision += 1;
  listeners.forEach((l) => l());
}

function isDev() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function logAuthError(scope: string, error: unknown) {
  if (!isDev()) return;
  console.error(`[auth:${scope}]`, error);
}

function errorText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause;
    return [value.message, errorText(cause)].filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    const obj = value as {
      message?: unknown;
      error_description?: unknown;
      code?: unknown;
      name?: unknown;
      cause?: unknown;
    };
    const parts = [
      obj.message,
      obj.error_description,
      obj.code,
      obj.name,
      errorText(obj.cause),
    ].filter((part): part is string => typeof part === 'string' && !!part);
    return parts.join(' ');
  }
  return String(value);
}

const HOST_HINTS = [
  'enotfound',
  'eai_again',
  'getaddrinfo',
  'name not resolved',
  'nodename nor servname',
  'nxdomain',
  'unable to resolve host',
  'dns',
];

const NETWORK_HINTS = [
  'fetch failed',
  'failed to fetch',
  'network request failed',
  'connection reset',
  'socketexception',
  'econnreset',
  'etimedout',
  'timeout',
  'tls',
  'ssl',
  'network error',
];

export function isNetworkError(message?: string | null) {
  if (!message) return false;
  const m = message.toLowerCase();
  return [...HOST_HINTS, ...NETWORK_HINTS].some((hint) => m.includes(hint));
}

function isHostResolutionError(message: string) {
  const m = message.toLowerCase();
  return HOST_HINTS.some((hint) => m.includes(hint));
}

function isRetryableNetworkError(message: string) {
  return isNetworkError(message) && !isHostResolutionError(message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withNetworkRetry<T>(
  run: () => Promise<T>,
  getError: (value: T) => { message?: string } | null | undefined,
  attempts = 2
): Promise<T> {
  let last: T | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await run();
      last = result;
      const error = getError(result);
      if (!error || !isRetryableNetworkError(error.message ?? '')) {
        return result;
      }
    } catch (error) {
      const message = errorText(error);
      if (!isRetryableNetworkError(message) || attempt === attempts - 1) {
        throw error;
      }
    }
    if (attempt < attempts - 1) await wait(700 * (attempt + 1));
  }
  return last as T;
}

function duplicateMessage() {
  return 'This email is already registered. Try signing in instead, or use "Forgot password" if you do not remember it.';
}

export function authErrorMessage(
  error: unknown,
  duplicate = false
): string {
  if (supabaseConfigError) return supabaseConfigError;

  const message = errorText(error);
  const m = message.toLowerCase();

  if (duplicate || m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
    return duplicateMessage();
  }
  if (isHostResolutionError(m)) {
    const host = supabaseHost ?? 'the configured Supabase host';
    return `Cannot reach the Supabase project at ${host}. This usually means EXPO_PUBLIC_SUPABASE_URL points to a deleted, paused, or wrong project. Open Supabase Dashboard -> Project Settings -> API, copy the current Project URL, update .env, then restart Expo with "npx expo start -c".`;
  }
  if (m.includes('invalid api key') || m.includes('no api key') || m.includes('invalid jwt')) {
    return 'Supabase rejected the API key. Check EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, make sure it belongs to the same project as the URL, then restart Expo with "npx expo start -c".';
  }
  if (m.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Open the confirmation link sent to your inbox, then sign in again.';
  }
  if (m.includes('invalid login credentials')) {
    return 'Incorrect email or password. If you just registered, confirm your email first.';
  }
  if (m.includes('email not found') || m.includes('user not found')) {
    return 'No account found for this email. Create an account first.';
  }
  if (m.includes('signups are disabled') || m.includes('signup is disabled') || m.includes('email signups')) {
    return 'Email registration is disabled in Supabase. Enable it under Authentication -> Providers -> Email in the Supabase dashboard.';
  }
  if (m.includes('password should be at least') || m.includes('weak password') || m.includes('password is too short')) {
    return 'Supabase rejected the password as too weak. Use at least 8 characters with a mix of letters and numbers.';
  }
  if (m.includes('email address is invalid') || m.includes('invalid email')) {
    return 'Enter a valid email address.';
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (m.includes('database error saving new user')) {
    return 'Supabase could not create your profile. The profile trigger or RLS policies are missing. Run supabase/fix-auth-profiles.sql in the Supabase SQL Editor, then try again.';
  }
  if (m.includes('profiles') && (m.includes('does not exist') || m.includes('schema cache'))) {
    return 'The profiles table is missing from Supabase. Run supabase/fix-auth-profiles.sql in the Supabase SQL Editor, then try again.';
  }
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'Supabase rejected the profile write because of RLS/permissions. Run supabase/fix-auth-profiles.sql in the Supabase SQL Editor, then try again.';
  }
  if (isNetworkError(m)) {
    return 'Network error while contacting Supabase. Check your internet connection, then try again. If it keeps failing, verify the Project URL is active.';
  }

  return message || 'Something went wrong. Please try again.';
}

type AuthData = {
  user: User | null;
  session: Session | null;
};

type SignUpResult = {
  data: AuthData;
  error: unknown;
  duplicate: boolean;
  configError: string | null;
};

type SignInResult = {
  data: AuthData;
  error: unknown;
  configError: string | null;
};

async function saveProfile(
  user: User,
  profile: SignUpProfile
): Promise<string | null> {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      full_name: profile.full_name.trim(),
      role: profile.role,
    },
    { onConflict: 'id' }
  );

  if (error) {
    logAuthError('profile.save', error);
    return error.message;
  }
  return null;
}

async function syncProfileFromMetadata(user: User): Promise<boolean> {
  const meta = user.user_metadata as
    | { full_name?: unknown; role?: unknown }
    | undefined;
  const fullName =
    typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  const role =
    meta?.role === 'teacher' || meta?.role === 'student' ? meta.role : null;

  if (!fullName && !role) return false;

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    logAuthError('profile.read', readError);
    return false;
  }

  try {
    if (!profile) {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          email: user.email ?? '',
          full_name: fullName || null,
          role: role ?? 'student',
        },
        { onConflict: 'id' }
      );
      if (error) {
        logAuthError('profile.insert', error);
        return false;
      }
      return true;
    }

    const updates: { full_name?: string; role?: 'teacher' | 'student' } = {};
    if (fullName && !profile.full_name) {
      updates.full_name = fullName;
    }
    if (role === 'teacher' && profile.role !== 'teacher') {
      updates.role = 'teacher';
    }
    if (Object.keys(updates).length === 0) return false;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
    if (error) {
      logAuthError('profile.update', error);
      return false;
    }
    return true;
  } catch (error) {
    logAuthError('profile.sync', error);
    return false;
  }
}

async function initAuth() {
  if (initialized) return;
  initialized = true;
  try {
    const { data } = await supabase.auth.getSession();
    globalSession = data.session;
    globalUser = data.session?.user ?? null;
    if (data.session?.user) {
      void syncProfileFromMetadata(data.session.user).then((changed) => {
        if (changed) notify();
      });
    }
  } catch (error) {
    logAuthError('getSession', error);
    globalSession = null;
    globalUser = null;
  } finally {
    globalLoading = false;
    notify();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    globalSession = session;
    globalUser = session?.user ?? null;
    globalLoading = false;
    notify();

    if (
      session?.user &&
      (event === 'SIGNED_IN' || event === 'USER_UPDATED')
    ) {
      void syncProfileFromMetadata(session.user).then((changed) => {
        if (changed) notify();
      });
    }
  });
}

export function setAuth(session: Session | null) {
  globalSession = session;
  globalUser = session?.user ?? null;
  globalLoading = false;
  notify();
}

export function useAuth(): AuthState {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    initAuth();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    session: globalSession,
    user: globalUser,
    loading: globalLoading,
    revision: globalRevision,
  };
}

export type SignUpProfile = {
  full_name: string;
  role: 'student' | 'teacher';
};

export async function signUp(
  email: string,
  password: string,
  profile?: SignUpProfile
): Promise<SignUpResult> {
  const empty: AuthData = { user: null, session: null };

  if (supabaseConfigError) {
    return {
      data: empty,
      error: new Error(supabaseConfigError),
      duplicate: false,
      configError: supabaseConfigError,
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await withNetworkRetry(
    () =>
      supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: profile
            ? { full_name: profile.full_name.trim(), role: profile.role }
            : undefined,
        },
      }),
    (result) => result.error
  );

  if (error) {
    logAuthError('signUp', error);
    return { data: empty, error, duplicate: false, configError: null };
  }

  const user = data.user;
  const duplicate =
    !!user &&
    Array.isArray(user.identities) &&
    user.identities.length === 0;

  if (duplicate) {
    logAuthError('signUp.duplicate', { email: normalizedEmail });
    return { data: empty, error: null, duplicate: true, configError: null };
  }

  if (data.session && profile && data.session.user) {
    const profileError = await saveProfile(data.session.user, profile);
    if (profileError) {
      logAuthError('signUp.profile', profileError);
    }
  }

  if (data.session) {
    setAuth(data.session);
  }

  return { data, error: null, duplicate: false, configError: null };
}

export async function signIn(
  email: string,
  password: string
): Promise<SignInResult> {
  const empty: AuthData = { user: null, session: null };

  if (supabaseConfigError) {
    return {
      data: empty,
      error: new Error(supabaseConfigError),
      configError: supabaseConfigError,
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await withNetworkRetry(
    () =>
      supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }),
    (result) => result.error
  );

  if (error) {
    logAuthError('signIn', error);
    return { data: empty, error, configError: null };
  }

  if (data.session) {
    const changed = await syncProfileFromMetadata(data.session.user);
    setAuth(data.session);
    if (changed) notify();
  }

  return { data, error: null, configError: null };
}

export async function signOut() {
  setAuth(null);
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  return { error: null };
}
