/**
 * Everything stored on the device that belongs to the signed-in user, and the
 * record of which user that is. Signing out purges all of it; signing in as a
 * different user purges it before anything can sync, so one account's data
 * is never merged into another's.
 *
 * Device-level settings (theme, sound, haptics, week start, quote rotation)
 * are deliberately not listed here.
 */
import { decideClaim } from './dataOwner';
import { discardPendingWrites } from './pendingWrites';
import { invalidateSyncGeneration } from './syncState';
import { readStorage, removeStorage, writeStorage } from './storage';

export const DATA_OWNER_STORAGE_KEY = 'ascend_data_owner';

/** Ledger and sync data; its presence means the device holds a user's data. */
const USER_LEDGER_KEYS = [
  'habit_tracker_habits',
  'ascend_completion_events',
  'ascend_momentum_events',
  'habit_tracker_evidence',
  'ascend_friction_audits',
  'ascend_pending_friction_audits',
  'ascend_friction_prompted_keys',
  'ascend_active_fallbacks',
  'ascend_rolled_over_habits',
  'habit_tracker_reminders',
  'ascend_chronicle_entries',
  'ascend_chronicle',
  'ascend_offline_habit_log_queue',
  'ascend_offline_profile_queue',
  'ascend_offline_momentum_event_queue',
  'ascend_offline_chronicle_queue',
  'ascend_offline_feedback_queue',
  'ascend_bowl_cycle_history',
  'ascend_user_feedback_history',
  'ascend_dead_letter',
] as const;

/** Profile, settings and flags that belong to the user. */
const USER_PROFILE_KEYS = [
  'ascend_user_session',
  'ascend_onboarding_completed',
  'ascend_has_completed_tutorial',
  'ascend_personal_interests',
  'ascend_chronicle_settings',
  'ascend_accumulation_cycle_days',
  'ascend_bowl_cycle_start_iso',
  'ascend_bowl_cycle_reset_at',
  'ascend_protection_state',
  'ascend_exam_shield',
  'ascend_vacation_mode',
  'ascend_last_active_date',
  'ascend_vision_reminder_last_date',
  'ascend_reminders_last_sync_timestamp',
  'ascend_deleted_habit_ids',
  'ascend_avatar_id',
  'ascend_user_name',
  'ascend_dob',
  'ascend_location',
  'ascend_university',
  'ascend_becoming_goal',
  'ascend_user_vision',
  'ascend_vision_statement',
  'ascend_health_sleep_denied',
  'ascend_identity_vote_floor',
  // Caches and widget hand-off that can carry the user's data.
  'ascend_reminders_cache',
  'ascend_habit_logs_cache',
  'ascend_reminders',
  'ascend_cache_timestamp',
  'ascend_widget_data',
  'CapacitorStorage.ascend_widget_data',
  'ascend_widget_pending_actions',
  'ascend_widget_launch_route',
] as const;

/** Per-user key families. */
const USER_KEY_PREFIXES = ['ascend_profile_cache:', 'ascend_tutorial_screen_'] as const;

function storageKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

export function hasLocalUserData(): boolean {
  return USER_LEDGER_KEYS.some((key) => {
    const raw = readStorage(key);
    return raw !== null && raw !== '' && raw !== '[]';
  });
}

export function readDataOwner(): string | null {
  return readStorage(DATA_OWNER_STORAGE_KEY) || null;
}

/**
 * Remove every user-scoped key. Pending debounced writes are dropped first so
 * none of them can write the previous user's data back afterwards.
 */
export function purgeLocalUserData(): void {
  discardPendingWrites();
  // Writes still in flight for this user must not re-queue into the next user's data.
  invalidateSyncGeneration();
  for (const key of [...USER_LEDGER_KEYS, ...USER_PROFILE_KEYS, DATA_OWNER_STORAGE_KEY]) removeStorage(key);
  for (const key of storageKeys()) {
    if (USER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) removeStorage(key);
  }
}

/**
 * Record `userId` as the owner of local data, purging it first when it belongs
 * to someone else. Returns true when data was purged, so in-memory state must
 * be reset as well.
 */
export function claimLocalUserData(userId: string, { adoptUnowned = false } = {}): boolean {
  const decision = decideClaim(readDataOwner(), userId, hasLocalUserData(), adoptUnowned);
  if (decision === 'keep') return false;
  if (decision === 'purge') purgeLocalUserData();
  writeStorage(DATA_OWNER_STORAGE_KEY, userId);
  return decision === 'purge';
}
