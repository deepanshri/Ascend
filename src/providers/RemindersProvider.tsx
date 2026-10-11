import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { StandaloneReminder, UserSession } from '../types';
import { useSession, useUserDataReset } from './SessionProvider';
import { usePersistEffect } from '../hooks/usePersistedState';
import { REMINDERS_STORAGE_KEY } from '../lib/ledgerStorage';
import { loadStoredReminders } from '../lib/ledgerStorageLoaders';
import { initializeReminderNotifications, requestNotificationPermissions } from '../lib/notifications';
import { writeJson } from '../lib/storage';
import { notificationScheduler, remindersSyncService, upsertPublicReminder } from '../lib/supabase';
import {
  addReminder as addReminderTo,
  countPendingReminders,
  createReminder,
  deleteReminder as deleteReminderFrom,
  mergeRemindersByUpdatedAt,
  setReminderCompleted as setReminderCompletedIn,
  snoozeReminder as snoozeReminderIn,
  toggleReminder as toggleReminderIn,
  updateReminder as updateReminderIn,
  type NewReminderInput,
  type ReminderChange,
  type ReminderUpdates,
} from './remindersState';

/** Debounce for reminder writes, matching the rest of the ledger. */
const STORAGE_DEBOUNCE_MS = 320;

interface RemindersState {
  reminders: StandaloneReminder[];
  pendingCount: number;
}

interface RemindersActions {
  addReminder: (input: NewReminderInput) => void;
  updateReminder: (id: string, updates: ReminderUpdates) => void;
  toggleReminder: (id: string) => void;
  setReminderCompleted: (id: string, completed: boolean) => void;
  deleteReminder: (id: string) => void;
  snoozeReminder: (id: string, minutes: number) => void;
  /** Merge reminders fetched elsewhere (RemindersView) and re-arm their alerts. */
  mergeHydrated: (remote: StandaloneReminder[]) => void;
  /** Run a last-write-wins sync with Supabase now. */
  syncNow: () => void;
  /** Cancel every reminder's alerts and clear the list, in memory and storage. */
  resetAll: () => void;
}

const RemindersStateContext = createContext<RemindersState | null>(null);
const RemindersActionsContext = createContext<RemindersActions | null>(null);

function sessionKey(session: UserSession | null): string | null {
  return session && !session.isGuest ? session.id : null;
}

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const [reminders, setReminders] = useState<StandaloneReminder[]>(loadStoredReminders);
  /** Latest list, updated synchronously so back-to-back actions never see stale data. */
  const remindersRef = useRef(reminders);
  const { session } = useSession();
  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;
  const syncUserId = sessionKey(session);
  /** Incremented per sync request; only the newest response is applied. */
  const syncSeqRef = useRef(0);

  const commit = useCallback((next: StandaloneReminder[]) => {
    if (next === remindersRef.current) return;
    remindersRef.current = next;
    setReminders(next);
  }, []);

  usePersistEffect(reminders, (value) => writeJson(REMINDERS_STORAGE_KEY, value), STORAGE_DEBOUNCE_MS);

  const syncWith = useCallback(
    (list: StandaloneReminder[], session: UserSession | null) => {
      const seq = ++syncSeqRef.current;
      return remindersSyncService
        .syncReminders(list, session)
        .then((res) => {
          if (seq !== syncSeqRef.current) return;
          commit(mergeRemindersByUpdatedAt(remindersRef.current, Array.isArray(res.reminders) ? res.reminders : []));
        })
        .catch(() => {});
    },
    [commit]
  );

  /** Push local changes for signed-in users; guests stay local. */
  const syncIfSignedIn = useCallback(
    (list: StandaloneReminder[]) => {
      const session = sessionRef.current;
      if (!session || session.isGuest) return;
      void syncWith(list, session);
    },
    [syncWith]
  );

  /** Apply a transition: commit, update native alerts, upsert the row, sync. */
  const apply = useCallback(
    (change: ReminderChange, { upsert = true, syncList = change.reminders } = {}) => {
      const { changed, alert } = change;
      if (!changed) return;
      if (alert === 'schedule') notificationScheduler.scheduleReminderAlerts(changed);
      else if (alert === 'cancel') notificationScheduler.cancelReminderAlerts(changed.id, changed);
      commit(change.reminders);
      if (upsert) void upsertPublicReminder(sessionRef.current, changed).catch(() => {});
      syncIfSignedIn(syncList);
    },
    [commit, syncIfSignedIn]
  );

  // Re-arm native dual alerts after force-quit / reboot, from the stored list.
  useEffect(() => {
    void initializeReminderNotifications();
    notificationScheduler.bootReschedulePendingAlerts(remindersRef.current);
  }, []);

  // Last-write-wins pull whenever a signed-in user is bound.
  useEffect(() => {
    if (!syncUserId) return;
    void syncWith(remindersRef.current, sessionRef.current);
  }, [syncUserId, syncWith]);

  const addReminder = useCallback(
    (input: NewReminderInput) => {
      const now = Date.now();
      const reminder = createReminder(input, now, Math.random().toString(36).substring(2, 6));
      apply(addReminderTo(remindersRef.current, reminder), { upsert: false });
    },
    [apply]
  );

  const updateReminder = useCallback(
    (id: string, updates: ReminderUpdates) => apply(updateReminderIn(remindersRef.current, id, updates, Date.now())),
    [apply]
  );

  const toggleReminder = useCallback(
    (id: string) => {
      void requestNotificationPermissions();
      apply(toggleReminderIn(remindersRef.current, id, Date.now()));
    },
    [apply]
  );

  const setReminderCompleted = useCallback(
    (id: string, completed: boolean) => {
      void requestNotificationPermissions();
      apply(setReminderCompletedIn(remindersRef.current, id, completed, Date.now()));
    },
    [apply]
  );

  const deleteReminder = useCallback(
    (id: string) => {
      const change = deleteReminderFrom(remindersRef.current, id, Date.now());
      // Sync the tombstone too, so other devices drop the reminder.
      apply(change, { syncList: change.changed ? [change.changed, ...change.reminders] : change.reminders });
    },
    [apply]
  );

  const snoozeReminder = useCallback(
    (id: string, minutes: number) => apply(snoozeReminderIn(remindersRef.current, id, minutes, Date.now())),
    [apply]
  );

  const mergeHydrated = useCallback(
    (remote: StandaloneReminder[]) => {
      const next = Array.isArray(remote) ? remote : [];
      commit(mergeRemindersByUpdatedAt(remindersRef.current, next));
      notificationScheduler.bootReschedulePendingAlerts(next);
    },
    [commit]
  );

  const syncNow = useCallback(() => {
    void syncWith(remindersRef.current, sessionRef.current);
  }, [syncWith]);

  const resetAll = useCallback(() => {
    // Invalidate in-flight syncs so a late response cannot restore the list.
    syncSeqRef.current += 1;
    for (const reminder of remindersRef.current) {
      notificationScheduler.cancelReminderAlerts(reminder.id, reminder);
    }
    commit([]);
  }, [commit]);

  // A response for a previous user must never merge into the next one.
  const boundUserRef = useRef(syncUserId);
  if (boundUserRef.current !== syncUserId) {
    boundUserRef.current = syncUserId;
    syncSeqRef.current += 1;
  }

  useUserDataReset(resetAll);

  const state = useMemo<RemindersState>(
    () => ({ reminders, pendingCount: countPendingReminders(reminders) }),
    [reminders]
  );

  const actions = useMemo<RemindersActions>(
    () => ({
      addReminder,
      updateReminder,
      toggleReminder,
      setReminderCompleted,
      deleteReminder,
      snoozeReminder,
      mergeHydrated,
      syncNow,
      resetAll,
    }),
    [
      addReminder,
      updateReminder,
      toggleReminder,
      setReminderCompleted,
      deleteReminder,
      snoozeReminder,
      mergeHydrated,
      syncNow,
      resetAll,
    ]
  );

  return (
    <RemindersActionsContext.Provider value={actions}>
      <RemindersStateContext.Provider value={state}>{children}</RemindersStateContext.Provider>
    </RemindersActionsContext.Provider>
  );
}

export function useReminders(): RemindersState {
  const value = useContext(RemindersStateContext);
  if (!value) throw new Error('useReminders must be used inside RemindersProvider');
  return value;
}

export function useRemindersActions(): RemindersActions {
  const value = useContext(RemindersActionsContext);
  if (!value) throw new Error('useRemindersActions must be used inside RemindersProvider');
  return value;
}
