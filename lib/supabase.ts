import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureStorage } from './secureStorage';

function readEnv(value: string | undefined) {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export const supabaseUrl = readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = readEnv(
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

export const supabaseHost = (() => {
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
})();

export const supabaseProjectRef = supabaseHost?.endsWith('.supabase.co')
  ? supabaseHost.slice(0, -'.supabase.co'.length)
  : null;

function jwtRole(key: string): string | null {
  if (typeof globalThis.atob !== 'function') return null;
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = globalThis.atob(normalized);
    const json = JSON.parse(decoded) as { role?: unknown };
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

export function getSupabaseConfigError(): string | null {
  if (!supabaseUrl) {
    return 'Supabase is not configured: EXPO_PUBLIC_SUPABASE_URL is missing. Add it to .env and restart Expo with a cache clear.';
  }
  if (!supabaseAnonKey) {
    return 'Supabase is not configured: EXPO_PUBLIC_SUPABASE_ANON_KEY is missing. Add it to .env and restart Expo with a cache clear.';
  }

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    return `Supabase URL is invalid: "${supabaseUrl}". Copy the Project URL from Supabase Dashboard -> Project Settings -> API.`;
  }

  if (parsed.protocol !== 'https:') {
    return 'Supabase URL must start with https://. Copy the Project URL from Supabase Dashboard -> Project Settings -> API.';
  }
  if (
    parsed.hostname.includes('your-project-id') ||
    parsed.hostname.includes('xxx.supabase.co') ||
    parsed.hostname === 'supabase.co'
  ) {
    return 'Supabase URL is still a placeholder. Copy the real Project URL from Supabase Dashboard -> Project Settings -> API.';
  }

  if (supabaseAnonKey.startsWith('sb_secret_')) {
    return 'The configured Supabase key is a secret/server key. Use only the publishable (anon) key in the app. Remove the service_role secret from .env immediately.';
  }
  if (jwtRole(supabaseAnonKey) === 'service_role') {
    return 'The configured Supabase key is a service_role key. Use only the publishable (anon) key in the app. Remove the service_role secret from .env immediately.';
  }
  if (
    !supabaseAnonKey.startsWith('sb_publishable_') &&
    jwtRole(supabaseAnonKey) !== 'anon'
  ) {
    return 'The configured Supabase key is not a publishable (anon) key. Copy the publishable/anon key from Supabase Dashboard -> Project Settings -> API.';
  }

  return null;
}

export const supabaseConfigError = getSupabaseConfigError();

if (supabaseConfigError) {
  console.error(`[supabase:config] ${supabaseConfigError}`);
}

// Keep the module importable so screens can render a clear configuration
// error instead of crashing at startup. Every auth call checks
// supabaseConfigError first and never reaches this placeholder.
export const supabase = createClient(
  supabaseUrl || 'https://supabase-not-configured.invalid',
  supabaseAnonKey || 'supabase-not-configured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
