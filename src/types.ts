import type { TimeOfDay } from './types/habit';

export type { TimeOfDay } from './types/habit';

export type HabitCategory = 'work' | 'self_improvement';

export type HabitPriority = 'high' | 'mid' | 'low';

export type ScheduleType = 'daily' | 'specific_days' | 'interval' | 'weekly_target';

export type CompletionType = 'full' | 'fallback_micro';

export type MomentumEventType = 'full' | 'fallback' | 'missed' | 'reversal';

/** Append-only swipe / miss record. Historical rows are never overwritten. */
export interface MomentumEvent {
  id: string;
  habitId: string;
  eventType: MomentumEventType;
  weight: number;
  timestamp: number;
  /** YYYY-MM-DD local calendar date the event belongs to. */
  loggedDate?: string;
  /** Bowl routing snapshot at insert time. */
  timeOfDay?: TimeOfDay;
}

// Daily card projection (latest-per-day). Momentum + identity votes use MomentumEvent.
export interface HabitCompletionEvent {
  id: string;
  habitId: string;
  dayIndex: number; // 0 to 6 (0 = Day 1 ... 6 = Day 7)
  date: string; // YYYY-MM-DD preferred; legacy display strings remap via timestamp
  type: CompletionType; // 'full' (1.0 weight) | 'fallback_micro' (0.5 weight)
  note?: string;
  frictionReason?: string;
  timestamp: number;
  /** Bowl routing snapshot at completion time. */
  timeOfDay?: TimeOfDay;
}

export interface Habit {
  id: string;
  name: string;
  category: HabitCategory;
  timestamp: string; // e.g., "08:00 AM" or "Every Morning"
  days: boolean[]; // Array of 7 booleans (index 0 = Day 1, index 6 = Day 7)
  microDays?: boolean[]; // Array of 7 booleans for fallback micro-habit completions
  fallbackMicroHabit?: string; // e.g., "Do 2 min warmup / read 2 pages"
  purposeAnchor?: string; // "Why I built this"
  identityStatement: string; // e.g. "I am a focused builder"
  targetDaysPerWeek: number;
  color?: string;
  archived?: boolean; // When archived, habit is hidden from active list without deleting logs
  tags?: string[];
  priority?: HabitPriority;
  scheduleType?: ScheduleType;
  scheduledDays?: number[]; // Monday-first weekdays: [0, 2, 4] = Mon/Wed/Fri. Empty/missing = every day.
  intervalDays?: number; // every X days
  weeklyTargetCount?: number; // X times per week
  isKeystone?: boolean;
  /** Morning vs night bowl this habit drops into. */
  timeOfDay?: TimeOfDay;
  /** Epoch ms of last local/remote mutation. Used for habit hydrate LWW. */
  updatedAt?: number;
}

export interface IdentityEvidence {
  id: string;
  habitId: string;
  habitName: string;
  identityStatement: string;
  category: HabitCategory;
  date: string;
  dayNumber: number;
  /** YYYY-MM-DD local calendar day this vote belongs to. */
  loggedDate?: string;
}

export interface StandaloneReminder {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM (24-hour, optional) — same as target_time
  notes?: string;
  completed: boolean;
  alert10Min?: boolean; // 10-minute prior alert enabled
  alertExact?: boolean; // exact-time alert enabled
  alert10MinTriggered?: boolean;
  alertDueTriggered?: boolean;
  createdAt: number;
  updatedAt: number; // Timestamp for Last-Write-Wins synchronization
  deleted?: boolean; // Soft-delete tombstone for cross-device sync
  habitId?: string | null;
  daysOfWeek?: number[]; // 0 = Sunday … 6 = Saturday
  isEnabled?: boolean;
  notificationId1?: number; // 10-minute prior native notification id
  notificationId2?: number; // exact-time native notification id
}

export type ActiveTab = 'home' | 'reminders' | 'report' | 'personal' | 'settings';
export type ReportPeriod = 'today' | 'week' | 'month';
export type GraphType = 'rings' | 'radar';
export type ReportTimeWindow = '7d' | '30d' | '90d';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  isGuest: boolean;
  memberSince: string;
  syncStatus: 'local' | 'synced' | 'syncing' | 'error';
}

export interface UserProfile {
  id: string;
  interests: string[];
  has_completed_tutorial: boolean;
  avatar_url?: string | null;
}

export interface FrictionAudit {
  id: string;
  date: string;
  dayNumber: number;
  habitName: string;
  habitId?: string;
  loggedDate?: string;
  type: 'fallback_used' | 'momentum_dip' | 'missed';
  reason?: string;
  note?: string;
  timestamp: number;
}
