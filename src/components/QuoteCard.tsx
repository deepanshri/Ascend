import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { mergeQuoteBank, resolveRotatingQuoteIndex } from '../data/quotes';
import { isJournalReady, type EveningJournalSettings } from '../lib/eveningJournal';
import { getYesterdayPlanForToday } from '../lib/chronicle';
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
  journalSettings?: EveningJournalSettings;
  journalCompletedToday?: boolean;
  morningIntention?: { text: string; habitName?: string } | null;
  yesterdayPlan?: string | null;
  onOpenJournal?: () => void;
  onOpenChronicle?: () => void;
}

const QuoteCardInner: React.FC<QuoteCardProps> = ({
  selectedInterests,
  isGuest = false,
  journalSettings,
  journalCompletedToday = false,
  morningIntention = null,
  yesterdayPlan,
  onOpenJournal,
  onOpenChronicle,
}) => {
  const [now, setNow] = useState(() => new Date());

  // Keep clock current so date boundary rollovers update immediately
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const journalReady = Boolean(
    journalSettings && isJournalReady(journalSettings, journalCompletedToday, now)
  );

  // T-1 Phase 3 strategy lookup for today
  const resolvedYesterdayPlan = useMemo(() => {
    if (yesterdayPlan !== undefined) return yesterdayPlan;
    return getYesterdayPlanForToday(now);
  }, [yesterdayPlan, now]);

  const activeMorningIntention =
    journalSettings?.enabled && now.getHours() < 12 ? morningIntention : null;

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

  // Periodic rotation (every 6 hours)
  useEffect(() => {
    if (poolLength < 2) return;
    const id = window.setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % poolLength);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [poolLength]);

  const goNext = useCallback(() => {
    if (poolLength < 2) return;
    setQuoteIndex((prev) => (prev + 1) % poolLength);
  }, [poolLength]);

  const goPrev = useCallback(() => {
    if (poolLength < 2) return;
    setQuoteIndex((prev) => (prev - 1 + poolLength) % poolLength);
  }, [poolLength]);

  // Safe index calculation guaranteed to prevent any array index or out-of-bounds error
  const safeIndex =
    pool.length > 0
      ? ((quoteIndex % poolLength) + poolLength) % poolLength
      : 0;
  const currentQuote = pool[safeIndex] || DEFAULT_HABIT_QUOTES[0];
  const isTip = currentQuote.kind === 'tip' || currentQuote.category === 'Tip';

  // Mode resolution
  // Mode 2: Evening journal ready
  // Mode 1: Next-day strategy ("See the plan of today by you")
  // Mode 3: Default quote rotation
  const isModeEvening = journalReady;
  const isModeNextDayPlan = Boolean(!isModeEvening && resolvedYesterdayPlan);

  const handleClick = useCallback(() => {
    if (isModeEvening) {
      onOpenJournal?.();
    } else if (isModeNextDayPlan) {
      if (onOpenChronicle) {
        onOpenChronicle();
      } else {
        goNext();
      }
    } else {
      goNext();
    }
  }, [isModeEvening, isModeNextDayPlan, onOpenJournal, onOpenChronicle, goNext]);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const deltaX = info.offset.x;
      const velocityX = info.velocity.x;
      const SWIPE_PX = 45;
      const VELOCITY_THRESHOLD = 250;

      if (Math.abs(deltaX) > SWIPE_PX || Math.abs(velocityX) > VELOCITY_THRESHOLD) {
        if (isModeEvening) {
          onOpenJournal?.();
        } else if (onOpenChronicle) {
          onOpenChronicle();
        } else {
          // Standard quote navigation fallback: Left -> next, Right -> prev
          if (deltaX < 0 || velocityX < 0) {
            goNext();
          } else {
            goPrev();
          }
        }
      }
    },
    [isModeEvening, isModeNextDayPlan, onOpenJournal, onOpenChronicle, goNext, goPrev]
  );

  return (
    <motion.div
      role="button"
      tabIndex={0}
      id="atomic-quote-card"
      data-tour="daily-wisdom"
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={
        isModeEvening
          ? 'Evening Journal is ready'
          : isModeNextDayPlan
          ? 'See the plan of today by you'
          : activeMorningIntention
          ? 'Your morning intention'
          : isTip
          ? 'Tip · swipe or tap for next'
          : 'Quote · swipe or tap for next'
      }
      aria-label={
        isModeEvening
          ? 'Evening Journal is ready, tap to begin'
          : isModeNextDayPlan
          ? `See the plan of today by you: ${resolvedYesterdayPlan}`
          : activeMorningIntention
          ? `Morning intention: ${activeMorningIntention.text}`
          : isTip
          ? 'App tip, swipe or tap for next'
          : 'Quote, swipe or tap for next'
      }
      layout={false}
      className={`touch-pan-y relative my-1 w-full h-auto cursor-grab active:cursor-grabbing rounded-xl p-3.5 select-none text-left transition-all duration-300 overflow-visible border ${
        isModeEvening
          ? 'bg-accent-soft border-accent shadow-sm'
          : isModeNextDayPlan
          ? 'bg-emerald-50/90 dark:bg-blue-950/40 border-emerald-300/80 dark:border-blue-700/70 shadow-xs'
          : activeMorningIntention
          ? 'bg-orange-50/80 dark:bg-orange-950/25 border-orange-300/70 dark:border-orange-700/60'
          : 'bg-slate-50/80 dark:bg-slate-800/40 border-transparent'
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isModeEvening ? (
          <motion.div
            key="evening-journal-ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3"
          >
            <span className="w-8 h-8 rounded-xl bg-accent text-accent-fg flex items-center justify-center text-[16px] shrink-0" aria-hidden="true">☾</span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-bold text-ink">Evening Journal is ready</span>
              <span className="block text-[10.5px] text-ink-muted mt-0.5">Reflect on today and choose tomorrow’s first action.</span>
            </span>
          </motion.div>
        ) : isModeNextDayPlan ? (
          <motion.div
            key={`next-day-plan-${resolvedYesterdayPlan}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3"
          >
            <span className="w-8 h-8 rounded-xl bg-[#23C15D] dark:bg-blue-600 text-white flex items-center justify-center text-[15px] shrink-0 font-bold shadow-xs mt-0.5" aria-hidden="true">
              🎯
            </span>
            <span className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-blue-300">
                See the plan of today by you
              </span>
              <span className="block text-[12px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug line-clamp-2 italic">
                &ldquo;{resolvedYesterdayPlan}&rdquo;
              </span>
              <span className="block text-[9.5px] text-emerald-700/90 dark:text-blue-300/80 mt-1 font-medium">
                Swipe or tap to record your 3-phase Chronicle →
              </span>
            </span>
          </motion.div>
        ) : activeMorningIntention ? (
          <motion.div
            key={`morning-${activeMorningIntention.text}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3"
          >
            <span className="w-8 h-8 rounded-xl bg-orange-400 text-white flex items-center justify-center text-[15px] shrink-0" aria-hidden="true">☀</span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">Your first action</span>
              <span className="block text-[12px] font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{activeMorningIntention.text}</span>
              {activeMorningIntention.habitName && <span className="block text-[9.5px] text-slate-500 dark:text-slate-400 mt-0.5">{activeMorningIntention.habitName}</span>}
            </span>
          </motion.div>
        ) : (
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

            <div className="flex items-center justify-between mt-1 text-[10px] gap-2">
              <span className="font-semibold text-emerald-900 dark:text-blue-300">
                {isTip ? 'Tip' : `— ${currentQuote.author}`}
              </span>
              <span className="text-[9.5px] font-medium text-emerald-800/80 dark:text-blue-300/80 flex items-center space-x-1 shrink-0">
                <span>{currentQuote.icon}</span>
                <span>{isTip ? 'App' : currentQuote.category}</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500">· ↔</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const QuoteCard = React.memo(QuoteCardInner, (prev, next) => {
  if (Boolean(prev.isGuest) !== Boolean(next.isGuest)) return false;
  if (prev.journalSettings?.enabled !== next.journalSettings?.enabled) return false;
  if (prev.journalSettings?.time !== next.journalSettings?.time) return false;
  if (Boolean(prev.journalCompletedToday) !== Boolean(next.journalCompletedToday)) return false;
  if (prev.morningIntention?.text !== next.morningIntention?.text) return false;
  if (prev.morningIntention?.habitName !== next.morningIntention?.habitName) return false;
  if (prev.yesterdayPlan !== next.yesterdayPlan) return false;
  if (prev.onOpenJournal !== next.onOpenJournal) return false;
  if (prev.onOpenChronicle !== next.onOpenChronicle) return false;
  const pList = prev.selectedInterests || [];
  const nList = next.selectedInterests || [];
  if (pList.length !== nList.length) return false;
  for (let i = 0; i < pList.length; i++) {
    if (pList[i] !== nList[i]) return false;
  }
  return true;
});
