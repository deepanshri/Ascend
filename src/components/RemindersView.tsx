import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StandaloneReminder, UserSession } from '../types';
import { fetchPublicReminders } from '../lib/supabase';
import { ReminderCard } from './ReminderCard';
import { ReminderLongPressOverlay } from './ReminderLongPressOverlay';
import { CreateReminderModal } from './CreateReminderModal';
import { EditReminderModal } from './EditReminderModal';
import { DeleteReminderConfirmModal } from './DeleteReminderConfirmModal';
import { ScreenHeader, SCREEN_INSET_CLASS, HEADER_ICON_BTN_CLASS } from './ScreenHeader';
import { FriendsFeed } from './FriendsFeed';
import { tapPress } from '../lib/motionPresets';
import { useTaskArchiveGrace } from '../hooks/useTaskArchiveGrace';

interface RemindersViewProps {
  reminders: StandaloneReminder[];
  focusReminderId?: string | null;
  openCreate?: boolean;
  onOpenCreateConsumed?: () => void;
  onAddReminder: (
    reminder: Omit<StandaloneReminder, 'id' | 'completed' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      notificationId1?: number;
      notificationId2?: number;
    }
  ) => void;
  onUpdateReminder?: (id: string, updates: Partial<Omit<StandaloneReminder, 'id' | 'createdAt'>>) => void;
  onToggleComplete: (id: string) => void;
  onSetReminderCompleted?: (id: string, completed: boolean) => void;
  onDeleteReminder: (id: string) => void;
  onSnoozeReminder?: (id: string, minutes: number) => void;
  userSession?: UserSession | null;
  onSyncReminders?: () => void;
  onRemindersHydrated?: (reminders: StandaloneReminder[]) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onOpenSettings?: () => void;
}

function hasTimedReminder(r: StandaloneReminder) {
  return Boolean(r.time && String(r.time).trim());
}

function sortTasks(list: StandaloneReminder[]) {
  return [...list].sort((a, b) => {
    const aTimed = hasTimedReminder(a) ? 0 : 1;
    const bTimed = hasTimedReminder(b) ? 0 : 1;
    if (aTimed !== bTimed) return aTimed - bTimed;
    return `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`);
  });
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  reminders,
  focusReminderId = null,
  openCreate = false,
  onOpenCreateConsumed,
  onAddReminder,
  onUpdateReminder,
  onToggleComplete,
  onSetReminderCompleted,
  onDeleteReminder,
  onSnoozeReminder,
  userSession,
  onRemindersHydrated,
  onScroll,
  onOpenSettings,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [longPressedReminder, setLongPressedReminder] = useState<StandaloneReminder | null>(null);
  const [longPressedRect, setLongPressedRect] = useState<DOMRect | null>(null);
  const [editingReminder, setEditingReminder] = useState<StandaloneReminder | null>(null);
  const [deletingReminder, setDeletingReminder] = useState<StandaloneReminder | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const { pendingArchiveIds, beginGrace, cancelGrace, isInGrace } = useTaskArchiveGrace();

  useEffect(() => {
    if (!userSession || userSession.isGuest) return;
    let cancelled = false;
    void fetchPublicReminders(userSession.id)
      .then((remote) => {
        if (cancelled || !remote) return;
        onRemindersHydrated?.(Array.isArray(remote) ? remote : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userSession?.id, userSession?.isGuest]);

  useEffect(() => {
    if (!focusReminderId) return;
    const found = (Array.isArray(reminders) ? reminders : []).find((item) => item.id === focusReminderId);
    if (found) setEditingReminder(found);
  }, [focusReminderId, reminders]);

  useEffect(() => {
    if (!openCreate) return;
    setIsCreateOpen(true);
    onOpenCreateConsumed?.();
  }, [openCreate, onOpenCreateConsumed]);

  const persistCompleted = useCallback(
    (id: string, completed: boolean) => {
      if (onSetReminderCompleted) onSetReminderCompleted(id, completed);
      else onToggleComplete(id);
    },
    [onSetReminderCompleted, onToggleComplete]
  );

  /** Complete → persist immediately (metrics), keep in active list for grace + Undo. */
  const handleSetCompleted = useCallback(
    (id: string, completed: boolean) => {
      if (completed) {
        persistCompleted(id, true);
        beginGrace(id);
        return;
      }
      cancelGrace(id);
      persistCompleted(id, false);
    },
    [beginGrace, cancelGrace, persistCompleted]
  );

  const handleUndoGrace = useCallback(
    (id: string) => {
      cancelGrace(id);
      persistCompleted(id, false);
    },
    [cancelGrace, persistCompleted]
  );

  const liveReminders = useMemo(
    () => (Array.isArray(reminders) ? reminders.filter((item) => !item.deleted) : []),
    [reminders]
  );

  const { activeTasks, completedTasks } = useMemo(() => {
    const active: StandaloneReminder[] = [];
    const completed: StandaloneReminder[] = [];
    for (const item of liveReminders) {
      if (!item.completed || pendingArchiveIds.has(item.id)) {
        active.push(item);
      } else {
        completed.push(item);
      }
    }
    return { activeTasks: sortTasks(active), completedTasks: sortTasks(completed) };
  }, [liveReminders, pendingArchiveIds]);

  return (
    <div
      id="reminders-screen"
      onScroll={onScroll}
      className={`absolute inset-0 w-full px-4 ${SCREEN_INSET_CLASS} pb-28 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none`}
    >
      <ScreenHeader
        title="Tasks"
        onOpenSettings={onOpenSettings}
        actions={
          <>
            {userSession ? (
              <FriendsFeed
                userId={userSession.id}
                isGuest={userSession.isGuest}
                userEmail={userSession.email}
                userName={userSession.name}
                variant="icon"
                mode="invite"
              />
            ) : null}
            <motion.button
              id="new-reminder-btn"
              type="button"
              whileTap={tapPress}
              onClick={() => setIsCreateOpen(true)}
              aria-label="New Task"
              title="New Task"
              className={HEADER_ICON_BTN_CLASS}
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </motion.button>
          </>
        }
      />

      <section className="space-y-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {activeTasks.map((rem) => (
            <motion.div
              key={rem.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <ReminderCard
                reminder={rem}
                variant="active"
                inGrace={isInGrace(rem.id)}
                onToggleComplete={onToggleComplete}
                onSetCompleted={handleSetCompleted}
                onUndoGrace={() => handleUndoGrace(rem.id)}
                onDeleteReminder={onDeleteReminder}
                onSnoozeReminder={onSnoozeReminder}
                onLongPress={(reminder, rect) => {
                  setLongPressedReminder(reminder);
                  setLongPressedRect(rect);
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500 space-y-1.5">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No tasks yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 px-6">
              Tap + to add a Reminder (with time) or a To-Do (no time).
            </p>
          </div>
        )}
      </section>

      {completedTasks.length > 0 ? (
        <section className="pt-1 pb-2">
          <button
            type="button"
            onClick={() => setCompletedOpen((open) => !open)}
            aria-expanded={completedOpen}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 px-3.5 py-2.5 text-left cursor-pointer"
          >
            <span className="text-[12.5px] font-bold text-slate-700 dark:text-slate-200">
              Completed ({completedTasks.length})
            </span>
            {completedOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden />
            )}
          </button>

          <AnimatePresence initial={false}>
            {completedOpen ? (
              <motion.div
                key="completed-drawer"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-2.5">
                  <AnimatePresence initial={false} mode="popLayout">
                    {completedTasks.map((rem) => (
                      <motion.div
                        key={rem.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-stretch gap-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <ReminderCard
                            reminder={rem}
                            variant="archived"
                            onToggleComplete={onToggleComplete}
                            onSetCompleted={handleSetCompleted}
                            onDeleteReminder={onDeleteReminder}
                            onLongPress={(reminder, rect) => {
                              setLongPressedReminder(reminder);
                              setLongPressedRect(rect);
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete ${rem.title}`}
                          title="Delete permanently"
                          onClick={() => setDeletingReminder(rem)}
                          className="shrink-0 self-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-slate-500 hover:text-orange-700 dark:hover:text-orange-400 hover:border-orange-300 dark:hover:border-orange-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={2.25} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>
      ) : null}

      <CreateReminderModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        userSession={userSession}
        onAddReminder={onAddReminder}
      />

      <AnimatePresence>
        {longPressedReminder && (
          <ReminderLongPressOverlay
            key="reminder-long-press"
            reminder={longPressedReminder}
            rect={longPressedRect}
            onClose={() => {
              setLongPressedReminder(null);
              setLongPressedRect(null);
            }}
            onOpenEdit={(r) => {
              setLongPressedReminder(null);
              setEditingReminder(r);
            }}
            onOpenDeleteConfirm={(r) => {
              setLongPressedReminder(null);
              setDeletingReminder(r);
            }}
          />
        )}
      </AnimatePresence>

      <EditReminderModal
        isOpen={Boolean(editingReminder)}
        reminder={editingReminder}
        userSession={userSession}
        onClose={() => setEditingReminder(null)}
        onSave={(id, updates) => {
          if (onUpdateReminder) {
            onUpdateReminder(id, updates);
          }
        }}
      />

      <DeleteReminderConfirmModal
        isOpen={Boolean(deletingReminder)}
        reminder={deletingReminder}
        onClose={() => setDeletingReminder(null)}
        onConfirm={() => {
          if (deletingReminder) {
            cancelGrace(deletingReminder.id);
            onDeleteReminder(deletingReminder.id);
            setDeletingReminder(null);
          }
        }}
      />
    </div>
  );
};
