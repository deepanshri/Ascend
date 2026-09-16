import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
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

interface RemindersViewProps {
  reminders: StandaloneReminder[];
  focusReminderId?: string | null;
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

export const RemindersView: React.FC<RemindersViewProps> = ({
  reminders,
  focusReminderId = null,
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

  const safeReminders = Array.isArray(reminders) ? reminders.filter((item) => !item.deleted) : [];
  const hasTime = (r: StandaloneReminder) => Boolean(r.time && String(r.time).trim());
  /** Timed (R) float above timeless to-dos (TD); then by date/time. */
  const sortedList = [...safeReminders].sort((a, b) => {
    const aTimed = hasTime(a) ? 0 : 1;
    const bTimed = hasTime(b) ? 0 : 1;
    if (aTimed !== bTimed) return aTimed - bTimed;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`);
  });

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
          {sortedList.map((rem) => (
            <motion.div
              key={rem.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <ReminderCard
                reminder={rem}
                onToggleComplete={onToggleComplete}
                onSetCompleted={onSetReminderCompleted}
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

        {sortedList.length === 0 && (
          <div className="py-6 text-center text-slate-400 dark:text-slate-500 space-y-1.5">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No tasks yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 px-6">
              Tap + to add a Reminder (with time) or a To-Do (no time).
            </p>
          </div>
        )}
      </section>

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
            onDeleteReminder(deletingReminder.id);
            setDeletingReminder(null);
          }
        }}
      />
    </div>
  );
};
