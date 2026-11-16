import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/lib/auth';
import { getProfile, type Profile, type Role } from '@/lib/profiles';

type ProfileContextValue = {
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  refresh: () => Promise<Profile | null>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: PropsWithChildren) {
  const { user, revision } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const next = await getProfile(user.id);
      setProfile(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!user) {
        if (!cancelled) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
      }

      try {
        const next = await getProfile(user.id);
        if (!cancelled) {
          setProfile(next);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user, revision]);

  const value = useMemo(
    () => ({
      profile,
      role: profile?.role ?? null,
      loading,
      refresh,
    }),
    [profile, loading, refresh]
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used inside ProfileProvider');
  }
  return context;
}
