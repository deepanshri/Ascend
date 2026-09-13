import { HabitCategory } from '../types';

export function normalizeHabitCategory(category: string | undefined | null): HabitCategory {
  return category === 'work' || category === 'Work' ? 'work' : 'self_improvement';
}

export function habitCategoryLabel(category: HabitCategory): string {
  return category === 'work' ? 'Work' : 'Self Improvement';
}

export function habitCategoryBadge(category: HabitCategory): string {
  return category === 'work' ? 'W' : 'SI';
}

export function habitCategoryTagClass(category: HabitCategory): string {
  if (category === 'work') {
    return 'bg-emerald-100 text-emerald-950 border-emerald-400 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-400';
  }
  return 'bg-teal-100 text-teal-950 border-teal-500 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-400';
}
