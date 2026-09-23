import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { mergeQuoteBank, resolveRotatingQuoteIndex } from '../data/quotes';
import {
  type Quote,
  INTEREST_QUOTES,
  DEFAULT_HABIT_QUOTES,
  matchesCategory,
  iconForCategory,
  getStoredUserInterests,
} from '../utils/quotes';

export type { Quote } from '../utils/quotes';
export { INTEREST_QUOTES, DEFAULT_HABIT_QUOTES } from '../utils/quotes';

function mapQuoteRow(row: Record<string, unknown>): Quote | null {
  const text = String(row.text || row.quote || row.content || row.body || '').trim();
  if (!text) return null;
  const category = String(row.category || row.interest || row.tag || 'Productivity');
  return {
    text,
    author: String(row.author || row.by || 'Unknown'),
    source: String(row.source || row.book || row.origin || category),
    category,
    icon: String(row.icon || iconForCategory(category)),
  };
}

async function fetchQuotesFromSupabase(categories: string[]): Promise<Quote[]> {
  if (!isSupabaseConfigured || !supabase || categories.length === 0) return [];

  try {
    const uniqueCategories = Array.from(new Set(categories.map((item) => item.trim()).filter(Boolean)));
    if (uniqueCategories.length === 0) return [];

    let { data, error } = await supabase
      .from('quotes')
      .select('*')
      .in('category', uniqueCategories);

    if (error) {
      console.warn('quotes category filter failed:', error.message);
      const overlap = uniqueCategories
        .map((item) => item.replace(/[,()]/g, ''))
        .filter(Boolean)
        .map((item) => `category.ilike.%${item}%`)
        .join(',');
      const retry = overlap
        ? await supabase.from('quotes').select('*').or(overlap)
        : await supabase.from('quotes').select('*');
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.warn('quotes fetch failed:', error.message);
      return [];
    }

    const mapped = (data as Record<string, unknown>[] | null || [])
      .map(mapQuoteRow)
      .filter((quote): quote is Quote => quote !== null);

    const matched = mapped.filter((quote) => matchesCategory(quote.category, uniqueCategories));
    return matched;
  } catch (err) {
    console.warn('quotes fetch offline:', err);
    return [];
  }
}

const ROTATE_MS = 6 * 60 * 60 * 1000;

export interface QuoteCardProps {
  selectedInterests?: string[];
  isGuest?: boolean;
}

const QuoteCardInner: React.FC<QuoteCardProps> = ({
  selectedInterests,
  isGuest = false,
}) => {
  // Listen for local storage changes if selectedInterests prop is not explicitly passed
  const [storedInterests, setStoredInterests] = useState<string[]>(() => getStoredUserInterests());

  useEffect(() => {
    const handleStorage = () => {
      setStoredInterests(getStoredUserInterests());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Dynamically resolve active interests: from prop if passed, or from localStorage settings
  const activeInterests = useMemo(() => {
    if (Array.isArray(selectedInterests)) {
      return selectedInterests;
    }
    return storedInterests;
  }, [selectedInterests, storedInterests]);

  const [remoteQuotes, setRemoteQuotes] = useState<Quote[]>([]);

  // Dynamically filter active pool. Strictly enforce that unchecked interests never display quotes.
  // When all interests are unchecked, fall back smoothly to DEFAULT_HABIT_QUOTES.
  const availableQuotes = useMemo(() => {
    if (isGuest || activeInterests.length === 0) {
      return DEFAULT_HABIT_QUOTES;
    }
    const baseBank = remoteQuotes.length > 0 ? remoteQuotes : INTEREST_QUOTES;
    const filtered = baseBank.filter((q) => matchesCategory(q.category, activeInterests));
    return filtered.length > 0 ? filtered : DEFAULT_HABIT_QUOTES;
  }, [remoteQuotes, activeInterests, isGuest]);

  // Interleave with App Feature Tips while preserving strict interest category bounds
  const pool = useMemo(() => {
    const merged = mergeQuoteBank(availableQuotes);
    return merged.length > 0 ? merged : mergeQuoteBank(DEFAULT_HABIT_QUOTES);
  }, [availableQuotes]);

  const poolLength = Math.max(pool.length, 1);

  // Session / daily persistent quote index
  const [quoteIndex, setQuoteIndex] = useState(() => resolveRotatingQuoteIndex(poolLength));

  // Reset index to 0 whenever user toggles interests so active quotes update instantly
  useEffect(() => {
    setQuoteIndex(0);
  }, [activeInterests]);

  // Background fetch from Supabase if configured and active
  useEffect(() => {
    let cancelled = false;

    const loadQuotes = async () => {
      if (isGuest || activeInterests.length === 0) {
        if (!cancelled) setRemoteQuotes([]);
        return;
      }

      const remoteMatched = await fetchQuotesFromSupabase(activeInterests);
      if (cancelled) return;

      if (remoteMatched.length > 0) {
        setRemoteQuotes(remoteMatched);
      }
    };

    void loadQuotes();

    return () => {
      cancelled = true;
    };
  }, [activeInterests, isGuest]);

  // Periodic rotation (every 5-6 hours)
  useEffect(() => {
    if (poolLength < 2) return;
    const id = window.setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % poolLength);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [poolLength]);

  const goNext = () => {
    if (poolLength < 2) return;
    setQuoteIndex((prev) => (prev + 1) % poolLength);
  };

  // Safe index calculation guaranteed to prevent any array index or out-of-bounds error
  const safeIndex =
    pool.length > 0
      ? ((quoteIndex % poolLength) + poolLength) % poolLength
      : 0;
  const currentQuote = pool[safeIndex] || DEFAULT_HABIT_QUOTES[0];
  const isTip = currentQuote.kind === 'tip' || currentQuote.category === 'Tip';

  return (
    <motion.button
      type="button"
      id="atomic-quote-card"
      data-tour="daily-wisdom"
      title={isTip ? 'Tip · tap for next' : 'Quote · tap for next'}
      aria-label={isTip ? 'App tip, tap for next' : 'Quote, tap for next'}
      onClick={goNext}
      layout={false}
      className="my-1 w-full h-auto cursor-pointer bg-slate-50/80 dark:bg-slate-800/40 border-none rounded-xl p-3.5 select-none text-left transition-all duration-300 overflow-visible"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${quoteIndex}-${currentQuote.text}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[11px] font-medium text-slate-800 dark:text-slate-100 italic leading-snug">
            {isTip ? currentQuote.text : `\u201C${currentQuote.text}\u201D`}
          </p>

          <div className="flex items-center justify-between mt-0.5 text-[10px] gap-2">
            <span className="font-semibold text-emerald-900 dark:text-blue-300">
              {isTip ? 'Tip' : `— ${currentQuote.author}`}
            </span>
            <span className="text-[9.5px] font-medium text-emerald-800/80 dark:text-blue-300/80 flex items-center space-x-1 shrink-0">
              <span>{currentQuote.icon}</span>
              <span>{isTip ? 'App' : currentQuote.category}</span>
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
};

export const QuoteCard = React.memo(QuoteCardInner, (prev, next) => {
  if (Boolean(prev.isGuest) !== Boolean(next.isGuest)) return false;
  const pList = prev.selectedInterests || [];
  const nList = next.selectedInterests || [];
  if (pList.length !== nList.length) return false;
  for (let i = 0; i < pList.length; i++) {
    if (pList[i] !== nList[i]) return false;
  }
  return true;
});
