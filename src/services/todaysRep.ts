export const USE_MOCK = true;

export type TodaysRepTaskStatus = 'not_started' | 'done' | 'skipped';

export interface TodaysRepTask {
  title: string;
  source_url: string | null;
  difficulty: string | null;
  est_minutes: number | null;
  status: TodaysRepTaskStatus;
}

export interface TodaysRepResult {
  searched_live: boolean;
  why_this_plan: string;
  model_id: string;
  latency_ms: number;
  sources: string[];
  tasks: TodaysRepTask[];
}

const MOCK_DELAY_MS = 4000;

const MOCK_SUCCESS: TodaysRepResult = {
  searched_live: true,
  why_this_plan: 'You usually finish shorter sessions, so this is a lighter set.',
  model_id: 'mock',
  latency_ms: MOCK_DELAY_MS,
  sources: ['https://example.com/arrays'],
  tasks: [
    {
      title: 'Example task 1',
      source_url: 'https://example.com/arrays',
      difficulty: 'easy',
      est_minutes: 5,
      status: 'not_started',
    },
    {
      title: 'Example task 2',
      source_url: 'https://example.com/arrays',
      difficulty: null,
      est_minutes: null,
      status: 'not_started',
    },
  ],
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function askTodaysRep(input: {
  habitId: string;
  habitName: string;
  request: string;
}): Promise<TodaysRepResult> {
  if (!USE_MOCK) {
    throw new Error("Couldn't build a plan. Try again.");
  }

  await wait(MOCK_DELAY_MS);

  const text = input.request.toLowerCase();
  if (text.includes('error')) {
    throw new Error("Couldn't build a plan. Try again.");
  }
  if (text.includes('fail')) {
    return {
      searched_live: false,
      why_this_plan: 'Live sources were unavailable, so this set is unverified.',
      model_id: 'mock',
      latency_ms: MOCK_DELAY_MS,
      sources: [],
      tasks: [
        {
          title: 'Example task 1',
          source_url: null,
          difficulty: 'easy',
          est_minutes: 5,
          status: 'not_started',
        },
        {
          title: 'Example task 2',
          source_url: null,
          difficulty: null,
          est_minutes: null,
          status: 'not_started',
        },
      ],
    };
  }

  return MOCK_SUCCESS;
}
