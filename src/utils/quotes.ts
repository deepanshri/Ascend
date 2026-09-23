/**
 * Ascend Curated Quotes Repository
 * Comprehensive high-impact quote bank across 11 interest categories
 * with 10+ actionable quotes per category and universal discipline fallbacks.
 */

export type QuoteKind = 'quote' | 'tip';

export interface Quote {
  text: string;
  author: string;
  source: string;
  category: string;
  icon: string;
  kind?: QuoteKind;
}

export const INTEREST_QUOTES: Quote[] = [
  // ==========================================
  // 1. Fitness & Gym (12 quotes)
  // ==========================================
  {
    text: 'Discipline is doing what you hate to do, but doing it like you love it.',
    author: 'Mike Tyson',
    source: 'Iron Mind',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'The body achieves what the mind believes.',
    author: 'Arnold Schwarzenegger',
    source: 'Total Recall',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'The last three or four reps is what makes the muscle grow. This area of pain divides a champion from someone who is not.',
    author: 'Arnold Schwarzenegger',
    source: 'Pumping Iron',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'Action creates motivation, not the other way around.',
    author: 'Peak Conditioning',
    source: 'Daily Drive',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'We don’t stop exercising because we grow old; we grow old because we stop exercising.',
    author: 'Kenneth Cooper',
    source: 'Aerobics Pioneer',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'You don’t have to be extreme, just consistent.',
    author: 'Strength Culture',
    source: 'Habitual Fitness',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'Today’s workout is tomorrow’s warm-up.',
    author: 'Iron Mindset',
    source: 'Gym Axiom',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'The clock is ticking. Are you becoming the person you want to be?',
    author: 'Greg Plitt',
    source: 'Workout Drive',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'Energy flows where attention goes. Focus on the lift, the breath, and the rep.',
    author: 'Movement Science',
    source: 'Kinetic Focus',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'You are one workout away from a completely different mood.',
    author: 'Endorphin Axiom',
    source: 'Recovery Science',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'Small daily improvements over time lead to stunning results.',
    author: 'Robin Sharma',
    source: 'Mastery Formula',
    category: 'Fitness/Gym',
    icon: '💪',
  },
  {
    text: 'Ain’t nothing to it but to do it. Heavy weights or light days, show up.',
    author: 'Ronnie Coleman',
    source: 'Olympia Mentality',
    category: 'Fitness/Gym',
    icon: '💪',
  },

  // ==========================================
  // 2. Coding & Tech (12 quotes)
  // ==========================================
  {
    text: 'First, solve the problem. Then, write the code.',
    author: 'John Johnson',
    source: 'Clean Codecraft',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Simplicity is prerequisite for reliability.',
    author: 'Edsger W. Dijkstra',
    source: 'Computing Science',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Make it work, make it right, make it fast.',
    author: 'Kent Beck',
    source: 'TDD Practice',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.',
    author: 'Martin Fowler',
    source: 'Refactoring',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Programs must be written for people to read, and only incidentally for machines to execute.',
    author: 'Harold Abelson',
    source: 'SICP',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'The best error message is the one that never shows up.',
    author: 'Thomas Fuchs',
    source: 'Pragmatic Thinking',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Deleted code is debugged code.',
    author: 'Jeff Sickel',
    source: 'Unix Wisdom',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Premature optimization is the root of all evil.',
    author: 'Donald Knuth',
    source: 'Structured Programming',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Code never lies, comments sometimes do.',
    author: 'Ron Jeffries',
    source: 'Extreme Programming',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Talk is cheap. Show me the code.',
    author: 'Linus Torvalds',
    source: 'Kernel Wisdom',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'The most dangerous phrase in the language is: We’ve always done it this way.',
    author: 'Grace Hopper',
    source: 'Pioneering Computing',
    category: 'Coding/Tech',
    icon: '💻',
  },
  {
    text: 'Controlling complexity is the essence of computer programming.',
    author: 'Brian Kernighan',
    source: 'Software Tools',
    category: 'Coding/Tech',
    icon: '💻',
  },

  // ==========================================
  // 3. Focus & Mindset (12 quotes)
  // ==========================================
  {
    text: 'You have power over your mind - not outside events. Realize this, and you will find strength.',
    author: 'Marcus Aurelius',
    source: 'Meditations',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'We suffer more often in imagination than in reality.',
    author: 'Seneca',
    source: 'Letters from a Stoic',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'No man is free who is not master of himself.',
    author: 'Epictetus',
    source: 'Discourses',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'When we are no longer able to change a situation, we are challenged to change ourselves.',
    author: 'Viktor Frankl',
    source: 'Man’s Search for Meaning',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'He who has a why to live can bear almost any how.',
    author: 'Friedrich Nietzsche',
    source: 'Twilight of the Idols',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'Clarity about what matters provides clarity about what does not.',
    author: 'Cal Newport',
    source: 'Deep Work',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'The obstacle in the path becomes the path. Never forget, within every obstacle is an opportunity to improve.',
    author: 'Ryan Holiday',
    source: 'The Obstacle Is the Way',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'Control your attention, control your life.',
    author: 'Mihaly Csikszentmihalyi',
    source: 'Flow',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'A fit body, a calm mind, a house full of love. These things cannot be bought - they must be earned.',
    author: 'Naval Ravikant',
    source: 'The Almanack of Naval Ravikant',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'Focus is a muscle. Practice saying no to the trivial many to safeguard the vital few.',
    author: 'Tim Ferriss',
    source: 'Principles of Focus',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'Nature does not hurry, yet everything is accomplished.',
    author: 'Lao Tzu',
    source: 'Tao Te Ching',
    category: 'Focus/Mindset',
    icon: '🧠',
  },
  {
    text: 'Your current life is the result of your previous choices. Want different results? Make different choices.',
    author: 'Mindset Axiom',
    source: 'Daily Clarity',
    category: 'Focus/Mindset',
    icon: '🧠',
  },

  // ==========================================
  // 4. Motion Design (12 quotes)
  // ==========================================
  {
    text: 'Good design is as little design as possible.',
    author: 'Dieter Rams',
    source: 'Ten Principles for Good Design',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Simplicity is not the absence of clutter; it is the presence of purpose.',
    author: 'Jony Ive',
    source: 'Design Thinking',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Good design is actually a lot harder to notice than poor design, in part because good designs fit our needs so well.',
    author: 'Don Norman',
    source: 'The Design of Everyday Things',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Design is not just what it looks like and feels like. Design is how it works.',
    author: 'Steve Jobs',
    source: 'Apple Design Axiom',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Animation is not the art of drawings that move, but the art of movements that are drawn.',
    author: 'Norman McLaren',
    source: 'Animation Aesthetics',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.',
    author: 'Antoine de Saint-Exupéry',
    source: 'Wind, Sand and Stars',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Design creates culture. Culture shapes values. Values determine the future.',
    author: 'Robert L. Peters',
    source: 'Design Manifesto',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Motion brings vitality to interfaces. When motion reflects physics, it feels natural and alive.',
    author: 'Frank Chimero',
    source: 'The Shape of Design',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'To design is much more than simply to assemble, to order, or even to edit; it is to add value and meaning.',
    author: 'Paul Rand',
    source: 'Thoughts on Design',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Styles come and go. Good design is a language, not a style.',
    author: 'Massimo Vignelli',
    source: 'The Vignelli Canon',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Motion without meaning is just noise. Choreograph with intention.',
    author: 'Kinetic Systems',
    source: 'UI Motion Guide',
    category: 'Motion Design',
    icon: '✨',
  },
  {
    text: 'Recognizing the need is the primary condition for design.',
    author: 'Charles Eames',
    source: 'Design Perspectives',
    category: 'Motion Design',
    icon: '✨',
  },

  // ==========================================
  // 5. Language Learning (12 quotes)
  // ==========================================
  {
    text: 'If you talk to a man in a language he understands, that goes to his head. If you talk to him in his language, that goes to his heart.',
    author: 'Nelson Mandela',
    source: 'Long Walk to Freedom',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'The limits of my language mean the limits of my world.',
    author: 'Ludwig Wittgenstein',
    source: 'Tractatus Logico-Philosophicus',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'To have another language is to possess a second soul.',
    author: 'Charlemagne',
    source: 'Historical Wisdom',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'A different language is a different vision of life.',
    author: 'Federico Fellini',
    source: 'Cinematic Musings',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'One language sets you in a corridor for life. Two languages open every door along the way.',
    author: 'Frank Smith',
    source: 'Linguistic Insights',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'You can never understand one language until you understand at least two.',
    author: 'Geoffrey Willans',
    source: 'Cross-Cultural Study',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'Language is the road map of a culture. It tells you where its people come from and where they are going.',
    author: 'Rita Mae Brown',
    source: 'Starting from Scratch',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'Learning another language is not only learning different words for the same things, but learning another way to think about things.',
    author: 'Flora Lewis',
    source: 'Cultural Dimensions',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'Every new language is an expansion of your cognitive horizon.',
    author: 'Kató Lomb',
    source: 'Polyglot: How I Learn Languages',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'Those who know nothing of foreign languages know nothing of their own.',
    author: 'Johann Wolfgang von Goethe',
    source: 'Maxims and Reflections',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'Language shapes the way we think, and determines what we can think about.',
    author: 'Benjamin Lee Whorf',
    source: 'Language, Thought, and Reality',
    category: 'Language Learning',
    icon: '🗣️',
  },
  {
    text: 'A language is not just words and grammar. It is a lens through which we interpret existence.',
    author: 'Oliver Wendell Holmes',
    source: 'The Autocrat of the Breakfast-Table',
    category: 'Language Learning',
    icon: '🗣️',
  },

  // ==========================================
  // 6. Running (12 quotes)
  // ==========================================
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
    text: 'Only the disciplined ones in life are free. If you are undisciplined, you are a slave to your moods.',
    author: 'Eliud Kipchoge',
    source: 'Marathon Discipline',
    category: 'Running',
    icon: '🏃',
  },
  {
    text: 'An athlete cannot run with money in his pockets. He must run with hope in his heart and dreams in his head.',
    author: 'Emil Zátopek',
    source: 'Olympic Grit',
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

  // ==========================================
  // 7. Books & Reading (12 quotes)
  // ==========================================
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
    text: 'You are never too old to set another goal or to dream a new dream.',
    author: 'C.S. Lewis',
    source: 'Literary Reflections',
    category: 'Books',
    icon: '📚',
  },
  {
    text: 'I have always imagined that Paradise will be a kind of library.',
    author: 'Jorge Luis Borges',
    source: 'Poem of the Gifts',
    category: 'Books',
    icon: '📚',
  },

  // ==========================================
  // 8. Movies & Cinema (12 quotes)
  // ==========================================
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
  {
    text: 'There is a difference between knowing the path and walking the path.',
    author: 'Morpheus',
    source: 'The Matrix',
    category: 'Movies',
    icon: '🎬',
  },

  // ==========================================
  // 9. Anime & Manga (12 quotes)
  // ==========================================
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
  {
    text: 'If you win, you live. If you lose, you die. If you don’t fight, you can’t win!',
    author: 'Eren Yeager',
    source: 'Attack on Titan',
    category: 'Anime',
    icon: '⚔️',
  },

  // ==========================================
  // 10. Music & Sound (12 quotes)
  // ==========================================
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
  {
    text: 'Music is a higher revelation than all wisdom and philosophy.',
    author: 'Ludwig van Beethoven',
    source: 'Letters',
    category: 'Music',
    icon: '🎵',
  },

  // ==========================================
  // 11. Gaming & Mastery (12 quotes)
  // ==========================================
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
  {
    text: 'Stand in the ashes of a trillion dead souls and ask the ghosts if honor matters. The silence is your answer.',
    author: 'Javik',
    source: 'Mass Effect 3',
    category: 'Gaming',
    icon: '🎮',
  },
];

/**
 * Universal default quotes for discipline and consistency.
 * Guaranteed fallback when user unchecks all interest categories.
 */
export const DEFAULT_HABIT_QUOTES: Quote[] = [
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
  {
    text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Will Durant',
    source: 'The Story of Philosophy',
    category: 'Productivity',
    icon: '⚡',
  },
  {
    text: 'Discipline equals freedom.',
    author: 'Jocko Willink',
    source: 'Discipline Equals Freedom',
    category: 'Productivity',
    icon: '⚡',
  },
  {
    text: 'Waste no more time arguing what a good man should be. Be one.',
    author: 'Marcus Aurelius',
    source: 'Meditations',
    category: 'Productivity',
    icon: '⚡',
  },
  {
    text: 'Don’t explain your philosophy. Embody it.',
    author: 'Epictetus',
    source: 'Enchiridion',
    category: 'Productivity',
    icon: '⚡',
  },
  {
    text: 'The man who moves a mountain begins by carrying away small stones.',
    author: 'Confucius',
    source: 'Analects',
    category: 'Productivity',
    icon: '⚡',
  },
];

export const CATEGORY_ICONS: Record<string, string> = {
  'Fitness/Gym': '💪',
  Fitness: '💪',
  'Coding/Tech': '💻',
  Coding: '💻',
  'Focus/Mindset': '🧠',
  'Motion Design': '✨',
  'Language Learning': '🗣️',
  Running: '🏃',
  Books: '📚',
  Movies: '🎬',
  Anime: '⚔️',
  Music: '🎵',
  Gaming: '🎮',
  Productivity: '⚡',
  'Atomic Habits': '🌱',
  Tip: '💡',
};

export function iconForCategory(category: string): string {
  return CATEGORY_ICONS[category] || '🌱';
}

/**
 * Normalizes category keys across aliases (e.g. 'Fitness/Gym' <-> 'Fitness', 'Coding/Tech' <-> 'Coding')
 */
export function normalizeCategoryKey(cat: string): string {
  const c = cat.trim().toLowerCase();
  if (c.includes('fitness') || c.includes('gym')) return 'fitness';
  if (c.includes('coding') || c.includes('tech') || c.includes('code')) return 'coding';
  if (c.includes('focus') || c.includes('mindset')) return 'focus';
  if (c.includes('motion') || c.includes('design')) return 'motion_design';
  if (c.includes('language') || c.includes('learning')) return 'language_learning';
  if (c.includes('run')) return 'running';
  if (c.includes('movie') || c.includes('film') || c.includes('cinema')) return 'movies';
  if (c.includes('anime') || c.includes('manga')) return 'anime';
  if (c.includes('music')) return 'music';
  if (c.includes('game') || c.includes('gaming')) return 'gaming';
  if (c.includes('book') || c.includes('reading') || c.includes('literature')) return 'books';
  return c;
}

/**
 * Strictly check whether a quote's category matches one of the user's active selected interests.
 * Unchecked topics will return false, guaranteeing they never appear.
 */
export function matchesCategory(quoteCategory: string, userCategories: string[]): boolean {
  if (!userCategories || userCategories.length === 0) return false;
  const quoteKey = normalizeCategoryKey(quoteCategory);
  return userCategories.some((u) => {
    const userKey = normalizeCategoryKey(u);
    return userKey === quoteKey || u.trim().toLowerCase() === quoteCategory.trim().toLowerCase();
  });
}

/**
 * Filter an array of quotes based on active user interests.
 * If userInterests is empty, falls back safely to DEFAULT_HABIT_QUOTES.
 */
export function filterQuotesByInterests(
  quotes: Quote[] = INTEREST_QUOTES,
  userInterests: string[] = []
): Quote[] {
  if (!Array.isArray(userInterests) || userInterests.length === 0) {
    return DEFAULT_HABIT_QUOTES;
  }
  const matched = quotes.filter((q) => matchesCategory(q.category, userInterests));
  return matched.length > 0 ? matched : DEFAULT_HABIT_QUOTES;
}

export const USER_INTERESTS_STORAGE_KEY = 'ascend_personal_interests';

export function getStoredUserInterests(): string[] {
  try {
    const raw = localStorage.getItem(USER_INTERESTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}
