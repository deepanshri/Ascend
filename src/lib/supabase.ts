import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MomentumEventType, StandaloneReminder, UserSession } from '../types';
import { isTimeOfDay, type TimeOfDay } from '../types/habit';
import {
  cancelReminderDualAlerts,
  reminderNotificationIds,
  requestNotificationPermissions,
  rescheduleAllReminderDualAlerts,
  scheduleReminderDualAlerts,
  weekdayFromIsoDate,
  withReminderNotificationIds,
} from './notifications';
import { DEFAULT_AVATAR_ID, resolveAvatarId } from '../data/avatars';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://dpgupbcbhkmjtyqkljpr.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dQDYyETfjDGRHXqqCtXznA_SJHHuxJ8';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canWriteUserRows(userId?: string | null): boolean {
  return Boolean(
    isSupabaseConfigured && supabase && userId && UUID_RE.test(userId) && !userId.startsWith('guest_')
  );
}

/** Append-only swipe payload written to `public.momentum_events`. */
export interface MomentumEventInsert {
  id: string;
  userId: string;
  habitId: string;
  eventType: MomentumEventType;
  /** Work (W) = 1.5, Self Improvement (SI) = 1.0 */
  weight: number;
  timestamp?: string | number;
  timeOfDay?: TimeOfDay;
}

export interface MomentumEventRecord {
  id: string;
  userId: string;
  habitId: string;
  eventType: MomentumEventType;
  weight: number;
  timestamp: string;
  timeOfDay?: TimeOfDay;
}

function parseMomentumEventType(raw: unknown): MomentumEventType | null {
  const value = String(raw || '').toLowerCase();
  if (value === 'full' || value === 'fallback' || value === 'missed') return value;
  return null;
}

/**
 * Insert-only write used when a HabitCard swipe commits.
 * Never upserts or deletes historical `momentum_events` rows.
 */
export async function insertMomentumEvent(record: MomentumEventInsert): Promise<boolean> {
  if (!canWriteUserRows(record.userId) || !supabase) return false;
  if (!UUID_RE.test(record.id)) return false;

  const timestamp =
    typeof record.timestamp === 'number'
      ? new Date(record.timestamp).toISOString()
      : record.timestamp || new Date().toISOString();

  try {
    const payload: Record<string, unknown> = {
      id: record.id,
      user_id: record.userId,
      habit_id: record.habitId,
      event_type: record.eventType,
      weight: record.weight,
      timestamp,
    };
    if (isTimeOfDay(record.timeOfDay)) payload.time_of_day = record.timeOfDay;

    let { error } = await supabase.from('momentum_events').insert(payload);
    if (error && isTimeOfDay(record.timeOfDay) && /time_of_day/i.test(error.message)) {
      const { time_of_day: _ignored, ...core } = payload;
      const retry = await supabase.from('momentum_events').insert(core);
      error = retry.error;
    }
    if (!error) return true;
    const code = (error as { code?: string }).code;
    if (code === '23505' || /duplicate/i.test(error.message)) return true;
    console.warn('momentum_events insert failed:', error.message);
    return false;
  } catch (err) {
    console.warn('momentum_events insert offline:', err);
    return false;
  }
}

/** Timestamp-ordered replica of `public.momentum_events` for the rolling engine. */
export async function fetchSequentialMomentumEvents(
  userId?: string | null
): Promise<MomentumEventRecord[]> {
  if (!canWriteUserRows(userId) || !supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('momentum_events')
      .select('id, user_id, habit_id, event_type, weight, timestamp, time_of_day')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });

    const query = error && /time_of_day/i.test(error.message)
      ? await supabase
          .from('momentum_events')
          .select('id, user_id, habit_id, event_type, weight, timestamp')
          .eq('user_id', userId)
          .order('timestamp', { ascending: true })
      : { data, error };

    if (query.error) {
      console.warn('momentum_events fetch failed:', query.error.message);
      return [];
    }

    return (query.data || [])
      .map((row) => {
        const eventType = parseMomentumEventType(row.event_type);
        const weight = Number(row.weight);
        if (!row.id || !row.habit_id || !eventType || !Number.isFinite(weight)) return null;
        const timeOfDayRaw = 'time_of_day' in row ? (row as { time_of_day?: unknown }).time_of_day : undefined;
        return {
          id: String(row.id),
          userId: String(row.user_id || userId),
          habitId: String(row.habit_id),
          eventType,
          weight,
          timestamp: String(row.timestamp || new Date().toISOString()),
          timeOfDay: isTimeOfDay(timeOfDayRaw) ? timeOfDayRaw : undefined,
        } satisfies MomentumEventRecord;
      })
      .filter((row): row is MomentumEventRecord => row !== null);
  } catch (err) {
    console.warn('momentum_events fetch offline:', err);
    return [];
  }
}

/** COUNT(*) of completed actions: event_type IN ('full', 'fallback'). */
export async function countMomentumCompletedActions(userId?: string | null): Promise<number | null> {
  if (!canWriteUserRows(userId) || !supabase || !userId) return null;
  try {
    const { count, error } = await supabase
      .from('momentum_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('event_type', ['full', 'fallback']);

    if (error) {
      console.warn('momentum_events count failed:', error.message);
      return null;
    }
    return count ?? 0;
  } catch (err) {
    console.warn('momentum_events count offline:', err);
    return null;
  }
}

const SESSION_STORAGE_KEY = 'ascend_user_session';
const ONBOARDING_COMPLETED_KEY = 'ascend_onboarding_completed';

export function getStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as UserSession;
    session.avatarUrl = resolveAvatarId(session.avatarUrl);
    return session;
  } catch {}
  return null;
}

export function setStoredSession(session: UserSession | null) {
  try {
    if (session) {
      const next = { ...session, avatarUrl: resolveAvatarId(session.avatarUrl) };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {}
}

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setOnboardingCompleted(completed: boolean) {
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_KEY, completed ? 'true' : 'false');
  } catch {}
}

// Generate an avatar based on name initials or seed
export function generateAvatarUrl(_name?: string): string {
  return DEFAULT_AVATAR_ID;
}

export function mapAuthError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw || '');
  const text = message.toLowerCase();
  if (text.includes('invalid login') || text.includes('invalid credentials')) {
    return 'Wrong email or password.';
  }
  if (text.includes('rate limit') || text.includes('over_email_send_rate_limit') || text.includes('429')) {
    return 'Account could not be opened yet. Wait a minute and tap Sign In with this email.';
  }
  if (text.includes('already registered') || text.includes('already been registered') || text.includes('user already exists')) {
    return 'That email already has an account. Use Sign In instead.';
  }
  if (text.includes('email not confirmed')) {
    return 'Account created. Tap Sign In with the same email and password.';
  }
  return message || 'Authentication failed. Please check your credentials.';
}

function sessionFromAuthUser(
  user: { id: string; email?: string | null; created_at?: string; user_metadata?: Record<string, unknown> },
  email: string,
  name?: string
): UserSession {
  const displayName =
    (typeof name === 'string' && name.trim()) ||
    String(user.user_metadata?.full_name || '') ||
    email.split('@')[0];
  return {
    id: user.id,
    email: user.email || email,
    name: displayName,
    avatarUrl: resolveAvatarId(String(user.user_metadata?.avatar_url || '')),
    isGuest: false,
    memberSince: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    }),
    syncStatus: 'syncing',
  };
}

async function signInRemote(email: string, password: string): Promise<UserSession> {
  if (!supabase) throw new Error('Cloud is not configured.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mapAuthError(error.message));
  if (!data.user) throw new Error('Sign in failed.');
  const session = sessionFromAuthUser(data.user, email);
  setStoredSession(session);
  return session;
}

export const authService = {
  async restoreExistingSession(): Promise<UserSession | 'pending' | null> {
    const stored = getStoredSession();
    if (!isSupabaseConfigured || !supabase) return stored;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn('Auth getSession failed:', error.message);
      if (data?.session?.user) {
        const session = sessionFromAuthUser(
          data.session.user,
          data.session.user.email || stored?.email || ''
        );
        setStoredSession(session);
        return session;
      }
      if (stored?.isGuest) return stored;
      if (stored && !stored.isGuest) return 'pending';
      return null;
    } catch (err) {
      console.warn('Auth restore offline:', err);
      return stored?.isGuest ? stored : stored ? 'pending' : null;
    }
  },

  async signInWithEmail(email: string, password: string): Promise<UserSession> {
    if (isSupabaseConfigured && supabase) {
      return signInRemote(email, password);
    }

    // Local / Demo Authenticated mode
    await new Promise((r) => setTimeout(r, 450));
    const name = email.split('@')[0] || 'User';
    const session: UserSession = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      email,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      avatarUrl: generateAvatarUrl(name),
      isGuest: false,
      memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      syncStatus: 'syncing',
    };
    setStoredSession(session);
    return session;
  },

  async signUpWithEmail(
    email: string,
    password: string,
    name: string,
    interests: string[] = []
  ): Promise<UserSession> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            avatar_url: generateAvatarUrl(name),
            interests,
          },
        },
      });

      if (data.session?.user) {
        const session = sessionFromAuthUser(data.session.user, email, name);
        setStoredSession(session);
        return session;
      }

      // Skip inbox confirmation: if the user row exists, open the session with the password.
      try {
        return await signInRemote(email, password);
      } catch (signInErr) {
        if (error) throw new Error(mapAuthError(error.message));
        throw signInErr;
      }
    }

    // Local simulated signup
    await new Promise((r) => setTimeout(r, 500));
    const session: UserSession = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      email,
      name: name.trim() || email.split('@')[0],
      avatarUrl: generateAvatarUrl(name),
      isGuest: false,
      memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      syncStatus: 'syncing',
    };
    setStoredSession(session);
    return session;
  },

  async signInAsGuest(): Promise<UserSession> {
    await new Promise((r) => setTimeout(r, 200));
    const guestNumber = Math.floor(1000 + Math.random() * 9000);
    const session: UserSession = {
      id: `guest_${guestNumber}`,
      email: `guest_${guestNumber}@ascend.local`,
      name: `Guest Ascender #${guestNumber}`,
      avatarUrl: generateAvatarUrl(`Guest${guestNumber}`),
      isGuest: true,
      memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      syncStatus: 'local',
    };
    setStoredSession(session);
    return session;
  },

  async resetPasswordForEmail(email: string): Promise<{ success: boolean; message: string }> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw new Error(mapAuthError(error.message));
      return { success: true, message: `Password reset instructions sent to ${email}.` };
    }

    await new Promise((r) => setTimeout(r, 400));
    return {
      success: true,
      message: `Password reset link has been dispatched to ${email}.`,
    };
  },

  async upgradeGuestAccount(
    email: string,
    password: string,
    name: string,
    currentSession: UserSession
  ): Promise<UserSession> {
    const updated: UserSession = {
      ...currentSession,
      email,
      name: name || currentSession.name,
      avatarUrl: resolveAvatarId(currentSession.avatarUrl || generateAvatarUrl(name || email)),
      isGuest: false,
      syncStatus: 'syncing',
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: updated.name, avatar_url: updated.avatarUrl } },
      });
      const signedInUser = data.session?.user;
      if (signedInUser?.id) {
        updated.id = signedInUser.id;
      } else {
        try {
          const signed = await signInRemote(email, password);
          updated.id = signed.id;
          updated.name = signed.name || updated.name;
          updated.avatarUrl = signed.avatarUrl || updated.avatarUrl;
        } catch (signInErr) {
          if (error) throw new Error(mapAuthError(error.message));
          throw signInErr;
        }
      }
    } else {
      await new Promise((r) => setTimeout(r, 450));
    }

    setStoredSession(updated);
    return updated;
  },

  async signOut() {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {}
    }
    setStoredSession(null);
  },
};

// ==========================================
// SUPABASE LAST-WRITE-WINS REMINDERS SYNC MODULE
// ==========================================

export interface SyncResult {
  reminders: StandaloneReminder[];
  status: 'synced' | 'local' | 'error';
  lastSyncedAt: number;
}

const REMINDERS_LOCAL_STORAGE_KEY = 'habit_tracker_reminders';
const REMINDERS_LAST_SYNC_KEY = 'ascend_reminders_last_sync_timestamp';

type ReminderRow = Record<string, unknown>;

function asIsoDate(value: unknown, fallback = ''): string {
  const raw = String(value || fallback);
  return raw.slice(0, 10);
}

function asOptionalInt(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asHHmm(value: unknown): string | undefined {
  if (!value) return undefined;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function asIntArray(value: unknown, fallbackDate: string): number[] {
  if (Array.isArray(value) && value.length > 0) {
    return value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
  }
  return [weekdayFromIsoDate(fallbackDate)];
}

function toReminderRow(userId: string, reminder: StandaloneReminder): ReminderRow {
  const hydrated = withReminderNotificationIds(reminder);
  const ids = reminderNotificationIds(hydrated.id);
  const isEnabled = hydrated.isEnabled !== false && !hydrated.completed && !hydrated.deleted;
  return {
    id: hydrated.id,
    user_id: userId,
    habit_id: hydrated.habitId || null,
    title: hydrated.title,
    date: hydrated.date,
    target_time: hydrated.time || null,
    days_of_week: hydrated.daysOfWeek?.length ? hydrated.daysOfWeek : [weekdayFromIsoDate(hydrated.date)],
    is_enabled: isEnabled,
    notification_id_1: Math.trunc(Number(hydrated.notificationId1 ?? ids.notificationId1)),
    notification_id_2: Math.trunc(Number(hydrated.notificationId2 ?? ids.notificationId2)),
    notes: hydrated.notes || null,
    completed: hydrated.completed,
    deleted: hydrated.deleted || false,
    alert_10min: hydrated.alert10Min !== false,
    alert_exact: hydrated.alertExact !== false,
    created_at: new Date(hydrated.createdAt).toISOString(),
    updated_at: new Date(hydrated.updatedAt || hydrated.createdAt).toISOString(),
  };
}

function fromReminderRow(row: ReminderRow): StandaloneReminder {
  const date = asIsoDate(row.date);
  return withReminderNotificationIds({
    id: String(row.id),
    title: String(row.title || ''),
    date,
    time: asHHmm(row.target_time) || asHHmm(row.time),
    notes: row.notes ? String(row.notes) : undefined,
    completed: Boolean(row.completed),
    alert10Min: row.alert_10min !== false,
    alertExact: row.alert_exact !== false,
    createdAt: row.created_at ? new Date(String(row.created_at)).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).getTime() : Date.now(),
    deleted: Boolean(row.deleted),
    habitId: row.habit_id ? String(row.habit_id) : null,
    daysOfWeek: asIntArray(row.days_of_week, date),
    isEnabled: row.is_enabled !== false && !row.completed && !row.deleted,
    notificationId1: asOptionalInt(row.notification_id_1),
    notificationId2: asOptionalInt(row.notification_id_2),
  });
}

async function persistMergedReminders(reminders: StandaloneReminder[], lastSyncedAt: number) {
  try {
    localStorage.setItem(REMINDERS_LOCAL_STORAGE_KEY, JSON.stringify(reminders));
    localStorage.setItem(REMINDERS_LAST_SYNC_KEY, lastSyncedAt.toString());
  } catch {}
}

async function fetchRemoteReminderRows(
  userId: string
): Promise<{ table: 'reminders' | 'standalone_reminders'; rows: ReminderRow[] } | { error: string }> {
  if (!supabase) return { error: 'Supabase is not configured' };

  const primary = await supabase.from('reminders').select('*').eq('user_id', userId);
  if (!primary.error) {
    return { table: 'reminders', rows: (primary.data || []) as ReminderRow[] };
  }

  const fallback = await supabase.from('standalone_reminders').select('*').eq('user_id', userId);
  if (!fallback.error) {
    return { table: 'standalone_reminders', rows: (fallback.data || []) as ReminderRow[] };
  }

  return { error: primary.error.message };
}

function toLegacyStandaloneRow(userId: string, reminder: StandaloneReminder): ReminderRow {
  const row = toReminderRow(userId, reminder);
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    date: row.date,
    time: row.target_time,
    notes: row.notes,
    completed: row.completed,
    alert_10min: row.alert_10min,
    alert_exact: row.alert_exact,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted: row.deleted,
  };
}

function toPublicReminderCoreRow(userId: string, reminder: StandaloneReminder): ReminderRow {
  const hydrated = withReminderNotificationIds(reminder);
  const ids = reminderNotificationIds(hydrated.id);
  return {
    id: hydrated.id,
    user_id: userId,
    habit_id: hydrated.habitId || null,
    target_time: hydrated.time || null,
    days_of_week: hydrated.daysOfWeek?.length ? hydrated.daysOfWeek : [weekdayFromIsoDate(hydrated.date)],
    is_enabled: hydrated.isEnabled !== false && !hydrated.completed && !hydrated.deleted,
    notification_id_1: Math.trunc(Number(hydrated.notificationId1 ?? ids.notificationId1)),
    notification_id_2: Math.trunc(Number(hydrated.notificationId2 ?? ids.notificationId2)),
    completed: Boolean(hydrated.completed),
    updated_at: new Date(hydrated.updatedAt || hydrated.createdAt || Date.now()).toISOString(),
  };
}

/** Direct fetch of `public.reminders` for the authenticated user. */
export async function fetchPublicReminders(userId?: string | null): Promise<StandaloneReminder[] | null> {
  if (!canWriteUserRows(userId) || !supabase || !userId) return null;
  try {
    const { data, error } = await supabase.from('reminders').select('*').eq('user_id', userId);
    if (error) {
      console.warn('public.reminders fetch failed:', error.message);
      return null;
    }
    return ((data || []) as ReminderRow[])
      .map((row) => fromReminderRow(row))
      .filter((item) => !item.deleted);
  } catch (err) {
    console.warn('public.reminders fetch offline:', err);
    return null;
  }
}

/**
 * Upsert one reminder into `public.reminders`.
 * Always writes id, user_id, habit_id, target_time, days_of_week, is_enabled,
 * notification_id_1, notification_id_2. Retries with only those columns if the
 * wider row is rejected by schema.
 */
export async function upsertPublicReminder(
  userSession: UserSession | null | undefined,
  reminder: StandaloneReminder
): Promise<boolean> {
  if (!canWriteUserRows(userSession?.id) || !supabase || !userSession) return false;
  const full = toReminderRow(userSession.id, reminder);
  const core = toPublicReminderCoreRow(userSession.id, reminder);
  try {
    const { error } = await supabase.from('reminders').upsert(full);
    if (!error) return true;
    console.warn('public.reminders upsert failed, retrying core columns:', error.message);
    const retry = await supabase.from('reminders').upsert(core);
    if (retry.error) {
      console.warn('public.reminders core upsert failed:', retry.error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('public.reminders upsert offline:', err);
    return false;
  }
}

export const remindersSyncService = {
  /**
   * Last-Write-Wins (LWW) cross-device synchronizer for reminders.
   * Fetches public.reminders, keeps the newest updated_at, then re-schedules native alerts.
   */
  async syncReminders(
    localReminders: StandaloneReminder[],
    userSession?: UserSession | null
  ): Promise<SyncResult> {
    const now = Date.now();
    const hydratedLocal = localReminders.map(withReminderNotificationIds);

    if (!isSupabaseConfigured || !supabase || !userSession || userSession.isGuest) {
      await persistMergedReminders(hydratedLocal.filter((item) => !item.deleted), now);
      await rescheduleAllReminderDualAlerts(hydratedLocal);
      return {
        reminders: hydratedLocal.filter((item) => !item.deleted),
        status: 'local',
        lastSyncedAt: now,
      };
    }

    try {
      const remote = await fetchRemoteReminderRows(userSession.id);
      if ('error' in remote) {
        console.warn('Supabase reminders table query note:', remote.error);
        await rescheduleAllReminderDualAlerts(hydratedLocal);
        return {
          reminders: hydratedLocal.filter((item) => !item.deleted),
          status: 'local',
          lastSyncedAt: now,
        };
      }

      const localMap = new Map<string, StandaloneReminder>();
      hydratedLocal.forEach((item) => localMap.set(item.id, item));

      const remoteMap = new Map<string, ReminderRow>();
      remote.rows.forEach((row) => remoteMap.set(String(row.id), row));

      const mergedMap = new Map<string, StandaloneReminder>();
      const toUpsertToRemote: ReminderRow[] = [];

      for (const [id, localItem] of localMap.entries()) {
        const remoteRow = remoteMap.get(id);
        if (!remoteRow) {
          mergedMap.set(id, localItem);
          toUpsertToRemote.push(
            remote.table === 'reminders'
              ? toReminderRow(userSession.id, localItem)
              : toLegacyStandaloneRow(userSession.id, localItem)
          );
          continue;
        }

        const remoteUpdatedAt = new Date(String(remoteRow.updated_at)).getTime();
        const localUpdatedAt = localItem.updatedAt || localItem.createdAt || 0;

        if (localUpdatedAt >= remoteUpdatedAt) {
          mergedMap.set(id, localItem);
          if (localUpdatedAt > remoteUpdatedAt) {
            toUpsertToRemote.push(
              remote.table === 'reminders'
                ? toReminderRow(userSession.id, localItem)
                : toLegacyStandaloneRow(userSession.id, localItem)
            );
          }
        } else {
          mergedMap.set(id, fromReminderRow(remoteRow));
        }
      }

      for (const [id, remoteRow] of remoteMap.entries()) {
        if (!localMap.has(id)) {
          mergedMap.set(id, fromReminderRow(remoteRow));
        }
      }

      if (toUpsertToRemote.length > 0) {
        const { error: upsertError } = await supabase.from(remote.table).upsert(toUpsertToRemote);
        if (upsertError && remote.table === 'reminders') {
          console.warn('Supabase reminders upsert note, retrying core columns:', upsertError.message);
          const coreRows = hydratedLocal
            .filter((item) => toUpsertToRemote.some((row) => row.id === item.id))
            .map((item) => toPublicReminderCoreRow(userSession.id, item));
          const retry = await supabase.from('reminders').upsert(coreRows);
          if (retry.error) {
            console.warn('Supabase reminders core upsert note:', retry.error.message);
          }
        } else if (upsertError) {
          console.warn('Supabase reminders upsert note:', upsertError.message);
        }
      }

      const merged = Array.from(mergedMap.values()).map(withReminderNotificationIds);
      await rescheduleAllReminderDualAlerts(merged);

      const finalActiveReminders = merged.filter((item) => !item.deleted);
      await persistMergedReminders(finalActiveReminders, now);

      return {
        reminders: finalActiveReminders,
        status: 'synced',
        lastSyncedAt: now,
      };
    } catch (err) {
      console.warn('Supabase LWW sync fallback:', err);
      await rescheduleAllReminderDualAlerts(hydratedLocal);
      return {
        reminders: hydratedLocal.filter((item) => !item.deleted),
        status: 'local',
        lastSyncedAt: now,
      };
    }
  },
};

// ==========================================
// NATIVE LOCAL NOTIFICATION SCHEDULER
// ==========================================
// Dual-alert Capacitor LocalNotifications: 10 minutes prior + exact target_time.
// No web Notification / setTimeout fallback. Boot reschedule uses native ids.

export const notificationScheduler = {
  async requestPermission(): Promise<'granted' | 'denied'> {
    const granted = await requestNotificationPermissions();
    return granted ? 'granted' : 'denied';
  },

  scheduleReminderAlerts(reminder: StandaloneReminder) {
    void scheduleReminderDualAlerts(reminder);
  },

  cancelReminderAlerts(reminderId: string, reminder?: StandaloneReminder) {
    const ids = reminder
      ? { id: reminder.id, notificationId1: reminder.notificationId1, notificationId2: reminder.notificationId2 }
      : reminderId;
    void cancelReminderDualAlerts(ids);
  },

  bootReschedulePendingAlerts(reminders: StandaloneReminder[] = []) {
    void (async () => {
      await requestNotificationPermissions();
      await rescheduleAllReminderDualAlerts(reminders);
    })();
  },
};


