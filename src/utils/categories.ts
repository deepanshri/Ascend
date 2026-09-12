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
    return 'bg-green-50 text-green-700 border-green-200/90 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800';
  }
  return 'bg-teal-50 text-teal-800 border-teal-200/90 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800';
}
