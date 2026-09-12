import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserSession } from '../types';

const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://dpgupbcbhkmjtyqkljpr.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dQDYyETfjDGRHXqqCtXznA_SJHHuxJ8';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const SESSION_STORAGE_KEY = 'ascend_user_session';
const ONBOARDING_COMPLETED_KEY = 'ascend_onboarding_completed';

export function getStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function setStoredSession(session: UserSession | null) {
  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
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
export function generateAvatarUrl(name: string): string {
  const clean = encodeURIComponent(name.trim() || 'User');
  return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${clean}&backgroundColor=e2f8eb,bbf7d0,dcfce7`;
}

export const authService = {
  async signInWithEmail(email: string, password: string): Promise<UserSession> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);
      const user = data.user;
      const session: UserSession = {
        id: user.id,
        email: user.email || email,
        name: user.user_metadata?.full_name || email.split('@')[0],
        avatarUrl: user.user_metadata?.avatar_url || generateAvatarUrl(email),
        isGuest: false,
        memberSince: new Date(user.created_at || Date.now()).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        syncStatus: 'synced',
      };
      setStoredSession(session);
      return session;
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
      syncStatus: 'synced',
    };
    setStoredSession(session);
    return session;
  },

  async signUpWithEmail(email: string, password: string, name: string): Promise<UserSession> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            avatar_url: generateAvatarUrl(name),
          },
        },
      });
      if (error) throw new Error(error.message);
      const user = data.user;
      const session: UserSession = {
        id: user?.id || 'usr_' + Math.random().toString(36).substring(2, 9),
        email,
        name: name.trim() || email.split('@')[0],
        avatarUrl: generateAvatarUrl(name),
        isGuest: false,
        memberSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        syncStatus: 'synced',
      };
      setStoredSession(session);
      return session;
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
      syncStatus: 'synced',
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
      if (error) throw new Error(error.message);
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
      avatarUrl: generateAvatarUrl(name || email),
      isGuest: false,
      syncStatus: 'synced',
    };

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: updated.name, avatar_url: updated.avatarUrl } },
      });
      if (error) throw new Error(error.message);
      if (data.user?.id) {
        updated.id = data.user.id;
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
  reminders: import('../types').StandaloneReminder[];
  status: 'synced' | 'local' | 'error';
  lastSyncedAt: number;
}

const REMINDERS_LOCAL_STORAGE_KEY = 'habit_tracker_reminders';
const REMINDERS_LAST_SYNC_KEY = 'ascend_reminders_last_sync_timestamp';

export const remindersSyncService = {
  /**
   * Last-Write-Wins (LWW) cross-device synchronizer for StandaloneReminders
   * Resolves conflicts by comparing updatedAt timestamps (Apple Reminders style).
   */
  async syncReminders(
    localReminders: import('../types').StandaloneReminder[],
    userSession?: UserSession | null
  ): Promise<SyncResult> {
    const now = Date.now();

    // If Supabase is not configured or user is guest / offline, use local LWW persistence
    if (!isSupabaseConfigured || !supabase || !userSession || userSession.isGuest) {
      try {
        localStorage.setItem(REMINDERS_LOCAL_STORAGE_KEY, JSON.stringify(localReminders));
        localStorage.setItem(REMINDERS_LAST_SYNC_KEY, now.toString());
      } catch {}
      return {
        reminders: localReminders,
        status: 'local',
        lastSyncedAt: now,
      };
    }

    try {
      // 1. Fetch remote reminders for this user
      const { data: remoteData, error } = await supabase
        .from('standalone_reminders')
        .select('*')
        .eq('user_id', userSession.id);

      if (error) {
        console.warn('Supabase reminders table query note:', error.message);
        // Graceful fallback to local cache
        return {
          reminders: localReminders,
          status: 'local',
          lastSyncedAt: now,
        };
      }

      // 2. Perform Last-Write-Wins (LWW) merge
      const localMap = new Map<string, import('../types').StandaloneReminder>();
      localReminders.forEach((r) => localMap.set(r.id, r));

      const remoteMap = new Map<string, any>();
      (remoteData || []).forEach((row: any) => remoteMap.set(row.id, row));

      const mergedMap = new Map<string, import('../types').StandaloneReminder>();
      const toUpsertToRemote: any[] = [];

      // Check all local records against remote
      for (const [id, localItem] of localMap.entries()) {
        const remoteRow = remoteMap.get(id);
        if (!remoteRow) {
          // Local only -> push to remote
          mergedMap.set(id, localItem);
          toUpsertToRemote.push({
            id: localItem.id,
            user_id: userSession.id,
            title: localItem.title,
            date: localItem.date,
            time: localItem.time,
            notes: localItem.notes || null,
            completed: localItem.completed,
            alert_10min: localItem.alert10Min !== false,
            alert_exact: localItem.alertExact !== false,
            created_at: new Date(localItem.createdAt).toISOString(),
            updated_at: new Date(localItem.updatedAt || localItem.createdAt).toISOString(),
            deleted: localItem.deleted || false,
          });
        } else {
          // Both exist -> Last-Write-Wins
          const remoteUpdatedAt = new Date(remoteRow.updated_at).getTime();
          const localUpdatedAt = localItem.updatedAt || localItem.createdAt || 0;

          if (localUpdatedAt >= remoteUpdatedAt) {
            // Local is newer or equal -> local wins
            mergedMap.set(id, localItem);
            if (localUpdatedAt > remoteUpdatedAt) {
              toUpsertToRemote.push({
                id: localItem.id,
                user_id: userSession.id,
                title: localItem.title,
                date: localItem.date,
                time: localItem.time,
                notes: localItem.notes || null,
                completed: localItem.completed,
                alert_10min: localItem.alert10Min !== false,
                alert_exact: localItem.alertExact !== false,
                created_at: new Date(localItem.createdAt).toISOString(),
                updated_at: new Date(localUpdatedAt).toISOString(),
                deleted: localItem.deleted || false,
              });
            }
          } else {
            // Remote is newer -> remote wins
            mergedMap.set(id, {
              id: remoteRow.id,
              title: remoteRow.title,
              date: remoteRow.date,
              time: remoteRow.time,
              notes: remoteRow.notes || undefined,
              completed: Boolean(remoteRow.completed),
              alert10Min: remoteRow.alert_10min !== false,
              alertExact: remoteRow.alert_exact !== false,
              createdAt: new Date(remoteRow.created_at).getTime(),
              updatedAt: remoteUpdatedAt,
              deleted: Boolean(remoteRow.deleted),
            });
          }
        }
      }

      // Check remote items not in local
      for (const [id, remoteRow] of remoteMap.entries()) {
        if (!localMap.has(id)) {
          mergedMap.set(id, {
            id: remoteRow.id,
            title: remoteRow.title,
            date: remoteRow.date,
            time: remoteRow.time,
            notes: remoteRow.notes || undefined,
            completed: Boolean(remoteRow.completed),
            alert10Min: remoteRow.alert_10min !== false,
            alertExact: remoteRow.alert_exact !== false,
            createdAt: new Date(remoteRow.created_at).getTime(),
            updatedAt: new Date(remoteRow.updated_at).getTime(),
            deleted: Boolean(remoteRow.deleted),
          });
        }
      }

      // 3. Push local changes to Supabase
      if (toUpsertToRemote.length > 0) {
        await supabase.from('standalone_reminders').upsert(toUpsertToRemote);
      }

      // Filter out tombstones (deleted items)
      const finalActiveReminders = Array.from(mergedMap.values()).filter((r) => !r.deleted);

      // Persist locally
      try {
        localStorage.setItem(REMINDERS_LOCAL_STORAGE_KEY, JSON.stringify(finalActiveReminders));
        localStorage.setItem(REMINDERS_LAST_SYNC_KEY, now.toString());
      } catch {}

      return {
        reminders: finalActiveReminders,
        status: 'synced',
        lastSyncedAt: now,
      };
    } catch (err) {
      console.warn('Supabase LWW sync fallback:', err);
      return {
        reminders: localReminders,
        status: 'local',
        lastSyncedAt: now,
      };
    }
  },
};

// ==========================================
// LOCAL OS-LEVEL NOTIFICATION SCHEDULER
// ==========================================
// Schedules 10-minute-before and exact-time alerts.
// Survives page reloads / app restarts via persistent pending alerts storage
// (mimicking boot-completed broadcast receiver re-scheduling).

interface ScheduledAlertRecord {
  id: string; // unique alert id (e.g. `alert_${reminderId}_10m`)
  reminderId: string;
  title: string;
  type: '10min' | 'exact';
  fireAt: number; // Unix timestamp in ms
}

const SCHEDULED_ALERTS_KEY = 'ascend_scheduled_alerts_registry';
const activeTimers = new Map<string, number>();

export const notificationScheduler = {
  /**
   * Request browser Notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    return await Notification.requestPermission();
  },

  getPermission(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  },

  /**
   * Schedule alerts for a reminder at creation time:
   * 1. 10-minute-before alert
   * 2. At exact-time alert
   */
  scheduleReminderAlerts(
    reminder: import('../types').StandaloneReminder,
    onFireAlert?: (title: string, message: string, type: '10min' | 'exact') => void
  ) {
    if (reminder.completed) return;
    if (!reminder.time) return;

    const [year, month, day] = reminder.date.split('-').map(Number);
    const [hours, minutes] = reminder.time.split(':').map(Number);
    const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const exactTimeMs = targetDate.getTime();
    const tenMinBeforeMs = exactTimeMs - 10 * 60 * 1000;
    const now = Date.now();

    const alertsToStore: ScheduledAlertRecord[] = [];

    // 1. 10-minute before alert (if enabled & not passed)
    if (reminder.alert10Min !== false && tenMinBeforeMs > now) {
      alertsToStore.push({
        id: `alert_${reminder.id}_10m`,
        reminderId: reminder.id,
        title: reminder.title,
        type: '10min',
        fireAt: tenMinBeforeMs,
      });
    }

    // 2. Exact-time alert (if enabled & not passed)
    if (reminder.alertExact !== false && exactTimeMs > now) {
      alertsToStore.push({
        id: `alert_${reminder.id}_exact`,
        reminderId: reminder.id,
        title: reminder.title,
        type: 'exact',
        fireAt: exactTimeMs,
      });
    }

    // Persist to registry
    const registry = this.getStoredRegistry();
    // Remove any existing alerts for this reminder
    const filtered = registry.filter((a) => a.reminderId !== reminder.id);
    const updated = [...filtered, ...alertsToStore];
    this.saveRegistry(updated);

    // Arm runtime timeouts
    alertsToStore.forEach((alert) => this.armTimeout(alert, onFireAlert));
  },

  cancelReminderAlerts(reminderId: string) {
    const registry = this.getStoredRegistry();
    const toCancel = registry.filter((a) => a.reminderId === reminderId);
    toCancel.forEach((a) => {
      const timer = activeTimers.get(a.id);
      if (timer) {
        clearTimeout(timer);
        activeTimers.delete(a.id);
      }
    });
    this.saveRegistry(registry.filter((a) => a.reminderId !== reminderId));
  },

  /**
   * Boot-Completed / App Startup Re-scheduler:
   * Called when app mounts to re-arm pending alerts after force-quit or device reboot.
   */
  bootReschedulePendingAlerts(
    onFireAlert?: (title: string, message: string, type: '10min' | 'exact') => void
  ) {
    const registry = this.getStoredRegistry();
    const now = Date.now();
    const stillValid: ScheduledAlertRecord[] = [];

    registry.forEach((alert) => {
      if (alert.fireAt > now) {
        stillValid.push(alert);
        this.armTimeout(alert, onFireAlert);
      }
    });

    this.saveRegistry(stillValid);
  },

  armTimeout(
    alert: ScheduledAlertRecord,
    onFireAlert?: (title: string, message: string, type: '10min' | 'exact') => void
  ) {
    // Clear any existing timer
    const existing = activeTimers.get(alert.id);
    if (existing) clearTimeout(existing);

    const delay = Math.max(0, alert.fireAt - Date.now());
    // Safe max delay for setTimeout is ~24.8 days (2147483647 ms)
    if (delay > 2147483600) return;

    const timerId = window.setTimeout(() => {
      this.fireNotification(alert, onFireAlert);
      activeTimers.delete(alert.id);
      // Remove from registry
      const registry = this.getStoredRegistry().filter((a) => a.id !== alert.id);
      this.saveRegistry(registry);
    }, delay);

    activeTimers.set(alert.id, timerId);
  },

  fireNotification(
    alert: ScheduledAlertRecord,
    onFireAlert?: (title: string, message: string, type: '10min' | 'exact') => void
  ) {
    const is10m = alert.type === '10min';
    const titleText = is10m ? `🔔 10 Min Alert: ${alert.title}` : `⚡ Due Now: ${alert.title}`;
    const bodyText = is10m
      ? `Upcoming reminder in 10 minutes: "${alert.title}"`
      : `It's time for your scheduled reminder: "${alert.title}"`;

    // 1. OS-level Notification (Web API)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(titleText, {
          body: bodyText,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: alert.id,
        });
      }
    } catch {}

    // 2. Play subtle audio chime if audio context is permitted
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(is10m ? 587.33 : 880, audioCtx.currentTime); // D5 or A5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch {}

    // 3. Invoke UI callback
    if (onFireAlert) {
      onFireAlert(alert.title, bodyText, alert.type);
    }
  },

  getStoredRegistry(): ScheduledAlertRecord[] {
    try {
      const raw = localStorage.getItem(SCHEDULED_ALERTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveRegistry(list: ScheduledAlertRecord[]) {
    try {
      localStorage.setItem(SCHEDULED_ALERTS_KEY, JSON.stringify(list));
    } catch {}
  },
};
