import { Habit, IdentityEvidence, HabitCompletionEvent } from '../types';
import { formatEvidenceDate, getWeekDates, seedCompletedDays } from '../utils/dates';

const seededDays = seedCompletedDays(3);
const weekDates = getWeekDates();

function seedEventsForHabit(habitId: string): HabitCompletionEvent[] {
  const events: HabitCompletionEvent[] = [];
  seededDays.forEach((done, dayIndex) => {
    if (!done) return;
    const date = weekDates[dayIndex] ?? new Date();
    events.push({
      id: `evt-init-${habitId}-${dayIndex}`,
      habitId,
      dayIndex,
      date: formatEvidenceDate(date),
      type: 'full',
      timestamp: date.getTime() + 9 * 3600000,
    });
  });
  return events;
}

function seedEvidenceForHabit(
  habitId: string,
  habitName: string,
  identityStatement: string,
  category: Habit['category']
): IdentityEvidence[] {
  const evidence: IdentityEvidence[] = [];
  seededDays.forEach((done, dayIndex) => {
    if (!done) return;
    const date = weekDates[dayIndex] ?? new Date();
    evidence.push({
      id: `ev-${habitId}-${dayIndex}`,
      habitId,
      habitName,
      identityStatement,
      category,
      date: `${formatEvidenceDate(date)} • Completed 09:12 AM`,
      dayNumber: dayIndex + 1,
    });
  });
  return evidence;
}

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
    identityStatement: 'I am a focused creator who builds meaningful software.',
    targetDaysPerWeek: 5,
    priority: 'high',
    scheduleType: 'specific_days',
    scheduledDays: [0, 1, 2, 3, 4], // Mon - Fri
    color: '#15803d',
    tags: ['Engineering', 'Flow'],
  },
  {
    id: 'habit-2',
    name: '8h Restorative Sleep',
    category: 'sleep',
    timestamp: '10:30 PM',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: 'Wind down screens 15 min early',
    purposeAnchor: 'High quality rest protects cognitive stamina and executive control.',
    identityStatement: 'I respect my mental clarity and energy cycles.',
    targetDaysPerWeek: 7,
    priority: 'high',
    scheduleType: 'daily',
    color: '#166534',
    tags: ['Recovery'],
  },
  {
    id: 'habit-3',
    name: 'Read 20 pages (Deep Thinking)',
    category: 'mindset',
    timestamp: '07:30 AM',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: 'Read 1 single page or highlight',
    purposeAnchor: 'Expanding mental models and widening my cognitive horizon.',
    identityStatement: 'I am a lifelong learner actively shaping my wisdom.',
    targetDaysPerWeek: 5,
    priority: 'mid',
    scheduleType: 'weekly_target',
    weeklyTargetCount: 5,
    color: '#7c3aed',
    tags: ['Reading', 'Mental Models'],
  },
  {
    id: 'habit-4',
    name: 'Morning Mindfulness & Breath',
    category: 'self',
    timestamp: '07:00 AM',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: '3 deep diaphragmatic breaths',
    purposeAnchor: 'Anchoring emotional clarity before reactive inputs take over.',
    identityStatement: 'I navigate my days with calm presence and intention.',
    targetDaysPerWeek: 5,
    priority: 'mid',
    scheduleType: 'daily',
    color: '#22c55e',
    tags: ['Presence'],
  },
  {
    id: 'habit-5',
    name: 'Hydration & Daily Movement',
    category: 'health',
    timestamp: 'Throughout Day',
    days: [false, false, false, false, false, false, false],
    microDays: [false, false, false, false, false, false, false],
    fallbackMicroHabit: 'Drink 1 full glass of water',
    purposeAnchor: 'Physical energy is the foundational vehicle for everything I build.',
    identityStatement: 'I honor my vitality and treat my body as a sanctuary.',
    targetDaysPerWeek: 7,
    priority: 'low',
    scheduleType: 'daily',
    color: '#10b981',
    tags: ['Vitality'],
  },
];

export const INITIAL_EVIDENCE: IdentityEvidence[] = seedEvidenceForHabit(
  'habit-1',
  'Deep Work & Coding',
  'I am a focused creator who builds meaningful software.',
  'work'
);

export const INITIAL_COMPLETION_EVENTS: HabitCompletionEvent[] = seedEventsForHabit('habit-1');
