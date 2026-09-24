import type { Habit } from '../types';

export const BOWL_COLORS = {
  dark_green: '#064e3b', // High-contrast deep dark forest green
  light_green: '#34d399', // Emerald-400
  blue: '#2563eb', // Blue-600
  light_blue: '#60a5fa', // Blue-400
  orange: '#ea580c', // Orange-600
} as const;

export type BowlColorKey = keyof typeof BOWL_COLORS;

/**
 * Normalizes named colors and hex codes to canonical bowl palette colors.
 */
export function normalizeHabitColor(color?: string | null): string {
  if (!color) return BOWL_COLORS.dark_green;
  const lower = color.toLowerCase().trim();
  if (
    lower === 'dark_green' ||
    lower === 'darkgreen' ||
    lower === 'dark green' ||
    lower === '#059669' ||
    lower === '#15803d' ||
    lower === '#166534'
  ) {
    return BOWL_COLORS.dark_green;
  }
  if (
    lower === 'light_green' ||
    lower === 'lightgreen' ||
    lower === 'light green' ||
    lower === '#86efac' ||
    lower === '#22c55e' ||
    lower === '#10b981'
  ) {
    return BOWL_COLORS.light_green;
  }
  if (lower === 'blue' || lower === '#2563eb' || lower === '#3b82f6') {
    return BOWL_COLORS.blue;
  }
  if (lower === 'light_blue' || lower === 'lightblue' || lower === 'light blue' || lower === '#60a5fa') {
    return BOWL_COLORS.light_blue;
  }
  if (lower === 'orange' || lower === '#ea580c' || lower === '#f97316') {
    return BOWL_COLORS.orange;
  }
  return color;
}

/**
 * Resolve habit piece color based on assigned habit color, fallback status, and theme mode.
 */
export function resolveHabitPieceColor(
  habit?: Habit | null,
  isFallback = false,
  isDark = false
): string {
  if (habit?.color) {
    return normalizeHabitColor(habit.color);
  }

  // Priority-based default if no explicit habit color
  if (habit?.priority === 'high') {
    return isDark ? BOWL_COLORS.blue : BOWL_COLORS.dark_green;
  }
  if (habit?.priority === 'low') {
    return BOWL_COLORS.orange;
  }

  // Fallback micro-habit or mid-priority default
  if (isFallback) {
    return isDark ? BOWL_COLORS.light_blue : BOWL_COLORS.light_green;
  }

  return isDark ? BOWL_COLORS.blue : BOWL_COLORS.dark_green;
}
