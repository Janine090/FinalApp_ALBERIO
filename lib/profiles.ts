import { supabase } from './supabase';

export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at?: string;
  updated_at?: string;
};

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    if (error && __DEV__) {
      console.error('[profiles:getProfile]', error);
    }
    return null;
  }

  return data as Profile;
}

export async function getAllProfiles(limit = 200): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as Profile[];
}

export async function updateProfile(
  userId: string,
  updates: { full_name?: string }
): Promise<{ error: string | null }> {
  // The row is normally created by the on_auth_user_created trigger,
  // but accounts registered BEFORE the schema was run have no row.
  // Upsert instead of update so the name still saves for those users
  // (insert needs the email, taken from the current session).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row: Record<string, unknown> = { id: userId, ...updates };
  if (user?.email) {
    row.email = user.email;
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'id' });

  return { error: error?.message ?? null };
}

export async function updateProfileRole(
  userId: string,
  role: Role
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  return { error: error?.message ?? null };
}
