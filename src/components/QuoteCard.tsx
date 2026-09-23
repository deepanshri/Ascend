import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  mergeQuoteBank,
  type Quote,
} from '../data/quotes';

export type { Quote } from '../data/quotes';

export const INTEREST_QUOTES: Quote[] = [
  // Movies (11 quotes)
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
  {
    text: 'Get busy living, or get busy dying.',
    author: 'Andy Dufresne',
    source: 'The Shawshank Redemption',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'It is not our abilities that show what we truly are… it is our choices.',
    author: 'Albus Dumbledore',
    source: 'Harry Potter and the Chamber of Secrets',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'The past can hurt. But the way I see it, you can either run from it or learn from it.',
    author: 'Rafiki',
    source: 'The Lion King',
    category: 'Movies',
    icon: '🎬',
  },
  {
    text: 'No amount of money ever bought a second of time.',
    author: 'Tony Stark',
    source: 'Avengers: Endgame',
    category: 'Movies',
    icon: '🎬',
  },

  // Books (11 quotes)
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
  {
    text: 'It takes courage to grow up and become who you really are.',
    author: 'E.E. Cummings',
    source: 'Selected Poems',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'There is nothing noble in being superior to your fellow man; true nobility is being superior to your former self.',
    author: 'Ernest Hemingway',
    source: 'By-Line',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'The only person you are destined to become is the person you decide to be.',
    author: 'Ralph Waldo Emerson',
    source: 'Essays',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'Start where you are. Use what you have. Do what you can.',
    author: 'Arthur Ashe',
    source: 'Days of Grace',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'He who has a why to live can bear almost any how.',
    author: 'Friedrich Nietzsche',
    source: 'Twilight of the Idols',
    category: 'Books',
    icon: '📚',
  },

  // Anime (11 quotes)
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
  {
    text: 'The moment you think of giving up, think of the reason why you held on so long.',
    author: 'Natsu Dragneel',
    source: 'Fairy Tail',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'If you can’t do something, then don’t. Focus on what you can do.',
    author: 'Shiroe',
    source: 'Log Horizon',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'Whatever you lose, you’ll find it again. But what you throw away you’ll never get back.',
    author: 'Kenshin Himura',
    source: 'Rurouni Kenshin',
    category: 'Anime',
    icon: '⚔️',
  },
  {
    text: 'Fear is not evil. It tells you what your weakness is. Once you know your weakness, you can become stronger.',
    author: 'Gildarts Clive',
    source: 'Fairy Tail',
    category: 'Anime',
    icon: '⚔️',
  },

  // Running (11 quotes)
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
  {
    text: 'If you run, you are a runner. It doesn’t matter how fast or how far.',
    author: 'John Bingham',
    source: 'No Need for Speed',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'It’s supposed to be hard. If it wasn’t hard, everyone would do it. The hard is what makes it great.',
    author: 'Coach Wisdom',
    source: 'A League of Their Own',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'The obsessiveness about running is really an obsessiveness about the potential for more and more life.',
    author: 'George Sheehan',
    source: 'Running & Being',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'You have a choice. You can throw in the towel, or you can use it to wipe the sweat off your face.',
    author: 'Trail Runner Creed',
    source: 'Endurance Path',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'A 12-minute mile is just as far as a 6-minute mile.',
    author: 'Running Axiom',
    source: 'Everyday Mileage',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'Consistency isn’t about perfection. It’s about lacing up your shoes even on the days you don’t feel like it.',
    author: 'Distance Discipline',
    source: 'Trail Wisdom',
    category: 'Running',
    icon: '🏃',
  },

  // Fitness (11 quotes)
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
  {
    text: 'The last three or four reps is what makes the muscle grow. This area of pain divides a champion from someone who is not.',
    author: 'Arnold Schwarzenegger',
    source: 'Pumping Iron',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'We don’t stop exercising because we grow old; we grow old because we stop exercising.',
    author: 'Kenneth Cooper',
    source: 'Aerobics Pioneer',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'You don’t have to be extreme, just consistent.',
    author: 'Strength Culture',
    source: 'Habitual Fitness',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'Today’s workout is tomorrow’s warm-up.',
    author: 'Iron Mindset',
    source: 'Gym Axiom',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'The clock is ticking. Are you becoming the person you want to be?',
    author: 'Greg Plitt',
    source: 'Workout Drive',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'Energy flows where attention goes. Focus on the lift, the breath, and the rep.',
    author: 'Movement Science',
    source: 'Kinetic Focus',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'You are one workout away from a completely different mood.',
    author: 'Endorphin Axiom',
    source: 'Recovery Science',
    category: 'Fitness',
    icon: '💪',
  },
  {
    text: 'Small daily improvements over time lead to stunning results.',
    author: 'Robin Sharma',
    source: 'Mastery Formula',
    category: 'Fitness',
    icon: '💪',
  },

  // Coding (11 quotes)
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
  {
    text: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.',
    author: 'Martin Fowler',
    source: 'Refactoring',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Programs must be written for people to read, and only incidentally for machines to execute.',
    author: 'Harold Abelson',
    source: 'SICP',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'The best error message is the one that never shows up.',
    author: 'Thomas Fuchs',
    source: 'Pragmatic Thinking',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Deleted code is debugged code.',
    author: 'Jeff Sickel',
    source: 'Unix Wisdom',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Experience is the name everyone gives to their mistakes.',
    author: 'Oscar Wilde',
    source: 'Software Craft',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Premature optimization is the root of all evil.',
    author: 'Donald Knuth',
    source: 'Structured Programming',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Code never lies, comments sometimes do.',
    author: 'Ron Jeffries',
    source: 'Extreme Programming',
    category: 'Coding',
    icon: '💻',
  },
  {
    text: 'Walking on water and developing software from a specification are easy if both are frozen.',
    author: 'Edward V. Berard',
    source: 'Software Engineering',
    category: 'Coding',
    icon: '💻',
  },

  // Music (11 quotes)
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
  {
    text: 'Without music, life would be a mistake.',
    author: 'Friedrich Nietzsche',
    source: 'Twilight of the Idols',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'One good thing about music, when it hits you, you feel no pain.',
    author: 'Bob Marley',
    source: 'Trenchtown Rock',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'Music is the shorthand of emotion.',
    author: 'Leo Tolstoy',
    source: 'The Kreutzer Sonata',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'To play a wrong note is insignificant; to play without passion is inexcusable.',
    author: 'Ludwig van Beethoven',
    source: 'Classical Masters',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'Music is moonlight in the gloomy night of life.',
    author: 'Jean Paul Richter',
    source: 'Melodic Philosophy',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'Everything in the universe has a rhythm, everything dances.',
    author: 'Maya Angelou',
    source: 'Rhythm of Life',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'The true beauty of music is that it connects people. It carries a message, and we, the musicians, are the messengers.',
    author: 'Roy Ayers',
    source: 'Soul Harmony',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'Practice until you cannot get it wrong, not just until you get it right.',
    author: 'Virtuoso Practice',
    source: 'Orchestral Disciplines',
    category: 'Music',
    icon: '🎵',
  },
  {
    text: 'Music washes away from the soul the dust of everyday life.',
    author: 'Berthold Auerbach',
    source: 'Sound & Spirit',
    category: 'Music',
    icon: '🎵',
  },

  // Gaming (11 quotes)
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
  {
    text: 'What is better: to be born good, or to overcome your evil nature through great effort?',
    author: 'Paarthurnax',
    source: 'The Elder Scrolls V: Skyrim',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'A hero doesn’t need to speak when his actions echo through the realm.',
    author: 'Link’s Legacy',
    source: 'The Legend of Zelda',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'The right man in the wrong place can make all the difference in the world.',
    author: 'The G-Man',
    source: 'Half-Life 2',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'Even in Dark Souls, the bonfire is always waiting if you persist.',
    author: 'Undead Wisdom',
    source: 'Lordran Chronicles',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'You died. Learn the timing, adapt your strategy, and try again.',
    author: 'Soulsborne Axiom',
    source: 'Trial and Triumph',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'No matter how dark the night, morning always comes, and our journey begins anew.',
    author: 'Lulu',
    source: 'Final Fantasy X',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'It’s dangerous to go alone! Take this.',
    author: 'Old Man',
    source: 'The Legend of Zelda',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'Protocol 3: Protect the Pilot.',
    author: 'BT-7274',
    source: 'Titanfall 2',
    category: 'Gaming',
    icon: '🎮',
  },
  {
    text: 'Keep grinding the levels; the hardest quests grant the greatest XP.',
    author: 'RPG Creed',
    source: 'Progress Mechanics',
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

/** Strictly match quote's category against selected categories (never substrings or sources). */
function matchesCategories(quote: Quote, categories: string[]): boolean {
  if (!categories || categories.length === 0) return false;
  const allowedSet = new Set(categories.map((item) => normalizeCategory(item)));
  return allowedSet.has(normalizeCategory(quote.category));
}

function localQuotesFor(interests: string[], isGuest: boolean = false): Quote[] {
  const list = Array.isArray(interests) ? interests : [];
  if (isGuest || list.length === 0) {
    return DEFAULT_HABIT_QUOTES;
  }
  const allowedSet = new Set(list.map((item) => normalizeCategory(item)));
  const matched = INTEREST_QUOTES.filter((quote) => allowedSet.has(normalizeCategory(quote.category)));
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
    return matched;
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

  // Immediately reset index to 0 whenever interests are toggled so the user sees matching quotes instantly
  useEffect(() => {
    setQuoteIndex(0);
  }, [selectedInterests]);

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

