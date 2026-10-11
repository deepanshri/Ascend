import React, { useCallback } from 'react';
import { useReminders, useRemindersActions } from '../providers/RemindersProvider';
import { useSession } from '../providers/SessionProvider';
import { useUI, useUIActions } from '../providers/UIProvider';

const RemindersView = React.lazy(() => import('../components/RemindersView').then((m) => ({ default: m.RemindersView })));

/** Tasks and reminders. */
export function RemindersRoute({ onScroll }: { onScroll: (event: React.UIEvent<HTMLElement>) => void }) {
  const { session } = useSession();
  const { reminders } = useReminders();
  const actions = useRemindersActions();
  const { widgetFocusReminderId, widgetOpenCreateTask } = useUI();
  const { setTab, setOpenCreateTask } = useUIActions();
  const openSettings = useCallback(() => setTab('settings'), [setTab]);
  const createConsumed = useCallback(() => setOpenCreateTask(false), [setOpenCreateTask]);

  return (
    <RemindersView
      reminders={reminders}
      focusReminderId={widgetFocusReminderId}
      openCreate={widgetOpenCreateTask}
      onOpenCreateConsumed={createConsumed}
      onAddReminder={actions.addReminder}
      onUpdateReminder={actions.updateReminder}
      onToggleComplete={actions.toggleReminder}
      onSetReminderCompleted={actions.setReminderCompleted}
      onDeleteReminder={actions.deleteReminder}
      onSnoozeReminder={actions.snoozeReminder}
      userSession={session}
      onRemindersHydrated={actions.mergeHydrated}
      onSyncReminders={actions.syncNow}
      onScroll={onScroll}
      onOpenSettings={openSettings}
    />
  );
}
