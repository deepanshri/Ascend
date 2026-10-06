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

export {
  INTEREST_QUOTES,
  DEFAULT_HABIT_QUOTES,
  filterQuotesByInterests,
  matchesCategory,
  normalizeCategoryKey,
  getStoredUserInterests,
} from '../utils/quotes';

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
    text: 'Unlike rigid all-or-nothing systems that reset to zero on a miss, decay gently scales down your progress.',
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
    text: 'Flag your single Keystone habit. Completing it lights up the rest of the list.',
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
  {
    text: 'Add a time for a Reminder (R). Skip time for a To-Do (TD). One continuous Tasks list — no split boxes.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Reminders (R) float above to-dos (TD) in Tasks. Timed items sort first so you can scan what is due.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
  {
    text: 'Alert windows (10m prior and exact time) are set when you create or edit a timed Reminder — they stay off the card face.',
    author: 'Ascend',
    source: 'Feature Tip',
    category: 'Tip',
    icon: '💡',
    kind: 'tip',
  },
];

export function mergeQuoteBank(quotes: Quote[]): Quote[] {
  return interleaveQuotesAndTips(quotes, FEATURE_TIPS, 2);
}

/**
 * Build a rotation pool where every `quotesPerTip` motivational quotes
 * are followed by one tip: [Q, Q, Tip, Q, Q, Tip, …].
 */
export function interleaveQuotesAndTips(
  quotes: Quote[],
  tips: Quote[] = FEATURE_TIPS,
  quotesPerTip = 2
): Quote[] {
  const seen = new Set<string>();
  const uniqueQuotes: Quote[] = [];
  for (const item of quotes) {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key) || item.kind === 'tip' || item.category === 'Tip') continue;
    seen.add(key);
    uniqueQuotes.push({ ...item, kind: item.kind || 'quote' });
  }

  const uniqueTips: Quote[] = [];
  for (const tip of tips) {
    const key = tip.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueTips.push({ ...tip, kind: 'tip', category: tip.category || 'Tip' });
  }

  if (uniqueQuotes.length === 0) return uniqueTips;
  if (uniqueTips.length === 0) return uniqueQuotes;

  const stride = Math.max(2, Math.min(3, Math.round(quotesPerTip)));
  const merged: Quote[] = [];
  let tipIndex = 0;
  let sinceTip = 0;

  for (const quote of uniqueQuotes) {
    merged.push(quote);
    sinceTip += 1;
    if (sinceTip >= stride && uniqueTips.length > 0) {
      merged.push(uniqueTips[tipIndex % uniqueTips.length]);
      tipIndex += 1;
      sinceTip = 0;
    }
  }

  // If the bank is short, still surface remaining tips after the quotes.
  while (tipIndex < uniqueTips.length && tipIndex < uniqueQuotes.length) {
    merged.push(uniqueTips[tipIndex]);
    tipIndex += 1;
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
