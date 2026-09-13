import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StandaloneReminder, UserSession } from '../types';
import { fetchPublicReminders } from '../lib/supabase';
import { ReminderCard } from './ReminderCard';
import { ReminderLongPressOverlay } from './ReminderLongPressOverlay';
import { CreateReminderModal } from './CreateReminderModal';
import { EditReminderModal } from './EditReminderModal';
import { DeleteReminderConfirmModal } from './DeleteReminderConfirmModal';
import { ScreenHeader, SCREEN_INSET_CLASS } from './ScreenHeader';
import { tapPress } from '../lib/motionPresets';

interface RemindersViewProps {
  reminders: StandaloneReminder[];
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
  onNotify?: (message: string) => void;
  userSession?: UserSession | null;
  onSyncReminders?: () => void;
  onRemindersHydrated?: (reminders: StandaloneReminder[]) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onOpenSettings?: () => void;
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  reminders,
  onAddReminder,
  onUpdateReminder,
  onToggleComplete,
  onSetReminderCompleted,
  onDeleteReminder,
  onSnoozeReminder,
  onNotify,
  userSession,
  onRemindersHydrated,
  onScroll,
  onOpenSettings,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(true);
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

  const safeReminders = Array.isArray(reminders) ? reminders.filter((item) => !item.deleted) : [];
  const activeList = safeReminders
    .filter((r) => !r.completed)
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  const completedList = safeReminders
    .filter((r) => r.completed)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  useEffect(() => {
    if (completedList.length === 0) setCompletedOpen(false);
  }, [completedList.length]);

  return (
    <div
      id="reminders-screen"
      onScroll={onScroll}
      className={`absolute inset-0 w-full px-4 ${SCREEN_INSET_CLASS} pb-28 space-y-4 overflow-y-auto overscroll-y-contain no-scrollbar select-none`}
    >
      <ScreenHeader
        title="Reminders"
        subtitle="Standalone alerts & focus checkpoints"
        titleClassName="text-[28px] sm:text-[30px] font-black text-slate-900 dark:text-white tracking-tight leading-tight text-left"
        onOpenSettings={onOpenSettings}
        actions={
          <motion.button
            id="new-reminder-btn"
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={tapPress}
            transition={{ type: 'spring', damping: 15, stiffness: 400 }}
            onClick={() => setIsCreateOpen(true)}
            aria-label="New Reminder"
            title="New Reminder"
            className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-[#22C55E]/70 dark:border-[#3B82F6] text-[#22C55E] dark:text-[#3B82F6] shadow-xs hover:bg-emerald-50 dark:hover:bg-blue-950/50 cursor-pointer flex items-center justify-center shrink-0"
          >
            <svg
              className="w-4 h-4 stroke-[2.5] text-[#22C55E] dark:text-[#3B82F6]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </motion.button>
        }
      />

      <div className="space-y-2">
        <div
          data-tour="reminders-standalone"
          className="px-1 text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed"
        >
          Standalone checkpoints stay off the habit log so a missed alert never rewrites identity votes.
        </div>
        <div
          data-tour="reminders-dual-alerts"
          className="px-1 text-[12.5px] text-slate-500 dark:text-slate-400 leading-relaxed"
        >
          Timed reminders can fire twice: 10 minutes before, then at the exact time — on the device, not a browser timer.
        </div>
      </div>

      <div className="space-y-4">
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[12px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Active ({activeList.length})
            </span>
            {activeList.length > 0 && (
              <span className="text-[10.5px] text-slate-400 font-medium">Tap the checkmark to complete</span>
            )}
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            {activeList.map((rem) => (
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
                  onToggleComplete={(id) => {
                    setCompletedOpen(true);
                    onToggleComplete(id);
                  }}
                  onSetCompleted={(id, completed) => {
                    if (completed) setCompletedOpen(true);
                    onSetReminderCompleted?.(id, completed);
                  }}
                  onDeleteReminder={onDeleteReminder}
                  onSnoozeReminder={onSnoozeReminder}
                  onNotify={onNotify}
                  onLongPress={(reminder, rect) => {
                    setLongPressedReminder(reminder);
                    setLongPressedRect(rect);
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {activeList.length === 0 && (
            <div className="py-6 text-center text-slate-400 dark:text-slate-500 space-y-1.5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No active reminders</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 px-6">
                {completedList.length > 0
                  ? 'Completed items stay below — uncheck one to restore it here.'
                  : 'Tap + to create a standalone checkpoint.'}
              </p>
            </div>
          )}
        </section>

        {completedList.length > 0 && (
          <section className="space-y-2 pt-1">
            <motion.button
              type="button"
              whileTap={tapPress}
              aria-expanded={completedOpen}
              onClick={() => setCompletedOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-1 py-1 cursor-pointer"
            >
              <span className="text-[12px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Completed ({completedList.length})
              </span>
              <span className="flex items-center gap-1 text-[10.5px] text-slate-400 font-medium">
                {completedOpen ? 'Hide' : 'Show'}
                <motion.svg
                  animate={{ rotate: completedOpen ? 180 : 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 9l-7 7-7-7" />
                </motion.svg>
              </span>
            </motion.button>

            <AnimatePresence initial={false}>
              {completedOpen && (
                <motion.div
                  key="completed-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="overflow-hidden space-y-2.5 transform-gpu"
                >
                  {completedList.map((rem) => (
                    <motion.div
                      key={rem.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <ReminderCard
                        reminder={rem}
                        onToggleComplete={onToggleComplete}
                        onSetCompleted={onSetReminderCompleted}
                        onDeleteReminder={onDeleteReminder}
                        onNotify={onNotify}
                        onLongPress={(reminder, rect) => {
                          setLongPressedReminder(reminder);
                          setLongPressedRect(rect);
                        }}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>

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
