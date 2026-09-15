export type QuoteKind = 'quote' | 'tip';

export interface Quote {
  text: string;
  author: string;
  source: string;
  category: string;
  icon: string;
  kind?: QuoteKind;
}

/** Midpoint of the 5–6 hour rotation window. */
export const QUOTE_ROTATION_MS = Math.round(5.5 * 60 * 60 * 1000);
export const LAST_QUOTE_ROTATION_TIMESTAMP_KEY = 'last_quote_rotation_timestamp';
export const CURRENT_QUOTE_INDEX_KEY = 'current_quote_index';

export const FEATURE_TIPS: Quote[] = [
  {
    text: 'Momentum grows with consistency — 1 vote today is better than 0, even fallback habits count.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Unlike rigid streaks that reset to zero on a miss, decay gently scales down your progress.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Tap a habit card once to flip it and read your purpose. Tap again to flip back.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Swipe left for a smaller version of a habit when low on time.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Your pet mascot grows permanently — it never shrinks on a hard day.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Flag at most two Keystone habits. Completing one lights up the rest of the list.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Exam Shield and Vacation pause miss decay so a hard week does not erase momentum.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
];

export function mergeQuoteBank(quotes: Quote[]): Quote[] {
  const seen = new Set<string>();
  const merged: Quote[] = [];
  for (const item of [...quotes, ...FEATURE_TIPS]) {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function readStoredIndex(): number {
  try {
    const raw = localStorage.getItem(CURRENT_QUOTE_INDEX_KEY);
    const parsed = raw == null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function readStoredTimestamp(): number {
  try {
    const raw = localStorage.getItem(LAST_QUOTE_ROTATION_TIMESTAMP_KEY);
    const parsed = raw == null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function persistRotation(index: number, timestamp: number): void {
  try {
    localStorage.setItem(CURRENT_QUOTE_INDEX_KEY, String(index));
    localStorage.setItem(LAST_QUOTE_ROTATION_TIMESTAMP_KEY, String(timestamp));
  } catch {
    // Private mode / quota — keep in-memory index only.
  }
}

/** Advance the persisted quote index when 5.5h have elapsed since the last rotation. */
export function resolveRotatingQuoteIndex(poolLength: number, now: number = Date.now()): number {
  const length = Math.max(poolLength, 1);
  const storedIndex = readStoredIndex() % length;
  const lastRotation = readStoredTimestamp();

  if (lastRotation <= 0) {
    persistRotation(storedIndex, now);
    return storedIndex;
  }

  if (now - lastRotation < QUOTE_ROTATION_MS) {
    return storedIndex;
  }

  const nextIndex = (storedIndex + 1) % length;
  persistRotation(nextIndex, now);
  return nextIndex;
}
