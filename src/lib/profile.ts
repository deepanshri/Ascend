import { UserProfile, UserSession } from '../types';
import { isSupabaseConfigured, supabase } from './supabase';
import { cacheProfileLocally, readCachedProfile, syncProfilePatch } from './offlineSync';
import { persistStoredAvatarId, readStoredAvatarId, resolveAvatarId } from '../data/avatars';

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
    avatar_url: readStoredAvatarId(session.avatarUrl),
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
    let { data, error } = await supabase
      .from('profiles')
      .select('id, interests, has_completed_tutorial, avatar_url')
      .eq('id', session.id)
      .maybeSingle();

    if (error && /avatar_url/i.test(error.message)) {
      const retry = await supabase
        .from('profiles')
        .select('id, interests, has_completed_tutorial')
        .eq('id', session.id)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error || !data) {
      return cached || fallback;
    }

    const interests = parseInterests(data.interests);
    const avatar_url = resolveAvatarId(
      (typeof data.avatar_url === 'string' && data.avatar_url) || cached?.avatar_url || session.avatarUrl
    );
    persistStoredAvatarId(avatar_url);
    const profile: UserProfile = {
      id: String(data.id || session.id),
      interests: interests.length > 0 ? interests : fallbackInterests,
      has_completed_tutorial: Boolean(data.has_completed_tutorial) || fallback.has_completed_tutorial,
      avatar_url,
    };
    cacheProfileLocally(profile);
    return profile;
  } catch {
    return cached || fallback;
  }
}

export async function persistUserProfile(
  session: UserSession,
  patch: Partial<Pick<UserProfile, 'interests' | 'has_completed_tutorial' | 'avatar_url'>>
): Promise<void> {
  const nextPatch = { ...patch };
  if (typeof nextPatch.avatar_url === 'string') {
    nextPatch.avatar_url = resolveAvatarId(nextPatch.avatar_url);
    persistStoredAvatarId(nextPatch.avatar_url);
  }
  if (typeof nextPatch.has_completed_tutorial === 'boolean') {
    setLocalTutorialCompleted(nextPatch.has_completed_tutorial);
  }

  const cached = readCachedProfile(session.id);
  cacheProfileLocally({
    id: session.id,
    interests: nextPatch.interests ?? cached?.interests ?? [],
    has_completed_tutorial:
      typeof nextPatch.has_completed_tutorial === 'boolean'
        ? nextPatch.has_completed_tutorial
        : Boolean(cached?.has_completed_tutorial),
    avatar_url:
      typeof nextPatch.avatar_url === 'string'
        ? nextPatch.avatar_url
        : cached?.avatar_url ?? readStoredAvatarId(session.avatarUrl),
  });

  if (!isSupabaseConfigured || !supabase || session.isGuest) {
    return;
  }

  await syncProfilePatch(session.id, nextPatch);
}
