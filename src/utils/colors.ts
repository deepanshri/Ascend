import type { Habit } from '../types';

/**
 * Locked bowl marble palette (blue / green / orange system).
 * Theme × completion mapping lives in `getMarbleColor`.
 * Hexes are bright enough to read under MeshPhysicalMaterial + studio env.
 */
export const BOWL_COLORS = {
  /** Light mode · normal completion — solid green */
  dark_green: '#16a34a',
  /** Light mode · fallback completion — light green */
  light_green: '#4ade80',
  /** Dark mode · normal completion — solid blue */
  blue: '#2563eb',
  /** Dark mode · fallback completion — light blue */
  light_blue: '#60a5fa',
  orange: '#ea580c',
} as const;

export type BowlColorKey = keyof typeof BOWL_COLORS;

/**
 * Central marble color resolver — theme + completion type only.
 * Same hex MUST be used for the flying overlay and the bowl physics marble.
 *
 * Light + Normal   → Solid Green  #16a34a
 * Light + Fallback → Light Green  #4ade80
 * Dark  + Normal   → Solid Blue   #2563eb
 * Dark  + Fallback → Light Blue   #60a5fa
 */
export function getMarbleColor(isDark: boolean, isFallback: boolean): string {
  if (isDark) {
    return isFallback ? '#60a5fa' : '#2563eb'; // Light Blue (Fallback) : Dark Blue (Normal)
  }
  return isFallback ? '#4ade80' : '#16a34a'; // Light Green (Fallback) : Dark Green (Normal)
}

/**
 * Normalizes named colors and hex codes to canonical bowl palette colors.
 * Legacy darker hexes remap to the bright palette so seated + flying marbles stay in sync.
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
    lower === '#166534' ||
    lower === '#064e3b' ||
    lower === '#16a34a'
  ) {
    return BOWL_COLORS.dark_green;
  }
  if (
    lower === 'light_green' ||
    lower === 'lightgreen' ||
    lower === 'light green' ||
    lower === '#86efac' ||
    lower === '#22c55e' ||
    lower === '#34d399' ||
    lower === '#10b981' ||
    lower === '#4ade80'
  ) {
    return BOWL_COLORS.light_green;
  }
  if (
    lower === 'blue' ||
    lower === '#2563eb' ||
    lower === '#3b82f6' ||
    lower === '#1e3a8a' ||
    lower === '#1e40af'
  ) {
    return BOWL_COLORS.blue;
  }
  if (lower === 'light_blue' || lower === 'lightblue' || lower === 'light blue' || lower === '#60a5fa') {
    return BOWL_COLORS.light_blue;
  }
  if (lower === 'orange' || lower === '#ea580c' || lower === '#f97316') {
    return BOWL_COLORS.orange;
  }
  // Accept valid hex codes (3, 4, 6, or 8 digit) as-is; reject anything else
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(lower)) {
    return lower;
  }
  // Unknown / malformed color string — safe fallback to prevent black 3D meshes
  return BOWL_COLORS.dark_green;
}

/**
 * Habit UI accent color (cards, chips). Bowl marbles use `getMarbleColor` instead
 * so flight → bowl handoff stays theme × completion consistent.
 */
export function resolveHabitPieceColor(
  habit?: Habit | null,
  isFallback = false,
  isDark = false
): string {
  if (habit?.color) {
    return normalizeHabitColor(habit.color);
  }

  if (habit?.priority === 'high') {
    return getMarbleColor(isDark, false);
  }
  if (habit?.priority === 'low') {
    return BOWL_COLORS.orange;
  }

  return getMarbleColor(isDark, isFallback);
}
