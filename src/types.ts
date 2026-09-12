export type HabitCategory = 'work' | 'self_improvement';

export type HabitPriority = 'high' | 'mid' | 'low';

export type ScheduleType = 'daily' | 'specific_days' | 'interval' | 'weekly_target';

export type CompletionType = 'full' | 'fallback_micro';

// Immutable append-only completion event log record
export interface HabitCompletionEvent {
  id: string;
  habitId: string;
  dayIndex: number; // 0 to 6 (0 = Day 1 ... 6 = Day 7)
  date: string;
  type: CompletionType; // 'full' (1.0 weight) | 'fallback_micro' (0.5 weight)
  note?: string;
  timestamp: number;
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
  scheduledDays?: number[]; // [0, 2, 4] for Mon/Wed/Fri (0 = Day 1 ... 6 = Day 7)
  intervalDays?: number; // every X days
  weeklyTargetCount?: number; // X times per week
}

export interface IdentityEvidence {
  id: string;
  habitId: string;
  habitName: string;
  identityStatement: string;
  category: HabitCategory;
  date: string;
  dayNumber: number;
}

export interface StandaloneReminder {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM (24-hour, optional)
  notes?: string;
  completed: boolean;
  alert10Min?: boolean; // 10-minute prior alert enabled
  alertExact?: boolean; // exact-time alert enabled
  alert10MinTriggered?: boolean;
  alertDueTriggered?: boolean;
  createdAt: number;
  updatedAt: number; // Timestamp for Last-Write-Wins synchronization
  deleted?: boolean; // Soft-delete tombstone for cross-device sync
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
  syncStatus: 'local' | 'synced' | 'syncing';
}

export interface UserProfile {
  id: string;
  interests: string[];
  has_completed_tutorial: boolean;
}

export interface FrictionAudit {
  id: string;
  date: string;
  dayNumber: number;
  habitName: string;
  type: 'fallback_used' | 'momentum_dip';
  note?: string;
  timestamp: number;
}
