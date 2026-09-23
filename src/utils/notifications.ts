/**
 * Ascend Notification Utilities & Phrasing
 * Bridge module providing direct access to native notification scheduling,
 * dynamic auto-cancellation, and natural action-oriented copy generation.
 */

export * from '../lib/notifications';
export * from '../services/notificationService';

export {
  habitTargetCopy,
  formatHabitTargetCopy,
  formatActionHeadline,
  reminderExactCopy,
  reminderPriorCopy,
  morningMomentumCopy,
  afternoonFocusCopy,
  nightWrapUpCopy,
} from '../services/notificationService';

export {
  scheduleHabitTargetTimeNotification,
  cancelHabitTargetTimeNotification,
  syncAllHabitTargetNotifications,
  scheduleReminderDualAlerts,
  cancelReminderDualAlerts,
  rescheduleAllReminderDualAlerts,
  requestNotificationPermissions,
  schedulePsychologyNotifications,
} from '../lib/notifications';
