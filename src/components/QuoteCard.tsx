import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  mergeQuoteBank,
  type Quote,
} from '../data/quotes';

export type { Quote } from '../data/quotes';

export const INTEREST_QUOTES: Quote[] = [
  // Movies
  {
    text: 'It’s not about how hard you hit. It’s about how hard you can get hit and keep moving forward.',
    author: 'Rocky Balboa',
    source: 'Rocky Balboa (2006)',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'Do, or do not. There is no try.',
    author: 'Yoda',
    source: 'The Empire Strikes Back',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'Why do we fall, Bruce? So we can learn to pick ourselves back up.',
    author: 'Alfred Pennyworth',
    source: 'Batman Begins',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'All we have to decide is what to do with the time that is given us.',
    author: 'Gandalf',
    source: 'The Fellowship of the Ring',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'Great men are not born great, they grow great.',
    author: 'Vito Corleone',
    source: 'The Godfather',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'Don’t ever let somebody tell you you can’t do something. Not even me.',
    author: 'Chris Gardner',
    source: 'The Pursuit of Happyness',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'Carpe diem. Seize the day, boys. Make your lives extraordinary.',
    author: 'John Keating',
    source: 'Dead Poets Society',
    category: 'Movies',
    icon: '🎬',
  },

  // Books
  {
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
    source: 'Atomic Habits',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'Every action you take is a vote for the type of person you wish to become.',
    author: 'James Clear',
    source: 'Atomic Habits',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'A reader lives a thousand lives before he dies. The man who never reads lives only one.',
    author: 'George R.R. Martin',
    source: 'A Dance with Dragons',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'It is our choices that show what we truly are, far more than our abilities.',
    author: 'Albus Dumbledore',
    source: 'Harry Potter',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Will Durant',
    source: 'The Story of Philosophy',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'Beware; for I am fearless, and therefore powerful.',
    author: 'Mary Shelley',
    source: 'Frankenstein',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'The secret of getting ahead is getting started.',
    author: 'Mark Twain',
    source: 'Literary Wisdom',
    category: 'Books',
    icon: '📚',
  },

  // Anime
  {
    text: 'If you don’t take risks, you can’t create a future.',
    author: 'Monkey D. Luffy',
    source: 'One Piece',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'Hard work is worthless for those that don’t believe in themselves.',
    author: 'Naruto Uzumaki',
    source: 'Naruto',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'Push past your limits! Right here, right now!',
    author: 'Yami Sukehiro',
    source: 'Black Clover',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'A person grows once he can defeat his previous self.',
    author: 'Bruno Bucciarati',
    source: 'JoJo’s Bizarre Adventure',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'If you really want to become strong, stop caring about what other people think about you.',
    author: 'Saitama',
    source: 'One Punch Man',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'Giving up is what kills people. When people refuse to give up, they gain the right to transcend.',
    author: 'Alucard',
    source: 'Hellsing',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'Whether a fish lives in a stream or a ditch, so long as it swims forward, it grows up beautifully.',
    author: 'Koro-sensei',
    source: 'Assassination Classroom',
    category: 'Anime',
    icon: '⚔️',
  },

  // Running
  {
    text: 'Pain is inevitable. Suffering is optional.',
    author: 'Haruki Murakami',
    source: 'What I Talk About When I Talk About Running',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'The miracle isn’t that I finished. The miracle is that I had the courage to start.',
    author: 'John Bingham',
    source: 'The Penguin Runner',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'Run when you can, walk if you have to, crawl if you must; just never give up.',
    author: 'Dean Karnazes',
    source: 'Ultramarathon Man',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'Most people run a race to see who is fastest. I run to see who has the most guts.',
    author: 'Steve Prefontaine',
    source: 'Distance Legend',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'Someone who is busier than you is out running right now.',
    author: 'Running Mindset',
    source: 'Trail Wisdom',
    category: 'Running',
    icon: '🏃',
  },

  // Fitness
  {
    text: 'Discipline is doing what you hate to do, but doing it like you love it.',
    author: 'Mike Tyson',
    source: 'Iron Mind',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'The body achieves what the mind believes.',
    author: 'Arnold Schwarzenegger',
    source: 'Total Recall',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'Action creates motivation, not the other way around.',
    author: 'Peak Conditioning',
    source: 'Daily Drive',
    category: 'Fitness',
    icon: '💪',
  },

  // Coding
  {
    text: 'First, solve the problem. Then, write the code.',
    author: 'John Johnson',
    source: 'Clean Codecraft',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Simplicity is prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
    source: 'Computing Science',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Make it work, make it right, make it fast.',
    author: 'Kent Beck',
    source: 'TDD Practice',
    category: 'Coding',
    icon: '💻',
  },

  // Music
  {
    text: 'Where words fail, music speaks.',
    author: 'Hans Christian Andersen',
    source: 'Harmonic Truth',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'Music can change the world because it can change people.',
    author: 'Bono',
    source: 'Rhythmic Soul',
    category: 'Music',
    icon: '🎵',
  },

  // Gaming
  {
    text: 'Failure is just another checkpoint on the way to mastery.',
    author: 'Gamer Mindset',
    source: 'Level Up',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'Every boss was once an impossible obstacle until you learned the pattern.',
    author: 'Speedrun Axiom',
    source: 'Pattern Recognition',
    category: 'Gaming',
    icon: '🎮',
  },
];

const DEFAULT_HABIT_QUOTES: Quote[] = [
  {
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
    source: 'Atomic Habits',
    category: 'Atomic Habits',
    icon: '🌱',
  },
  {
    text: 'Every action you take is a vote for the type of person you wish to become.',
    author: 'James Clear',
    source: 'Atomic Habits',
    category: 'Atomic Habits',
    icon: '🌱',
  },
  {
    text: 'Small habits don’t add up. They compound. That’s the power of atomic habits.',
    author: 'James Clear',
    source: 'Atomic Habits',
    category: 'Atomic Habits',
    icon: '🌱',
  },
  {
    text: 'Consistency is not about perfection. It is about never missing twice.',
    author: 'Atomic Systems',
    source: 'Rule of Two',
    category: 'Productivity',
    icon: '⚡',
  },
  {
    text: 'Be the designer of your world and not merely the consumer of it.',
    author: 'James Clear',
    source: 'Environment Design',
    category: 'Productivity',
    icon: '⚡',
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  Movies: '🎬',
  Books: '📚',
  Anime: '⚔️',
  Running: '🏃',
  Fitness: '💪',
  Coding: '💻',
  Music: '🎵',
  Gaming: '🎮',
  Productivity: '⚡',
  'Atomic Habits': '🌱',
  Habits: '🌱',
  Tip: '💡',
};

function iconForCategory(category: string): string {
  return CATEGORY_ICONS[category] || '🌱';
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

function matchesCategories(quote: Quote, categories: string[]): boolean {
  const list = Array.isArray(categories) ? categories : [];
  const needles = list.map(normalizeCategory);
  const haystacks = [quote.category, quote.source].map(normalizeCategory);
  return needles.some((needle) => haystacks.some((hay) => hay.includes(needle) || needle.includes(hay)));
}

function localQuotesFor(interests: string[], isGuest: boolean): Quote[] {
  const list = Array.isArray(interests) ? interests : [];
  if (isGuest || list.length === 0) {
    return DEFAULT_HABIT_QUOTES;
  }
  const matched = INTEREST_QUOTES.filter((quote) => matchesCategories(quote, list));
  return matched.length > 0 ? matched : DEFAULT_HABIT_QUOTES;
}

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

    const matched = mapped.filter((quote) => matchesCategories(quote, uniqueCategories));
    return matched.length > 0 ? matched : mapped;
  } catch (err) {
    console.warn('quotes fetch offline:', err);
    return [];
  }
}

const ROTATE_MS = 6 * 60 * 60 * 1000;

interface QuoteCardProps {
  selectedInterests?: string[];
  isGuest?: boolean;
}

const QuoteCardInner: React.FC<QuoteCardProps> = ({
  selectedInterests = [],
  isGuest = false,
}) => {
  const [quotes, setQuotes] = useState<Quote[]>(() => mergeQuoteBank(localQuotesFor(selectedInterests, isGuest)));
  const [quoteIndex, setQuoteIndex] = useState(0);
  const pool = useMemo(() => {
    const merged = mergeQuoteBank(Array.isArray(quotes) ? quotes : []);
    return merged.length > 0 ? merged : mergeQuoteBank([]);
  }, [quotes]);
  const poolLength = Math.max(pool.length, 1);

  useEffect(() => {
    let cancelled = false;

    const loadQuotes = async () => {
      if (isGuest || selectedInterests.length === 0) {
        if (!cancelled) setQuotes(DEFAULT_HABIT_QUOTES);
        return;
      }

      const remoteMatched = await fetchQuotesFromSupabase(selectedInterests);
      if (cancelled) return;

      if (remoteMatched.length > 0) {
        setQuotes(remoteMatched);
        return;
      }

      setQuotes(localQuotesFor(selectedInterests, false));
    };

    setQuotes(localQuotesFor(selectedInterests, isGuest));
    void loadQuotes();

    return () => {
      cancelled = true;
    };
  }, [selectedInterests, isGuest]);

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

  const currentQuote = pool[quoteIndex % poolLength] || DEFAULT_HABIT_QUOTES[0];
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
      className="my-1 w-full h-auto cursor-pointer rounded-xl py-1 px-2.5 bg-surface text-ink border border-line shadow-2xs select-none text-left transition-all duration-300 overflow-visible"
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
  if (prev.isGuest !== next.isGuest) return false;
  const pList = prev.selectedInterests || [];
  const nList = next.selectedInterests || [];
  if (pList.length !== nList.length) return false;
  for (let i = 0; i < pList.length; i++) {
    if (pList[i] !== nList[i]) return false;
  }
  return true;
});

