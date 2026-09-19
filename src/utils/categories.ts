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

/**
 * WCAG AA status / category chips — solid brand fill + white text.
 * Light: --ascend-accent (#15803d) on white ≈ 5.02:1
 * Dark:  Tailwind blue-600 (#2563eb) on white ≈ 5.17:1
 * Avoids soft --ascend-accent-soft (#dcfce7) + mid greens (~3.4:1 FAIL).
 */
export const ASCEND_STATUS_CHIP_CLASS =
  'bg-accent text-accent-fg border-accent dark:bg-blue-600 dark:text-white dark:border-blue-500';

/**
 * Self-improvement category chip — mint soft + accent ink (not orange/red).
 * Orange is reserved for needs-attention only. Soft fill + solid accent text
 * keeps the mint look while holding AA contrast (~5:1 on accent-soft).
 */
export const ASCEND_SI_CHIP_CLASS =
  'bg-accent-soft text-accent border-accent dark:bg-blue-950 dark:text-blue-200 dark:border-blue-500';

export function habitCategoryTagClass(category: HabitCategory): string {
  if (category === 'work') {
    return ASCEND_STATUS_CHIP_CLASS;
  }
  return ASCEND_SI_CHIP_CLASS;
}
