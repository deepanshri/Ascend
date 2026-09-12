import { UserProfile, UserSession } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { cacheProfileLocally, readCachedProfile, syncProfilePatch } from './offlineSync';

const TUTORIAL_STORAGE_KEY = 'ascend_has_completed_tutorial';

export function getLocalTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLocalTutorialCompleted(completed: boolean) {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, completed ? 'true' : 'false');
  } catch {}
}

function parseInterests(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parseInterests(parsed);
    } catch {
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function localProfile(session: UserSession, interests: string[] = []): UserProfile {
  return {
    id: session.id,
    interests,
    has_completed_tutorial: getLocalTutorialCompleted(),
  };
}

export async function fetchUserProfile(
  session: UserSession,
  fallbackInterests: string[] = []
): Promise<UserProfile> {
  const fallback = localProfile(session, fallbackInterests);
  const cached = readCachedProfile(session.id);
  if (!isSupabaseConfigured || !supabase || session.isGuest) {
    return cached
      ? { ...fallback, ...cached, interests: cached.interests.length > 0 ? cached.interests : fallback.interests }
      : fallback;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, interests, has_completed_tutorial')
      .eq('id', session.id)
      .maybeSingle();

    if (error || !data) {
      return cached || fallback;
    }

    const interests = parseInterests(data.interests);
    const profile: UserProfile = {
      id: String(data.id || session.id),
      interests: interests.length > 0 ? interests : fallbackInterests,
      has_completed_tutorial: Boolean(data.has_completed_tutorial) || fallback.has_completed_tutorial,
    };
    cacheProfileLocally(profile);
    return profile;
  } catch {
    return cached || fallback;
  }
}

export async function persistUserProfile(
  session: UserSession,
  patch: Partial<Pick<UserProfile, 'interests' | 'has_completed_tutorial'>>
): Promise<void> {
  if (typeof patch.has_completed_tutorial === 'boolean') {
    setLocalTutorialCompleted(patch.has_completed_tutorial);
  }

  cacheProfileLocally({
    id: session.id,
    interests: patch.interests ?? readCachedProfile(session.id)?.interests ?? [],
    has_completed_tutorial:
      typeof patch.has_completed_tutorial === 'boolean'
        ? patch.has_completed_tutorial
        : Boolean(readCachedProfile(session.id)?.has_completed_tutorial),
  });

  if (!isSupabaseConfigured || !supabase || session.isGuest) {
    return;
  }

  await syncProfilePatch(session.id, patch);
}
