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
