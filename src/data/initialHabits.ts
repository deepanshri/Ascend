import { Habit, IdentityEvidence, HabitCompletionEvent } from '../types';
import { seedCompletedDays } from '../utils/dates';

const seededDays = seedCompletedDays(3);

export const INITIAL_HABITS: Habit[] = [
  {
    id: 'habit-1',
    name: 'Deep Work & Coding',
    category: 'work',
    timestamp: '09:00 AM',
    days: seededDays,
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: '5 min code review or outline task',
    purposeAnchor: 'To compound technical mastery and bring novel ideas into reality.',
    targetDaysPerWeek: 5,
    priority: 'high',
    scheduleType: 'specific_days',
    scheduledDays: [0, 1, 2, 3, 4],
    color: '#064e3b',
    tags: ['W'],
    timeOfDay: 'morning',
  },
  {
    id: 'habit-2',
    name: '8h Restorative Sleep',
    category: 'self_improvement',
    timestamp: '10:30 PM',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: 'Wind down screens 15 min early',
    purposeAnchor: 'High quality rest protects cognitive stamina and executive control.',
    targetDaysPerWeek: 7,
    priority: 'high',
    scheduleType: 'daily',
    color: '#2563eb',
    tags: ['SI'],
    timeOfDay: 'night',
  },
  {
    id: 'habit-3',
    name: 'Read 20 pages (Deep Thinking)',
    category: 'self_improvement',
    timestamp: '07:30 AM',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: 'Read 1 single page or highlight',
    purposeAnchor: 'Expanding mental models and widening my cognitive horizon.',
    targetDaysPerWeek: 5,
    priority: 'mid',
    scheduleType: 'weekly_target',
    weeklyTargetCount: 5,
    color: '#ea580c',
    tags: ['SI'],
    timeOfDay: 'morning',
  },
  {
    id: 'habit-4',
    name: 'Morning Mindfulness & Breath',
    category: 'self_improvement',
    timestamp: '07:00 AM',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: '3 deep diaphragmatic breaths',
    purposeAnchor: 'Anchoring emotional clarity before reactive inputs take over.',
    targetDaysPerWeek: 5,
    priority: 'mid',
    scheduleType: 'daily',
    color: '#34d399',
    tags: ['SI'],
    timeOfDay: 'morning',
  },
  {
    id: 'habit-5',
    name: 'Hydration & Daily Movement',
    category: 'self_improvement',
    timestamp: 'Throughout Day',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: 'Drink 1 full glass of water',
    purposeAnchor: 'Physical energy is the foundational vehicle for everything I build.',
    targetDaysPerWeek: 7,
    priority: 'low',
    scheduleType: 'daily',
    color: '#064e3b',
    tags: ['SI'],
    timeOfDay: 'morning',
  },
];

export const SEED_HABIT_IDS: ReadonlySet<string> = new Set(INITIAL_HABITS.map((habit) => habit.id));

export function isSeedHabitId(id: string): boolean {
  return SEED_HABIT_IDS.has(id) || id.startsWith('habit-onboarding-');
}

export const INITIAL_EVIDENCE: IdentityEvidence[] = [];

export const INITIAL_COMPLETION_EVENTS: HabitCompletionEvent[] = [];
